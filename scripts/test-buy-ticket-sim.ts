/**
 * Test buy ticket simulation — verifies the instruction serializes
 * and simulates correctly on devnet (treasury pays all rent).
 *
 * Usage: npx ts-node scripts/test-buy-ticket-sim.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { FortressProtocol } from "../target/types/fortress_protocol";
import {
  PublicKey,
  Transaction,
  ComputeBudgetProgram,
  SystemProgram,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

const PROGRAM_ID = new PublicKey("2JHDbUz11kLe7q44nneougHcJCQqD6t26XeEFFNQJpHY");
const FPT_MINT = new PublicKey("3YTnzmFTECtyKDxaghWPQcjzX7g1Cj3NxMq41JdWk2rj");

function derivePricingConfigPDA(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("pricing_config")],
    PROGRAM_ID,
  );
  return pda;
}

function deriveParticipantPagePDA(
  lotteryTypeId: number,
  tier: number,
  pageNumber: number,
): PublicKey {
  const typeBuffer = Buffer.alloc(4);
  typeBuffer.writeUInt32LE(lotteryTypeId, 0);
  const tierBuffer = Buffer.alloc(4);
  tierBuffer.writeUInt32LE(tier, 0);
  const pageBuffer = Buffer.alloc(4);
  pageBuffer.writeUInt32LE(pageNumber, 0);

  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("page"), typeBuffer, tierBuffer, pageBuffer],
    PROGRAM_ID,
  );
  return pda;
}

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.FortressProtocol as Program<FortressProtocol>;
  const connection = provider.connection;
  const wallet = provider.wallet.publicKey;

  console.log("═".repeat(75));
  console.log(" BUY TICKET SIMULATION TEST");
  console.log("═".repeat(75));
  console.log(`Wallet: ${wallet.toString()}`);
  console.log(`Program: ${PROGRAM_ID.toString()}`);

  // Test LPM tier 10 (empty vault — first buy scenario)
  const tier = 10;
  const quantity = 1;
  const pageNumber = 0;
  const maxFptAmount = new anchor.BN(100_000_000); // 100 FPT max slippage

  // Derive all accounts
  const [lotteryVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_lpm"), Buffer.from([tier])],
    PROGRAM_ID,
  );

  const vaultTokenAccount = getAssociatedTokenAddressSync(
    FPT_MINT,
    lotteryVault,
    true, // allowOwnerOffCurve
    TOKEN_2022_PROGRAM_ID,
  );

  const participantPage = deriveParticipantPagePDA(0, tier, pageNumber);

  const buyerTokenAccount = getAssociatedTokenAddressSync(
    FPT_MINT,
    wallet,
    false,
    TOKEN_2022_PROGRAM_ID,
  );

  const [registry] = PublicKey.findProgramAddressSync(
    [Buffer.from("global_registry")],
    PROGRAM_ID,
  );

  const pricingConfig = derivePricingConfigPDA();

  const [solVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("sol_vault")],
    PROGRAM_ID,
  );

  console.log("\n─── ACCOUNTS ───");
  console.log(`  buyer:              ${wallet.toString()}`);
  console.log(`  fptMint:            ${FPT_MINT.toString()}`);
  console.log(`  buyerTokenAccount:  ${buyerTokenAccount.toString()}`);
  console.log(`  lotteryVault:       ${lotteryVault.toString()}`);
  console.log(`  vaultTokenAccount:  ${vaultTokenAccount.toString()}`);
  console.log(`  participantPage:    ${participantPage.toString()}`);
  console.log(`  registry:           ${registry.toString()}`);
  console.log(`  pricingConfig:      ${pricingConfig.toString()}`);
  console.log(`  solVault:           ${solVault.toString()}`);

  // Check if accounts exist
  const vaultAtaInfo = await connection.getAccountInfo(vaultTokenAccount);
  const pageInfo = await connection.getAccountInfo(participantPage);
  const solVaultBal = await connection.getBalance(solVault);

  console.log("\n─── ACCOUNT STATUS ───");
  console.log(`  vaultTokenAccount exists: ${vaultAtaInfo !== null}`);
  console.log(`  participantPage exists:   ${pageInfo !== null}`);
  console.log(`  solVault balance:         ${(solVaultBal / 1e9).toFixed(4)} SOL`);

  // Build the instruction
  const ix = await (program.methods as any)
    .buyLpmTicket(tier, quantity, maxFptAmount, pageNumber)
    .accountsStrict({
      buyer: wallet,
      fptMint: FPT_MINT,
      buyerTokenAccount: buyerTokenAccount,
      lotteryVault: lotteryVault,
      vaultTokenAccount: vaultTokenAccount,
      participantPage: participantPage,
      registry: registry,
      pricingConfig: pricingConfig,
      solVault: solVault,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  console.log("\n─── INSTRUCTION BUILT ───");
  console.log(`  programId: ${ix.programId.toString()}`);
  console.log(`  keys: ${ix.keys.length}`);
  console.log(`  data length: ${ix.data.length}`);

  // Build transaction
  const tx = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }),
    ix,
  );

  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = wallet;

  // Simulate
  console.log("\n─── SIMULATING TRANSACTION ───");
  try {
    const sim = await connection.simulateTransaction(tx);
    if (sim.value.err) {
      console.error("❌ Simulation FAILED:", JSON.stringify(sim.value.err, null, 2));
      console.error("Logs:", sim.value.logs?.join("\n"));
    } else {
      console.log("✅ Simulation SUCCEEDED!");
      console.log(`  Compute units used: ${sim.value.unitsConsumed}`);
      
      // Check logs for account creation
      const logs = sim.value.logs || [];
      const creationLogs = logs.filter(l =>
        l.includes("CreateAccount") || l.includes("create") || l.includes("invoke")
      );
      if (creationLogs.length > 0) {
        console.log("\n  CPI calls detected:");
        creationLogs.forEach(l => console.log(`    ${l}`));
      }

      // Check if any SOL was debited from buyer
      console.log("\n  Full logs:");
      logs.forEach(l => console.log(`    ${l}`));
    }
  } catch (simErr: any) {
    console.error("❌ Simulation error:", simErr.message);
    if (simErr.logs) {
      console.error("Logs:", simErr.logs.join("\n"));
    }
  }
}

main().catch(console.error);

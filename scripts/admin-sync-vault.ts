import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { Program, BN } from "@coral-xyz/anchor";
import * as fs from "fs";
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

const PROGRAM_ID = new PublicKey("2JHDbUz11kLe7q44nneougHcJCQqD6t26XeEFFNQJpHY");
const FPT_MINT = new PublicKey("3YTnzmFTECtyKDxaghWPQcjzX7g1Cj3NxMq41JdWk2rj");

async function main() {
  console.log("═══════════════════════════════════════════════════════════════════════════");
  console.log(" ADMIN: SYNC ALL VAULT STATES");
  console.log("═══════════════════════════════════════════════════════════════════════════\n");

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const idl = JSON.parse(fs.readFileSync("target/idl/fortress_protocol.json", "utf8"));
  const program = new Program(idl, provider);

  // Fetch PricingConfig to get actual exchange rate
  const [pricingConfigPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("pricing_config")],
    PROGRAM_ID
  );
  
  const pricingConfig = await (program.account as any).pricingConfig.fetch(pricingConfigPDA);
  const fptToUsdRate = pricingConfig.fptToUsdRate.toNumber();
  console.log(`Pricing Config:`);
  console.log(`  Rate: ${fptToUsdRate} (${fptToUsdRate / 1_000_000} FPT per USD)\n`);

  // Calculate required FPT per ticket for each tier
  function calculateRequiredDpt(tierValue: number): number {
    const tierUsdPrice = tierValue * 1_000_000; // Convert to base units
    return Math.floor((tierUsdPrice * fptToUsdRate) / 1_000_000);
  }

  // Define all lottery tiers
  const lotteryTiers = [
    { type: 0, name: "LPM", prefix: "vault_lpm", tiers: [5, 10, 20, 50] },
    { type: 1, name: "DPL", prefix: "vault_dpl", tiers: [5, 10, 15, 20] },
    { type: 2, name: "WPL", prefix: "vault_wpl", tiers: [5, 10, 15, 20] },
    { type: 3, name: "MPL", prefix: "vault_mpl", tiers: [5, 10, 15, 20] },
    { type: 4, name: "YPL", prefix: "vault_ypl", tiers: [5, 10, 15, 20] },
  ];

  console.log("Syncing all vaults...\n");
  console.log("═".repeat(79));

  for (const lottery of lotteryTiers) {
    for (const tier of lottery.tiers) {
      try {
        // Derive vault PDA
        const [vaultPDA] = PublicKey.findProgramAddressSync(
          [Buffer.from(lottery.prefix), Buffer.from([tier])],
          PROGRAM_ID
        );

        // Get vault account
        const vault = await (program.account as any).lotteryVault.fetch(vaultPDA);
        
        // Get vault token account
        const vaultTokenAccount = getAssociatedTokenAddressSync(
          FPT_MINT,
          vaultPDA,
          true,
          TOKEN_2022_PROGRAM_ID
        );

        // Get token balance
        const tokenBalance = await provider.connection.getTokenAccountBalance(vaultTokenAccount);
        const actualBalanceNum = parseInt(tokenBalance.value.amount);
        const actualBalance = new BN(actualBalanceNum);

        // Calculate expected participants based on ticket price
        const ticketPrice = calculateRequiredDpt(tier);
        const calculatedParticipants = Math.floor(actualBalanceNum / ticketPrice);

        const currentParticipants = vault.participantCount;
        const currentBalance = vault.balance.toNumber();

        console.log(`\n${lottery.name} Tier ${tier}:`);
        console.log(`  Vault PDA: ${vaultPDA.toString().slice(0, 20)}...`);
        console.log(`  Token Balance: ${tokenBalance.value.uiAmount} FPT`);
        console.log(`  Ticket Price: ${ticketPrice / 1_000_000} FPT`);
        console.log(`  Current State: ${currentParticipants} participants, ${currentBalance / 1_000_000} FPT`);
        console.log(`  Expected State: ${calculatedParticipants} participants, ${actualBalanceNum / 1_000_000} FPT`);

        // Only sync if there's a mismatch
        if (currentParticipants !== calculatedParticipants || currentBalance !== actualBalanceNum) {
          console.log(`  ⚠️  MISMATCH - Syncing...`);
          
          const tx = await (program.methods as any)
            .adminSyncVaultState(lottery.type, tier, actualBalance, calculatedParticipants)
            .accounts({
              admin: provider.wallet.publicKey,
              lotteryVault: vaultPDA,
            })
            .rpc();

          console.log(`  ✅ Synced! TX: ${tx.slice(0, 20)}...`);
        } else {
          console.log(`  ✅ Already in sync`);
        }
      } catch (error: any) {
        console.log(`\n${lottery.name} Tier ${tier}:`);
        console.log(`  ❌ Error: ${error.message}`);
      }
    }
    console.log("");
  }

  console.log("═".repeat(79));
  console.log("\n✅ ALL VAULTS SYNCED\n");
}

main().catch(console.error);

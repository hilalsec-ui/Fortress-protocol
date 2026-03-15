import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as fs from "fs";
import { FortressProtocol } from "../target/types/fortress_protocol";

const FPT_MINT = new PublicKey("3YTnzmFTECtyKDxaghWPQcjzX7g1Cj3NxMq41JdWk2rj");

function derivePagePDA(programId: PublicKey, typeId: number, tier: number, pageNum: number): PublicKey {
  const tb = Buffer.alloc(4); tb.writeUInt32LE(typeId, 0);
  const tierB = Buffer.alloc(4); tierB.writeUInt32LE(tier, 0);
  const pb = Buffer.alloc(4); pb.writeUInt32LE(pageNum, 0);
  const [pda] = PublicKey.findProgramAddressSync([Buffer.from("page"), tb, tierB, pb], programId);
  return pda;
}

async function main() {
  const kp = anchor.web3.Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync("/home/dev/my-wallet.json", "utf-8")))
  );
  const conn = new anchor.web3.Connection("https://api.mainnet-beta.solana.com", "confirmed");
  anchor.setProvider(new anchor.AnchorProvider(conn, new anchor.Wallet(kp), { commitment: "confirmed" }));
  const program = anchor.workspace.FortressProtocol as Program<FortressProtocol>;
  const wallet = kp.publicKey;

  const userFptAta = getAssociatedTokenAddressSync(FPT_MINT, wallet, false, TOKEN_2022_PROGRAM_ID);
  const [registryPDA] = PublicKey.findProgramAddressSync([Buffer.from("global_registry")], program.programId);
  const [pricingPDA] = PublicKey.findProgramAddressSync([Buffer.from("pricing_config")], program.programId);
  const [solVaultPDA] = PublicKey.findProgramAddressSync([Buffer.from("sol_vault")], program.programId);
  
  // DPL tier=5, page=0
  const [vaultPDA] = PublicKey.findProgramAddressSync([Buffer.from("vault_dpl"), Buffer.from([5])], program.programId);
  const vaultTokenAccount = getAssociatedTokenAddressSync(FPT_MINT, vaultPDA, true, TOKEN_2022_PROGRAM_ID);
  const page0PDA = derivePagePDA(program.programId, 1, 5, 0); // DPL=1
  
  const pageInfo = await conn.getAccountInfo(page0PDA);
  console.log("DPL vault_5 PDA:", vaultPDA.toString());
  console.log("DPL page0 PDA:", page0PDA.toString(), "exists:", !!pageInfo);
  console.log("DPL vault ATA:", vaultTokenAccount.toString(), "exists:", !!(await conn.getAccountInfo(vaultTokenAccount)));
  
  try {
    const maxFptAmount = new BN(100_000_000); // 100 FPT max
    // Now lottery_type_id=1 is the FIRST arg for DPL
    const sig = await (program.methods as any).buyDplTicket(1, 5, 1, maxFptAmount, 0).accountsStrict({
      buyer: wallet,
      fptMint: FPT_MINT,
      buyerTokenAccount: userFptAta,
      lotteryVault: vaultPDA,
      vaultTokenAccount,
      participantPage: page0PDA,
      registry: registryPDA,
      pricingConfig: pricingPDA,
      solVault: solVaultPDA,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    }).rpc({ commitment: "confirmed" });
    console.log("\n✅ DPL Buy ticket SUCCESS! Signature:", sig);
    const vault = await program.account.lotteryVault.fetch(vaultPDA);
    console.log("DPL Vault participantCount:", vault.participantCount.toString());
    const now = Math.floor(Date.now() / 1000);
    const endTime = (vault as any).endTime?.toNumber?.() ?? (vault as any).end_time?.toNumber?.() ?? 0;
    console.log("DPL Vault end_time:        ", endTime, "(expected ~", now + 86400, ")");
    console.log("DPL Vault end_time offset: ", endTime - now, "seconds (should be ~86400)");
    if (endTime > now) {
      console.log("✅ Timer is RUNNING — counts down from", new Date(endTime * 1000).toISOString());
    } else {
      console.log("❌ Timer NOT started — end_time is still 0 or in the past");
    }
  } catch (e: any) {
    console.log("\n❌ DPL Buy ticket FAILED:", e.message?.slice(0, 400));
  }
}
main().catch(console.error);

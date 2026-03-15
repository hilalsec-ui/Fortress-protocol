import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as fs from "fs";
import { FortressProtocol } from "../target/types/fortress_protocol";

const FPT_MINT = new PublicKey("3YTnzmFTECtyKDxaghWPQcjzX7g1Cj3NxMq41JdWk2rj");

async function main() {
  const kp = anchor.web3.Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync("/home/dev/my-wallet.json", "utf-8")))
  );
  const conn = new anchor.web3.Connection("https://api.mainnet-beta.solana.com", "confirmed");
  const provider = new anchor.AnchorProvider(conn, new anchor.Wallet(kp), { commitment: "confirmed" });
  anchor.setProvider(provider);
  const program = anchor.workspace.FortressProtocol as Program<FortressProtocol>;

  const wallet = kp.publicKey;
  console.log("Wallet:", wallet.toString());
  
  const userFptAta = getAssociatedTokenAddressSync(FPT_MINT, wallet, false, TOKEN_2022_PROGRAM_ID);
  const ataInfo = await conn.getAccountInfo(userFptAta);
  if (!ataInfo) {
    console.log("❌ No FPT ATA found.");
    return;
  }
  const tokenAcct = await conn.getTokenAccountBalance(userFptAta);
  console.log("FPT balance:", tokenAcct.value.uiAmount, "FPT");
  
  const [registryPDA] = PublicKey.findProgramAddressSync([Buffer.from("global_registry")], program.programId);
  const [pricingPDA] = PublicKey.findProgramAddressSync([Buffer.from("pricing_config")], program.programId);
  const [solVaultPDA] = PublicKey.findProgramAddressSync([Buffer.from("sol_vault")], program.programId);
  const [vaultPDA] = PublicKey.findProgramAddressSync([Buffer.from("vault_lpm"), Buffer.from([5])], program.programId);
  const vaultTokenAccount = getAssociatedTokenAddressSync(FPT_MINT, vaultPDA, true, TOKEN_2022_PROGRAM_ID);
  const typeBytes = Buffer.alloc(4); typeBytes.writeUInt32LE(0, 0); // LPM=0
  const tierBytes = Buffer.alloc(4); tierBytes.writeUInt32LE(5, 0);
  const pageBytes = Buffer.alloc(4); pageBytes.writeUInt32LE(0, 0);
  const [page0PDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("page"), typeBytes, tierBytes, pageBytes],
    program.programId
  );
  
  console.log("\nVault PDA:", vaultPDA.toString());
  console.log("Page0 PDA:", page0PDA.toString());
  
  try {
    // tier=5 ($5), qty=1, maxFpt=100 FPT (100_000_000 base units with 6 decimals), pageNumber=0
    const maxFptAmount = new BN(100_000_000); // 100 FPT with slippage
    const sig = await program.methods.buyLpmTicket(5, 1, maxFptAmount, 0).accountsStrict({
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
    } as any).rpc({ commitment: "confirmed" });
    console.log("\n✅ Buy ticket SUCCESS! Signature:", sig);
    
    const vault = await program.account.lotteryVault.fetch(vaultPDA);
    console.log("Vault participantCount:", vault.participantCount.toString());
  } catch (e: any) {
    console.log("\n❌ Buy ticket FAILED:", e.message?.slice(0, 300));
  }
}
main().catch(console.error);

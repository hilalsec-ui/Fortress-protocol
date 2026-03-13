import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import * as fs from "fs";

async function main() {
  const kp = anchor.web3.Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync("/home/dev/my-wallet.json", "utf-8")))
  );
  const conn = new anchor.web3.Connection("https://api.devnet.solana.com", "confirmed");
  anchor.setProvider(new anchor.AnchorProvider(conn, new anchor.Wallet(kp), {}));
  const program = anchor.workspace.FortressProtocol;
  const FPT = new PublicKey("7vZbJ3WN4eGF6rGikB4MBLs4kiJwaRzNSX3smQRJJNw2");

  const [vaultPDA] = PublicKey.findProgramAddressSync([Buffer.from("vault_lpm"), Buffer.from([5])], program.programId);
  const vaultAta = getAssociatedTokenAddressSync(FPT, vaultPDA, true, TOKEN_2022_PROGRAM_ID);
  const info = await conn.getAccountInfo(vaultAta);
  console.log("vault_lpm tier5 ATA:", vaultAta.toString(), "— exists:", !!info);

  // Program seeds: seeds = [b"page", &[0,0,0,0], &[tier,0,0,0], &page_number.to_le_bytes()]
  // tier=5, page_number=0
  const [page0_correct] = PublicKey.findProgramAddressSync([
    Buffer.from("page"),
    Buffer.from([0, 0, 0, 0]),    // lottery_type_id=0 (LPM) as 4 bytes
    Buffer.from([5, 0, 0, 0]),    // tier=5 as 4 bytes
    Buffer.from([0, 0, 0, 0])     // page_number=0 as 4 bytes LE
  ], program.programId);
  console.log("participant_page (program seeds):", page0_correct.toString());
}
main().catch(console.error);

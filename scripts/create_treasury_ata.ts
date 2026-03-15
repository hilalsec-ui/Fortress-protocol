import fs from 'fs';
import path from 'path';
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction, Transaction } from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

// Config
const PROGRAM_ID = new PublicKey('2JHDbUz11kLe7q44nneougHcJCQqD6t26XeEFFNQJpHY');
const FPT_MINT = new PublicKey('3YTnzmFTECtyKDxaghWPQcjzX7g1Cj3NxMq41JdWk2rj');

async function main() {
  const ADMIN_KEYPAIR_PATH = process.env.ADMIN_KEYPAIR_PATH;
  const RPC_ENDPOINT = process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com';

  if (!ADMIN_KEYPAIR_PATH) {
    console.error('ADMIN_KEYPAIR_PATH env var is required');
    process.exit(1);
  }

  const adminKeypair = Keypair.fromSecretKey(Buffer.from(JSON.parse(fs.readFileSync(path.resolve(ADMIN_KEYPAIR_PATH), 'utf8'))));
  const connection = new Connection(RPC_ENDPOINT, 'confirmed');

  // Derive sol_vault PDA — this is the ATA authority (seeds: [b"sol_vault"])
  // Must match associated_token::authority = treasury_vault in admin.rs
  const [solVaultPDA] = PublicKey.findProgramAddressSync([Buffer.from('sol_vault')], PROGRAM_ID);

  console.log('sol_vault PDA (ATA authority):', solVaultPDA.toBase58());

  // Derive ATA for FPT with sol_vault PDA as owner (Token-2022)
  const ata = await getAssociatedTokenAddress(
    FPT_MINT,
    solVaultPDA,        // ← owner is sol_vault PDA, NOT the treasury data PDA
    true,               // allowOwnerOffCurve — PDAs are off-curve
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  console.log('Derived Treasury FPT ATA (owned by sol_vault):', ata.toBase58());

  const ataInfo = await connection.getAccountInfo(ata);
  if (ataInfo) {
    console.log('ATA already exists on-chain. Nothing to do.');
    process.exit(0);
  }

  // Build transaction to create ATA — admin pays rent, sol_vault is the owner
  const ix = createAssociatedTokenAccountInstruction(
    adminKeypair.publicKey, // payer
    ata,
    solVaultPDA,            // ← owner (was incorrectly treasuryPDA)
    FPT_MINT,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const tx = new Transaction().add(ix);
  console.log('Sending transaction to create ATA (admin pays rent)');
  const sig = await sendAndConfirmTransaction(connection, tx, [adminKeypair], {commitment: 'confirmed'});
  console.log('Transaction signature:', sig);
  console.log('Treasury FPT ATA created:', ata.toBase58());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

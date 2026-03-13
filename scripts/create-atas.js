const { Connection, PublicKey, Keypair, Transaction } = require('@solana/web3.js');
const {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} = require('@solana/spl-token');
const fs = require('fs');

const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
const walletRaw = JSON.parse(fs.readFileSync('/home/dev/my-wallet.json', 'utf8'));
const admin = Keypair.fromSecretKey(Uint8Array.from(walletRaw));

const FPT_MINT    = new PublicKey('7vZbJ3WN4eGF6rGikB4MBLs4kiJwaRzNSX3smQRJJNw2');
const SOL_VAULT   = new PublicKey('ECx92d7Y7e6krdQzq7ALZZRpAZd41coi5q5qiYyGNP6C'); // sol_vault PDA

async function createAtaIfMissing(owner, allowOffCurve, label) {
  const ata = getAssociatedTokenAddressSync(FPT_MINT, owner, allowOffCurve, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const info = await connection.getAccountInfo(ata);
  if (info) { console.log(label, ':', ata.toBase58(), 'already exists'); return ata; }
  console.log(label, ':', ata.toBase58(), 'creating...');
  const ix = createAssociatedTokenAccountInstruction(admin.publicKey, ata, owner, FPT_MINT, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  const tx = new Transaction({ feePayer: admin.publicKey, recentBlockhash: blockhash }).add(ix);
  tx.sign(admin);
  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  await connection.confirmTransaction(sig, 'confirmed');
  console.log(label, ': created', sig);
  return ata;
}

async function main() {
  await createAtaIfMissing(admin.publicKey, false, 'Admin FPT ATA ');
  await createAtaIfMissing(SOL_VAULT,       true,  'Treasury FPT ATA');
  console.log('Done!');
}
main().catch(console.error);

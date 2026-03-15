import { Connection, PublicKey } from '@solana/web3.js';

const conn = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
const PROGRAM_ID = new PublicKey('EB6kkg2sW5rnukjRH7Ljhz78gbfc36XZAuiFn5jdefF3');

// Look at recent program transactions
const sigs = await conn.getSignaturesForAddress(PROGRAM_ID, { limit: 10 });
console.log('Recent txs on program:');
for (const s of sigs) {
  const status = s.err ? `FAILED: ${JSON.stringify(s.err)}` : 'OK';
  console.log(`  ${s.signature.slice(0,10)}... ${status} @ slot ${s.slot}`);
}

import { Connection, PublicKey } from '@solana/web3.js';

const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
const PROGRAM_ID = new PublicKey('2JHDbUz11kLe7q44nneougHcJCQqD6t26XeEFFNQJpHY');

// Look at recent program transactions
const sigs = await conn.getSignaturesForAddress(PROGRAM_ID, { limit: 10 });
console.log('Recent txs on program:');
for (const s of sigs) {
  const status = s.err ? `FAILED: ${JSON.stringify(s.err)}` : 'OK';
  console.log(`  ${s.signature.slice(0,10)}... ${status} @ slot ${s.slot}`);
}

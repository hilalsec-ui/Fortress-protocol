import { Connection, PublicKey } from '@solana/web3.js';
const conn = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
const crank = new PublicKey('BzsGQccSzoWPiRSKoTNpf7iKxqJRq3CwvSygmzvwMei5');
const sigs = await conn.getSignaturesForAddress(crank, { limit: 20 });

console.log(`Crank wallet recent ${sigs.length} txs:`);
for (const s of sigs) {
  const ok = s.err ? 'FAIL' : 'OK  ';
  console.log(`  ${ok} ${s.signature.slice(0,12)}... slot ${s.slot}`);
  if (s.err) console.log(`       err: ${JSON.stringify(s.err)}`);
}

import { Connection, PublicKey } from '@solana/web3.js';
const conn = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
const prog = new PublicKey('2JHDbUz11kLe7q44nneougHcJCQqD6t26XeEFFNQJpHY');
const sigs = await conn.getSignaturesForAddress(prog, { limit: 10 });

for (const s of sigs.slice(1, 8)) {
  const tx = await conn.getTransaction(s.signature, { maxSupportedTransactionVersion: 0 });
  if (tx?.meta?.logMessages) {
    const relevant = tx.meta.logMessages.filter(l => l.includes('REQUEST_DRAW') || l.includes('request_draw'));
    if (relevant.length > 0) {
      console.log(`\nSig: ${s.signature.slice(0,12)}...`);
      relevant.forEach(l => console.log('  ', l));
    } else {
      // Print first few logs to see which instruction this is
      console.log(`Sig ${s.signature.slice(0,8)}: ${tx.meta.logMessages[1]?.slice(0, 60) ?? 'no logs'}`);
    }
  }
}

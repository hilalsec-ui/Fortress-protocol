import { Connection } from '@solana/web3.js';
const conn = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

// Check recent txs for log messages
const SIGS = [
  '5nZM1RPEes', '4C3ApH8y2k', 'BWD7UtVmiZ', '5oi3PzfmSa', '2ej1ESotsm'
];

const allSigs = await conn.getSignaturesForAddress(
  (await import('@solana/web3.js')).SystemProgram.programId.constructor.createFromString
    ? null : null, {limit: 1}
);

// Actually just fetch the full recent list with logs
const { Connection: C, PublicKey: PK } = await import('@solana/web3.js');
const prog = new PK('2JHDbUz11kLe7q44nneougHcJCQqD6t26XeEFFNQJpHY');
const sigs = await conn.getSignaturesForAddress(prog, { limit: 10 });

for (const s of sigs.slice(1, 5)) { // skip upgrade tx
  const tx = await conn.getTransaction(s.signature, { maxSupportedTransactionVersion: 0 });
  if (tx?.meta?.logMessages) {
    const logs = tx.meta.logMessages.filter(l => l.includes('REQUEST_DRAW') || l.includes('Program log'));
    if (logs.some(l => l.includes('REQUEST_DRAW'))) {
      console.log(`\nSig: ${s.signature.slice(0,12)}...`);
      logs.forEach(l => console.log(' ', l.slice(0, 80)));
    }
  }
}
console.log('Done');

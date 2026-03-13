const { Connection, PublicKey } = require('@solana/web3.js');
const conn = new Connection('https://api.devnet.solana.com', 'confirmed');

async function main() {
  const vault = new PublicKey('9e66v1zAnHRw5RKNCZmKJyWopy6NmsfkdRSUGcPUssuG');
  const sigs = await conn.getSignaturesForAddress(vault, { limit: 15 });
  
  for (const sigInfo of sigs.slice(0, 6)) {
    const tx = await conn.getTransaction(sigInfo.signature, { maxSupportedTransactionVersion: 0 });
    if (!tx) { console.log(sigInfo.signature.slice(0,20), 'NOT FOUND'); continue; }
    const logs = tx.meta?.logMessages || [];
    const relevant = logs.filter(l => l.includes('REQUEST_DRAW') || l.includes('FULFILL') || l.includes('BUY') || l.includes('DRAW') || l.includes('Error'));
    console.log('\n--- TX:', sigInfo.signature.slice(0,20), sigInfo.err ? 'ERR' : 'OK', '---');
    relevant.forEach(l => console.log(' ', l));
    const pre  = tx.meta?.preTokenBalances  || [];
    const post = tx.meta?.postTokenBalances || [];
    if (pre.length || post.length) {
      pre.forEach(b => console.log('  pre  token[', b.accountIndex, ']:', b.uiTokenAmount?.amount));
      post.forEach(b => console.log('  post token[', b.accountIndex, ']:', b.uiTokenAmount?.amount));
    }
  }
}
main().catch(console.error);

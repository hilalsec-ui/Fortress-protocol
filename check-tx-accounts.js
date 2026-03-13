const { Connection, PublicKey } = require('@solana/web3.js');
const conn = new Connection('https://api.devnet.solana.com', 'confirmed');

async function main() {
  const vault = new PublicKey('9e66v1zAnHRw5RKNCZmKJyWopy6NmsfkdRSUGcPUssuG');
  const sigs = await conn.getSignaturesForAddress(vault, { limit: 15 });
  
  // Get the details for the buy_ticket TX to find actual vault_token_account address
  for (const sigInfo of sigs) {
    const tx = await conn.getTransaction(sigInfo.signature, { maxSupportedTransactionVersion: 0 });
    if (!tx) continue;
    const logs = tx.meta?.logMessages || [];
    const hasBuy = logs.some(l => l.includes('BUY') || l.includes('buy'));
    const hasFulfill = logs.some(l => l.includes('FULFILL'));
    const hasRequest = logs.some(l => l.includes('REQUEST_DRAW'));
    
    if (hasBuy || hasFulfill || hasRequest) {
      console.log('\n--- TX:', sigInfo.signature.slice(0,20), sigInfo.err ? 'ERR' : 'OK', '---');
      
      // Get account keys
      let accountKeys = [];
      if (tx.transaction?.message?.staticAccountKeys) {
        accountKeys = tx.transaction.message.staticAccountKeys;
      } else if (tx.transaction?.message?.accountKeys) {
        accountKeys = tx.transaction.message.accountKeys.map(k => new PublicKey(k));
      }
      
      console.log('  Accounts:');
      accountKeys.forEach((k, i) => console.log('   [' + i + ']', k.toString()));
      
      // Token balances with account address
      const pre = tx.meta?.preTokenBalances || [];
      const post = tx.meta?.postTokenBalances || [];
      pre.forEach(b => {
        const addr = accountKeys[b.accountIndex]?.toString() || 'unknown';
        console.log('  pre  [' + b.accountIndex + '] ' + addr.slice(0,20), ':', b.uiTokenAmount?.amount);
      });
      post.forEach(b => {
        const addr = accountKeys[b.accountIndex]?.toString() || 'unknown';
        console.log('  post [' + b.accountIndex + '] ' + addr.slice(0,20), ':', b.uiTokenAmount?.amount);
      });
      
      // Only do first 4 relevant TXs
      if (sigs.indexOf(sigInfo) >= 5) break;
    }
  }
}
main().catch(console.error);

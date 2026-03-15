// Check what address buy_ticket uses for the vault_token_account
const { Connection, PublicKey } = require('@solana/web3.js');
const conn = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

async function main() {
  const vault = new PublicKey('9e66v1zAnHRw5RKNCZmKJyWopy6NmsfkdRSUGcPUssuG');
  const sigs = await conn.getSignaturesForAddress(vault, { limit: 15 });
  
  // The buy_ticket TXs
  const buyTxSigs = [
    sigs[2]?.signature,  // mnkSGRqriFz1hk5He6if
    sigs[1]?.signature,  // 3ZbVWHBzMQgsRkE2CkZi
  ].filter(Boolean);
  
  for (const sig of buyTxSigs) {
    const tx = await conn.getTransaction(sig, { maxSupportedTransactionVersion: 0 });
    if (!tx) { console.log(sig, 'NOT FOUND'); continue; }
    
    const logs = tx.meta?.logMessages || [];
    console.log('\n--- TX:', sig.slice(0, 20), '---');
    logs.filter(l => l.includes('BUY') || l.includes('Error')).forEach(l => console.log('  LOG:', l));
    
    let accountKeys = [];
    if (tx.transaction?.message?.staticAccountKeys) {
      accountKeys = tx.transaction.message.staticAccountKeys;
    } else if (tx.transaction?.message?.accountKeys) {
      accountKeys = tx.transaction.message.accountKeys.map(k => new PublicKey(k));
    }
    
    console.log('  Accounts:');
    accountKeys.forEach((k, i) => console.log('   [' + i + ']', k.toString()));
    
    const pre = tx.meta?.preTokenBalances || [];
    const post = tx.meta?.postTokenBalances || [];
    pre.forEach(b => {
      const addr = accountKeys[b.accountIndex]?.toString() || 'unknown';
      console.log('  pre  [' + b.accountIndex + '] ' + addr + ' :', b.uiTokenAmount?.amount);
    });
    post.forEach(b => {
      const addr = accountKeys[b.accountIndex]?.toString() || 'unknown';
      console.log('  post [' + b.accountIndex + '] ' + addr + ' :', b.uiTokenAmount?.amount);
    });
    
    // Check if those accounts still exist now
    console.log('\n  Current state of token accounts:');
    for (const b of post) {
      const addr = accountKeys[b.accountIndex]?.toString();
      if (!addr) continue;
      const info = await conn.getAccountInfo(new PublicKey(addr));
      if (info && info.data.length >= 72) {
        const bal = info.data.readBigUInt64LE(64);
        console.log('  ', addr.slice(0,20), 'still exists, balance:', bal.toString());
      } else {
        console.log('  ', addr.slice(0,20), 'DOES NOT EXIST');
      }
    }
  }
}
main().catch(console.error);

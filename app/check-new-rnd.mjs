import { Connection, PublicKey } from '@solana/web3.js';
const conn = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

// New LPM $5 account
const acct = new PublicKey('3RNBFv6gsfLVAdPShje3U4oWksJ5yei8BxAPEpkpjvcZ');
const info = await conn.getAccountInfo(acct, 'confirmed');
if (!info) { console.log('NOT FOUND'); process.exit(1); }
const d = info.data;
console.log('total len:', d.length);
console.log('owner:', info.owner.toBase58());
console.log('disc[0..8]:', d.slice(0,8).toString('hex'));
console.log('authority[8..40]:', new PublicKey(d.slice(8,40)).toBase58());
console.log('queue[40..72]:', new PublicKey(d.slice(40,72)).toBase58());
console.log('seed[72..104]:', d.slice(72,104).toString('hex'));
console.log('oracle[104..136]:', new PublicKey(d.slice(104,136)).toBase58());
// Show everything as hex in 16-byte chunks
for (let i = 0; i < Math.min(d.length, 200); i += 16) {
  const chunk = d.slice(i, i+16);
  const hex = chunk.toString('hex').match(/.{2}/g)?.join(' ') ?? '';
  const ascii = Array.from(chunk).map(b => b >= 32 && b < 127 ? String.fromCharCode(b) : '.').join('');
  console.log(`  ${String(i).padStart(4)}  ${hex.padEnd(48)}  ${ascii}`);
}

const { Connection, PublicKey } = require('@solana/web3.js');
const conn = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
const acct = new PublicKey('4dqvnPSuq9PEZaGojLke2oe3zd3q26iS7wBYEhQSkWC3'); // LPM $5
conn.getAccountInfo(acct).then(info => {
  if (!info) { console.log('NOT FOUND'); return; }
  const d = info.data;
  console.log('total len:', d.length);
  console.log('owner:', info.owner.toBase58());
  console.log('hex[0..48]:', d.slice(0,48).toString('hex'));
  console.log('hex[96..200]:', d.slice(96,200).toString('hex'));
  for (const off of [136, 144, 152, 160, 168]) {
    try { console.log('u64 LE @' + off + ':', d.readBigUInt64LE(off).toString()); } catch(e){}
  }
}).catch(e => console.error(e.message));

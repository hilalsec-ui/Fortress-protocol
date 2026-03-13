import { Connection, PublicKey } from '@solana/web3.js';

const conn = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

const CRANK = 'BzsGQccSzoWPiRSKoTNpf7iKxqJRq3CwvSygmzvwMei5';

const LPM_RND = {
  5:  '4dqvnPSuq9PEZaGojLke2oe3zd3q26iS7wBYEhQSkWC3',
  10: 'DiUXBnxQ4W8S5Uju8ywDFE8bw16qHdQrE4LvxUn8sD5T',
  20: 'FWiMmuF3czX4LgPnhiPWaDKdZjRi8H785i8anZd48DLm',
  50: 'AvWpxsjHn1v58ePcnbmHDvetbxx9auzYCzmghjei3zYp',
};

for (const [tier, addr] of Object.entries(LPM_RND)) {
  const info = await conn.getAccountInfo(new PublicKey(addr), 'confirmed');
  if (!info) { console.log(`LPM $${tier}: NOT FOUND`); continue; }
  const authority = new PublicKey(info.data.slice(8, 40)).toBase58();
  const match = authority === CRANK ? '✓ MATCH' : '✗ MISMATCH';
  console.log(`LPM $${tier}: authority = ${authority} ${match}`);
}

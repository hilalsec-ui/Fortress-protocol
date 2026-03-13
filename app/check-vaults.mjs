import { Connection, PublicKey } from '@solana/web3.js';
const conn = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
const PROG = new PublicKey('2JHDbUz11kLe7q44nneougHcJCQqD6t26XeEFFNQJpHY');

const LPM_TIERS = [5, 10, 20, 50];
for (const tier of LPM_TIERS) {
  const [vaultPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault_lpm'), Buffer.from([tier])], PROG
  );
  const info = await conn.getAccountInfo(vaultPDA, 'confirmed');
  if (!info) { console.log(`LPM $${tier}: NOT FOUND`); continue; }
  const d = info.data;
  // disc(8)+type(1)+tier(1)+round(4)+balance(8)=22
  const participants = d.readUInt32LE(22);
  const currentPage = d.readUInt32LE(26);
  // end_time at offset 30
  const endTimeLo = d.readUInt32LE(30);
  const endTimeHi = d.readUInt32LE(34);
  const endTime = endTimeLo + endTimeHi * 4294967296;
  const state = d[80];
  const stateNames = ['Active','ReadyToWithdraw','Claimed','Ready'];
  console.log(`LPM $${tier}: participants=${participants} page=${currentPage} endTime=${endTime} state=${stateNames[state]??state}`);
}

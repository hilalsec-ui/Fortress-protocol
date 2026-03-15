const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const anchor = require('@coral-xyz/anchor');
const { getAssociatedTokenAddressSync, ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } = require('@solana/spl-token');
const fs = require('fs');

const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
const walletRaw = JSON.parse(fs.readFileSync('/home/dev/my-wallet.json', 'utf8'));
const admin = Keypair.fromSecretKey(Uint8Array.from(walletRaw));
const idl = JSON.parse(fs.readFileSync('/home/dev/fortress/app/src/idl/fortress_protocol.json', 'utf8'));
const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(admin), { commitment: 'confirmed' });
const program = new anchor.Program(idl, provider);

const PYTH_NEW   = new PublicKey('J83w4HKfqxwcq3BEMMkPFSppX3gqekLyLJBexebFVkix');
const DPL5_VAULT = new PublicKey('7cig1GHRuR8dP2hGX7tSBQQrQ5cE56oT55eGwjecibSf');
const FPT_MINT   = new PublicKey('H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG');
const TREASURY   = new PublicKey('GEKTf17LBwxHHR758b1Zc2JZzmTpVeou5sfDCW1qsYgH');

async function main() {
  const pythInfo = await connection.getAccountInfo(PYTH_NEW);
  if (!pythInfo) { console.error('Pyth NOT FOUND'); return; }

  const magic   = Array.from(pythInfo.data.slice(0,4)).reverse().map(b=>b.toString(16).padStart(2,'0')).join('');
  const atype   = pythInfo.data.readUInt32LE(8);
  const pubSlot = Number(pythInfo.data.readBigUInt64LE(232));
  const status  = pythInfo.data.readUInt32LE(224);
  const price   = Number(pythInfo.data.readBigInt64LE(208));
  const curSlot = await connection.getSlot();
  const slotAge = curSlot - pubSlot;

  console.log('=== PYTH ACCOUNT ===');
  console.log('Address:', PYTH_NEW.toBase58());
  console.log('Len:', pythInfo.data.length, '>=240?', pythInfo.data.length>=240?'YES':'NO');
  console.log('Magic: 0x'+magic, '==0xa1b2c3d4?', magic==='a1b2c3d4'?'YES ✅':'NO ❌');
  console.log('Atype:', atype, '==2?', atype===2?'YES ✅':'NO ❌');
  console.log('Status:', status, '==1(Trading)?', status===1?'YES ✅':'NO (Clock fallback)');
  console.log('Slot age:', slotAge, slotAge<150?'<150 ✅':'>=150 (stale->Clock fallback)');
  console.log('Price raw:', price);

  console.log('\n=== DPL-5 VAULT ===');
  try {
    const vault = await program.account.lotteryVault.fetch(DPL5_VAULT);
    const et = typeof vault.endTime==='object' ? vault.endTime.toNumber() : vault.endTime;
    const now = Math.floor(Date.now()/1000);
    console.log('participants:', vault.participantCount, '| isDrawn:', vault.isDrawn);
    console.log('endTime:', et, '| expired:', et<now?'YES ✅':'NO');
    console.log('balance:', typeof vault.balance==='object'?vault.balance.toString():vault.balance);
  } catch(e) { console.log('Vault error:', e.message); }

  console.log('\n=== ATAs ===');
  const adminAta = getAssociatedTokenAddressSync(FPT_MINT, admin.publicKey, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const ai = await connection.getAccountInfo(adminAta);
  console.log('Admin FPT ATA   :', adminAta.toBase58(), ai?'EXISTS ✅':'MISSING ❌');

  const tAta = getAssociatedTokenAddressSync(FPT_MINT, TREASURY, true, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const ti = await connection.getAccountInfo(tAta);
  console.log('Treasury FPT ATA:', tAta.toBase58(), ti?'EXISTS ✅':'MISSING ❌');
}
main().catch(console.error);

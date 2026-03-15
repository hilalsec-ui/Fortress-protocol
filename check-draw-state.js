const { Connection, PublicKey } = require('@solana/web3.js');
const conn = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
const PROGRAM_ID = new PublicKey('EB6kkg2sW5rnukjRH7Ljhz78gbfc36XZAuiFn5jdefF3');

const types = [
  { name: 'LPM', id: 0, tiers: [5, 10, 20, 50] },
  { name: 'DPL', id: 1, tiers: [5, 10, 15, 20] },
  { name: 'WPL', id: 2, tiers: [5, 10, 15, 20] },
  { name: 'MPL', id: 3, tiers: [5, 10, 15, 20] },
];

async function main() {
  for (const { name, id, tiers } of types) {
    for (const tier of tiers) {
      const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from('pending_draw'), Buffer.from([id]), Buffer.from([tier])],
        PROGRAM_ID
      );
      const info = await conn.getAccountInfo(pda, 'confirmed');
      if (info) {
        console.log(`FOUND PendingDraw: ${name} $${tier} — PDA: ${pda.toBase58()} — ${info.data.length} bytes`);
        // Read randomness_account from PendingDraw (offset 8+1+1=10, then pubkey 32 bytes)
        if (info.data.length >= 42) {
          const ra = new PublicKey(info.data.slice(10, 42));
          console.log(`  → randomness_account: ${ra.toBase58()}`);
          // Check reveal_slot on the randomness account
          const rndInfo = await conn.getAccountInfo(ra, 'confirmed');
          if (rndInfo && rndInfo.data.length >= 160) {
            for (const off of [136, 144, 152]) {
              const v = rndInfo.data.readBigUInt64LE(off);
              if (v > 0n) console.log(`  → reveal_slot @${off}: ${v} (NON-ZERO = oracle revealed!)`);
            }
            const allZero = [136,144,152].every(o => rndInfo.data.readBigUInt64LE(o) === 0n);
            if (allZero) console.log('  → all slots zero — oracle has NOT revealed yet');
          }
        }
      }
    }
  }
  console.log('Done');
}
main().catch(console.error);

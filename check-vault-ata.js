const { Connection, PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddressSync } = require('@solana/spl-token');
const conn = new Connection('https://api.devnet.solana.com', 'confirmed');

const PROGRAM_ID = new PublicKey('2JHDbUz11kLe7q44nneougHcJCQqD6t26XeEFFNQJpHY');
const FPT_MINT   = new PublicKey('7vZbJ3WN4eGF6rGikB4MBLs4kiJwaRzNSX3smQRJJNw2');
const TOKEN_2022 = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
const TOKEN_STD  = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOC      = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe8bv8');

async function main() {
  const tests = [
    { label:'LPM-5',  seed:'vault_lpm', tier:5  },
    { label:'DPL-10', seed:'vault_dpl', tier:10 },
  ];
  for (const t of tests) {
    const [vault] = PublicKey.findProgramAddressSync([Buffer.from(t.seed), Buffer.from([t.tier])], PROGRAM_ID);
    const ata22  = getAssociatedTokenAddressSync(FPT_MINT, vault, true, TOKEN_2022, ASSOC);
    const ataStd = getAssociatedTokenAddressSync(FPT_MINT, vault, true, TOKEN_STD,  ASSOC);
    const [i22, iStd] = await Promise.all([
      conn.getAccountInfo(ata22),
      conn.getAccountInfo(ataStd),
    ]);
    console.log(t.label + ' vault:', vault.toString());
    console.log('  Token-2022 ATA:', ata22.toString(), 'exists:', !!i22);
    if (i22) {
      const bal = i22.data.readBigUInt64LE(64);
      console.log('    balance:', bal.toString());
    }
    console.log('  Standard  ATA:', ataStd.toString(), 'exists:', !!iStd);
    if (iStd) {
      const bal = iStd.data.readBigUInt64LE(64);
      console.log('    balance:', bal.toString());
    }
    console.log();
  }
}
main().catch(console.error);

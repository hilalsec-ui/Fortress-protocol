const { Connection, PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY } = require('@solana/web3.js');
const { TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } = require('@solana/spl-token');

const PROGRAM_ID = new PublicKey('2JHDbUz11kLe7q44nneougHcJCQqD6t26XeEFFNQJpHY');
const FPT_MINT = new PublicKey('3YTnzmFTECtyKDxaghWPQcjzX7g1Cj3NxMq41JdWk2rj');
const conn = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

const tier = 5;
// DPL vault
const [vaultPDA] = PublicKey.findProgramAddressSync([Buffer.from('vault_dpl'), Buffer.from([tier])], PROGRAM_ID);
const [vaultTokenAccount] = PublicKey.findProgramAddressSync(
  [vaultPDA.toBuffer(), TOKEN_2022_PROGRAM_ID.toBuffer(), FPT_MINT.toBuffer()],
  ASSOCIATED_TOKEN_PROGRAM_ID
);
const typeBuffer = Buffer.alloc(4); typeBuffer.writeUInt32LE(1, 0);
const tierBuffer = Buffer.alloc(4); tierBuffer.writeUInt32LE(tier, 0);
const pageBuffer = Buffer.alloc(4); pageBuffer.writeUInt32LE(0, 0);
const [pagePDA] = PublicKey.findProgramAddressSync([Buffer.from('page'), typeBuffer, tierBuffer, pageBuffer], PROGRAM_ID);

// Check FPT mint
const fptMintInfo = conn.getAccountInfo(FPT_MINT);
const vtaInfo = conn.getAccountInfo(vaultTokenAccount);
const pageInfo = conn.getAccountInfo(pagePDA);
const vaultInfo = conn.getAccountInfo(vaultPDA);

Promise.all([fptMintInfo, vtaInfo, pageInfo, vaultInfo]).then(([fpt, vta, page, vault]) => {
  console.log('FPT Mint:', FPT_MINT.toBase58(), 'exists:', !!fpt, fpt ? 'owner:'+fpt.owner.toBase58() : '');
  console.log('Vault token acct:', vaultTokenAccount.toBase58(), 'exists:', !!vta, vta ? 'owner:'+vta.owner.toBase58() : '');
  console.log('Page PDA:', pagePDA.toBase58(), 'exists:', !!page);
  console.log('Vault PDA:', vaultPDA.toBase58(), 'exists:', !!vault, vault ? 'data len:'+vault.data.length : '');
  
  // Check vault data: disc(8) + lottery_type(1) + tier(1) + round_number(4) + balance(8) + participant_count(4)  
  if (vault) {
    const d = vault.data;
    console.log('Vault disc:', d.slice(0,8).toString('hex'));
    console.log('Vault lottery_type:', d[8]);
    console.log('Vault tier:', d[9]);
    const balance = d.readBigInt64LE(14);
    console.log('Vault balance:', balance.toString());
    const participantCount = d.readUInt32LE(22);
    console.log('Vault participant_count:', participantCount);
    console.log('Vault is_drawn:', d[30]); // approximate offset
  }
}).catch(e => console.error('Error:', e.message));

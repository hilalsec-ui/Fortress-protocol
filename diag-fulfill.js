// Simulate fulfillDrawEntropy to get the exact on-chain error
const { Connection, PublicKey, TransactionMessage, VersionedTransaction } = require('@solana/web3.js');
const { getAssociatedTokenAddressSync } = require('@solana/spl-token');

const RPC = 'https://api.mainnet-beta.solana.com';
const connection = new Connection(RPC, 'confirmed');
const PROGRAM_ID = new PublicKey('2JHDbUz11kLe7q44nneougHcJCQqD6t26XeEFFNQJpHY');
const FPT_MINT   = new PublicKey('3YTnzmFTECtyKDxaghWPQcjzX7g1Cj3NxMq41JdWk2rj');
const TOKEN_2022 = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
const ASSOC_PGM  = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe8bv8');

// ── Struct layout for LotteryVault (82 bytes):
// 8 disc | 1 lottery_type | 1 tier | 4 round_number | 8 balance | 4 participant_count
// | 4 current_page | 8 end_time | 33 last_winner (Option<pubkey>) | 8 last_prize
// | 1 is_drawn | 1 state | 1 bump
function parseVault(data) {
  const lottery_type   = data[8];
  const tier           = data[9];
  const round_number   = data.readUInt32LE(10);
  const balance        = data.readBigUInt64LE(14);
  const participant_count = data.readUInt32LE(22);
  const current_page   = data.readUInt32LE(26);
  const end_time       = data.readBigInt64LE(30);
  const last_winner_present = data[38] === 1;
  const last_winner    = last_winner_present ? new PublicKey(data.slice(39, 71)).toString() : null;
  const last_prize     = data.readBigUInt64LE(71);
  const is_drawn       = data[79] !== 0;
  const state          = data[80];
  const bump           = data[81];
  return { lottery_type, tier, round_number, balance, participant_count, current_page, end_time, last_winner, last_prize, is_drawn, state, bump };
}

async function checkAll(lotteryType, tier) {
  const typeId = { LPM: 0, DPL: 1, WPL: 2, MPL: 3 }[lotteryType];
  const prefix = `vault_${lotteryType.toLowerCase()}`;

  const [vaultPDA] = PublicKey.findProgramAddressSync([Buffer.from(prefix), Buffer.from([tier])], PROGRAM_ID);
  const [solVault] = PublicKey.findProgramAddressSync([Buffer.from('sol_vault')], PROGRAM_ID);
  const [treasury] = PublicKey.findProgramAddressSync([Buffer.from('treasury')], PROGRAM_ID);
  const [config]   = PublicKey.findProgramAddressSync([Buffer.from('global_registry')], PROGRAM_ID);
  const [pendingDraw] = PublicKey.findProgramAddressSync(
    [Buffer.from('pending_draw'), Buffer.from([typeId]), Buffer.from([tier])],
    PROGRAM_ID
  );
  const [winnerHistory] = PublicKey.findProgramAddressSync(
    [Buffer.from('winner_history'), Buffer.from([typeId]), Buffer.from([tier])],
    PROGRAM_ID
  );

  const vaultTokenAccount = getAssociatedTokenAddressSync(FPT_MINT, vaultPDA, true, TOKEN_2022, ASSOC_PGM);
  const treasuryFptAta    = getAssociatedTokenAddressSync(FPT_MINT, solVault, true, TOKEN_2022, ASSOC_PGM);

  console.log(`\n═══ ${lotteryType} Tier ${tier} ═══`);
  console.log('vault PDA:', vaultPDA.toString());
  console.log('vault_token_account:', vaultTokenAccount.toString());
  console.log('sol_vault:', solVault.toString());
  console.log('treasury_fpt_ata:', treasuryFptAta.toString());
  console.log('pending_draw:', pendingDraw.toString());

  // Fetch vault
  const vaultInfo = await connection.getAccountInfo(vaultPDA);
  if (vaultInfo) {
    const v = parseVault(vaultInfo.data);
    console.log('vault:', v);
    console.log('vault.balance (FPT µ):', v.balance.toString());
    console.log('vault.participant_count:', v.participant_count);
    console.log('vault.state:', v.state, '(0=Active, 1=Ready, 2=Drawn)');
    console.log('vault.is_drawn:', v.is_drawn);
  } else {
    console.log('vault: NOT FOUND');
    return;
  }

  // Fetch vault token account
  const vtaInfo = await connection.getAccountInfo(vaultTokenAccount);
  console.log('vault_token_account exists:', !!vtaInfo);
  if (vtaInfo) {
    const amount = vtaInfo.data.readBigUInt64LE(64);
    console.log('  vault_token_account balance:', amount.toString());
  }

  // Fetch treasury_fpt_ata
  const tfataInfo = await connection.getAccountInfo(treasuryFptAta);
  console.log('treasury_fpt_ata exists:', !!tfataInfo);

  // Fetch pending_draw
  const pdInfo = await connection.getAccountInfo(pendingDraw);
  console.log('pending_draw exists:', !!pdInfo);
  if (pdInfo) {
    const d = pdInfo.data;
    // 8 disc | u8 lottery_type_id | u8 tier | pub randomness_account[32] | [u8;32] commitment | pub requester[32] | i64 requested_at | u64 request_reveal_slot | u8 bump
    const randAccPk = new PublicKey(d.slice(10, 42));
    const requester = new PublicKey(d.slice(74, 106));
    const requested_at = d.readBigInt64LE(106);
    const request_reveal_slot = d.readBigUInt64LE(114);
    const bump = d[122];
    const now = BigInt(Math.floor(Date.now() / 1000));
    console.log('  randomness_account:', randAccPk.toString());
    console.log('  requester:', requester.toString());
    console.log('  requested_at:', requested_at.toString(), '(', (now - requested_at).toString(), 's ago)');
    console.log('  request_reveal_slot:', request_reveal_slot.toString());

    // Check randomness account
    const raInfo = await connection.getAccountInfo(randAccPk);
    if (raInfo && raInfo.data.length >= 184) {
      const revealSlot = raInfo.data.readBigUInt64LE(144);
      console.log('  SB reveal_slot:', revealSlot.toString());
      console.log('  reveal_slot > request_reveal_slot:', revealSlot > request_reveal_slot);
      if (revealSlot > BigInt(0)) {
        console.log('  → Oracle HAS revealed ✓');
      } else {
        console.log('  → Oracle NOT yet revealed ✗');
      }
    }

    // Check expiry (1 hour = 3600s)
    const EXPIRY_SECS = BigInt(3600);
    console.log('  expired:', (now - requested_at) > EXPIRY_SECS, `(${(now - requested_at).toString()}s vs ${EXPIRY_SECS}s limit)`);
  }

  // Fetch participant pages
  for (let page = 0; page < 2; page++) {
    const typeBuffer = Buffer.alloc(4); typeBuffer.writeUInt32LE(typeId, 0);
    const tierBuffer = Buffer.alloc(4); tierBuffer.writeUInt32LE(tier, 0);
    const pageBuffer = Buffer.alloc(4); pageBuffer.writeUInt32LE(page, 0);
    const [pagePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('page'), typeBuffer, tierBuffer, pageBuffer], PROGRAM_ID
    );
    const pageInfo = await connection.getAccountInfo(pagePDA);
    if (pageInfo) {
      const vecLen = pageInfo.data.readUInt32LE(14);
      console.log(`  page${page} PDA=${pagePDA.toString().slice(0,8)}… participants=${vecLen}`);
    } else {
      console.log(`  page${page}: NOT FOUND`);
    }
  }
}

async function main() {
  await checkAll('LPM', 5);
  await checkAll('DPL', 5);
  await checkAll('DPL', 10);
}
main().catch(console.error);

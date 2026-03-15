/**
 * POST /api/draw/fulfill
 *
 * Step 3 (final) — "House-sponsored" fulfill_draw_entropy.
 *
 * Reads the on-chain PendingDraw + RandomnessAccount, computes the winner
 * using the same VRF entropy function as the Rust program, then submits
 * fulfill_draw_entropy signed by the crank wallet so no user wallet popup
 * appears.
 *
 * Called automatically by the house auto-trigger (all 4 lottery pages) after
 * /api/draw/request confirms the oracle reveal.  If this route fails the
 * frontend falls back to the manual "Claim Reward & Finalize" button so the
 * user can complete the draw themselves.
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  ComputeBudgetProgram,
  Transaction,
} from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { AnchorProvider, BN, Program } from '@coral-xyz/anchor';
import { guardRequest, validateInputs, safeError } from '../../_guard';

// ─── IDL ─────────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-var-requires
const IDL = require('@/idl/fortress_protocol.json');

// ─── Constants ────────────────────────────────────────────────────────────────
const PROGRAM_ID   = new PublicKey('2JHDbUz11kLe7q44nneougHcJCQqD6t26XeEFFNQJpHY');
const FPT_MINT     = new PublicKey('3YTnzmFTECtyKDxaghWPQcjzX7g1Cj3NxMq41JdWk2rj');
const RPC_ENDPOINT = process.env.SOLANA_RPC_ENDPOINT
  ?? process.env.NEXT_PUBLIC_RPC_ENDPOINT
  ?? 'https://api.mainnet-beta.solana.com';

const LOTTERY_TYPE_ID: Record<string, number> = { LPM: 0, DPL: 1, WPL: 2, MPL: 3 };

const VAULT_SEED: Record<string, string> = {
  LPM: 'vault_lpm',
  DPL: 'vault_dpl',
  WPL: 'vault_wpl',
  MPL: 'vault_mpl',
};

// Switchboard RandomnessAccount layout offsets (same as crank/index.ts)
const REVEAL_SLOT_OFFSET = 144; // u64 LE — slot when oracle revealed
const SB_VALUE_OFFSET    = 152; // [u8; 32] — VRF output

// Settler reward: 0.5 FPT within [MIN=100_000, MAX=5_000_000]
const SETTLER_REWARD_FPT = 500_000;

// How long to poll for oracle reveal — oracle should have already revealed
// because /api/draw/request calls revealIx before returning success.
const POLL_TIMEOUT_MS  = 30_000;
const POLL_INTERVAL_MS = 1_500;

// ─── PDA helpers ──────────────────────────────────────────────────────────────

function getVaultPDA(lotteryType: string, tier: number): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(VAULT_SEED[lotteryType]), Buffer.from([tier])],
    PROGRAM_ID,
  )[0];
}

function getPendingDrawPDA(lotteryTypeId: number, tier: number): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('pending_draw'), Buffer.from([lotteryTypeId]), Buffer.from([tier])],
    PROGRAM_ID,
  )[0];
}

function getSolVaultPDA(): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from('sol_vault')], PROGRAM_ID)[0];
}

function getTreasuryPDA(): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from('treasury')], PROGRAM_ID)[0];
}

function getGlobalRegistryPDA(): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from('global_registry')], PROGRAM_ID)[0];
}

function getWinnerHistoryPDA(typeId: number, tier: number): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('winner_history'), Buffer.from([typeId]), Buffer.from([tier])],
    PROGRAM_ID,
  )[0];
}

function getParticipantPagePDA(typeId: number, tier: number, page: number): PublicKey {
  const tb = Buffer.alloc(4); tb.writeUInt32LE(typeId, 0);
  const rb = Buffer.alloc(4); rb.writeUInt32LE(tier,   0);
  const pb = Buffer.alloc(4); pb.writeUInt32LE(page,   0);
  return PublicKey.findProgramAddressSync(
    [Buffer.from('page'), tb, rb, pb],
    PROGRAM_ID,
  )[0];
}

// ─── VRF entropy (mirrors oracle.rs create_lottery_entropy_from_slot) ─────────
// Must be bit-for-bit identical to the Rust implementation.

function computeVrfEntropy(
  sbValue:     Uint8Array,
  commitment:  Uint8Array,
  typeId:      number,
  tier:        number,
  roundNumber: number,
): bigint {
  const M  = BigInt('0xffffffffffffffff');
  const K1 = BigInt('0x9e3779b97f4a7c15');
  const K2 = BigInt('0x517cc1b727220a95');
  const mul  = (a: bigint, b: bigint) => (a * b) & M;
  const rotL = (x: bigint, n: number) =>
    ((x << BigInt(n)) | (x >> BigInt(64 - n))) & M;
  const u64 = (b: Uint8Array, o: number) => {
    let v = BigInt(0);
    for (let i = 0; i < 8; i++) v |= BigInt(b[o + i]) << BigInt(i * 8);
    return v;
  };

  const s0 = u64(sbValue, 0);  const s1 = u64(sbValue, 8);
  const s2 = u64(sbValue, 16); const s3 = u64(sbValue, 24);
  const c0 = u64(commitment, 0);
  const c1 = u64(commitment, 8);
  const meta = (BigInt(typeId)      << BigInt(56))
             | (BigInt(tier)        << BigInt(48))
             | (BigInt(roundNumber) & BigInt(0xffff));

  let st = mul(s0, K1);
  st ^= rotL(mul(s1, K2), 27);
  st ^= mul(rotL(s2, 13), K1);
  st ^= mul(rotL(s3, 41), K2);
  st ^= mul(c0, (K1 + K2) & M);
  st ^= rotL(mul(c1, mul(K2, K1)), 19);
  st ^= rotL(mul(meta, K1), 31);
  return st & M;
}

// ─── Participant page reader ───────────────────────────────────────────────────

function readPageParticipants(data: Buffer): PublicKey[] {
  if (data.length < 18) return [];
  // ParticipantPage layout (after 8B discriminator):
  //   u8 lottery_type(1) + u8 tier(1) + u32 page_number(4) = 6B metadata
  //   then Vec<Pubkey>: u32 len(4) + 32B × n  (total metadata = 8+6 = 14, vec len at 14)
  const vecLen = data.readUInt32LE(14);
  const out: PublicKey[] = [];
  let off = 18;
  for (let i = 0; i < vecLen && off + 32 <= data.length; i++) {
    out.push(new PublicKey(data.slice(off, off + 32)));
    off += 32;
  }
  return out;
}

// ─── Crank keypair loading ─────────────────────────────────────────────────────

function loadCrankKeypair(): Keypair {
  const secretB64 = process.env.CRANK_SECRET_KEY;
  if (secretB64) {
    const bytes = Buffer.from(secretB64, 'base64');
    if (bytes.length !== 64) throw new Error('CRANK_SECRET_KEY must be 64 bytes base64');
    return Keypair.fromSecretKey(new Uint8Array(bytes));
  }
  const keyPath = process.env.CRANK_KEYPAIR_PATH ?? '/home/dev/crank-wallet.json';
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(keyPath, 'utf8'))));
}

// ─── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const blocked = guardRequest(req, 'fulfill');
  if (blocked) return blocked;
  try {
    return await handlePost(req);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[FULFILL] Unhandled error:', msg);
    return safeError('FULFILL', msg, 500);
  }
}

async function handlePost(req: NextRequest): Promise<NextResponse> {
  // 1. Load crank keypair
  let crankKeypair: Keypair;
  try {
    crankKeypair = loadCrankKeypair();
  } catch (e) {
    console.error('[FULFILL] Failed to load keypair:', e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: 'Server misconfiguration: crank keypair unavailable' },
      { status: 500 },
    );
  }

  // 2. Parse + validate body
  let lotteryType: string, tier: number;
  try {
    const body = await req.json();
    if (typeof body.lottery_type !== 'string') throw new Error('bad type');
    lotteryType = body.lottery_type.toUpperCase();
    tier = Number(body.tier);
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const inputErr = validateInputs(lotteryType, tier);
  if (inputErr) return inputErr;

  const lotteryTypeId = LOTTERY_TYPE_ID[lotteryType];
  const connection    = new Connection(RPC_ENDPOINT, 'confirmed');

  // 3. Read PendingDraw — if missing the draw may have already been fulfilled
  const pdPDA   = getPendingDrawPDA(lotteryTypeId, tier);
  const pdInfo  = await connection.getAccountInfo(pdPDA, 'confirmed');
  if (!pdInfo || pdInfo.data.length < 43) {
    return NextResponse.json(
      { error: 'No pending draw on-chain — already fulfilled or not yet started', already_fulfilled: true },
      { status: 409 },
    );
  }
  const pd = pdInfo.data;
  // PendingDraw layout: disc(8) + lottery_type_id(1) + tier(1) + randomness_account(32)
  //   + user_commitment(32) + requester(32) + requested_at(8) + bump(1) + request_reveal_slot(8)
  const randomnessAccountPk = new PublicKey(pd.slice(10, 42));
  const storedCommitment    = new Uint8Array(pd.slice(42, 74));
  const requestRevealSlot   = pd.length >= 123 ? pd.readBigUInt64LE(115) : BigInt(0);

  // 4. Read vault for roundNumber + participantCount
  // LotteryVault layout: disc(8) + lottery_type(1) + tier(1) + round_number(4) + balance(8) + participant_count(4)
  const vaultPDA  = getVaultPDA(lotteryType, tier);
  const vaultInfo = await connection.getAccountInfo(vaultPDA, 'confirmed');
  if (!vaultInfo || vaultInfo.data.length < 26) {
    return NextResponse.json({ error: 'Vault account not found' }, { status: 409 });
  }
  const vd             = vaultInfo.data;
  const roundNumber    = vd.readUInt32LE(10);
  // balance: disc(8)+lottery_type(1)+tier(1)+round(4) = offset 14, i64 LE 8 bytes
  const balanceLo    = vd.readUInt32LE(14);
  const balanceHi    = vd.readUInt32LE(18);
  const vaultBalance = balanceLo + balanceHi * 4294967296; // µFPT (6 decimals → divide by 1e6 = FPT)
  const participantCount = vd.readUInt32LE(22);

  if (participantCount === 0) {
    return NextResponse.json(
      { error: 'Vault has 0 participants — draw already settled', already_fulfilled: true },
      { status: 409 },
    );
  }

  // 5. Poll RandomnessAccount until oracle reveals (revealSlot > requestRevealSlot)
  //    /api/draw/request already called revealIx, so this should resolve in 0-1 polls.
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let sbValue: Uint8Array | null = null;

  while (Date.now() < deadline) {
    const raInfo = await connection.getAccountInfo(randomnessAccountPk, 'processed');
    if (raInfo && raInfo.data.length >= SB_VALUE_OFFSET + 32) {
      const revealSlot = raInfo.data.readBigUInt64LE(REVEAL_SLOT_OFFSET);
      if (revealSlot > requestRevealSlot) {
        sbValue = new Uint8Array(raInfo.data.slice(SB_VALUE_OFFSET, SB_VALUE_OFFSET + 32));
        break;
      }
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }

  if (!sbValue) {
    return NextResponse.json(
      { error: 'Oracle did not reveal within 30s — will retry on next crank run', oracle_timeout: true },
      { status: 408 },
    );
  }

  // 6. Compute winner (off-chain, mirrors oracle.rs create_lottery_entropy_from_slot)
  const entropyBI    = computeVrfEntropy(sbValue, storedCommitment, lotteryTypeId, tier, roundNumber);
  const winnerIdx    = Number(entropyBI % BigInt(participantCount));

  // 7. Read participant pages
  const page0PDA = getParticipantPagePDA(lotteryTypeId, tier, 0);
  const page1PDA = getParticipantPagePDA(lotteryTypeId, tier, 1);
  const [page0Info, page1Info] = await Promise.all([
    connection.getAccountInfo(page0PDA, 'confirmed'),
    connection.getAccountInfo(page1PDA, 'confirmed'),
  ]);
  const page0     = page0Info ? readPageParticipants(page0Info.data) : [];
  const page1     = page1Info ? readPageParticipants(page1Info.data) : [];
  const allPtcpts = [...page0, ...page1];

  if (allPtcpts.length === 0) {
    return NextResponse.json(
      { error: 'Participant pages are empty — cannot determine winner' },
      { status: 409 },
    );
  }

  const safeIdx        = winnerIdx % allPtcpts.length;
  const winnerPubkey   = allPtcpts[safeIdx];
  const winningPagePDA = safeIdx < page0.length ? page0PDA : page1PDA;

  // 8. Build Anchor provider + program (inline wallet to avoid ESM warnings)
  const wallet = {
    publicKey: crankKeypair.publicKey,
    payer:     crankKeypair,
    signTransaction: async <T extends Transaction>(tx: T): Promise<T> => {
      tx.partialSign(crankKeypair);
      return tx;
    },
    signAllTransactions: async <T extends Transaction>(txs: T[]): Promise<T[]> => {
      txs.forEach(tx => tx.partialSign(crankKeypair));
      return txs;
    },
  };
  const provider = new AnchorProvider(connection, wallet as unknown as import('@coral-xyz/anchor').Wallet, {
    commitment: 'confirmed',
    skipPreflight: true,
  });
  const program = new Program(IDL as import('@coral-xyz/anchor').Idl, provider);

  // 9. Derive ATAs and PDAs
  const solVault       = getSolVaultPDA();
  const vaultTokenAcct = getAssociatedTokenAddressSync(FPT_MINT, vaultPDA,               true,  TOKEN_2022_PROGRAM_ID);
  const winnerAta      = getAssociatedTokenAddressSync(FPT_MINT, winnerPubkey,            false, TOKEN_2022_PROGRAM_ID);
  const authorityAta   = getAssociatedTokenAddressSync(FPT_MINT, crankKeypair.publicKey,  false, TOKEN_2022_PROGRAM_ID);
  const treasuryFptAta = getAssociatedTokenAddressSync(FPT_MINT, solVault,                true,  TOKEN_2022_PROGRAM_ID);

  // 10. Submit fulfill_draw_entropy
  let fulfillSig: string;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fulfillSig = await ((program.methods as any)
      .fulfillDrawEntropy(lotteryTypeId, tier, new BN(SETTLER_REWARD_FPT))
      .accountsStrict({
        authority:              crankKeypair.publicKey,
        fptMint:                FPT_MINT,
        lotteryState:           vaultPDA,
        vaultTokenAccount:      vaultTokenAcct,
        winner:                 winnerPubkey,
        winnerAta,
        treasuryVault:          solVault,
        treasury:               getTreasuryPDA(),
        treasuryFptAta,
        authorityAta,
        participantPage0:       page0PDA,
        winningParticipantPage: winningPagePDA,
        config:                 getGlobalRegistryPDA(),
        randomnessAccount:      randomnessAccountPk,
        winnerHistory:          getWinnerHistoryPDA(lotteryTypeId, tier),
        pendingDraw:            pdPDA,
        tokenProgram:           TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram:          SystemProgram.programId,
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }),
      ])
      .rpc({ skipPreflight: true, commitment: 'confirmed' })) as string;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[FULFILL] fulfill_draw_entropy failed:', msg);
    return safeError('FULFILL', 'fulfill_draw_entropy failed on-chain', 502);
  }

  console.log(
    `[FULFILL] 🎉 Draw complete — ${lotteryType} T$${tier}` +
    `  winner=${winnerPubkey.toBase58()}  sig=${fulfillSig}`,
  );
  return NextResponse.json({
    success: true,
    winner: winnerPubkey.toBase58(),
    sig: fulfillSig,
    prize: vaultBalance,      // µFPT — divide by 1e6 yields FPT
    tier,
    lotteryType,
  });
}

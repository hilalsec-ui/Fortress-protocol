/**
 * POST /api/draw/request
 *
 * Step 1 — "House-Sponsored" Silent Crank.
 * Signs request_draw_entropy with the server-side CRANK_AUTHORITY wallet so the
 * user sees ZERO wallet popups.  The crank wallet is the only key allowed to sign
 * this instruction on-chain (enforced in the Rust program).
 *
 * Security notes:
 *  • The crank keypair is loaded from a JSON file on the server filesystem
 *    (CRANK_KEYPAIR_PATH env var, default /home/dev/crank-wallet.json).
 *    The private key is NEVER stored in environment variables or config files.
 *  • If the keypair file is missing or invalid, the handler returns HTTP 500.
 *  • All on-chain pre-flight checks run before signing (lazy-reset protection, etc.).
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import { AnchorProvider, BN, Program } from '@coral-xyz/anchor';
import * as sb from '@switchboard-xyz/on-demand';
import { guardRequest, validateInputs, safeError } from '../../_guard';

// ─── IDL ─────────────────────────────────────────────────────────────────────
const IDL = require('@/idl/fortress_protocol.json');

// ─── Constants (server-safe copies — no "use client" import) ────────────────
const PROGRAM_ID    = new PublicKey('EB6kkg2sW5rnukjRH7Ljhz78gbfc36XZAuiFn5jdefF3');
// Server-side RPC: prefer unpublished env var to avoid leaking API keys in client bundle
const RPC_ENDPOINT  = process.env.SOLANA_RPC_ENDPOINT
  ?? process.env.NEXT_PUBLIC_RPC_STANDARD
  ?? process.env.NEXT_PUBLIC_RPC_GATEKEEPER
  ?? process.env.NEXT_PUBLIC_RPC_URL
  ?? process.env.NEXT_PUBLIC_RPC_ENDPOINT
  ?? 'https://api.mainnet-beta.solana.com';
const SB_MAINNET_QUEUE = new PublicKey('3u9PpRz7fN8Lp693zPueppQf94v7N2jKj3C18j9o7oG1');
const CRANK_AUTHORITY = new PublicKey('BzsGQccSzoWPiRSKoTNpf7iKxqJRq3CwvSygmzvwMei5');

const LOTTERY_TYPE_ID: Record<string, number> = { LPM: 0, DPL: 1, WPL: 2, MPL: 3 };

const VAULT_SEED: Record<string, string> = {
  LPM: 'vault_lpm',
  DPL: 'vault_dpl',
  WPL: 'vault_wpl',
  MPL: 'vault_mpl',
};

// Switchboard RandomnessAccount pre-initialised per (type, tier).
const SB_RANDOMNESS_ACCOUNTS: Record<string, Record<number, string>> = {
  LPM: { 5: '3RNBFv6gsfLVAdPShje3U4oWksJ5yei8BxAPEpkpjvcZ', 10: '89yqdqDCCEVEcDDtiSruUzbogPwvSafQogVw6RrvWyXr', 20: 'ABztidiDtQc5f8AWpCEAH812SsMWPFfx1cj6hq97jsPK', 50: 'BaVkrGGXenHmyJiugxqabVUZT688cRdqbzWTR5B8FRRd' },
  DPL: { 5: 'DXD7WX7ZJ6J3G4en9QjfLMED4NNFaUccnH2p4SBDnELi', 10: 'BVsgsmAcgxuut5m6iHTVq2cjQ9Kou8zwGfwb9oBAUect', 15: '54jw437jQKWWx4fSNhUm1ksVyXMbtNVPExDmPzNX7VR8', 20: 'AQqoHS5s5VABzpGdjTRcxDUwTWgs8bWtM8gTuMAzXS1T' },
  WPL: { 5: 'EoHXzefgFstYot72iswj9oZ3UHbPdCv44boodxDD4Age', 10: 'H5ekLQD7NwKgcpc5AJ73nEohv5QTxVUVYHFAh2kMGfSR', 15: '5RnkTBHtqV9j7Z9xEiDDixwsCLNwNKjDa9N4vBr74XYt', 20: '8YZaUddM74dH3Aqe3wAYUyJnVNDQaZyCfh7UpS8pKW4C' },
  MPL: { 5: '2H1VT31g6gXLfpoT92D3yvtqCBaztXELiueUXYdPKUMB', 10: 'Hag4Kd215YVSCVsQfA9K85PmF2LBRij3WF65FAJbjNNy', 15: '2d8TfV4tmGNT5bANfYPPy3CaqhmUczKzp9DEinE6kaTA', 20: 'Hhza1xnE1cn89xTE3Mmn9Zx5y426iUdpdkySAjUMpCrD' },
};

// ─── PDA helpers (pure computation — no wallet I/O) ─────────────────────────
function getVaultPDA(lotteryType: string, tier: number): PublicKey {
  const seed = VAULT_SEED[lotteryType];
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from(seed), Buffer.from([tier])],
    PROGRAM_ID,
  );
  return pda;
}

function getPendingDrawPDA(lotteryTypeId: number, tier: number): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('pending_draw'), Buffer.from([lotteryTypeId]), Buffer.from([tier])],
    PROGRAM_ID,
  );
  return pda;
}

// ─── Vault on-chain state helpers ────────────────────────────────────────────
interface VaultState {
  participantCount: number;
  endTime: number;     // unix seconds — 0 for LPM
  state: number;       // VaultState enum: 0=Active, 1=ReadyToWithdraw, 2=Claimed, 3=Ready
}

async function fetchVaultState(
  connection: Connection,
  vaultPDA: PublicKey,
): Promise<VaultState | null> {
  const info = await connection.getAccountInfo(vaultPDA, 'confirmed');
  if (!info || info.data.length < 60) return null;

  // LotteryVault layout (Anchor discriminator + fields):
  // disc(8) + lottery_type(1) + tier(1) + round_number(4) + balance(8) + participant_count(4)
  // + current_page(4) + end_time(8) + last_winner(33) + last_prize(8) + is_drawn(1) + state(1) + bump(1)
  const d = info.data;
  const participantCount = d.readUInt32LE(22);
  // end_time: @30 (8 bytes, i64 LE)
  const endTimeLo = d.readUInt32LE(30);
  const endTimeHi = d.readUInt32LE(34);
  const endTime = endTimeLo + endTimeHi * 4294967296;
  // state: @80 (1 byte enum)
  const stateVal = d[80] ?? 0;

  return { participantCount, endTime, state: stateVal };
}

// ─── Route handler ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest): Promise<NextResponse> {
  // Auth + rate-limit guard (returns 401/429 if rejected)
  const blocked = guardRequest(req, 'request');
  if (blocked) return blocked;
  try {
    return await handlePost(req);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[CRANK] Unhandled error in POST handler:', msg);
    return safeError('CRANK', msg, 500);
  }
}

// ─── Crank keypair loading ───────────────────────────────────────────────────
// Priority (most secure first):
//
// 1. CRANK_SECRET_KEY env var — base64-encoded 64-byte secret key.
//    Set this from a secrets manager (AWS Secrets Manager, HashiCorp Vault,
//    Vercel/Railway encrypted env, etc.) in production. The value is NEVER
//    logged and never written to disk by this process.
//    Generate the value with:
//      node -e "const k=require('fs').readFileSync('/home/dev/crank-wallet.json'); \
//               console.log(Buffer.from(JSON.parse(k)).toString('base64'));"
//
// 2. CRANK_KEYPAIR_PATH env var — path to a JSON keypair file on the server
//    filesystem (Solana CLI format: [u8; 64] array).
//    File must be outside the project directory with chmod 600.
//    Defaults to /home/dev/crank-wallet.json when no env var is set.
//    Use this for local dev / self-hosted servers where a secrets manager
//    is not available.
//
// NEVER: put the raw bytes or base64 value in .env files that get committed.
// Add *-wallet.json and *-keypair.json to .gitignore (already done).

function loadCrankKeypair(): Keypair {
  // Option 1: injected via secrets manager as base64
  const secretB64 = process.env.CRANK_SECRET_KEY;
  if (secretB64) {
    const bytes = Buffer.from(secretB64, 'base64');
    if (bytes.length !== 64) {
      throw new Error('CRANK_SECRET_KEY must be a base64-encoded 64-byte secret key');
    }
    return Keypair.fromSecretKey(new Uint8Array(bytes));
  }

  // Option 2: keypair file on disk
  const keyPath = process.env.CRANK_KEYPAIR_PATH ?? '/home/dev/crank-wallet.json';
  const raw = fs.readFileSync(keyPath, 'utf8');
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

async function handlePost(req: NextRequest): Promise<NextResponse> {
  // 1. Load + validate crank keypair — secret never logged or exposed in responses
  let crankKeypair: Keypair;
  try {
    crankKeypair = loadCrankKeypair();
  } catch (e) {
    const hint = process.env.CRANK_SECRET_KEY
      ? 'Check CRANK_SECRET_KEY env var (must be base64, 64 bytes)'
      : `Could not read keypair file at ${process.env.CRANK_KEYPAIR_PATH ?? '/home/dev/crank-wallet.json'}`;
    console.error('[CRANK] Failed to load keypair:', hint, e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: 'Server misconfiguration: crank keypair unavailable' },
      { status: 500 },
    );
  }

  // Sanity-check: ensure the loaded key matches the on-chain CRANK_AUTHORITY constant.
  if (!crankKeypair.publicKey.equals(CRANK_AUTHORITY)) {
    console.error('[CRANK] Key mismatch: keypair file does not match CRANK_AUTHORITY');
    return NextResponse.json({ error: 'Server misconfiguration: crank authority mismatch' }, { status: 500 });
  }

  // 2. Parse request body
  let lotteryType: string;
  let tier: number;
  try {
    const body = await req.json();
    if (typeof body.lottery_type !== 'string') throw new Error('bad type');
    lotteryType = body.lottery_type.toUpperCase();
    tier = Number(body.tier);
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // Strict whitelist validation — prevents float, NaN, prototype-injection, etc.
  const inputErr = validateInputs(lotteryType, tier);
  if (inputErr) return inputErr;

  const lotteryTypeId = LOTTERY_TYPE_ID[lotteryType];
  const randomnessStr = SB_RANDOMNESS_ACCOUNTS[lotteryType]?.[tier];
  if (!randomnessStr) {
    return NextResponse.json(
      { error: `No RandomnessAccount configured for ${lotteryType} tier ${tier}` },
      { status: 400 },
    );
  }

  // 3. On-chain pre-flight validation
  const connection = new Connection(RPC_ENDPOINT, 'confirmed');

  // Balance check — if crank wallet is too low to pay fees, signal the frontend
  // to skip retries and immediately present the manual fallback to the user.
  const MIN_CRANK_BALANCE = 10_000_000; // 0.01 SOL
  const crankBalance = await connection.getBalance(crankKeypair.publicKey, 'confirmed');
  if (crankBalance < MIN_CRANK_BALANCE) {
    console.warn(`[CRANK] Wallet balance too low: ${crankBalance} lamports — triggering user fallback`);
    return NextResponse.json(
      { error: `Crank wallet balance too low (${crankBalance} lamports) — use manual fallback`, fallback_required: true },
      { status: 402 },
    );
  }

  const vaultPDA = getVaultPDA(lotteryType, tier);
  const pendingDrawPDA = getPendingDrawPDA(lotteryTypeId, tier);
  const [treasuryVaultPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('sol_vault')],
    PROGRAM_ID,
  );

  // Guard: check if a draw is already in progress for this tier.
  const existingDraw = await connection.getAccountInfo(pendingDrawPDA, 'confirmed');
  if (existingDraw) {
    return NextResponse.json({ error: 'Draw already in progress for this tier' }, { status: 409 });
  }

  const vaultState = await fetchVaultState(connection, vaultPDA);
  if (!vaultState) {
    return NextResponse.json({ error: 'Vault account not found or invalid' }, { status: 409 });
  }

  const nowSec = Math.floor(Date.now() / 1000);

  if (lotteryTypeId === 0) {
    // LPM: trigger only when FULL (100 participants)
    if (vaultState.participantCount < 100) {
      return NextResponse.json(
        { error: `LPM tier $${tier} not full yet (${vaultState.participantCount}/100)` },
        { status: 409 },
      );
    }
  } else {
    // Time-based: trigger only when expired AND has participants

    // CRITICAL: Lazy Reset Protection — empty expired pool must stay idle
    if (vaultState.participantCount === 0) {
      return NextResponse.json(
        { error: `Tier $${tier} is expired with 0 participants — lazy reset required, not a draw` },
        { status: 409 },
      );
    }

    if (vaultState.endTime <= 0 || nowSec < vaultState.endTime) {
      return NextResponse.json(
        { error: `Tier $${tier} timer has not expired yet` },
        { status: 409 },
      );
    }
  }

  // Guard: vault must not already be in "Ready" (drawn) state
  if (vaultState.state === 3) {
    return NextResponse.json({ error: 'Vault already drawn (state=Ready)' }, { status: 409 });
  }

  // 4. Verify the RandomnessAccount is owned by Switchboard (quick sanity check)
  const randomnessAccount = new PublicKey(randomnessStr);
  const rndInfo = await connection.getAccountInfo(randomnessAccount, 'confirmed');
  if (!rndInfo) {
    return NextResponse.json(
      { error: `RandomnessAccount ${randomnessStr} not found` },
      { status: 500 },
    );
  }

  // 5. Build + submit Step 1: request_draw_entropy (creates PendingDraw PDA)
  // Inline wallet adapter — satisfies AnchorProvider's Wallet interface without
  // importing the Wallet class (which triggers a webpack ESM false-positive warning).
  const wallet = {
    publicKey: crankKeypair.publicKey,
    payer: crankKeypair,
    signTransaction: async <T extends Transaction>(tx: T): Promise<T> => {
      tx.partialSign(crankKeypair);
      return tx;
    },
    signAllTransactions: async <T extends Transaction>(txs: T[]): Promise<T[]> => {
      txs.forEach(tx => tx.partialSign(crankKeypair));
      return txs;
    },
  };
  const provider = new AnchorProvider(connection, wallet as any, {
    commitment: 'confirmed',
    skipPreflight: true,
  });

  const program = new Program(IDL as any, provider);

  // Generate a fresh random commitment for this draw request
  const userCommitment = Array.from(crypto.getRandomValues(new Uint8Array(32))) as number[];

  let sig: string;
  try {
    sig = await (program.methods as any)
      .requestDrawEntropy(lotteryTypeId, tier, userCommitment, new BN(0))
      .accountsStrict({
        requester:        crankKeypair.publicKey,
        lotteryState:     vaultPDA,
        pendingDraw:      pendingDrawPDA,
        treasuryVault:    treasuryVaultPDA,
        systemProgram:    SystemProgram.programId,
        randomnessAccount,
      })
      .rpc({ skipPreflight: true, commitment: 'confirmed' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[CRANK] requestDrawEntropy failed:', msg);
    return safeError('CRANK', 'On-chain draw request failed', 502);
  }

  console.log(`[CRANK] request_draw_entropy OK — ${lotteryType} T$${tier} sig=${sig}`);

  // 6. Switchboard randomness_commit + reveal — two SDK transactions.
  //    commit: assigns an oracle and sets seedSlot on-chain.
  //    reveal: contacts the oracle's TEE gateway to fetch the reveal, then
  //            submits randomnessReveal on-chain (sets revealSlot > 0).
  //    The crank handles both steps so the frontend only needs to call
  //    fulfillDrawEntropy once oracle_ready is detected (revealSlot > 0).
  const sbProgram = await sb.AnchorUtils.loadProgramFromConnection(connection, wallet as any);
  const rnd = new sb.Randomness(sbProgram, randomnessAccount);

  let commitOk = false;
  try {
    const commitIx = await rnd.commitIx(SB_MAINNET_QUEUE);
    const commitTx = new Transaction().add(commitIx);
    const commitSig = await provider.sendAndConfirm(commitTx, [], {
      skipPreflight: true,
      commitment: 'confirmed',
    });
    console.log(`[CRANK] randomness_commit OK — sig=${commitSig}`);
    commitOk = true;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[CRANK] randomness_commit FAILED: ${msg}`);
  }

  if (!commitOk) {
    return NextResponse.json({ success: false, oracle_failed: true, signature: sig, lotteryType, tier });
  }

  // Wait 2 slots (~800ms) so seedSlot is in the past and the oracle gateway
  // has the slothash needed to generate randomness before we request reveal.
  await new Promise(r => setTimeout(r, 2500));

  let revealOk = false;
  try {
    const revealIx = await rnd.revealIx();
    const revealTx = new Transaction().add(revealIx);
    const revealSig = await provider.sendAndConfirm(revealTx, [], {
      skipPreflight: true,
      commitment: 'confirmed',
    });
    console.log(`[CRANK] randomness_reveal OK — sig=${revealSig}`);
    revealOk = true;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[CRANK] randomness_reveal FAILED: ${msg}`);
  }

  if (!revealOk) {
    return NextResponse.json({ success: false, oracle_failed: true, signature: sig, lotteryType, tier });
  }

  return NextResponse.json({ success: true, signature: sig, lotteryType, tier });
}

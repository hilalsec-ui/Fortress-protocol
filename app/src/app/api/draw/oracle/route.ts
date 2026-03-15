/**
 * POST /api/draw/oracle
 *
 * Fallback oracle kick.
 * After the user signs+submits request_draw_entropy (via /api/draw/build),
 * the frontend calls this endpoint to complete the Switchboard commit+reveal
 * cycle.  The crank wallet signs only the Switchboard-native oracle transactions
 * (small oracle fees), NOT the draw instruction itself.
 *
 * The randomness account is read directly from the on-chain PendingDraw so this
 * endpoint works regardless of which wallet triggered the draw.
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from '@solana/web3.js';
import { AnchorProvider } from '@coral-xyz/anchor';
import * as sb from '@switchboard-xyz/on-demand';
import { guardRequest, validateInputs, safeError } from '../../_guard';

// ─── Constants ───────────────────────────────────────────────────────────────
// Server-side RPC: prefer unpublished env var to avoid leaking API keys in client bundle
const RPC_ENDPOINT    = process.env.SOLANA_RPC_ENDPOINT ?? process.env.NEXT_PUBLIC_RPC_URL ?? process.env.NEXT_PUBLIC_RPC_ENDPOINT ?? 'https://api.mainnet-beta.solana.com';
const SB_MAINNET_QUEUE = new PublicKey('3u9PpRz7fN8Lp693zPueppQf94v7N2jKj3C18j9o7oG1');
const PROGRAM_ID      = new PublicKey('2JHDbUz11kLe7q44nneougHcJCQqD6t26XeEFFNQJpHY');

const LOTTERY_TYPE_ID: Record<string, number> = { LPM: 0, DPL: 1, WPL: 2, MPL: 3 };

// Fallback static map — used only when PendingDraw data is somehow unavailable
const SB_RANDOMNESS_ACCOUNTS: Record<string, Record<number, string>> = {
  LPM: { 5: '3RNBFv6gsfLVAdPShje3U4oWksJ5yei8BxAPEpkpjvcZ', 10: '89yqdqDCCEVEcDDtiSruUzbogPwvSafQogVw6RrvWyXr', 20: 'ABztidiDtQc5f8AWpCEAH812SsMWPFfx1cj6hq97jsPK', 50: 'BaVkrGGXenHmyJiugxqabVUZT688cRdqbzWTR5B8FRRd' },
  DPL: { 5: 'DXD7WX7ZJ6J3G4en9QjfLMED4NNFaUccnH2p4SBDnELi', 10: 'BVsgsmAcgxuut5m6iHTVq2cjQ9Kou8zwGfwb9oBAUect', 15: '54jw437jQKWWx4fSNhUm1ksVyXMbtNVPExDmPzNX7VR8', 20: 'AQqoHS5s5VABzpGdjTRcxDUwTWgs8bWtM8gTuMAzXS1T' },
  WPL: { 5: 'EoHXzefgFstYot72iswj9oZ3UHbPdCv44boodxDD4Age', 10: 'H5ekLQD7NwKgcpc5AJ73nEohv5QTxVUVYHFAh2kMGfSR', 15: '5RnkTBHtqV9j7Z9xEiDDixwsCLNwNKjDa9N4vBr74XYt', 20: '8YZaUddM74dH3Aqe3wAYUyJnVNDQaZyCfh7UpS8pKW4C' },
  MPL: { 5: '2H1VT31g6gXLfpoT92D3yvtqCBaztXELiueUXYdPKUMB', 10: 'Hag4Kd215YVSCVsQfA9K85PmF2LBRij3WF65FAJbjNNy', 15: '2d8TfV4tmGNT5bANfYPPy3CaqhmUczKzp9DEinE6kaTA', 20: 'Hhza1xnE1cn89xTE3Mmn9Zx5y426iUdpdkySAjUMpCrD' },
};

// PendingDraw layout: disc(8) + lottery_type_id(1) + tier(1) + randomness_account(32) …
const PENDING_DRAW_RANDOMNESS_ACCOUNT_OFFSET = 10;

function getPendingDrawPDA(lotteryTypeId: number, tier: number): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('pending_draw'), Buffer.from([lotteryTypeId]), Buffer.from([tier])],
    PROGRAM_ID,
  );
  return pda;
}

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

// ─── Route handler ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest): Promise<NextResponse> {
  // Auth + rate-limit guard — oracle route has a tighter per-IP limit
  const blocked = guardRequest(req, 'oracle');
  if (blocked) return blocked;
  try {
    return await handlePost(req);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[ORACLE] Unhandled error:', msg);
    return safeError('ORACLE', msg, 500);
  }
}

async function handlePost(req: NextRequest): Promise<NextResponse> {
  // 1. Parse body
  let lotteryType: string, tier: number, mode: string, userPubkeyStr: string | null;
  try {
    const body  = await req.json();
    if (typeof body.lottery_type !== 'string') throw new Error('bad type');
    lotteryType = body.lottery_type.toUpperCase();
    tier        = Number(body.tier);
    mode        = body.mode ?? 'execute';  // 'execute' (default) || 'build'
    userPubkeyStr = body.user_pubkey ?? null;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // Strict whitelist validation
  const inputErr = validateInputs(lotteryType, tier);
  if (inputErr) return inputErr;

  const lotteryTypeId = LOTTERY_TYPE_ID[lotteryType];

  // 2. Resolve randomness account from on-chain PendingDraw
  const connection = new Connection(RPC_ENDPOINT, 'confirmed');
  const pendingDrawPDA = getPendingDrawPDA(lotteryTypeId, tier);

  const pdInfo = await connection.getAccountInfo(pendingDrawPDA, 'confirmed');
  if (!pdInfo) {
    return NextResponse.json(
      { error: 'PendingDraw not found on-chain — draw was not yet requested or already fulfilled' },
      { status: 409 },
    );
  }

  let randomnessAccountStr: string;
  if (pdInfo.data.length >= PENDING_DRAW_RANDOMNESS_ACCOUNT_OFFSET + 32) {
    randomnessAccountStr = new PublicKey(
      pdInfo.data.slice(PENDING_DRAW_RANDOMNESS_ACCOUNT_OFFSET, PENDING_DRAW_RANDOMNESS_ACCOUNT_OFFSET + 32),
    ).toBase58();
  } else {
    const fallback = SB_RANDOMNESS_ACCOUNTS[lotteryType]?.[tier];
    if (!fallback) {
      return NextResponse.json(
        { error: `Cannot resolve randomness account for ${lotteryType} tier ${tier}` },
        { status: 409 },
      );
    }
    randomnessAccountStr = fallback;
  }

  const randomnessAccount = new PublicKey(randomnessAccountStr);

  // ─── MODE: build ──────────────────────────────────────────────────────────
  // Returns a partially-signed commit TX for the user's wallet to co-sign as feePayer.
  // The crank keypair co-signs as the SB randomness account authority (requires 0 SOL
  // from the crank — the user pays all transaction and oracle fees).
  if (mode === 'build') {
    let userPubkey: PublicKey;
    try {
      if (!userPubkeyStr) throw new Error('missing');
      userPubkey = new PublicKey(userPubkeyStr);
    } catch {
      return NextResponse.json({ error: 'user_pubkey is required for mode=build' }, { status: 400 });
    }

    // The crank keypair is needed only as the SB randomness authority co-signer.
    // No balance check — the user is feePayer, the crank pays nothing.
    let crankKeypair: Keypair;
    try {
      crankKeypair = loadCrankKeypair();
    } catch (e) {
      const hint = process.env.CRANK_SECRET_KEY
        ? 'Check CRANK_SECRET_KEY env var'
        : `Cannot read ${process.env.CRANK_KEYPAIR_PATH ?? '/home/dev/crank-wallet.json'}`;
      console.error('[ORACLE] build mode — failed to load crank keypair:', hint);
      return safeError('ORACLE', 'Crank keypair unavailable for oracle co-signing', 500);
    }

    // Use crank wallet as the SB provider so that commitIx reads the stored
    // authority (= crankKeypair.publicKey) from the on-chain Randomness account.
    const crankWallet = {
      publicKey: crankKeypair.publicKey,
      signTransaction: async <T extends Transaction>(tx: T): Promise<T> => { tx.partialSign(crankKeypair); return tx; },
      signAllTransactions: async <T extends Transaction>(txs: T[]): Promise<T[]> => { txs.forEach(tx => tx.partialSign(crankKeypair)); return txs; },
    };
    const sbProgram = await sb.AnchorUtils.loadProgramFromConnection(connection, crankWallet as any);
    const rnd = new sb.Randomness(sbProgram, randomnessAccount);

    try {
      // No authority_ arg: SDK reads stored authority (CRANK_AUTHORITY) from the on-chain
      // Randomness account. Authority is isSigner:true in the commit instruction.
      const commitIx = await rnd.commitIx(SB_MAINNET_QUEUE);
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      // feePayer = userPubkey — user's wallet pays all transaction fees
      const commitTx = new Transaction({ recentBlockhash: blockhash, feePayer: userPubkey }).add(commitIx);
      // Crank partial-signs as the SB authority (no SOL required from crank)
      commitTx.partialSign(crankKeypair);
      const serialized = commitTx.serialize({ requireAllSignatures: false }).toString('base64');
      console.log(`[ORACLE] build — commit TX partial-signed (crank auth, user feePayer) for ${lotteryType} T$${tier} user=${userPubkeyStr?.slice(0,8)}…`);
      return NextResponse.json({ success: true, commit_tx: serialized, lotteryType, tier, mode: 'build' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[ORACLE] build mode — commitIx failed:', msg);
      return safeError('ORACLE', 'Failed to build commit instruction', 500);
    }
  }

  // ─── MODE: build_reveal ───────────────────────────────────────────────────
  // Returns a partially-signed reveal TX for the user's wallet to co-sign as feePayer.
  // Server-side: contacts the oracle TEE gateway to obtain the randomness proof.
  // feePayer = user (pays oracle reward fee via rewardEscrow); authority = crank (0 SOL needed).
  if (mode === 'build_reveal') {
    let userPubkey: PublicKey;
    try {
      if (!userPubkeyStr) throw new Error('missing');
      userPubkey = new PublicKey(userPubkeyStr);
    } catch {
      return NextResponse.json({ error: 'user_pubkey is required for mode=build_reveal' }, { status: 400 });
    }

    // Crank keypair needed as authority co-signer and for TEE gateway communication.
    // No balance check — user is feePayer, crank pays nothing.
    let crankKeypair: Keypair;
    try {
      crankKeypair = loadCrankKeypair();
    } catch (e) {
      const hint = process.env.CRANK_SECRET_KEY
        ? 'Check CRANK_SECRET_KEY env var'
        : `Cannot read ${process.env.CRANK_KEYPAIR_PATH ?? '/home/dev/crank-wallet.json'}`;
      console.error('[ORACLE] build_reveal mode — failed to load crank keypair:', hint);
      return safeError('ORACLE', 'Crank keypair unavailable for oracle co-signing', 500);
    }

    const crankWallet = {
      publicKey: crankKeypair.publicKey,
      signTransaction: async <T extends Transaction>(tx: T): Promise<T> => { tx.partialSign(crankKeypair); return tx; },
      signAllTransactions: async <T extends Transaction>(txs: T[]): Promise<T[]> => { txs.forEach(tx => tx.partialSign(crankKeypair)); return txs; },
    };
    const sbProgram = await sb.AnchorUtils.loadProgramFromConnection(connection, crankWallet as any);
    const rnd = new sb.Randomness(sbProgram, randomnessAccount);

    try {
      // revealIx(userPubkey): user is the payer account for the oracle reward fee;
      // authority comes from on-chain Randomness data (= CRANK_AUTHORITY, must sign).
      const revealIx = await rnd.revealIx(userPubkey);
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      const revealTx = new Transaction({ recentBlockhash: blockhash, feePayer: userPubkey }).add(revealIx);
      // Crank partial-signs as the SB authority (no SOL required from crank)
      revealTx.partialSign(crankKeypair);
      const serialized = revealTx.serialize({ requireAllSignatures: false }).toString('base64');
      console.log(`[ORACLE] build_reveal — reveal TX partial-signed (crank auth, user feePayer+payer) for ${lotteryType} T$${tier}`);
      return NextResponse.json({ success: true, reveal_tx: serialized, lotteryType, tier, mode: 'build_reveal' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[ORACLE] build_reveal mode — revealIx failed:', msg);
      return safeError('ORACLE', 'Failed to build reveal instruction', 500);
    }
  }

  // ─── MODE: execute (default) ──────────────────────────────────────────────
  // Crank wallet signs and pays oracle fees.

  // 3. Load crank keypair
  let crankKeypair: Keypair;
  try {
    crankKeypair = loadCrankKeypair();
  } catch (e) {
    const hint = process.env.CRANK_SECRET_KEY
      ? 'Check CRANK_SECRET_KEY env var'
      : `Cannot read ${process.env.CRANK_KEYPAIR_PATH ?? '/home/dev/crank-wallet.json'}`;
    console.error('[ORACLE] Failed to load keypair:', hint);
    return NextResponse.json({ error: 'Crank keypair unavailable', fallback_required: true }, { status: 500 });
  }

  // Check crank balance — if too low, signal frontend to use manual oracle path
  const MIN_ORACLE_BALANCE = 5_000_000; // 0.005 SOL for oracle fees
  const crankBalance = await connection.getBalance(crankKeypair.publicKey, 'confirmed');
  if (crankBalance < MIN_ORACLE_BALANCE) {
    console.warn(`[ORACLE] Crank balance too low for oracle fees: ${crankBalance} lamports`);
    return NextResponse.json(
      { error: 'Crank wallet balance too low for oracle fees', fallback_required: true },
      { status: 402 },
    );
  }

  // 4. Set up Switchboard provider (crank wallet covers oracle fees)
  const wallet = {
    publicKey: crankKeypair.publicKey,
    signTransaction: async <T extends Transaction>(tx: T): Promise<T> => { tx.partialSign(crankKeypair); return tx; },
    signAllTransactions: async <T extends Transaction>(txs: T[]): Promise<T[]> => { txs.forEach(tx => tx.partialSign(crankKeypair)); return txs; },
  };
  const provider = new AnchorProvider(connection, wallet as any, { commitment: 'confirmed', skipPreflight: true });

  const sbProgram = await sb.AnchorUtils.loadProgramFromConnection(connection, wallet as any);
  const rnd = new sb.Randomness(sbProgram, randomnessAccount);

  // 5. Switchboard commit (assigns oracle + records seedSlot on-chain)
  let commitOk = false;
  try {
    const commitIx  = await rnd.commitIx(SB_MAINNET_QUEUE);
    const commitSig = await provider.sendAndConfirm(new Transaction().add(commitIx), [], {
      skipPreflight: true,
      commitment: 'confirmed',
    });
    console.log(`[ORACLE] randomness_commit OK — ${lotteryType} T$${tier} sig=${commitSig}`);
    commitOk = true;
  } catch (err: unknown) {
    console.warn(`[ORACLE] randomness_commit FAILED:`, err instanceof Error ? err.message : err);
  }

  if (!commitOk) {
    // Commit failed — signal frontend to fall back to user-signed oracle path
    return NextResponse.json(
      { success: false, oracle_failed: true, lotteryType, tier, error: 'Oracle commit failed — please retry' },
      { status: 200 },
    );
  }

  // Wait 2 slots (~800 ms) + buffer so the oracle TEE gateway has the slothash
  await new Promise(r => setTimeout(r, 2500));

  // 6. Switchboard reveal (contacts oracle TEE gateway, submits randomnessReveal on-chain)
  let revealOk = false;
  try {
    const revealIx  = await rnd.revealIx();
    const revealSig = await provider.sendAndConfirm(new Transaction().add(revealIx), [], {
      skipPreflight: true,
      commitment: 'confirmed',
    });
    console.log(`[ORACLE] randomness_reveal OK — ${lotteryType} T$${tier} sig=${revealSig}`);
    revealOk = true;
  } catch (err: unknown) {
    console.warn(`[ORACLE] randomness_reveal FAILED:`, err instanceof Error ? err.message : err);
  }

  if (!revealOk) {
    // Reveal failed — frontend will show the error
    return NextResponse.json(
      { success: false, oracle_failed: true, lotteryType, tier, error: 'Oracle reveal failed — please retry' },
      { status: 200 },
    );
  }

  return NextResponse.json({ success: true, lotteryType, tier });
}

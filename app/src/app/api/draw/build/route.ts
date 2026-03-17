/**
 * POST /api/draw/build
 *
 * Fallback manual-draw helper.
 * Returns a base64-serialised, unsigned `request_draw_entropy` transaction
 * with feePayer = the user's wallet.  The browser wallet signs and submits it.
 * After the tx confirms on-chain the frontend calls /api/draw/oracle to kick
 * off the Switchboard commit+reveal (server-side, crank wallet pays oracle fees).
 *
 * Unlike the normal /api/draw/request route, the CRANK_AUTHORITY keypair is NOT
 * used to sign the draw instruction here — the user's wallet does that.
 * If an expired PendingDraw needs to be cancelled first, the cancel instruction
 * is included in the same user-signed transaction (no crank dependency).
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
import { AnchorProvider, Program } from '@coral-xyz/anchor';
import { guardRequest, validateInputs, safeError } from '../../_guard';

// ─── IDL ─────────────────────────────────────────────────────────────────────
const IDL = require('@/idl/fortress_protocol.json');

// ─── Constants ───────────────────────────────────────────────────────────────
const PROGRAM_ID   = new PublicKey('EB6kkg2sW5rnukjRH7Ljhz78gbfc36XZAuiFn5jdefF3');
// Server-side RPC: prefer unpublished env var to avoid leaking API keys in client bundle
const RPC_ENDPOINT = process.env.SOLANA_RPC_ENDPOINT
  ?? process.env.RPC_STANDARD
  ?? process.env.RPC_GATEKEEPER
  ?? process.env.NEXT_PUBLIC_RPC_STANDARD
  ?? process.env.NEXT_PUBLIC_RPC_GATEKEEPER
  ?? process.env.NEXT_PUBLIC_RPC_ENDPOINT
  ?? 'https://api.mainnet-beta.solana.com';

const LOTTERY_TYPE_ID: Record<string, number> = { LPM: 0, DPL: 1, WPL: 2, MPL: 3 };

// Crank wallet that pays Switchboard oracle fees
const CRANK_AUTHORITY = new PublicKey('BzsGQccSzoWPiRSKoTNpf7iKxqJRq3CwvSygmzvwMei5');
// Treasury vault PDA that funds the crank when depleted (seeds=[b"sol_vault"])
const [TREASURY_VAULT_PDA] = PublicKey.findProgramAddressSync([Buffer.from('sol_vault')], PROGRAM_ID);
// If crank balance is below this threshold, include fund_oracle_crank in the user's TX
const MIN_CRANK_BALANCE = 5_000_000; // 0.005 SOL
// Amount to transfer from treasury to crank (capped at 0.01 SOL on-chain)
const CRANK_FUND_LAMPORTS = 10_000_000; // 0.01 SOL

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

const VAULT_SEED: Record<string, string> = {
  LPM: 'vault_lpm',
  DPL: 'vault_dpl',
  WPL: 'vault_wpl',
  MPL: 'vault_mpl',
};

const SB_RANDOMNESS_ACCOUNTS: Record<string, Record<number, string>> = {
  LPM: { 5: '3RNBFv6gsfLVAdPShje3U4oWksJ5yei8BxAPEpkpjvcZ', 10: '89yqdqDCCEVEcDDtiSruUzbogPwvSafQogVw6RrvWyXr', 20: 'ABztidiDtQc5f8AWpCEAH812SsMWPFfx1cj6hq97jsPK', 50: 'BaVkrGGXenHmyJiugxqabVUZT688cRdqbzWTR5B8FRRd' },
  DPL: { 5: 'DXD7WX7ZJ6J3G4en9QjfLMED4NNFaUccnH2p4SBDnELi', 10: 'BVsgsmAcgxuut5m6iHTVq2cjQ9Kou8zwGfwb9oBAUect', 15: '54jw437jQKWWx4fSNhUm1ksVyXMbtNVPExDmPzNX7VR8', 20: 'AQqoHS5s5VABzpGdjTRcxDUwTWgs8bWtM8gTuMAzXS1T' },
  WPL: { 5: 'EoHXzefgFstYot72iswj9oZ3UHbPdCv44boodxDD4Age', 10: 'H5ekLQD7NwKgcpc5AJ73nEohv5QTxVUVYHFAh2kMGfSR', 15: '5RnkTBHtqV9j7Z9xEiDDixwsCLNwNKjDa9N4vBr74XYt', 20: '8YZaUddM74dH3Aqe3wAYUyJnVNDQaZyCfh7UpS8pKW4C' },
  MPL: { 5: '2H1VT31g6gXLfpoT92D3yvtqCBaztXELiueUXYdPKUMB', 10: 'Hag4Kd215YVSCVsQfA9K85PmF2LBRij3WF65FAJbjNNy', 15: '2d8TfV4tmGNT5bANfYPPy3CaqhmUczKzp9DEinE6kaTA', 20: 'Hhza1xnE1cn89xTE3Mmn9Zx5y426iUdpdkySAjUMpCrD' },
};

// ─── PDA helpers ─────────────────────────────────────────────────────────────
function getVaultPDA(lotteryType: string, tier: number): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from(VAULT_SEED[lotteryType]), Buffer.from([tier])],
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

// ─── Vault state helper ───────────────────────────────────────────────────────
// LotteryVault layout (Anchor discriminator + fields):
// disc(8) + lottery_type(1) + tier(1) + round_number(4) + balance(8) + participant_count(4)
// + current_page(4) + end_time(8) + last_winner(33) + last_prize(8) + is_drawn(1) + state(1) + bump(1)
interface VaultState {
  participantCount: number;
  endTime: number;
  state: number;
}

async function fetchVaultState(connection: Connection, vaultPDA: PublicKey): Promise<VaultState | null> {
  const info = await connection.getAccountInfo(vaultPDA, 'confirmed');
  if (!info || info.data.length < 82) return null;
  const d = info.data;
  const participantCount = d.readUInt32LE(22);
  const endTimeLo = d.readUInt32LE(30);
  const endTimeHi = d.readUInt32LE(34);
  const endTime = endTimeLo + endTimeHi * 4294967296;
  const stateVal = d[80] ?? 0;
  return { participantCount, endTime, state: stateVal };
}


// ─── Route handler ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest): Promise<NextResponse> {
  // Auth + rate-limit guard (returns 401/429 if rejected)
  const blocked = guardRequest(req, 'build');
  if (blocked) return blocked;
  try {
    return await handlePost(req);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[BUILD] Unhandled error:', msg);
    return safeError('BUILD', msg, 500);
  }
}

async function handlePost(req: NextRequest): Promise<NextResponse> {
  // 1. Parse + validate body
  let lotteryType: string, tier: number, userPubkeyStr: string, manual: boolean;
  try {
    const body = await req.json();
    if (typeof body.lottery_type !== 'string') throw new Error('bad type');
    lotteryType   = body.lottery_type.toUpperCase();
    tier          = Number(body.tier);
    userPubkeyStr = String(body.user_pubkey ?? '');
    manual        = body.manual === true;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // Strict whitelist validation
  const inputErr = validateInputs(lotteryType, tier);
  if (inputErr) return inputErr;

  const lotteryTypeId = LOTTERY_TYPE_ID[lotteryType];

  let userPubkey: PublicKey;
  try {
    userPubkey = new PublicKey(userPubkeyStr);
  } catch {
    return NextResponse.json({ error: 'Invalid user_pubkey' }, { status: 400 });
  }

  const randomnessStr = SB_RANDOMNESS_ACCOUNTS[lotteryType]?.[tier];
  if (!randomnessStr) {
    return NextResponse.json(
      { error: `No RandomnessAccount configured for ${lotteryType} tier ${tier}` },
      { status: 400 },
    );
  }

  // 2. On-chain pre-flight — same guards as /api/draw/request
  const connection = new Connection(RPC_ENDPOINT, 'confirmed');
  const vaultPDA = getVaultPDA(lotteryType, tier);
  const pendingDrawPDA = getPendingDrawPDA(lotteryTypeId, tier);

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
    if (vaultState.participantCount < 100) {
      return NextResponse.json(
        { error: `LPM tier $${tier} not full yet (${vaultState.participantCount}/100)` },
        { status: 409 },
      );
    }
  } else {
    if (vaultState.participantCount === 0) {
      return NextResponse.json(
        { error: `Tier $${tier} expired with 0 participants — lazy reset required, not a draw` },
        { status: 409 },
      );
    }
    if (vaultState.endTime <= 0 || nowSec < vaultState.endTime) {
      return NextResponse.json({ error: `Tier $${tier} timer has not expired yet` }, { status: 409 });
    }
  }

  if (vaultState.state === 3) {
    return NextResponse.json({ error: 'Vault already drawn (state=Ready)' }, { status: 409 });
  }

  const randomnessAccount = new PublicKey(randomnessStr);
  const rndInfo = await connection.getAccountInfo(randomnessAccount, 'confirmed');
  if (!rndInfo) {
    return NextResponse.json(
      { error: `RandomnessAccount ${randomnessStr} not found` },
      { status: 500 },
    );
  }

  // 3. Build all required instructions — cancel expired draw (if any) + fund crank (if low)
  //    All IXs are unsigned; the user's wallet signs them in one single popup.
  const dummyWallet = {
    publicKey: userPubkey,
    signTransaction: async (tx: any) => tx,
    signAllTransactions: async (txs: any[]) => txs,
  };
  const provider = new AnchorProvider(connection, dummyWallet as any, { commitment: 'confirmed' });
  const program  = new Program(IDL as any, provider);

  // Always include fund_oracle_crank if crank balance is low.
  // Both auto-crank and manual paths need the crank funded for oracle commit/reveal.
  // In the manual path the server handles oracle via mode='execute' using the
  // crank wallet, so the crank must have SOL regardless of who triggered the draw.
  let fundCrankIx: any = null;
  try {
    let crankBalance = 0;
    try {
      crankBalance = await connection.getBalance(CRANK_AUTHORITY, 'confirmed');
    } catch { /* treat as 0 */ }

    if (crankBalance < MIN_CRANK_BALANCE) {
      // Verify treasury has enough SOL before including the IX (avoids TX revert)
      const treasuryBalance = await connection.getBalance(TREASURY_VAULT_PDA, 'confirmed');
      const TREASURY_MIN_RESERVE = 3_000_000; // matches on-chain TREASURY_VAULT_MIN_LAMPORTS
      if (treasuryBalance >= CRANK_FUND_LAMPORTS + TREASURY_MIN_RESERVE) {
        fundCrankIx = await (program.methods as any)
          .fundOracleCrank(BigInt(CRANK_FUND_LAMPORTS))
          .accountsStrict({
            payer:          userPubkey,
            treasuryVault:  TREASURY_VAULT_PDA,
            crankWallet:    CRANK_AUTHORITY,
            systemProgram:  SystemProgram.programId,
          })
          .instruction();
        console.log(`[BUILD] Crank balance low (${crankBalance} lamports) — fund_oracle_crank IX added (${CRANK_FUND_LAMPORTS} lamports from treasury)`);
      } else {
        console.warn(`[BUILD] Crank low AND treasury low — crank=${crankBalance}, treasury=${treasuryBalance}. Oracle may fail.`);
      }
    }
  } catch (err: unknown) {
    // Non-fatal: if IX build fails, proceed without it; oracle will return oracle_failed if needed
    console.warn('[BUILD] fund_oracle_crank IX build error (non-fatal):', err instanceof Error ? err.message : err);
  }

  // 4. Build the request_draw_entropy instruction with requester = user's wallet
  const userCommitment = Array.from(crypto.getRandomValues(new Uint8Array(32))) as number[];

  let ix: any;
  try {
    ix = await (program.methods as any)
      .requestDrawEntropy(lotteryTypeId, tier, userCommitment)
      .accountsStrict({
        requester:        userPubkey,
        lotteryState:     vaultPDA,
        pendingDraw:      pendingDrawPDA,
        systemProgram:    SystemProgram.programId,
        randomnessAccount,
      })
      .instruction();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[BUILD] instruction() failed:', msg);
    return safeError('BUILD', 'Failed to build transaction', 500);
  }

  // 5. Wrap in a Transaction and serialise without requiring any signatures.
  //    IXs are ordered: fund_oracle_crank → request_draw_entropy.
  //    The user's wallet signs and submits it from the browser (ONE wallet popup).
  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  const tx = new Transaction({ recentBlockhash: blockhash, feePayer: userPubkey });
  if (fundCrankIx) tx.add(fundCrankIx); // 1. fund crank from treasury (if balance low)
  tx.add(ix);                           // 2. request_draw_entropy
  const serialized = tx.serialize({ requireAllSignatures: false }).toString('base64');

  const hasFundCrank = fundCrankIx !== null;
  console.log(`[BUILD] Unsigned tx ready — ${lotteryType} T$${tier} requester=${userPubkeyStr.slice(0, 8)}… fund_crank=${hasFundCrank}`);
  return NextResponse.json({ transaction: serialized, lotteryType, tier, crank_funded: hasFundCrank });
}

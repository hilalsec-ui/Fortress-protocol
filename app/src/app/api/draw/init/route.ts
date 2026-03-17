/**
 * POST /api/draw/init
 *
 * Builds the unsigned TX for the manual fallback draw path (Step 1).
 * Uses the same pre-initialised SB RandomnessAccount as the house crank —
 * no fresh keypair, no oracle contact at build time, no commitIx needed.
 *
 * The oracle observes the PendingDraw on-chain and commits/reveals autonomously
 * (identical mechanism to the house-crank path in /api/draw/request).
 *
 * Input:  { lottery_type, tier, user_pubkey }
 * Output: { success: true, transaction: "<base64 unsigned TX>" }
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  Connection,
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import { AnchorProvider, BN, Program } from '@coral-xyz/anchor';
import { guardRequest, validateInputs, safeError } from '../../_guard';

const IDL = require('@/idl/fortress_protocol.json');

const RPC_ENDPOINT = process.env.SOLANA_RPC_ENDPOINT
  ?? process.env.RPC_STANDARD
  ?? process.env.RPC_GATEKEEPER
  ?? process.env.NEXT_PUBLIC_RPC_STANDARD
  ?? process.env.NEXT_PUBLIC_RPC_GATEKEEPER
  ?? process.env.NEXT_PUBLIC_RPC_ENDPOINT
  ?? 'https://api.mainnet-beta.solana.com';
const PROGRAM_ID   = new PublicKey('EB6kkg2sW5rnukjRH7Ljhz78gbfc36XZAuiFn5jdefF3');

const LOTTERY_TYPE_ID: Record<string, number> = { LPM: 0, DPL: 1, WPL: 2, MPL: 3 };
const VAULT_SEED: Record<string, string> = {
  LPM: 'vault_lpm',
  DPL: 'vault_dpl',
  WPL: 'vault_wpl',
  MPL: 'vault_mpl',
};

// Pre-initialised SB RandomnessAccounts — same accounts used by the house crank.
// No fresh account creation needed; the oracle commits/reveals autonomously.
const SB_RANDOMNESS_ACCOUNTS: Record<string, Record<number, string>> = {
  LPM: { 5: '3RNBFv6gsfLVAdPShje3U4oWksJ5yei8BxAPEpkpjvcZ', 10: '89yqdqDCCEVEcDDtiSruUzbogPwvSafQogVw6RrvWyXr', 20: 'ABztidiDtQc5f8AWpCEAH812SsMWPFfx1cj6hq97jsPK', 50: 'BaVkrGGXenHmyJiugxqabVUZT688cRdqbzWTR5B8FRRd' },
  DPL: { 5: 'DXD7WX7ZJ6J3G4en9QjfLMED4NNFaUccnH2p4SBDnELi', 10: 'BVsgsmAcgxuut5m6iHTVq2cjQ9Kou8zwGfwb9oBAUect', 15: '54jw437jQKWWx4fSNhUm1ksVyXMbtNVPExDmPzNX7VR8', 20: 'AQqoHS5s5VABzpGdjTRcxDUwTWgs8bWtM8gTuMAzXS1T' },
  WPL: { 5: 'EoHXzefgFstYot72iswj9oZ3UHbPdCv44boodxDD4Age', 10: 'H5ekLQD7NwKgcpc5AJ73nEohv5QTxVUVYHFAh2kMGfSR', 15: '5RnkTBHtqV9j7Z9xEiDDixwsCLNwNKjDa9N4vBr74XYt', 20: '8YZaUddM74dH3Aqe3wAYUyJnVNDQaZyCfh7UpS8pKW4C' },
  MPL: { 5: '2H1VT31g6gXLfpoT92D3yvtqCBaztXELiueUXYdPKUMB', 10: 'Hag4Kd215YVSCVsQfA9K85PmF2LBRij3WF65FAJbjNNy', 15: '2d8TfV4tmGNT5bANfYPPy3CaqhmUczKzp9DEinE6kaTA', 20: 'Hhza1xnE1cn89xTE3Mmn9Zx5y426iUdpdkySAjUMpCrD' },
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  const blocked = guardRequest(req, 'request');
  if (blocked) return blocked;
  try {
    return await handlePost(req);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[DRAW-INIT] Unhandled error:', msg);
    return safeError('DRAW-INIT', msg, 500);
  }
}

async function handlePost(req: NextRequest): Promise<NextResponse> {
  let lotteryType: string, tier: number, userPubkeyStr: string;
  try {
    const body = await req.json();
    if (typeof body.lottery_type !== 'string') throw new Error('bad type');
    lotteryType   = body.lottery_type.toUpperCase();
    tier          = Number(body.tier);
    userPubkeyStr = String(body.user_pubkey ?? '');
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const inputErr = validateInputs(lotteryType, tier);
  if (inputErr) return inputErr;

  let userPubkey: PublicKey;
  try {
    userPubkey = new PublicKey(userPubkeyStr);
  } catch {
    return NextResponse.json({ error: 'Invalid public key' }, { status: 400 });
  }

  const randomnessStr = SB_RANDOMNESS_ACCOUNTS[lotteryType]?.[tier];
  if (!randomnessStr) {
    return NextResponse.json({ error: `No RandomnessAccount configured for ${lotteryType} tier ${tier}` }, { status: 400 });
  }
  const randomnessAccount = new PublicKey(randomnessStr);

  const connection = new Connection(RPC_ENDPOINT, 'confirmed');
  const lotteryTypeId = LOTTERY_TYPE_ID[lotteryType];

  const [vaultPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from(VAULT_SEED[lotteryType]), Buffer.from([tier])],
    PROGRAM_ID,
  );
  const [pendingDrawPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('pending_draw'), Buffer.from([lotteryTypeId]), Buffer.from([tier])],
    PROGRAM_ID,
  );
  const [treasuryVaultPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('sol_vault')],
    PROGRAM_ID,
  );

  const userWallet = {
    publicKey: userPubkey,
    signTransaction: async <T extends Transaction>(tx: T) => tx,
    signAllTransactions: async <T extends Transaction>(txs: T[]) => txs,
  };
  const readProvider = new AnchorProvider(connection, userWallet as any, { commitment: 'confirmed' });
  const program = new Program(IDL, readProvider);

  const commitment = Array.from(crypto.getRandomValues(new Uint8Array(32)));

  const drawIx = await (program.methods as any)
    .requestDrawEntropy(lotteryTypeId, tier, commitment, new BN(0))
    .accountsStrict({
      requester: userPubkey,
      lotteryState: vaultPDA,
      pendingDraw: pendingDrawPDA,
      treasuryVault: treasuryVaultPDA,
      systemProgram: SystemProgram.programId,
      randomnessAccount,
    })
    .instruction();

  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  const tx = new Transaction({ recentBlockhash: blockhash, feePayer: userPubkey });
  tx.add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
    drawIx,
  );

  const serialized = tx.serialize({ requireAllSignatures: false }).toString('base64');
  console.log(`[DRAW-INIT] Built unsigned TX for ${lotteryType} T$${tier} user=${userPubkeyStr.slice(0, 8)}…`);

  return NextResponse.json({ success: true, transaction: serialized });
}

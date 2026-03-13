/**
 * POST /api/draw/init
 *
 * Builds the unsigned TX1 for the manual fallback draw path.
 * The Switchboard SDK runs server-side (avoids client-side Node.js bundle issues).
 *
 * NO crank wallet involved — user pays everything, user is the only signer.
 * The transaction is returned unsigned; the client adds:
 *   - rngKp signature (passed as `signers: [rngKp]` to sendTransaction)
 *   - user wallet signature (Phantom popup)
 *
 * Input:  { lottery_type, tier, user_pubkey, rng_pubkey }
 * Output: { success: true, transaction: "<base64 unsigned TX>" }
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  Connection,
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import { AnchorProvider, BN, Program } from '@coral-xyz/anchor';
import * as sb from '@switchboard-xyz/on-demand';
import { guardRequest, validateInputs, safeError } from '../../_guard';

const IDL = require('@/idl/fortress_protocol.json');

const RPC_ENDPOINT    = process.env.SOLANA_RPC_ENDPOINT ?? process.env.NEXT_PUBLIC_RPC_ENDPOINT ?? 'https://api.devnet.solana.com';
const PROGRAM_ID      = new PublicKey('2JHDbUz11kLe7q44nneougHcJCQqD6t26XeEFFNQJpHY');
const SB_DEVNET_QUEUE = new PublicKey('EYiAmGSdsQTuCw413V5BzaruWuCCSDgTPtBGvLkXHbe7');

const LOTTERY_TYPE_ID: Record<string, number> = { LPM: 0, DPL: 1, WPL: 2, MPL: 3 };
const VAULT_SEED: Record<string, string> = {
  LPM: 'vault_lpm',
  DPL: 'vault_dpl',
  WPL: 'vault_wpl',
  MPL: 'vault_mpl',
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
  // 1. Parse + validate inputs
  let lotteryType: string, tier: number, userPubkeyStr: string, rngPubkeyStr: string;
  try {
    const body = await req.json();
    if (typeof body.lottery_type !== 'string') throw new Error('bad type');
    lotteryType   = body.lottery_type.toUpperCase();
    tier          = Number(body.tier);
    userPubkeyStr = String(body.user_pubkey ?? '');
    rngPubkeyStr  = String(body.rng_pubkey ?? '');
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const inputErr = validateInputs(lotteryType, tier);
  if (inputErr) return inputErr;

  let userPubkey: PublicKey;
  let rngPubkey: PublicKey;
  try {
    userPubkey = new PublicKey(userPubkeyStr);
    rngPubkey  = new PublicKey(rngPubkeyStr);
  } catch {
    return NextResponse.json({ error: 'Invalid public key' }, { status: 400 });
  }

  const connection = new Connection(RPC_ENDPOINT, 'confirmed');
  const lotteryTypeId = LOTTERY_TYPE_ID[lotteryType];

  // 2. Build SB program — user pubkey as wallet so authority field in SB account = user
  const userWallet = {
    publicKey: userPubkey,
    signTransaction: async <T extends Transaction>(tx: T) => tx,
    signAllTransactions: async <T extends Transaction>(txs: T[]) => txs,
  };
  const sbProgram = await sb.AnchorUtils.loadProgramFromConnection(connection, userWallet as any);

  // 3. Build randomnessInitIx — only the publicKey is needed for IX building;
  //    the real secretKey lives client-side and signs via sendTransaction({ signers: [rngKp] })
  const fakeRngKp = { publicKey: rngPubkey, secretKey: new Uint8Array(64) } as Keypair;
  const [rnd, randomnessInitIx] = await sb.Randomness.create(sbProgram, fakeRngKp, SB_DEVNET_QUEUE, userPubkey);

  // 4. Build drawIx (request_draw_entropy) — user is requester + feePayer
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

  const readProvider = new AnchorProvider(connection, userWallet as any, { commitment: 'confirmed' });
  const program = new Program(IDL, readProvider);

  const commitment = Array.from(crypto.getRandomValues(new Uint8Array(32)));

  // Static cost covering all Switchboard charges:
  //   • Randomness account rent (480 bytes)  = 4,231,680
  //   • wSOL ATA(s) + oracle state accounts  = ~2,980,320 (empirically observed)
  //   • Oracle queue commit fee              = 1,000,000
  //   • TX fee buffer                        = ~10,000
  // Total SB cost observed: ~8,222,000. We pad to 8,800,000 so the user sees
  // zero or a tiny positive SOL change in their wallet popup (treasury pays the rest).
  const EXTRA_LAMPORTS = new BN(8_800_000);

  const drawIx = await (program.methods as any)
    .requestDrawEntropy(lotteryTypeId, tier, commitment, EXTRA_LAMPORTS)
    .accountsStrict({
      requester: userPubkey,
      lotteryState: vaultPDA,
      pendingDraw: pendingDrawPDA,
      treasuryVault: treasuryVaultPDA,
      systemProgram: SystemProgram.programId,
      randomnessAccount: rngPubkey,
    })
    .instruction();

  const commitIx = await rnd.commitIx(SB_DEVNET_QUEUE, userPubkey);
  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  const tx = new Transaction({ recentBlockhash: blockhash, feePayer: userPubkey });
  tx.add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
    randomnessInitIx,
    drawIx,
    commitIx,
  );

  // Return unsigned — client will sign with: rngKp (via signers:[]) + user wallet (Phantom)
  const serialized = tx.serialize({ requireAllSignatures: false }).toString('base64');

  console.log(`[DRAW-INIT] Built unsigned TX for ${lotteryType} T$${tier} rng=${rngPubkeyStr.slice(0, 8)}… user=${userPubkeyStr.slice(0, 8)}…`);

  return NextResponse.json({ success: true, transaction: serialized });
}

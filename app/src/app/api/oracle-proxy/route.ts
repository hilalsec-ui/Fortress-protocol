/**
 * POST /api/oracle-proxy
 *
 * Stateless CORS proxy for Switchboard oracle TEE gateway reveal.
 * Used by the 100% client-side manual fallback draw path.
 *
 * NO crank keypair required — the user is the sole signer.
 * This endpoint contacts the oracle TEE gateway server-side (avoiding browser
 * CORS), retries until the gateway is ready (up to ~45s), builds an UNSIGNED
 * reveal TX, and returns it as base64 for the user wallet to sign.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  Connection,
  PublicKey,
  Transaction,
} from '@solana/web3.js';
import * as sb from '@switchboard-xyz/on-demand';

const RPC_ENDPOINT = process.env.SOLANA_RPC_ENDPOINT
  ?? process.env.RPC_STANDARD
  ?? process.env.RPC_GATEKEEPER
  ?? process.env.NEXT_PUBLIC_RPC_STANDARD
  ?? process.env.NEXT_PUBLIC_RPC_GATEKEEPER
  ?? process.env.NEXT_PUBLIC_RPC_ENDPOINT
  ?? 'https://api.mainnet-beta.solana.com';

// Allow up to 60 s for the oracle TEE to process the commit before giving up.
export const maxDuration = 60;

const MAX_REVEAL_ATTEMPTS = 8;
const RETRY_DELAY_MS = 5_000;

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const { randomness_account, user_pubkey } = body;
    if (typeof randomness_account !== 'string' || typeof user_pubkey !== 'string') {
      return NextResponse.json({ error: 'randomness_account and user_pubkey are required' }, { status: 400 });
    }

    let randomnessPubkey: PublicKey;
    let userPubkey: PublicKey;
    try {
      randomnessPubkey = new PublicKey(randomness_account);
      userPubkey = new PublicKey(user_pubkey);
    } catch {
      return NextResponse.json({ error: 'Invalid public key' }, { status: 400 });
    }

    const connection = new Connection(RPC_ENDPOINT, 'confirmed');

    // Create a dummy wallet using the user's pubkey (no signing happens server-side)
    const dummyWallet = {
      publicKey: userPubkey,
      signTransaction: async <T extends Transaction>(tx: T): Promise<T> => tx,
      signAllTransactions: async <T extends Transaction>(txs: T[]): Promise<T[]> => txs,
    };

    const sbProgram = await sb.AnchorUtils.loadProgramFromConnection(connection, dummyWallet as any);
    const rnd = new sb.Randomness(sbProgram, randomnessPubkey);

    // Retry loop: the oracle TEE gateway needs time to observe the on-chain commit
    // before it can produce the reveal proof. On devnet this can take 10-30 seconds.
    let lastErr = '';
    for (let attempt = 1; attempt <= MAX_REVEAL_ATTEMPTS; attempt++) {
      try {
        console.log(`[ORACLE-PROXY] reveal attempt ${attempt}/${MAX_REVEAL_ATTEMPTS} for ${randomness_account.slice(0, 8)}…`);
        const revealIx = await rnd.revealIx(userPubkey);

        const { blockhash } = await connection.getLatestBlockhash('confirmed');
        const tx = new Transaction({ recentBlockhash: blockhash, feePayer: userPubkey }).add(revealIx);
        const serialized = tx.serialize({ requireAllSignatures: false }).toString('base64');

        console.log(`[ORACLE-PROXY] reveal succeeded on attempt ${attempt}`);
        return NextResponse.json({ success: true, transaction: serialized });
      } catch (err: unknown) {
        lastErr = err instanceof Error ? err.message : String(err);
        console.warn(`[ORACLE-PROXY] attempt ${attempt} failed: ${lastErr.slice(0, 120)}`);
        if (attempt < MAX_REVEAL_ATTEMPTS) {
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        }
      }
    }

    console.error(`[ORACLE-PROXY] all ${MAX_REVEAL_ATTEMPTS} attempts failed: ${lastErr}`);
    return NextResponse.json(
      { error: `Oracle gateway not ready after ${MAX_REVEAL_ATTEMPTS} attempts: ${lastErr.slice(0, 200)}` },
      { status: 504 },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[ORACLE-PROXY] Error:', msg);
    return NextResponse.json(
      { error: 'Failed to build reveal transaction' },
      { status: 500 },
    );
  }
}

/**
 * Fortress Protocol — Mainnet Crank
 *
 * Scans all 16 lottery vault (type, tier) pairs and:
 *   1. Calls request_draw_entropy when a vault is ready (LPM: 100 participants,
 *      DPL/WPL/MPL: expired + at least 1 participant).
 *   2. Triggers the Switchboard V3 oracle commit so it generates the random value.
 *   3. Polls until the oracle reveals the value (up to POLL_TIMEOUT_MS).
 *   4. Calls fulfill_draw_entropy with the computed winner.
 *   5. Calls rollover_*_tier for expired timed vaults with 0 participants.
 *   6. Skips gracefully when a vault is not ready or has already been drawn.
 *
 * Prerequisites:
 *   • Crank wallet (BzsGQccSzoWPiRSKoTNpf7iKxqJRq3CwvSygmzvwMei5) funded with SOL on Mainnet-Beta
 *   • RandomnessAccounts pre-initialised: npx ts-node ../scripts/reinit-sb-randomness-crank.ts
 *
 * Local usage:
 *   cd crank && CRANK_PRIVATE_KEY=<base58-secret-key> npx ts-node index.ts
 *
 * CI usage: CRANK_PRIVATE_KEY is injected from GitHub Secrets (see ../.github/workflows/crank-mainnet.yml).
 */

// In CI, env vars are injected by GitHub Actions. For local dev, run:
//   source .env && npx ts-node index.ts

import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, Program, BN, Wallet } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  ComputeBudgetProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import bs58 from "bs58";
import * as sb from "@switchboard-xyz/on-demand";
import * as crypto from "crypto";
import * as path from "path";

// ─── Network & Program Constants ────────────────────────────────────────────

const RPC_URL = process.env.RPC_URL ?? "https://api.mainnet-beta.solana.com";
const PROGRAM_ID = new PublicKey("EB6kkg2sW5rnukjRH7Ljhz78gbfc36XZAuiFn5jdefF3");
const FPT_MINT   = new PublicKey("3YTnzmFTECtyKDxaghWPQcjzX7g1Cj3NxMq41JdWk2rj");
const SB_MAINNET_QUEUE = new PublicKey("3u9PpRz7fN8Lp693zPueppQf94v7N2jKj3C18j9o7oG1");

// ─── Pre-initialised Switchboard RandomnessAccounts ─────────────────────────
//
// One per (lotteryType, tier) — created by:
//   npx ts-node scripts/reinit-sb-randomness-crank.ts
//
// Keys must remain in sync with app/src/utils/constants.ts SB_RANDOMNESS_ACCOUNTS.
const SB_RANDOMNESS_ACCOUNTS: Record<string, Record<number, string>> = {
  LPM: {
    5:  "3RNBFv6gsfLVAdPShje3U4oWksJ5yei8BxAPEpkpjvcZ",
    10: "89yqdqDCCEVEcDDtiSruUzbogPwvSafQogVw6RrvWyXr",
    20: "ABztidiDtQc5f8AWpCEAH812SsMWPFfx1cj6hq97jsPK",
    50: "BaVkrGGXenHmyJiugxqabVUZT688cRdqbzWTR5B8FRRd",
  },
  DPL: {
    5:  "DXD7WX7ZJ6J3G4en9QjfLMED4NNFaUccnH2p4SBDnELi",
    10: "BVsgsmAcgxuut5m6iHTVq2cjQ9Kou8zwGfwb9oBAUect",
    15: "54jw437jQKWWx4fSNhUm1ksVyXMbtNVPExDmPzNX7VR8",
    20: "AQqoHS5s5VABzpGdjTRcxDUwTWgs8bWtM8gTuMAzXS1T",
  },
  WPL: {
    5:  "EoHXzefgFstYot72iswj9oZ3UHbPdCv44boodxDD4Age",
    10: "H5ekLQD7NwKgcpc5AJ73nEohv5QTxVUVYHFAh2kMGfSR",
    15: "5RnkTBHtqV9j7Z9xEiDDixwsCLNwNKjDa9N4vBr74XYt",
    20: "8YZaUddM74dH3Aqe3wAYUyJnVNDQaZyCfh7UpS8pKW4C",
  },
  MPL: {
    5:  "2H1VT31g6gXLfpoT92D3yvtqCBaztXELiueUXYdPKUMB",
    10: "Hag4Kd215YVSCVsQfA9K85PmF2LBRij3WF65FAJbjNNy",
    15: "2d8TfV4tmGNT5bANfYPPy3CaqhmUczKzp9DEinE6kaTA",
    20: "Hhza1xnE1cn89xTE3Mmn9Zx5y426iUdpdkySAjUMpCrD",
  },
};

// All vault types and their tiers
const LOTTERY_CONFIGS = [
  { name: "LPM", id: 0, tiers: [5, 10, 20, 50], prefix: "vault_lpm" },
  { name: "DPL", id: 1, tiers: [5, 10, 15, 20], prefix: "vault_dpl" },
  { name: "WPL", id: 2, tiers: [5, 10, 15, 20], prefix: "vault_wpl" },
  { name: "MPL", id: 3, tiers: [5, 10, 15, 20], prefix: "vault_mpl" },
] as const;

// RandomnessAccountData layout offsets (Switchboard V3)
const REVEAL_SLOT_OFFSET = 144;  // u64 LE — slot when oracle revealed
const SB_VALUE_OFFSET    = 152;  // [u8; 32] — the VRF output

const POLL_TIMEOUT_MS  = 45_000;  // 45 s — oracle reveals within ~5 s on mainnet
const POLL_INTERVAL_MS = 1_500;

// $0.50 equivalent in µFPT at ~$180 SOL / 1000 FPT-per-SOL ≈ 500 000 µFPT.
// Must stay within on-chain bounds: [MIN_SETTLER_REWARD = 100_000, MAX_SETTLER_REWARD = 5_000_000].
const SETTLER_REWARD_FPT = 500_000;

// ─── PDA Derivation Helpers ──────────────────────────────────────────────────

function vaultPDA(prefix: string, tier: number): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(prefix), Buffer.from([tier])], PROGRAM_ID,
  )[0];
}

function pendingDrawPDA(typeId: number, tier: number): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pending_draw"), Buffer.from([typeId]), Buffer.from([tier])], PROGRAM_ID,
  )[0];
}

function solVaultPDA(): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("sol_vault")], PROGRAM_ID)[0];
}

function treasuryPDA(): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("treasury")], PROGRAM_ID)[0];
}

function globalRegistryPDA(): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("global_registry")], PROGRAM_ID)[0];
}

function winnerHistoryPDA(typeId: number, tier: number): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("winner_history"), Buffer.from([typeId]), Buffer.from([tier])], PROGRAM_ID,
  )[0];
}

function participantPagePDA(typeId: number, tier: number, page: number): PublicKey {
  const tb = Buffer.alloc(4); tb.writeUInt32LE(typeId, 0);
  const rb = Buffer.alloc(4); rb.writeUInt32LE(tier,   0);
  const pb = Buffer.alloc(4); pb.writeUInt32LE(page,   0);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("page"), tb, rb, pb], PROGRAM_ID,
  )[0];
}

// ─── VRF Entropy (mirrors oracle.rs create_lottery_entropy_from_slot) ────────

function computeVrfEntropy(
  sbValue:       Uint8Array,
  commitment:    Uint8Array,
  typeId:        number,
  tier:          number,
  roundNumber:   number,
): bigint {
  const M = BigInt("0xffffffffffffffff");
  const K1 = BigInt("0x9e3779b97f4a7c15");
  const K2 = BigInt("0x517cc1b727220a95");
  const mul  = (a: bigint, b: bigint) => (a * b) & M;
  const rotL = (x: bigint, n: number) => ((x << BigInt(n)) | (x >> BigInt(64 - n))) & M;
  const u64  = (b: Uint8Array, o: number) => {
    let v = BigInt(0);
    for (let i = 0; i < 8; i++) v |= BigInt(b[o + i]) << BigInt(i * 8);
    return v;
  };

  const s0 = u64(sbValue, 0);  const s1 = u64(sbValue, 8);
  const s2 = u64(sbValue, 16); const s3 = u64(sbValue, 24);
  const c0 = u64(commitment, 0);
  const c1 = u64(commitment, 8);
  const meta = (BigInt(typeId)     << BigInt(56))
             | (BigInt(tier)       << BigInt(48))
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

// ─── Participant Page Reader ──────────────────────────────────────────────────

async function readPageParticipants(
  connection: Connection,
  pagePDA:    PublicKey,
): Promise<PublicKey[]> {
  const info = await connection.getAccountInfo(pagePDA);
  if (!info || info.data.length < 18) return [];
  // ParticipantPage layout (after 8B discriminator):
  //   u8 lottery_type(1) + u8 tier(1) + u32 page_number(4) = 14B metadata
  //   then Vec<Pubkey>: u32 len(4) + 32B × n
  const vecLen = info.data.readUInt32LE(14);
  const out: PublicKey[] = [];
  let off = 18;
  for (let i = 0; i < vecLen && off + 32 <= info.data.length; i++) {
    out.push(new PublicKey(info.data.slice(off, off + 32)));
    off += 32;
  }
  return out;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SbProgram = any;

async function main(): Promise<void> {
  // ── Load and validate private key ──
  // Supports three formats for CRANK_PRIVATE_KEY:
  //   • base58 string     (Phantom export)
  //   • JSON byte array   [1,2,3,...] (Solana CLI / most wallets)
  // Also falls back to ANCHOR_WALLET (same JSON array format).
  const rawKey = process.env.CRANK_PRIVATE_KEY?.trim();
  const anchorWallet = process.env.ANCHOR_WALLET?.trim();

  let crankKp: Keypair;

  function keypairFromAny(value: string): Keypair {
    // Try base58 first
    try { return Keypair.fromSecretKey(bs58.decode(value)); } catch { /* fall through */ }
    // Try JSON byte array
    try {
      const parsed = JSON.parse(value);
      return Keypair.fromSecretKey(Uint8Array.from(parsed));
    } catch { /* fall through */ }
    throw new Error("Key is neither valid base58 nor a JSON byte array.");
  }

  if (rawKey) {
    try {
      crankKp = keypairFromAny(rawKey);
    } catch (e: any) {
      console.error(`❌  CRANK_PRIVATE_KEY is invalid — ${e.message}`);
      process.exit(1);
    }
  } else if (anchorWallet) {
    try {
      crankKp = keypairFromAny(anchorWallet);
    } catch (e: any) {
      console.error(`❌  ANCHOR_WALLET is invalid — ${e.message}`);
      process.exit(1);
    }
  } else {
    console.error(
      "❌  No crank key found.\n" +
      "    • Local dev: add CRANK_PRIVATE_KEY=<base58-key> to crank/.env\n" +
      "    • GitHub CI: set mainnet_crank secret (base58 or JSON byte array)",
    );
    process.exit(1);
  }

  console.log(`🔑  Crank wallet : ${crankKp.publicKey.toBase58()}`);

  // ── Connect ──
  const connection = new Connection(RPC_URL, "confirmed");
  const balance    = await connection.getBalance(crankKp.publicKey);
  console.log(`💰  Balance       : ${(balance / 1e9).toFixed(4)} SOL`);
  if (balance < 0.05e9) {
    console.warn(
      "⚠️   Balance is low — please fund the crank wallet with SOL on Mainnet-Beta:\n" +
      `    solana transfer ${crankKp.publicKey.toBase58()} 0.1`,
    );
  }

  // ── Anchor provider + program ──
  const wallet   = new anchor.Wallet(crankKp);
  const provider = new AnchorProvider(connection, wallet, {
    commitment:    "confirmed",
    skipPreflight: true,
  });
  // Load IDL — sits alongside index.ts in the crank repo
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const idl     = require(path.join(__dirname, "fortress_protocol.json")) as anchor.Idl;
  const program = new Program(idl, provider);

  // ── Switchboard SDK ──
  const sbProgram: SbProgram = await sb.AnchorUtils.loadProgramFromConnection(connection, wallet);

  // ── Targeted mode: only process one vault when LOTTERY_TYPE + TIER are set ──
  const targetType = process.env.LOTTERY_TYPE?.trim().toUpperCase() || null;
  const targetTierRaw = process.env.TIER ? parseInt(process.env.TIER, 10) : NaN;
  const targetTier = Number.isFinite(targetTierRaw) ? targetTierRaw : null;

  const filteredLotteries = targetType
    ? LOTTERY_CONFIGS.filter(l => l.name === targetType)
    : [...LOTTERY_CONFIGS];
  const effectiveLotteries = filteredLotteries.length > 0 ? filteredLotteries : [...LOTTERY_CONFIGS];

  const header = targetType && targetTier !== null
    ? `${targetType} $${targetTier} (targeted)`
    : `all ${LOTTERY_CONFIGS.reduce((n, l) => n + l.tiers.length, 0)} vaults`;

  console.log(`\n${"═".repeat(72)}`);
  console.log(`  FORTRESS MAINNET CRANK — scanning ${header}`);
  console.log(`${"═".repeat(72)}\n`);

  // ── Process vaults ──
  for (const lottery of effectiveLotteries) {
    for (const tier of lottery.tiers) {
      if (targetTier !== null && tier !== targetTier) continue;
      await processVault(connection, program, sbProgram, crankKp, lottery, tier);
    }
  }

  console.log("\n✅  Crank run complete.\n");
}

// ─── Process a single vault ──────────────────────────────────────────────────

async function processVault(
  connection: Connection,
  program:    Program,
  sbProgram:  SbProgram,
  crankKp:    Keypair,
  lottery:    (typeof LOTTERY_CONFIGS)[number],
  tier:       number,
): Promise<void> {
  const tag = `[${lottery.name} $${tier}]`;

  try {
    const vault = deriveVaultPDA(lottery.prefix, tier);

    // Fetch vault state — skip if not yet initialised
    let vaultData: any;
    try {
      vaultData = await (program.account as any).lotteryVault.fetch(vault);
    } catch {
      console.log(`${tag}  — not initialised, skipping`);
      return;
    }

    const participantCount: number = toNum(vaultData.participantCount);
    const roundNumber: number      = toNum(vaultData.roundNumber);
    const endTime: number          = toNum(vaultData.endTime);
    const isLpm                    = lottery.id === 0;
    const nowSec                   = Math.floor(Date.now() / 1000);

    // Skip already-drawn vaults (VaultState::Ready means payout already done)
    const vaultStateReady =
      vaultData.state?.ready !== undefined
        ? "ready" in vaultData.state
        : false;
    if (vaultStateReady && participantCount === 0) {
      console.log(`${tag}  — already drawn and reset, skipping`);
      return;
    }

    // ── Determine action ──
    let action: "draw" | "rollover" | "wait" = "wait";
    if (isLpm) {
      if (participantCount >= 100) action = "draw";
    } else {
      const expired = endTime > 0 && nowSec >= endTime;
      if (expired && participantCount > 0) action = "draw";
      else if (expired && participantCount === 0) action = "rollover";
    }

    const remaining = endTime > 0 ? endTime - nowSec : null;
    console.log(
      `${tag}  participants=${participantCount}` +
      (isLpm ? "" : `  endTime=${endTime}  remaining=${remaining !== null ? remaining + "s" : "—"}`) +
      `  → ${action}`,
    );

    if (action === "rollover") {
      if (participantCount === 0) {
        // Expired vault with no participants: nothing to roll over, just skip.
        // The on-chain rollover_*_tier instruction requires participant_count > 0.
        console.log(`${tag}  — expired, 0 participants → skip (no action needed)`);
        return;
      }
      await doRollover(program, crankKp, lottery, tier);
      return;
    }
    if (action !== "draw") return;

    // ── Already a pending draw? Jump straight to fulfill ──
    const pdPDA        = pendingDrawPDA(lottery.id, tier);
    const pdInfo       = await connection.getAccountInfo(pdPDA, "confirmed");

    if (!pdInfo) {
      await doRequestDraw(connection, program, sbProgram, crankKp, lottery, tier, pdPDA, vault);
    } else {
      console.log(`${tag}  PendingDraw already exists — jumping to fulfill`);
    }

    await doFulfillDraw(
      connection, program, crankKp, lottery, tier,
      pdPDA, vault, participantCount, roundNumber,
    );

  } catch (err: any) {
    // Log but do not crash — other vaults should still be processed
    const msg: string = err?.message ?? (typeof err === 'object' ? JSON.stringify(err) : String(err));
    console.error(`${tag}  ❌  ${msg.slice(0, 400)}`);
    if (Array.isArray(err?.logs)) {
      err.logs.slice(-8).forEach((l: string) => console.error(`         ${l}`));
    }
  }
}

// ─── Step 1 : request_draw_entropy + SB oracle commit ────────────────────────

async function doRequestDraw(
  connection: Connection,
  program:    Program,
  sbProgram:  SbProgram,
  crankKp:    Keypair,
  lottery:    (typeof LOTTERY_CONFIGS)[number],
  tier:       number,
  pdPDA:      PublicKey,
  vault:      PublicKey,
): Promise<void> {
  const tag   = `[${lottery.name} $${tier}]`;
  const rndStr = SB_RANDOMNESS_ACCOUNTS[lottery.name]?.[tier];
  if (!rndStr) {
    console.warn(`${tag}  No RandomnessAccount configured — run scripts/reinit-sb-randomness-crank.ts`);
    return;
  }
  const randomnessAccountPk = new PublicKey(rndStr);

  // Make sure the RandomnessAccount still exists on-chain
  const rndInfo = await connection.getAccountInfo(randomnessAccountPk, "confirmed");
  if (!rndInfo) {
    console.warn(`${tag}  RandomnessAccount not on-chain — run scripts/reinit-sb-randomness-crank.ts`);
    return;
  }

  // Generate a unique user commitment (32 random bytes)
  const userCommitment = new Uint8Array(crypto.randomBytes(32));
  const commitment     = Array.from(userCommitment) as number[];

  console.log(`${tag}  → request_draw_entropy`);
  const reqSig: string = await (program.methods as any)
    .requestDrawEntropy(lottery.id, tier, commitment, new BN(0))
    .accountsStrict({
      requester:         crankKp.publicKey,
      lotteryState:      vault,
      pendingDraw:       pdPDA,
      treasuryVault:     solVaultPDA(),
      systemProgram:     SystemProgram.programId,
      randomnessAccount: randomnessAccountPk,
    })
    .rpc({ skipPreflight: true, commitment: "confirmed" });
  console.log(`${tag}  ✅  request_draw_entropy  sig=${reqSig.slice(0, 20)}…`);

  // Trigger the Switchboard oracle commit so it generates the random value.
  // This tells the SRS oracle "please generate randomness for this account now".
  // Non-fatal: the SRS oracle polls on its own schedule and may pick it up anyway.
  try {
    console.log(`${tag}  → SB oracle commit`);
    const randomness    = new sb.Randomness(sbProgram, randomnessAccountPk);
    const commitIx      = await (randomness.commitIx(SB_MAINNET_QUEUE) as Promise<import("@solana/web3.js").TransactionInstruction>);
    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    const msg           = new TransactionMessage({
      payerKey:        crankKp.publicKey,
      recentBlockhash: blockhash,
      instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }),
        commitIx,
      ],
    }).compileToV0Message();
    const vtx = new VersionedTransaction(msg);
    vtx.sign([crankKp]);
    const commitSig = await connection.sendRawTransaction(vtx.serialize(), { skipPreflight: true });
    await connection.confirmTransaction(commitSig, "confirmed");
    console.log(`${tag}  ✅  SB commit  sig=${commitSig.slice(0, 20)}…`);
  } catch (sbErr: any) {
    // Non-fatal — oracle may auto-pick up the request on mainnet
    console.warn(`${tag}  ⚠️   SB commit failed (proceeding anyway): ${String(sbErr?.message ?? sbErr).slice(0, 100)}`);
  }
}

// ─── Step 2 : poll reveal + fulfill_draw_entropy ─────────────────────────────

async function doFulfillDraw(
  connection:       Connection,
  program:          Program,
  crankKp:          Keypair,
  lottery:          (typeof LOTTERY_CONFIGS)[number],
  tier:             number,
  pdPDA:            PublicKey,
  vault:            PublicKey,
  participantCount: number,
  roundNumber:      number,
): Promise<void> {
  const tag = `[${lottery.name} $${tier}]`;

  // Re-read PendingDraw for the stored commitment + randomness account pubkey.
  // PendingDraw layout (after 8B discriminator):
  //   u8 lottery_type_id(1) + u8 tier(1) + pubkey randomness_account(32)
  //   + [u8;32] user_commitment(32) + pubkey requester(32) + i64 requested_at(8)
  //   + u8 bump(1) + u64 request_reveal_slot(8)
  const pdInfo = await connection.getAccountInfo(pdPDA, "confirmed");
  if (!pdInfo) {
    console.error(`${tag}  PendingDraw missing — cannot fulfill`);
    return;
  }
  const d = pdInfo.data;
  const randomnessAccountPk  = new PublicKey(d.slice(10, 42));
  const storedCommitment     = new Uint8Array(d.slice(42, 74));
  const requestRevealSlot    = d.length >= 123 ? d.readBigUInt64LE(115) : BigInt(0);

  // ── Poll oracle until it reveals a value strictly newer than requestRevealSlot ──
  console.log(`${tag}  Polling oracle (timeout ${POLL_TIMEOUT_MS / 1000}s) …`);
  const deadline  = Date.now() + POLL_TIMEOUT_MS;
  let sbValue: Uint8Array | null = null;

  while (Date.now() < deadline) {
    const raInfo = await connection.getAccountInfo(randomnessAccountPk, "processed");
    if (raInfo && raInfo.data.length >= SB_VALUE_OFFSET + 32) {
      const revealSlot = raInfo.data.readBigUInt64LE(REVEAL_SLOT_OFFSET);
      if (revealSlot > requestRevealSlot) {
        sbValue = new Uint8Array(raInfo.data.slice(SB_VALUE_OFFSET, SB_VALUE_OFFSET + 32));
        console.log(`${tag}  Oracle revealed at slot ${revealSlot}`);
        break;
      }
    }
    await sleep(POLL_INTERVAL_MS);
  }

  if (!sbValue) {
    console.error(
      `${tag}  ⏰  Oracle did not reveal within ${POLL_TIMEOUT_MS / 1000}s. ` +
      "Will retry on next crank run.",
    );
    return;
  }

  // ── Compute winner (off-chain mirrors oracle.rs create_lottery_entropy_from_slot) ──
  const entropyBI  = computeVrfEntropy(sbValue, storedCommitment, lottery.id, tier, roundNumber);
  const winnerIdx  = Number(entropyBI % BigInt(participantCount));
  console.log(`${tag}  Winner index = ${winnerIdx} / ${participantCount}`);

  // Read participant pages
  const page0PDA    = participantPagePDA(lottery.id, tier, 0);
  const page1PDA    = participantPagePDA(lottery.id, tier, 1);
  const page0       = await readPageParticipants(connection, page0PDA);
  const page1       = await readPageParticipants(connection, page1PDA);
  const allPtcpts   = [...page0, ...page1];

  if (allPtcpts.length === 0) {
    console.error(`${tag}  Participant pages are empty — cannot determine winner`);
    return;
  }

  const safeIdx        = winnerIdx % allPtcpts.length;
  const winnerPubkey   = allPtcpts[safeIdx];
  const winningPagePDA = safeIdx < page0.length ? page0PDA : page1PDA;

  // Resolve ATAs (all created on-chain by the program if absent; no client pre-creation needed)
  const solVault           = solVaultPDA();
  const vaultTokenAccount  = getAssociatedTokenAddressSync(FPT_MINT, vault,            true,  TOKEN_2022_PROGRAM_ID);
  const winnerAta          = getAssociatedTokenAddressSync(FPT_MINT, winnerPubkey,     false, TOKEN_2022_PROGRAM_ID);
  const authorityAta       = getAssociatedTokenAddressSync(FPT_MINT, crankKp.publicKey, false, TOKEN_2022_PROGRAM_ID);
  const treasuryFptAta     = getAssociatedTokenAddressSync(FPT_MINT, solVault,          true,  TOKEN_2022_PROGRAM_ID);

  console.log(`${tag}  → fulfill_draw_entropy  winner=${winnerPubkey.toBase58().slice(0, 8)}…`);

  const fulfillSig: string = await (program.methods as any)
    .fulfillDrawEntropy(lottery.id, tier, new BN(SETTLER_REWARD_FPT))
    .accountsStrict({
      authority:              crankKp.publicKey,
      fptMint:                FPT_MINT,
      lotteryState:           vault,
      vaultTokenAccount,
      winner:                 winnerPubkey,
      winnerAta,
      treasuryVault:          solVault,
      treasury:               treasuryPDA(),
      treasuryFptAta,
      authorityAta,
      participantPage0:       page0PDA,
      winningParticipantPage: winningPagePDA,
      config:                 globalRegistryPDA(),
      randomnessAccount:      randomnessAccountPk,
      winnerHistory:          winnerHistoryPDA(lottery.id, tier),
      pendingDraw:             pdPDA,
      tokenProgram:           TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram:          SystemProgram.programId,
    })
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }),
    ])
    .rpc({ skipPreflight: true, commitment: "confirmed" });

  console.log(
    `${tag}  🎉  Draw complete!\n` +
    `         winner  = ${winnerPubkey.toBase58()}\n` +
    `         sig     = ${fulfillSig}`,
  );
}

// ─── Rollover : expired timed vault with 0 participants ──────────────────────

async function doRollover(
  program: Program,
  crankKp: Keypair,
  lottery: (typeof LOTTERY_CONFIGS)[number],
  tier:    number,
): Promise<void> {
  const tag       = `[${lottery.name} $${tier}]`;
  const methodMap: Record<string, string> = {
    DPL: "rolloverDplTier",
    WPL: "rolloverWplTier",
    MPL: "rolloverMplTier",
  };
  const method = methodMap[lottery.name];
  if (!method) return; // LPM has no rollover

  console.log(`${tag}  → rollover (expired, 0 participants)`);
  const vault  = deriveVaultPDA(lottery.prefix, tier);
  const sig: string = await (program.methods as any)
    [method](tier)
    .accountsStrict({
      authority:     crankKp.publicKey,
      lotteryVault:  vault,
      systemProgram: SystemProgram.programId,
    })
    .rpc({ skipPreflight: true, commitment: "confirmed" });
  console.log(`${tag}  ✅  Rollover  sig=${sig.slice(0, 20)}…`);
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function deriveVaultPDA(prefix: string, tier: number): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(prefix), Buffer.from([tier])], PROGRAM_ID,
  )[0];
}

function toNum(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  if (typeof (v as any).toNumber === "function") return (v as any).toNumber();
  return Number(v);
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ─── Run ──────────────────────────────────────────────────────────────────────

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

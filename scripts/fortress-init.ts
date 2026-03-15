#!/usr/bin/env npx ts-node
/**
 * Fortress Protocol — Correct Full Initialization Script
 *
 * Initializes in order:
 *  1. Treasury data PDA         (seeds: ["treasury"])
 *  2. Treasury Vault / sol_vault (seeds: ["sol_vault"]) — pays rent for all other accounts
 *  3. Global Registry
 *  4. DPL / WPL / MPL / LPM lottery accounts
 *  5. All 16 vault + token-account pairs (4 tiers × 4 types)
 *  6. Pricing Config
 *
 * Usage:
 *   ADMIN_KEYPAIR=/home/dev/my-wallet.json npx ts-node scripts/fortress-init.ts
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { AnchorProvider, Wallet, BN, Program } from '@coral-xyz/anchor';
import {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';

// ───────────────────────── Configuration ──────────────────────────────────────
const PROGRAM_ID = new PublicKey('EB6kkg2sW5rnukjRH7Ljhz78gbfc36XZAuiFn5jdefF3');
const FPT_MINT   = new PublicKey('3YTnzmFTECtyKDxaghWPQcjzX7g1Cj3NxMq41JdWk2rj');
const ADMIN_KEY  = new PublicKey('EANi5dM5CUbtoiJAN72JgKMSNM6bMWsSWMX1w1t2yWcv');

// SOL deposited into sol_vault so it can pay for all PDA rent allocations
const SOL_VAULT_DEPOSIT = 0.5 * LAMPORTS_PER_SOL;

// FPT pricing rate: 1_000_000 = 1 FPT (6 dec) per USD (6 dec) → 1:1 parity
const PRICING_RATE = 1_000_000;

// Tier price arrays (u8 values become PDA seeds directly)
const DPL_TIERS: number[] = [5, 10, 15, 20];
const WPL_TIERS: number[] = [5, 10, 15, 20];
const MPL_TIERS: number[] = [5, 10, 15, 20];
const LPM_TIERS: number[] = [5, 10, 20, 50];

// ───────────────────────── PDA helpers ────────────────────────────────────────
function pda(...seeds: Buffer[]): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
}

const TREASURY    = pda(Buffer.from('treasury'));
const SOL_VAULT   = pda(Buffer.from('sol_vault'));
const REGISTRY    = pda(Buffer.from('global_registry'));
const DPL_LOTTERY = pda(Buffer.from('dpl_lottery'));
const WPL_LOTTERY = pda(Buffer.from('wpl_lottery'));
const MPL_LOTTERY = pda(Buffer.from('mpl_lottery'));
const LPM_LOTTERY = pda(Buffer.from('lpm_lottery'));
const PRICING_CFG = pda(Buffer.from('pricing_config'));

function vaultPda(type: string, tier: number): PublicKey {
  return pda(Buffer.from(`vault_${type}`), Buffer.from([tier]));
}

function vaultAta(vaultKey: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(FPT_MINT, vaultKey, true, TOKEN_2022_PROGRAM_ID);
}

// ───────────────────────── Retry wrapper ──────────────────────────────────────
async function tryCall(label: string, fn: () => Promise<string>): Promise<boolean> {
  try {
    const tx = await fn();
    console.log(`  ✅ ${label}`);
    console.log(`     tx: ${tx.slice(0, 60)}...`);
    return true;
  } catch (e: any) {
    const msg: string = e.message || '';
    // Graceful skip for already-initialized accounts
    if (
      /already in use|already initialized|custom program error: 0x0\b|account already exists/i.test(msg)
    ) {
      console.log(`  ⏭️  ${label}: already initialized`);
      return true;
    }
    console.error(`  ❌ ${label} FAILED`);
    console.error(`     ${msg.split('\n')[0]}`);
    if (e.logs) {
      const logs: string[] = e.logs;
      console.error(`     Logs:\n       ${logs.slice(-6).join('\n       ')}`);
    }
    return false;
  }
}

// ───────────────────────── Main ───────────────────────────────────────────────
async function main() {
  // Load keypair
  const keypairPath =
    process.env.ADMIN_KEYPAIR ||
    `${process.env.HOME}/.config/solana/id.json`;

  if (!fs.existsSync(keypairPath)) {
    console.error(`❌ Keypair not found at ${keypairPath}`);
    console.error('   Set ADMIN_KEYPAIR env var to the correct path.');
    process.exit(1);
  }

  const adminKp = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, 'utf8')))
  );

  if (!adminKp.publicKey.equals(ADMIN_KEY)) {
    console.error(`❌ Wrong wallet loaded.`);
    console.error(`   Expected: ${ADMIN_KEY.toBase58()}`);
    console.error(`   Got:      ${adminKp.publicKey.toBase58()}`);
    process.exit(1);
  }

  // Load IDL
  const idlPath = path.join(__dirname, '../target/idl/fortress_protocol.json');
  if (!fs.existsSync(idlPath)) {
    console.error('❌ IDL not found. Run `anchor build` first.');
    process.exit(1);
  }
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));

  // Setup provider
  const rpc = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
  const conn = new Connection(rpc, 'confirmed');
  const provider = new AnchorProvider(conn, new Wallet(adminKp), {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  });
  const program = new Program(idl, provider);

  const adminBal = await conn.getBalance(adminKp.publicKey);

  console.log('\n🏰  Fortress Protocol — Full Initialization');
  console.log('='.repeat(60));
  console.log('Program:   ', PROGRAM_ID.toBase58());
  console.log('Admin:     ', ADMIN_KEY.toBase58());
  console.log('Balance:   ', (adminBal / LAMPORTS_PER_SOL).toFixed(4), 'SOL');
  console.log('RPC:       ', rpc);
  console.log('\nPDAs:');
  console.log('  treasury:        ', TREASURY.toBase58());
  console.log('  sol_vault:       ', SOL_VAULT.toBase58());
  console.log('  global_registry: ', REGISTRY.toBase58());
  console.log('  pricing_config:  ', PRICING_CFG.toBase58());

  // Common accounts shared by all treasury-vault-funded instructions
  const tvAccounts = {
    authority: adminKp.publicKey,
    treasuryVault: SOL_VAULT,
    treasury: TREASURY,
    systemProgram: SystemProgram.programId,
  };

  // ── Step 1: Treasury data PDA ───────────────────────────────────────────────
  console.log('\n──── Step 1: Treasury ──────────────────────────────────────────');
  const treasuryInfo = await conn.getAccountInfo(TREASURY);
  if (treasuryInfo) {
    console.log('  ⏭️  Treasury: already initialized');
  } else {
    await tryCall('initialize_treasury', () =>
      (program.methods as any)
        .initializeTreasury()
        .accounts({
          admin: adminKp.publicKey,
          treasury: TREASURY,
          systemProgram: SystemProgram.programId,
        })
        .signers([adminKp])
        .rpc()
    );
  }

  // ── Step 2: Treasury Vault (sol_vault) ────────────────────────────────────
  console.log('\n──── Step 2: Treasury Vault (sol_vault) ────────────────────────');
  const vaultBalanceLamports = await conn.getBalance(SOL_VAULT);
  console.log(
    `  Current sol_vault balance: ${(vaultBalanceLamports / LAMPORTS_PER_SOL).toFixed(4)} SOL`
  );

  if (vaultBalanceLamports < 0.3 * LAMPORTS_PER_SOL) {
    // Call the program instruction to create the sol_vault PDA and deposit SOL
    await tryCall(
      `initialize_treasury_vault (deposit ${SOL_VAULT_DEPOSIT / LAMPORTS_PER_SOL} SOL)`,
      () =>
        (program.methods as any)
          .initializeTreasuryVault(new BN(SOL_VAULT_DEPOSIT))
          .accounts({
            authority: adminKp.publicKey,
            treasuryVault: SOL_VAULT,
            treasury: TREASURY,
            systemProgram: SystemProgram.programId,
          })
          .signers([adminKp])
          .rpc()
    );
  } else {
    console.log('  ⏭️  sol_vault: already funded (skipping)');
  }

  // Verify sol_vault is funded before proceeding
  const vaultBalAfter = await conn.getBalance(SOL_VAULT);
  if (vaultBalAfter < 0.05 * LAMPORTS_PER_SOL) {
    console.error(
      `❌ sol_vault has insufficient balance (${(vaultBalAfter / LAMPORTS_PER_SOL).toFixed(4)} SOL)`
    );
    console.error(
      '   Send SOL to sol_vault first: solana transfer ' +
        SOL_VAULT.toBase58() +
        ' 0.5 --allow-unfunded-recipient'
    );
    process.exit(1);
  }

  // ── Step 3: Global Registry ─────────────────────────────────────────────────
  console.log('\n──── Step 3: Global Registry ───────────────────────────────────');
  await tryCall('initialize_global_registry', () =>
    (program.methods as any)
      .initializeGlobalRegistry()
      .accounts({ ...tvAccounts, registry: REGISTRY })
      .signers([adminKp])
      .rpc()
  );

  // ── Step 4: Lottery Accounts ────────────────────────────────────────────────
  console.log('\n──── Step 4: Lottery Accounts ──────────────────────────────────');
  const lotteryInits = [
    { name: 'DPL', pda: DPL_LOTTERY, method: 'initializeDplLottery', pdaKey: 'dplLottery' },
    { name: 'WPL', pda: WPL_LOTTERY, method: 'initializeWplLottery', pdaKey: 'wplLottery' },
    { name: 'MPL', pda: MPL_LOTTERY, method: 'initializeMplLottery', pdaKey: 'mplLottery' },
    { name: 'LPM', pda: LPM_LOTTERY, method: 'initializeLpmLottery', pdaKey: 'lpmLottery' },
  ];

  for (const { name, pda: lotteryPda, method, pdaKey } of lotteryInits) {
    await tryCall(`${name} lottery account`, () =>
      (program.methods as any)
        [method]()
        .accounts({ ...tvAccounts, [pdaKey]: lotteryPda })
        .signers([adminKp])
        .rpc()
    );
  }

  // ── Step 5: Vault Tiers (16 total) ──────────────────────────────────────────
  console.log('\n──── Step 5: Vault Tiers (16 total) ────────────────────────────');
  const tierDefs = [
    { type: 'dpl', method: 'initializeDplTier', tiers: DPL_TIERS },
    { type: 'wpl', method: 'initializeWplTier', tiers: WPL_TIERS },
    { type: 'mpl', method: 'initializeMplTier', tiers: MPL_TIERS },
    { type: 'lpm', method: 'initializeLpmTier', tiers: LPM_TIERS },
  ];

  for (const { type, method, tiers } of tierDefs) {
    for (const tier of tiers) {
      const vault = vaultPda(type, tier);
      const tokenAccount = vaultAta(vault);

      await tryCall(`${type.toUpperCase()} $${tier} vault`, () =>
        (program.methods as any)
          [method](tier)
          .accounts({
            authority: adminKp.publicKey,
            treasuryVault: SOL_VAULT,
            treasury: TREASURY,
            fptMint: FPT_MINT,
            vault,
            tokenAccount,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([adminKp])
          .rpc()
      );
    }
  }

  // ── Step 6: Pricing Config ──────────────────────────────────────────────────
  console.log('\n──── Step 6: Pricing Config ────────────────────────────────────');
  await tryCall(`initialize_pricing_config (rate: ${PRICING_RATE})`, () =>
    (program.methods as any)
      .initializePricingConfig(new BN(PRICING_RATE))
      .accounts({
        admin: adminKp.publicKey,
        pricingConfig: PRICING_CFG,
        systemProgram: SystemProgram.programId,
      })
      .signers([adminKp])
      .rpc()
  );

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log('\n🎉  Initialization complete!');
  console.log('='.repeat(60));
  const finalAdminBal = await conn.getBalance(adminKp.publicKey);
  const finalVaultBal = await conn.getBalance(SOL_VAULT);
  console.log(`   Admin balance:     ${(finalAdminBal / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  console.log(`   sol_vault balance: ${(finalVaultBal / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  console.log('\n   Next steps:');
  console.log('   1. Verify: npx ts-node scripts/verify-lottery-status.ts');
  console.log('   2. Fund treasury ATA with FPT for draw bounties');
}

main().catch((e) => {
  console.error('\n💥 Fatal error:', e);
  process.exit(1);
});

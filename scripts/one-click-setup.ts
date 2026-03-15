/**
 * One-Click Fortress Lottery Setup Script
 * 
 * This script performs the complete initialization sequence:
 * 1. Checks if Treasury exists, creates if not
 * 2. Checks Treasury balance, prompts for top-up if low
 * 3. Initializes all 20 lottery tiers using Treasury-funded PDAs
 * 
 * The user only pays for:
 * - Treasury initialization (once, ~0.002 SOL)
 * - Treasury top-up (user-defined amount)
 * 
 * All 20 tier initializations are paid from Treasury PDA automatically.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import { AnchorProvider, Program, setProvider, Wallet, BN } from '@coral-xyz/anchor';
import {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// ==================== CONFIGURATION ====================

const PROGRAM_ID = new PublicKey('2JHDbUz11kLe7q44nneougHcJCQqD6t26XeEFFNQJpHY');
const ADMIN_PUBKEY = new PublicKey('EANi5dM5CUbtoiJAN72JgKMSNM6bMWsSWMX1w1t2yWcv');
const FPT_MINT = new PublicKey('3YTnzmFTECtyKDxaghWPQcjzX7g1Cj3NxMq41JdWk2rj');

// Recommended funding: ~0.03 SOL (20 tiers * 0.00128 SOL rent each + buffer)
const RECOMMENDED_TREASURY_FUNDING = 0.5 * LAMPORTS_PER_SOL;
const MIN_TREASURY_BALANCE = 0.1 * LAMPORTS_PER_SOL;

// Lottery types with 4 tiers each
const LOTTERY_TYPES = ['lpm', 'dpl', 'wpl', 'mpl', 'ypl'] as const;
const TIERS = [0, 1, 2, 3] as const;

// ==================== PDA DERIVATION ====================

function deriveTreasuryPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('treasury')],
    PROGRAM_ID
  );
}

function deriveGlobalRegistryPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('global_registry')],
    PROGRAM_ID
  );
}

function deriveLotteryPDA(type: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(`${type}_lottery`)],
    PROGRAM_ID
  );
}

function deriveVaultPDA(type: string, tier: number): [PublicKey, number] {
  const tierBytes = Buffer.alloc(4);
  tierBytes.writeUInt8(tier, 0);
  return PublicKey.findProgramAddressSync(
    [Buffer.from(`vault_${type}`), tierBytes],
    PROGRAM_ID
  );
}

function derivePricingConfigPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('pricing_config')],
    PROGRAM_ID
  );
}

// ==================== UTILITIES ====================

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function formatSOL(lamports: number): string {
  return (lamports / LAMPORTS_PER_SOL).toFixed(4);
}

// ==================== MAIN SETUP FUNCTION ====================

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║        FORTRESS LOTTERY - ONE-CLICK SETUP SCRIPT               ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Load IDL
  const idlPath = path.join(__dirname, '../target/idl/fortress_protocol.json');
  if (!fs.existsSync(idlPath)) {
    console.error('❌ IDL not found. Run `anchor build` first.');
    process.exit(1);
  }
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));

  // Load admin keypair
  const adminKeypairPath = process.env.ADMIN_KEYPAIR || `${process.env.HOME}/.config/solana/id.json`;
  if (!fs.existsSync(adminKeypairPath)) {
    console.error(`❌ Admin keypair not found at ${adminKeypairPath}`);
    process.exit(1);
  }
  const adminKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(adminKeypairPath, 'utf8')))
  );

  console.log('📋 Configuration:');
  console.log(`   Admin Wallet: ${adminKeypair.publicKey.toBase58()}`);
  
  if (!adminKeypair.publicKey.equals(ADMIN_PUBKEY)) {
    console.error('❌ ERROR: Loaded keypair does not match expected admin wallet');
    console.error(`   Expected: ${ADMIN_PUBKEY.toBase58()}`);
    console.error(`   Got: ${adminKeypair.publicKey.toBase58()}`);
    process.exit(1);
  }
  console.log('   ✅ Admin wallet verified\n');

  // Setup connection
  const rpcUrl = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');
  console.log(`   RPC: ${rpcUrl}\n`);

  // Setup provider
  const wallet = new Wallet(adminKeypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  setProvider(provider);

  // Load program
  const program = new Program(idl, provider);

  // Get admin balance
  const adminBalance = await connection.getBalance(adminKeypair.publicKey);
  console.log(`💰 Admin Balance: ${formatSOL(adminBalance)} SOL\n`);

  // ==================== STEP 1: TREASURY ====================
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('STEP 1: TREASURY PDA');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const [treasuryPDA] = deriveTreasuryPDA();
  console.log(`   Treasury PDA: ${treasuryPDA.toBase58()}`);

  let treasuryAccount = await connection.getAccountInfo(treasuryPDA);

  if (!treasuryAccount) {
    console.log('   Status: NOT INITIALIZED\n');
    console.log('   🚀 Initializing Treasury...');

    try {
      const tx = await (program.methods as any).initializeTreasury()
        .accounts({
          admin: adminKeypair.publicKey,
          treasury: treasuryPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([adminKeypair])
        .rpc();

      console.log(`   ✅ Treasury initialized! TX: ${tx}\n`);
      treasuryAccount = await connection.getAccountInfo(treasuryPDA);
    } catch (error: any) {
      console.error(`   ❌ Failed to initialize treasury: ${error.message}`);
      process.exit(1);
    }
  } else {
    console.log('   Status: ✅ ALREADY INITIALIZED\n');
  }

  // Check treasury balance
  const treasuryBalance = treasuryAccount?.lamports || 0;
  console.log(`   Treasury Balance: ${formatSOL(treasuryBalance)} SOL`);

  if (treasuryBalance < MIN_TREASURY_BALANCE) {
    console.log(`   ⚠️  Treasury balance is LOW (< ${formatSOL(MIN_TREASURY_BALANCE)} SOL)`);
    console.log(`   Recommended: ${formatSOL(RECOMMENDED_TREASURY_FUNDING)} SOL for 20 tier inits\n`);

    const answer = await prompt(`   💳 Top up treasury? (y/n): `);
    
    if (answer.toLowerCase() === 'y') {
      const amountStr = await prompt(`   Enter amount in SOL (default: ${formatSOL(RECOMMENDED_TREASURY_FUNDING)}): `);
      const amount = amountStr ? parseFloat(amountStr) * LAMPORTS_PER_SOL : RECOMMENDED_TREASURY_FUNDING;

      if (adminBalance < amount + 0.01 * LAMPORTS_PER_SOL) {
        console.error(`   ❌ Insufficient admin balance for top-up`);
        process.exit(1);
      }

      console.log(`   🚀 Topping up treasury with ${formatSOL(amount)} SOL...`);

      try {
        const tx = await (program.methods as any).topUpTreasury(new BN(amount))
          .accounts({
            payer: adminKeypair.publicKey,
            treasury: treasuryPDA,
            systemProgram: SystemProgram.programId,
          })
          .signers([adminKeypair])
          .rpc();

        console.log(`   ✅ Treasury topped up! TX: ${tx}\n`);
      } catch (error: any) {
        console.error(`   ❌ Failed to top up treasury: ${error.message}`);
        process.exit(1);
      }
    }
  } else {
    console.log(`   ✅ Treasury has sufficient balance\n`);
  }

  // ==================== STEP 2: GLOBAL REGISTRY ====================
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('STEP 2: GLOBAL REGISTRY');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const [registryPDA] = deriveGlobalRegistryPDA();
  console.log(`   Registry PDA: ${registryPDA.toBase58()}`);

  const registryAccount = await connection.getAccountInfo(registryPDA);

  if (!registryAccount) {
    console.log('   Status: NOT INITIALIZED\n');
    console.log('   🚀 Initializing Global Registry...');

    try {
      const tx = await (program.methods as any).initializeGlobalRegistry()
        .accounts({
          authority: adminKeypair.publicKey,
          registry: registryPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([adminKeypair])
        .rpc();

      console.log(`   ✅ Global Registry initialized! TX: ${tx}\n`);
    } catch (error: any) {
      console.error(`   ❌ Failed to initialize registry: ${error.message}`);
      process.exit(1);
    }
  } else {
    console.log('   Status: ✅ ALREADY INITIALIZED\n');
  }

  // ==================== STEP 3: PRICING CONFIG ====================
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('STEP 3: PRICING CONFIG');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const [pricingConfigPDA] = derivePricingConfigPDA();
  console.log(`   Pricing Config PDA: ${pricingConfigPDA.toBase58()}`);

  const pricingAccount = await connection.getAccountInfo(pricingConfigPDA);

  if (!pricingAccount) {
    console.log('   Status: NOT INITIALIZED\n');
    console.log('   🚀 Initializing Pricing Config (rate: 1.0 FPT/USD)...');

    try {
      const tx = await (program.methods as any).initializePricingConfig(new BN(1_000_000))
        .accounts({
          admin: adminKeypair.publicKey,
          pricingConfig: pricingConfigPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([adminKeypair])
        .rpc();

      console.log(`   ✅ Pricing Config initialized! TX: ${tx}\n`);
    } catch (error: any) {
      console.error(`   ❌ Failed to initialize pricing config: ${error.message}`);
      process.exit(1);
    }
  } else {
    console.log('   Status: ✅ ALREADY INITIALIZED\n');
  }

  // ==================== STEP 4: LOTTERY MAIN ACCOUNTS ====================
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('STEP 4: MAIN LOTTERY ACCOUNTS (5 total)');
  console.log('═══════════════════════════════════════════════════════════════\n');

  for (const type of LOTTERY_TYPES) {
    const [lotteryPDA] = deriveLotteryPDA(type);
    const account = await connection.getAccountInfo(lotteryPDA);

    if (!account) {
      console.log(`   🚀 Initializing ${type.toUpperCase()} lottery...`);

      try {
        const methodName = `initialize${type.charAt(0).toUpperCase()}${type.slice(1)}Lottery`;
        const tx = await (program.methods as any)[methodName]()
          .accounts({
            authority: adminKeypair.publicKey,
            [`${type}Lottery`]: lotteryPDA,
            systemProgram: SystemProgram.programId,
          })
          .signers([adminKeypair])
          .rpc();

        console.log(`   ✅ ${type.toUpperCase()} lottery initialized! TX: ${tx.slice(0, 20)}...`);
      } catch (error: any) {
        console.error(`   ❌ Failed to initialize ${type.toUpperCase()} lottery: ${error.message}`);
      }
    } else {
      console.log(`   ✅ ${type.toUpperCase()} lottery already initialized`);
    }
  }
  console.log('');

  // ==================== STEP 5: TIER VAULTS (Treasury-Funded) ====================
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('STEP 5: TIER VAULTS (20 total - Treasury-funded)');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log('   💡 These initializations are paid by the Treasury PDA,');
  console.log('   not your wallet. No additional signatures needed.\n');

  // Re-check treasury balance
  const updatedTreasuryBalance = await connection.getBalance(treasuryPDA);
  console.log(`   Current Treasury Balance: ${formatSOL(updatedTreasuryBalance)} SOL\n`);

  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;

  for (const type of LOTTERY_TYPES) {
    for (const tier of TIERS) {
      const [vaultPDA] = deriveVaultPDA(type, tier);
      const vaultAccount = await connection.getAccountInfo(vaultPDA);

      if (vaultAccount) {
        skipCount++;
        continue; // Already initialized
      }

      // Get the vault token account
      const vaultTokenAccount = getAssociatedTokenAddressSync(
        FPT_MINT,
        vaultPDA,
        true, // allowOwnerOffCurve
        TOKEN_2022_PROGRAM_ID
      );

      console.log(`   🚀 Initializing ${type.toUpperCase()} Tier ${tier}...`);

      try {
        const methodName = `initialize${type.charAt(0).toUpperCase()}${type.slice(1)}Tier`;
        const tx = await (program.methods as any)[methodName](tier)
          .accounts({
            authority: adminKeypair.publicKey,
            treasury: treasuryPDA,
            fptMint: FPT_MINT,
            vault: vaultPDA,
            tokenAccount: vaultTokenAccount,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([adminKeypair])
          .rpc();

        console.log(`   ✅ ${type.toUpperCase()} Tier ${tier} initialized! TX: ${tx.slice(0, 20)}...`);
        successCount++;
      } catch (error: any) {
        console.error(`   ❌ Failed ${type.toUpperCase()} Tier ${tier}: ${error.message}`);
        failCount++;
      }
    }
  }

  console.log('');

  // ==================== SUMMARY ====================
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('SETUP COMPLETE - SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const finalTreasuryBalance = await connection.getBalance(treasuryPDA);
  const finalAdminBalance = await connection.getBalance(adminKeypair.publicKey);

  console.log('   📊 Results:');
  console.log(`      Tiers Initialized: ${successCount}`);
  console.log(`      Tiers Skipped (already exist): ${skipCount}`);
  console.log(`      Tiers Failed: ${failCount}`);
  console.log('');
  console.log('   💰 Final Balances:');
  console.log(`      Admin Wallet: ${formatSOL(finalAdminBalance)} SOL`);
  console.log(`      Treasury PDA: ${formatSOL(finalTreasuryBalance)} SOL`);
  console.log('');
  console.log('   🎉 Fortress Lottery is ready for users!\n');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

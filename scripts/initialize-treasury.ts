import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { AnchorProvider, Program, setProvider, Wallet } from '@coral-xyz/anchor';
import * as fs from 'fs';
import * as path from 'path';

// Load IDL
const idlPath = path.join(__dirname, '../target/idl/fortress_protocol.json');
const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));

// Program ID
const PROGRAM_ID = new PublicKey('BLNY4gLMg4MnPhBGin5p1vxhtY47nYPMw4XGJf63QMHW');

// Admin wallet
const ADMIN_PUBKEY = new PublicKey('EzrUKQPTj7iEAvaJj9rnv4HKUhRGjj4bDLRsAEQfyaYg');

// Treasury PDA
function deriveTreasuryPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('treasury')],
    PROGRAM_ID
  );
}

async function main() {
  // Load admin keypair
  const adminKeypairPath = process.env.ADMIN_KEYPAIR || `${process.env.HOME}/.config/solana/id.json`;
  const adminKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(adminKeypairPath, 'utf8')))
  );

  console.log('Admin Wallet:', adminKeypair.publicKey.toBase58());

  if (!adminKeypair.publicKey.equals(ADMIN_PUBKEY)) {
    console.error('ERROR: Loaded keypair does not match expected admin wallet');
    console.error('Expected:', ADMIN_PUBKEY.toBase58());
    console.error('Got:', adminKeypair.publicKey.toBase58());
    process.exit(1);
  }

  // Setup connection
  const connection = new Connection(
    process.env.RPC_URL || 'https://api.devnet.solana.com',
    'confirmed'
  );

  // Setup provider
  const wallet = new Wallet(adminKeypair);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
  });
  setProvider(provider);

  // Load program
  const program = new Program(idl, provider);

  // Get Treasury PDA
  const [treasuryPDA, treasuryBump] = deriveTreasuryPDA();
  console.log('Treasury PDA:', treasuryPDA.toBase58());
  console.log('Treasury Bump:', treasuryBump);

  // Check if treasury already exists
  const treasuryAccount = await connection.getAccountInfo(treasuryPDA);
  
  if (treasuryAccount) {
    console.log('\n✅ Treasury already initialized');
    console.log('Balance:', treasuryAccount.lamports / LAMPORTS_PER_SOL, 'SOL');
    
    // Decode treasury state
    const treasury = await (program.account as any).treasury.fetch(treasuryPDA);
    console.log('\nTreasury State:');
    console.log('  Authority:', treasury.authority.toBase58());
    console.log('  Total Deposited:', treasury.totalDeposited.toNumber() / LAMPORTS_PER_SOL, 'SOL');
    console.log('  Total Withdrawn:', treasury.totalWithdrawn.toNumber() / LAMPORTS_PER_SOL, 'SOL');
    console.log('  Total Init Fees:', treasury.totalInitFees.toNumber() / LAMPORTS_PER_SOL, 'SOL');
    console.log('  Total Oracle Fees:', treasury.totalOracleFees.toNumber() / LAMPORTS_PER_SOL, 'SOL');
    return;
  }

  console.log('\n🚀 Initializing Treasury...');

  try {
    const tx = await (program.methods as any).initializeTreasury()
      .accounts({
        authority: adminKeypair.publicKey,
        treasury: treasuryPDA,
        systemProgram: new PublicKey('11111111111111111111111111111111'),
      })
      .signers([adminKeypair])
      .rpc();

    console.log('✅ Treasury initialized!');
    console.log('Transaction:', tx);

    // Fund treasury with 1 SOL for initial operations
    const INITIAL_FUNDING = 1 * LAMPORTS_PER_SOL;
    console.log(`\n💰 Funding treasury with ${INITIAL_FUNDING / LAMPORTS_PER_SOL} SOL...`);

    const fundTx = await (program.methods as any).topUpTreasury(new (await import('@coral-xyz/anchor')).BN(INITIAL_FUNDING))
      .accounts({
        payer: adminKeypair.publicKey,
        treasury: treasuryPDA,
        systemProgram: new PublicKey('11111111111111111111111111111111'),
      })
      .signers([adminKeypair])
      .rpc();

    console.log('✅ Treasury funded!');
    console.log('Transaction:', fundTx);

    // Verify balance
    const finalBalance = await connection.getBalance(treasuryPDA);
    console.log('\n📊 Final Treasury Balance:', finalBalance / LAMPORTS_PER_SOL, 'SOL');

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main().catch(console.error);

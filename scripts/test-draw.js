// Test draw for DPL-5 vault using try-each-participant approach
const { Connection, PublicKey, Keypair, Transaction, SystemProgram } = require('@solana/web3.js');
const anchor = require('@coral-xyz/anchor');
const {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} = require('@solana/spl-token');
const fs = require('fs');
const BN = require('bn.js');

const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
const walletRaw = JSON.parse(fs.readFileSync('/home/dev/my-wallet.json', 'utf8'));
const admin = Keypair.fromSecretKey(Uint8Array.from(walletRaw));
const idl = JSON.parse(fs.readFileSync('/home/dev/fortress/app/src/idl/fortress_protocol.json', 'utf8'));
const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(admin), { commitment: 'confirmed' });
const program = new anchor.Program(idl, provider);

const FPT_MINT    = new PublicKey('7vZbJ3WN4eGF6rGikB4MBLs4kiJwaRzNSX3smQRJJNw2');
const PYTH        = new PublicKey('J83w4HKfqxwcq3BEMMkPFSppX3gqekLyLJBexebFVkix');
const PROGRAM_ID  = new PublicKey('BLNY4gLMg4MnPhBGin5p1vxhtY47nYPMw4XGJf63QMHW');

// PDAs
const [SOL_VAULT_PDA] = PublicKey.findProgramAddressSync([Buffer.from('sol_vault')], PROGRAM_ID);
const [TREASURY_PDA]  = PublicKey.findProgramAddressSync([Buffer.from('treasury')], PROGRAM_ID);
const [REGISTRY_PDA]  = PublicKey.findProgramAddressSync([Buffer.from('global_registry')], PROGRAM_ID);
const [PRICING_PDA]   = PublicKey.findProgramAddressSync([Buffer.from('pricing_config')], PROGRAM_ID);

const DPL5_VAULT = new PublicKey('7cig1GHRuR8dP2hGX7tSBQQrQ5cE56oT55eGwjecibSf');
const DPL_TYPE   = Buffer.from([1]);  // DPL = 1
const TIER_BUF   = Buffer.from([5]);  // tier = $5
const PAGE0_BUF  = Buffer.from([0]);  // page 0

const PAGE0_PDA = PublicKey.findProgramAddressSync(
  [Buffer.from('page'), DPL_TYPE, TIER_BUF, PAGE0_BUF],
  PROGRAM_ID
)[0];

async function readParticipants(pageAddr) {
  const info = await connection.getAccountInfo(pageAddr);
  if (!info) { console.log('Page not found:', pageAddr.toBase58()); return []; }
  // Page layout: 8 bytes discriminator, then 4 bytes count, then 32-byte pubkeys
  const data = info.data;
  const count = data.readUInt32LE(8);
  console.log('Page participant count:', count);
  const participants = [];
  for (let i = 0; i < count; i++) {
    const offset = 12 + i * 32;
    if (offset + 32 <= data.length) {
      participants.push(new PublicKey(data.slice(offset, offset + 32)));
    }
  }
  return participants;
}

async function tryDraw(winnerPubkey, page0PDA) {
  const vaultTokenAccount = getAssociatedTokenAddressSync(FPT_MINT, DPL5_VAULT, true, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const treasuryFptAta    = getAssociatedTokenAddressSync(FPT_MINT, SOL_VAULT_PDA, true, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const authorityAta      = getAssociatedTokenAddressSync(FPT_MINT, admin.publicKey, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const winnerAta         = getAssociatedTokenAddressSync(FPT_MINT, winnerPubkey, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);

  // Create winner ATA if missing
  const winnerAtaInfo = await connection.getAccountInfo(winnerAta);
  if (!winnerAtaInfo) {
    console.log('  Creating winner ATA...');
    const ix = createAssociatedTokenAccountInstruction(admin.publicKey, winnerAta, winnerPubkey, FPT_MINT, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    const tx = new Transaction({ feePayer: admin.publicKey, recentBlockhash: blockhash }).add(ix);
    tx.sign(admin);
    const sig = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction(sig, 'confirmed');
    console.log('  Winner ATA created:', sig);
  }

  const accounts = {
    authority: admin.publicKey,
    fptMint: FPT_MINT,
    lotteryState: DPL5_VAULT,
    vaultTokenAccount,
    winner: winnerPubkey,
    winnerAta,
    treasuryVault: SOL_VAULT_PDA,
    treasury: TREASURY_PDA,
    treasuryFptAta,
    participantPage0: page0PDA,
    winningParticipantPage: page0PDA,
    config: REGISTRY_PDA,
    pythEntropyAccount: PYTH,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
    authorityAta,
    pricingConfig: PRICING_PDA,
  };

  // First simulate
  try {
    const sim = await program.methods.executeDrawDpl(5)
      .accountsStrict(accounts)
      .simulate();
    console.log('  SIMULATION PASSED for winner:', winnerPubkey.toBase58().slice(0, 8));
    if (sim.raw) sim.raw.forEach(l => console.log(' ', l));
    return true;
  } catch (e) {
    const msg = e.message || '';
    if (msg.includes('InvalidWinner') || (e.logs && e.logs.some && e.logs.some(l => l.includes('InvalidWinner')))) {
      console.log('  InvalidWinner for:', winnerPubkey.toBase58().slice(0, 8));
    } else {
      console.log('  Other error for', winnerPubkey.toBase58().slice(0, 8), ':', msg.slice(0, 200));
      if (e.logs) e.logs.forEach(l => console.log('   LOG:', l));
    }
    return false;
  }
}

async function main() {
  console.log('=== DRAW TEST ===');
  console.log('Vault:', DPL5_VAULT.toBase58());
  console.log('Page0:', PAGE0_PDA.toBase58());
  console.log('Pyth :', PYTH.toBase58());
  console.log('');

  const participants = await readParticipants(PAGE0_PDA);
  console.log('Participants:', participants.map(p => p.toBase58().slice(0, 8)));

  if (participants.length === 0) {
    console.log('No participants — testing auto-extend draw...');
    const success = await tryDraw(admin.publicKey, PAGE0_PDA);
    console.log('Auto-extend draw:', success ? 'PASSED ✅' : 'FAILED ❌');
    return;
  }

  // Try each participant as potential winner
  for (const p of participants) {
    console.log('\nTrying participant:', p.toBase58());
    const ok = await tryDraw(p, PAGE0_PDA);
    if (ok) {
      // Submit for real
      console.log('\nSubmitting real draw with winner:', p.toBase58());
      try {
        const vaultTokenAccount = getAssociatedTokenAddressSync(FPT_MINT, DPL5_VAULT, true, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
        const treasuryFptAta    = getAssociatedTokenAddressSync(FPT_MINT, SOL_VAULT_PDA, true, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
        const authorityAta      = getAssociatedTokenAddressSync(FPT_MINT, admin.publicKey, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
        const winnerAta         = getAssociatedTokenAddressSync(FPT_MINT, p, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
        const tx = await program.methods.executeDrawDpl(5)
          .accountsStrict({
            authority: admin.publicKey, fptMint: FPT_MINT, lotteryState: DPL5_VAULT,
            vaultTokenAccount, winner: p, winnerAta, treasuryVault: SOL_VAULT_PDA,
            treasury: TREASURY_PDA, treasuryFptAta, participantPage0: PAGE0_PDA,
            winningParticipantPage: PAGE0_PDA, config: REGISTRY_PDA,
            pythEntropyAccount: PYTH, tokenProgram: TOKEN_2022_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
            authorityAta, pricingConfig: PRICING_PDA,
          })
          .rpc({ commitment: 'confirmed' });
        console.log('🎉 DRAW SUCCESSFUL! TX:', tx);
        console.log('Winner:', p.toBase58());
      } catch (e) {
        console.log('Real tx failed:', e.message || e);
        if (e.logs) e.logs.forEach(l => console.log(' ', l));
      }
      return;
    }
  }
  console.log('\nAll participants tried — none passed simulation. The winner varies by slot timing.');
  console.log('This is expected — draw entropy depends on exact execution slot.');
  console.log('In the app, the tx will be retried automatically until it succeeds.');
}

main().catch(console.error);

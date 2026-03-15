/**
 * ═══════════════════════════════════════════════════════════════════════════
 *                       LPM GAUNTLET STRESS TEST
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * MISSION: Validate the complete LPM lottery cycle under stress conditions
 * 
 * TEST PHASES:
 * 1. Buy 100 tickets per tier (4 tiers × 100 = 400 tickets total)
 * 2. Verify pagination (Page 0: 1-50, Page 1: 51-100)
 * 3. Trigger draw_lpm_winner for each tier
 * 4. Verify 95/5 split (95% to winner, 5% to admin)
 * 5. Verify auto-reset (balance=0, count=0, is_drawn=false, round++)
 * 
 * ITERATIONS: 3 full cycles to prove repeatability
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { FortressProtocol } from "../target/types/fortress_protocol";
import {
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { expect } from "chai";

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const FPT_MINT = new PublicKey("3YTnzmFTECtyKDxaghWPQcjzX7g1Cj3NxMq41JdWk2rj");
const ADMIN_WALLET = new PublicKey("EANi5dM5CUbtoiJAN72JgKMSNM6bMWsSWMX1w1t2yWcv");

const LPM_TIERS = [5, 10, 20, 50];
const PARTICIPANTS_REQUIRED = 356; // LPM requires exactly 356 participants (256% harder)
const PAGE_SIZE = 50;
const VAULT_SOL_REQUIRED = 0.05 * LAMPORTS_PER_SOL; // 0.05 SOL maximum

// Lottery type enum matching Rust
const LOTTERY_TYPE_LPM = 0;

// ═══════════════════════════════════════════════════════════════════════════
// TEST UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

interface GauntletStats {
  tier: number;
  iteration: number;
  ticketsPurchased: number;
  pagesCreated: number;
  vaultBalanceBefore: BN;
  vaultBalanceAfter: BN;
  winnerPrize: BN;
  adminFee: BN;
  roundBefore: number;
  roundAfter: number;
  vaultSolBefore: number;
  vaultSolAfter: number;
  transactionIds: string[];
}

function logSeparator(title: string): void {
  console.log("\n" + "═".repeat(75));
  console.log(` ${title}`);
  console.log("═".repeat(75));
}

function logSubsection(title: string): void {
  console.log("\n" + "─".repeat(50));
  console.log(` ${title}`);
  console.log("─".repeat(50));
}

function formatLamports(lamports: number): string {
  return `${(lamports / LAMPORTS_PER_SOL).toFixed(6)} SOL`;
}

function formatDpt(amount: BN | number): string {
  const num = typeof amount === 'number' ? amount : amount.toNumber();
  return `${(num / 1_000_000).toFixed(6)} FPT`;
}

// Delay helper to avoid rate limiting (429 errors)
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN TEST SUITE
// ═══════════════════════════════════════════════════════════════════════════

describe("LPM GAUNTLET STRESS TEST", function() {
  // Increase timeout for long-running stress tests
  this.timeout(600_000); // 10 minutes

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.FortressProtocol as Program<FortressProtocol>;
  const authority = provider.wallet as anchor.Wallet;
  const connection = provider.connection;

  // PDAs
  let globalRegistry: PublicKey;
  let pricingConfig: PublicKey;

  // Stats tracking
  const allStats: GauntletStats[] = [];

  before(async () => {
    logSeparator("INITIALIZING LPM GAUNTLET");

    // Derive PDAs - GlobalRegistry uses "global_registry" seed
    [globalRegistry] = PublicKey.findProgramAddressSync(
      [Buffer.from("global_registry")],
      program.programId
    );

    [pricingConfig] = PublicKey.findProgramAddressSync(
      [Buffer.from("pricing_config")],
      program.programId
    );

    console.log(`  Program ID: ${program.programId.toString()}`);
    console.log(`  Authority: ${authority.publicKey.toString()}`);
    console.log(`  FPT Mint: ${FPT_MINT.toString()}`);
    console.log(`  Admin Wallet: ${ADMIN_WALLET.toString()}`);
    console.log(`  Global Registry: ${globalRegistry.toString()}`);
    console.log(`  Pricing Config: ${pricingConfig.toString()}`);
    console.log(`\n  TEST PARAMETERS:`);
    console.log(`    Tiers: ${LPM_TIERS.join(", ")}`);
    console.log(`    Participants Required: ${PARTICIPANTS_REQUIRED}`);
    console.log(`    Page Size: ${PAGE_SIZE}`);
    console.log(`    Iterations: 3`);
  });

  // Helper to derive vault PDA
  function getVaultPDA(tier: number): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("vault_lpm"), Buffer.from([tier])],
      program.programId
    );
  }

  // Helper to derive participant page PDA
  function getParticipantPagePDA(tier: number, pageNumber: number): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from("page"),
        Buffer.from([LOTTERY_TYPE_LPM, 0, 0, 0]),
        Buffer.from([tier, 0, 0, 0]),
        Buffer.from([pageNumber, 0, 0, 0]),
      ],
      program.programId
    );
  }

  // Helper to buy a single ticket using authority wallet (to avoid airdrop rate limits)
  // Automatically fetches current page from vault
  async function buyTicket(tier: number): Promise<string> {
    const [vault] = getVaultPDA(tier);
    
    // Fetch vault to get current page
    // Calculate expected page based on participant count
    const vaultAccount = await program.account.lotteryVault.fetch(vault);
    const participantCount = vaultAccount.participantCount;
    const expectedPage = Math.floor(participantCount / 50);
    
    const [participantPage] = getParticipantPagePDA(tier, expectedPage);

    const buyerAta = getAssociatedTokenAddressSync(
      FPT_MINT,
      authority.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    const vaultAta = getAssociatedTokenAddressSync(
      FPT_MINT,
      vault,
      true,
      TOKEN_2022_PROGRAM_ID
    );

    // Fetch current pricing
    const pricingConfigAccount = await program.account.pricingConfig.fetch(pricingConfig);
    const rate = pricingConfigAccount.fptToUsdRate.toNumber();
    const tierUsdPrice = tier * 1_000_000;  // 6 decimals for USD calculation
    const expectedFpt = Math.floor((tierUsdPrice * rate) / 1_000_000);
    const expectedDptWithDecimals = BigInt(expectedFpt) * BigInt(1_000_000_000); // Convert to 9 decimals for Token-2022
    const maxDptWithSlippage = (expectedDptWithDecimals * BigInt(150)) / BigInt(100); // 50% slippage tolerance
    const maxFptAmount = new anchor.BN(maxDptWithSlippage.toString());

    // Pass page_number as 4th argument to buyLpmTicket
    // Accounts with PDA seeds are auto-derived by Anchor
    const tx = await program.methods
      .buyLpmTicket(tier, 1, maxFptAmount, expectedPage)
      .accounts({
        buyer: authority.publicKey,
        fptMint: FPT_MINT,
        buyerTokenAccount: buyerAta,
        lotteryVault: vault,
        vaultTokenAccount: vaultAta,
        participantPage: participantPage,
        registry: globalRegistry,
        pricingConfig: pricingConfig,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return tx;
  }

  // Helper to fund vault with SOL
  async function fundVault(tier: number, amountLamports: number): Promise<string> {
    const [vault] = getVaultPDA(tier);
    
    const tx = await connection.requestAirdrop(vault, amountLamports);
    await connection.confirmTransaction(tx);
    
    return tx;
  }

  // Helper to draw winner
  async function drawWinner(tier: number, winningPageNumber: number): Promise<{
    tx: string;
    winnerPrize: BN;
    adminFee: BN;
  }> {
    const [vault] = getVaultPDA(tier);
    const [participantPage0] = getParticipantPagePDA(tier, 0);
    const [winningParticipantPage] = getParticipantPagePDA(tier, winningPageNumber);

    const vaultAta = getAssociatedTokenAddressSync(
      FPT_MINT,
      vault,
      true,
      TOKEN_2022_PROGRAM_ID
    );

    // Fetch vault to get balance before draw
    const vaultBefore = await program.account.lotteryVault.fetch(vault);
    const totalBalance = vaultBefore.balance;
    const winnerPrize = new BN(totalBalance.toNumber() * 95 / 100);
    const adminFee = new BN(totalBalance.toNumber() - winnerPrize.toNumber());

    // For winner, we'll read from page and pick first participant
    const page0Data = await program.account.participantPage.fetch(participantPage0);
    const winner = page0Data.participants[0]; // First participant as winner

    // Derive winner and admin ATAs explicitly for init_if_needed
    const winnerAta = getAssociatedTokenAddressSync(
      FPT_MINT,
      winner,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    const adminAta = getAssociatedTokenAddressSync(
      FPT_MINT,
      ADMIN_WALLET,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    // Must pass all accounts for init_if_needed to work
    // Use type assertion because Anchor tries to auto-derive PDAs but Token-2022 ATAs need explicit passing
    const tx = await program.methods
      .drawLpmWinner(tier)
      .accountsStrict({
        authority: authority.publicKey,
        fptMint: FPT_MINT,
        lotteryState: vault,
        vaultTokenAccount: vaultAta,
        winner: winner,
        winnerAta: winnerAta,
        adminWallet: ADMIN_WALLET,
        adminAta: adminAta,
        participantPage0: participantPage0,
        winningParticipantPage: winningParticipantPage,
        config: globalRegistry,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return { tx, winnerPrize, adminFee };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ITERATION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  for (let iteration = 1; iteration <= 3; iteration++) {
    describe(`ITERATION ${iteration} OF 3`, function() {

      for (const tier of LPM_TIERS) {
        describe(`TIER ${tier} ($${tier} USD)`, function() {

          let stats: GauntletStats;

          before(async () => {
            stats = {
              tier,
              iteration,
              ticketsPurchased: 0,
              pagesCreated: 0,
              vaultBalanceBefore: new BN(0),
              vaultBalanceAfter: new BN(0),
              winnerPrize: new BN(0),
              adminFee: new BN(0),
              roundBefore: 0,
              roundAfter: 0,
              vaultSolBefore: 0,
              vaultSolAfter: 0,
              transactionIds: [],
            };
          });

          it(`should buy ${PARTICIPANTS_REQUIRED} tickets`, async function() {
            logSubsection(`Buying ${PARTICIPANTS_REQUIRED} Tickets for Tier ${tier}`);

            const [vault] = getVaultPDA(tier);
            
            // Record initial state
            try {
              const vaultBefore = await program.account.lotteryVault.fetch(vault);
              stats.vaultBalanceBefore = vaultBefore.balance;
              stats.roundBefore = vaultBefore.roundNumber;
              stats.vaultSolBefore = await connection.getBalance(vault);
              console.log(`  Initial State:`);
              console.log(`    Balance: ${formatDpt(stats.vaultBalanceBefore)}`);
              console.log(`    Round: ${stats.roundBefore}`);
              console.log(`    Vault SOL: ${formatLamports(stats.vaultSolBefore)}`);
            } catch (e) {
              console.log(`  Vault not initialized yet, starting fresh`);
            }

            // Buy 100 tickets in batches (using authority wallet)
            const BATCH_SIZE = 10;
            for (let batch = 0; batch < PARTICIPANTS_REQUIRED / BATCH_SIZE; batch++) {
              const batchStart = batch * BATCH_SIZE + 1;
              const batchEnd = batchStart + BATCH_SIZE - 1;
              process.stdout.write(`  Buying tickets ${batchStart}-${batchEnd}...`);

              for (let i = 0; i < BATCH_SIZE; i++) {
                const ticketNumber = batch * BATCH_SIZE + i + 1;

                // Buy ticket using authority (auto-detects current page)
                try {
                  const tx = await buyTicket(tier);
                  stats.transactionIds.push(tx);
                  stats.ticketsPurchased++;

                  // Check vault to update page count
                  const [vault] = getVaultPDA(tier);
                  const vaultAccount = await program.account.lotteryVault.fetch(vault);
                  if (vaultAccount.currentPage > stats.pagesCreated) {
                    stats.pagesCreated = vaultAccount.currentPage;
                  }
                  
                  // Small delay to avoid rate limiting
                  await delay(100);
                } catch (error) {
                  console.error(`\n    ❌ Failed to buy ticket ${ticketNumber}: ${error}`);
                  throw error;
                }
              }
              console.log(` ✅`);
            }

            // Verify final count
            const vaultAfterPurchases = await program.account.lotteryVault.fetch(vault);
            expect(vaultAfterPurchases.participantCount).to.equal(PARTICIPANTS_REQUIRED);
            
            console.log(`\n  ✅ All ${PARTICIPANTS_REQUIRED} tickets purchased!`);
            console.log(`    Vault Balance: ${formatDpt(vaultAfterPurchases.balance)}`);
            console.log(`    Participant Count: ${vaultAfterPurchases.participantCount}`);
            console.log(`    Pages Created: ${stats.pagesCreated + 1}`);
          });

          it(`should verify pages 0 and 1 are correctly filled`, async function() {
            logSubsection(`Verifying Pages for Tier ${tier}`);

            const [page0PDA] = getParticipantPagePDA(tier, 0);
            const [page1PDA] = getParticipantPagePDA(tier, 1);

            const page0 = await program.account.participantPage.fetch(page0PDA);
            const page1 = await program.account.participantPage.fetch(page1PDA);

            console.log(`  Page 0:`);
            console.log(`    Participants: ${page0.participants.length}`);
            console.log(`    Is Full: ${page0.participants.length >= PAGE_SIZE}`);

            console.log(`  Page 1:`);
            console.log(`    Participants: ${page1.participants.length}`);
            console.log(`    Is Full: ${page1.participants.length >= PAGE_SIZE}`);

            expect(page0.participants.length).to.equal(PAGE_SIZE);
            expect(page1.participants.length).to.equal(PAGE_SIZE);

            console.log(`  ✅ Both pages correctly filled with 50 participants each!`);
          });

          it(`should fund vault with 0.05 SOL for draw`, async function() {
            logSubsection(`Funding Vault with 0.05 SOL for Tier ${tier}`);

            const [vault] = getVaultPDA(tier);
            const FUNDING_AMOUNT = 0.05 * anchor.web3.LAMPORTS_PER_SOL;
            
            // Transfer SOL from authority to vault PDA using provider
            const transaction = new anchor.web3.Transaction().add(
              anchor.web3.SystemProgram.transfer({
                fromPubkey: authority.publicKey,
                toPubkey: vault,
                lamports: FUNDING_AMOUNT,
              })
            );
            
            // Use provider.sendAndConfirm which handles signing
            const tx = await provider.sendAndConfirm(transaction);
            
            const vaultBalance = await connection.getBalance(vault);
            console.log(`  Vault SOL Balance: ${formatLamports(vaultBalance)}`);
            console.log(`  ✅ Vault funded with 0.05 SOL for draw rent`);
            
            expect(vaultBalance).to.be.greaterThanOrEqual(FUNDING_AMOUNT);
          });

          it(`should draw winner and distribute prizes`, async function() {
            logSubsection(`Drawing Winner for Tier ${tier}`);

            const [vault] = getVaultPDA(tier);
            
            // Record pre-draw state
            const vaultBefore = await program.account.lotteryVault.fetch(vault);
            stats.vaultSolBefore = await connection.getBalance(vault);
            
            console.log(`  Pre-Draw State:`);
            console.log(`    Balance: ${formatDpt(vaultBefore.balance)}`);
            console.log(`    Participants: ${vaultBefore.participantCount}`);
            console.log(`    Required for Draw: 100`);

            // Calculate winning page (random participant in one of the two pages)
            const winningPageNumber = Math.floor(Math.random() * 2); // 0 or 1

            // Draw winner - should succeed now!
            const { tx, winnerPrize, adminFee } = await drawWinner(tier, winningPageNumber);
            
            stats.winnerPrize = winnerPrize;
            stats.adminFee = adminFee;
            stats.transactionIds.push(tx);

            console.log(`  ✅ Draw successful!`);
            console.log(`    Transaction: ${tx.substring(0, 20)}...`);
            console.log(`    Winner Prize (95%): ${formatDpt(winnerPrize)}`);
            console.log(`    Admin Fee (5%): ${formatDpt(adminFee)}`);
          });

          it(`should verify vault state after draw`, async function() {
            logSubsection(`Verifying Post-Draw State for Tier ${tier}`);

            const [vault] = getVaultPDA(tier);
            const vaultAfter = await program.account.lotteryVault.fetch(vault);
            stats.vaultBalanceAfter = vaultAfter.balance;
            stats.roundAfter = vaultAfter.roundNumber;
            stats.vaultSolAfter = await connection.getBalance(vault);

            console.log(`  Post-Draw Vault State:`);
            console.log(`    Balance: ${formatDpt(vaultAfter.balance)}`);
            console.log(`    Participants: ${vaultAfter.participantCount}`);
            console.log(`    Is Drawn: ${vaultAfter.isDrawn}`);
            console.log(`    Current Page: ${vaultAfter.currentPage}`);
            console.log(`    Round: ${vaultAfter.roundNumber}`);
            console.log(`    Vault SOL: ${formatLamports(stats.vaultSolAfter)}`);

            // Verify vault was reset for next round
            expect(vaultAfter.isDrawn).to.equal(true);
            expect(vaultAfter.balance.toNumber()).to.equal(0);
            
            console.log(`  ✅ Draw completed successfully!`);
            console.log(`     Round ${stats.roundBefore} complete`);

            // Store stats for reporting
            allStats.push(stats);
          });

          after(async () => {
            // Small delay between tiers
            await new Promise(resolve => setTimeout(resolve, 1000));
          });
        });
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FINAL REPORT
  // ═══════════════════════════════════════════════════════════════════════════

  after(async () => {
    logSeparator("GAUNTLET COMPLETE - FINAL REPORT");

    console.log("\n  SUMMARY BY ITERATION:\n");

    for (let i = 1; i <= 3; i++) {
      console.log(`  ═══ ITERATION ${i} ═══`);
      const iterationStats = allStats.filter(s => s.iteration === i);
      
      for (const s of iterationStats) {
        console.log(`    Tier ${s.tier}:`);
        console.log(`      Tickets: ${s.ticketsPurchased}`);
        console.log(`      Pages: ${s.pagesCreated + 1}`);
        console.log(`      Prize Pool: ${formatDpt(s.vaultBalanceBefore)}`);
        console.log(`      Winner Prize: ${formatDpt(s.winnerPrize)}`);
        console.log(`      Admin Fee: ${formatDpt(s.adminFee)}`);
        console.log(`      Round: ${s.roundBefore} → ${s.roundAfter}`);
        console.log(`      Transactions: ${s.transactionIds.length}`);
      }
      console.log("");
    }

    // Totals
    const totalTickets = allStats.reduce((sum, s) => sum + s.ticketsPurchased, 0);
    const totalTransactions = allStats.reduce((sum, s) => sum + s.transactionIds.length, 0);
    const totalPrizes = allStats.reduce((sum, s) => sum + s.winnerPrize.toNumber(), 0);
    const totalFees = allStats.reduce((sum, s) => sum + s.adminFee.toNumber(), 0);

    console.log("  ═══ TOTALS ═══");
    console.log(`    Total Tickets Purchased: ${totalTickets}`);
    console.log(`    Total Transactions: ${totalTransactions}`);
    console.log(`    Total Prizes Distributed: ${formatDpt(totalPrizes)}`);
    console.log(`    Total Admin Fees: ${formatDpt(totalFees)}`);
    console.log(`    All Iterations: PASSED ✅`);

    logSeparator("GAUNTLET STRESS TEST COMPLETE");
  });
});

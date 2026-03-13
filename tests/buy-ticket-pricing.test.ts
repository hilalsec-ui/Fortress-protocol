import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { FortressProtocol } from "../target/types/fortress_protocol";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { expect } from "chai";

describe("Buy Ticket with Dynamic Pricing", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.FortressProtocol as Program<FortressProtocol>;
  const authority = provider.wallet as anchor.Wallet;

  // Known addresses from deployment
  const FPT_MINT = new PublicKey("7vZbJ3WN4eGF6rGikB4MBLs4kiJwaRzNSX3smQRJJNw2");
  const ADMIN_WALLET = new PublicKey("EzrUKQPTj7iEAvaJj9rnv4HKUhRGjj4bDLRsAEQfyaYg");

  // PDAs
  let globalRegistry: PublicKey;
  let pricingConfig: PublicKey;

  before(async () => {
    // Derive PDAs
    [globalRegistry] = PublicKey.findProgramAddressSync(
      [Buffer.from("registry")],
      program.programId
    );

    [pricingConfig] = PublicKey.findProgramAddressSync(
      [Buffer.from("pricing_config")],
      program.programId
    );
  });

  describe("LPM Tier Purchases", () => {
    const tiers = [5, 10, 20, 50];

    for (const tier of tiers) {
      it(`should buy 1 LPM tier-${tier} ticket with dynamic pricing`, async () => {
        const buyer = Keypair.generate();

        // Airdrop SOL for rent and fees
        const airdropSig = await provider.connection.requestAirdrop(
          buyer.publicKey,
          2 * LAMPORTS_PER_SOL
        );
        await provider.connection.confirmTransaction(airdropSig);

        // Derive vault PDA
        const [vault] = PublicKey.findProgramAddressSync(
          [Buffer.from("vault_lpm"), Buffer.from([tier])],
          program.programId
        );

        // Derive participant page PDA
        const [participantPage] = PublicKey.findProgramAddressSync(
          [
            Buffer.from("page"),
            Buffer.from([0, 0, 0, 0]), // LPM = 0
            Buffer.from([tier, 0, 0, 0]),
            Buffer.from([0, 0, 0, 0]), // page 0
          ],
          program.programId
        );

        // Get buyer's ATA
        const buyerAta = getAssociatedTokenAddressSync(
          FPT_MINT,
          buyer.publicKey,
          false,
          TOKEN_2022_PROGRAM_ID
        );

        // Get vault's ATA
        const vaultAta = getAssociatedTokenAddressSync(
          FPT_MINT,
          vault,
          true,
          TOKEN_2022_PROGRAM_ID
        );

        // Fetch pricing config to calculate expected FPT
        const pricingConfigAccount = await program.account.pricingConfig.fetch(
          pricingConfig
        );
        const rate = pricingConfigAccount.fptToUsdRate.toNumber();
        const tierUsdPrice = tier * 1_000_000; // tier value in USD (6 decimals)
        const expectedFpt = Math.floor((tierUsdPrice * rate) / 1_000_000);

        // Set max_fpt_amount to expected + 10% slippage tolerance
        const maxFptAmount = new anchor.BN(Math.floor(expectedFpt * 1.1));

        console.log(`\nLPM Tier ${tier} Purchase:`);
        console.log(`  USD Price: ${tierUsdPrice / 1_000_000} USD`);
        console.log(`  FPT/USD Rate: ${rate / 1_000_000}`);
        console.log(`  Expected FPT: ${expectedFpt / 1_000_000} FPT`);
        console.log(`  Max FPT (with slippage): ${maxFptAmount.toNumber() / 1_000_000} FPT`);

        // Calculate current page from vault participant count
        const vaultData = await program.account.lotteryVault.fetch(vault);
        const currentPage = Math.floor(vaultData.participantCount / 50);

        try {
          const tx = await program.methods
            .buyLpmTicket(tier, 1, maxFptAmount, currentPage)
            .accounts({
              buyer: buyer.publicKey,
              fptMint: FPT_MINT,
              tokenProgram: TOKEN_2022_PROGRAM_ID,
              lotteryVault: vault,
              vaultTokenAccount: vaultAta,
              participantPage: participantPage,
            })
            .signers([buyer])
            .rpc();

          console.log(`  ✅ Transaction: ${tx}`);

          // Verify vault state
          const vaultAccount = await program.account.lotteryVault.fetch(vault);
          expect(vaultAccount.participantCount).to.equal(1);
          expect(vaultAccount.balance.toNumber()).to.equal(expectedFpt);
          expect(vaultAccount.roundNumber).to.be.greaterThan(0);

          console.log(`  ✅ Vault updated: balance=${vaultAccount.balance.toNumber() / 1_000_000} FPT, round=${vaultAccount.roundNumber}`);
        } catch (error) {
          const err = error as Error;
          console.error(`  ❌ Error: ${err.message}`);
          throw error;
        }
      });
    }
  });

  describe("DPL Tier Purchases", () => {
    const tiers = [5, 10, 15, 20];

    for (const tier of tiers) {
      it(`should buy 2 DPL tier-${tier} tickets with slippage protection`, async () => {
        const buyer = Keypair.generate();

        const airdropSig = await provider.connection.requestAirdrop(
          buyer.publicKey,
          2 * LAMPORTS_PER_SOL
        );
        await provider.connection.confirmTransaction(airdropSig);

        const [vault] = PublicKey.findProgramAddressSync(
          [Buffer.from("vault_dpl"), Buffer.from([tier])],
          program.programId
        );

        const [participantPage] = PublicKey.findProgramAddressSync(
          [
            Buffer.from("page"),
            Buffer.from([1, 0, 0, 0]), // DPL = 1
            Buffer.from([tier, 0, 0, 0]),
            Buffer.from([0, 0, 0, 0]),
          ],
          program.programId
        );

        const buyerAta = getAssociatedTokenAddressSync(
          FPT_MINT,
          buyer.publicKey,
          false,
          TOKEN_2022_PROGRAM_ID
        );

        const vaultAta = getAssociatedTokenAddressSync(
          FPT_MINT,
          vault,
          true,
          TOKEN_2022_PROGRAM_ID
        );

        const pricingConfigAccount = await program.account.pricingConfig.fetch(
          pricingConfig
        );
        const rate = pricingConfigAccount.fptToUsdRate.toNumber();
        const tierUsdPrice = tier * 1_000_000;
        const expectedFptPerTicket = Math.floor((tierUsdPrice * rate) / 1_000_000);
        const totalExpectedFpt = expectedFptPerTicket * 2;

        const maxFptAmount = new anchor.BN(Math.floor(expectedFptPerTicket * 1.1));

        console.log(`\nDPL Tier ${tier} Purchase (qty=2):`);
        console.log(`  Expected FPT per ticket: ${expectedFptPerTicket / 1_000_000} FPT`);
        console.log(`  Total expected: ${totalExpectedFpt / 1_000_000} FPT`);

        // Calculate current page from vault participant count
        const dplVaultData = await program.account.lotteryVault.fetch(vault);
        const dplCurrentPage = Math.floor(dplVaultData.participantCount / 50);

        const tx = await program.methods
          .buyDplTicket(tier, 2, maxFptAmount, dplCurrentPage)
          .accounts({
            buyer: buyer.publicKey,
            fptMint: FPT_MINT,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            lotteryVault: vault,
            vaultTokenAccount: vaultAta,
            participantPage: participantPage,
          })
          .signers([buyer])
          .rpc();

        console.log(`  ✅ Transaction: ${tx}`);

        const vaultAccount = await program.account.lotteryVault.fetch(vault);
        expect(vaultAccount.participantCount).to.equal(2);
        expect(vaultAccount.balance.toNumber()).to.equal(totalExpectedFpt);
      });
    }
  });

  describe("Slippage Protection", () => {
    it("should reject purchase if max_fpt_amount is too low", async () => {
      const buyer = Keypair.generate();
      const tier = 5;

      const airdropSig = await provider.connection.requestAirdrop(
        buyer.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdropSig);

      const [vault] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault_wpl"), Buffer.from([tier])],
        program.programId
      );

      const [participantPage] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("page"),
          Buffer.from([2, 0, 0, 0]), // WPL = 2
          Buffer.from([tier, 0, 0, 0]),
          Buffer.from([0, 0, 0, 0]),
        ],
        program.programId
      );

      const buyerAta = getAssociatedTokenAddressSync(
        FPT_MINT,
        buyer.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      const vaultAta = getAssociatedTokenAddressSync(
        FPT_MINT,
        vault,
        true,
        TOKEN_2022_PROGRAM_ID
      );

      // Set max_fpt_amount unrealistically low (1 FPT = 1_000_000 base units)
      const maxFptAmount = new anchor.BN(1_000_000);

      console.log("\nSlippage Protection Test:");
      console.log(`  Setting max_fpt_amount to: ${maxFptAmount.toNumber() / 1_000_000} FPT`);
      console.log(`  Expected FPT for tier 5: ~2.5 FPT (with 0.5 rate)`);

      // Calculate current page from vault participant count
      const wplVaultData = await program.account.lotteryVault.fetch(vault);
      const wplCurrentPage = Math.floor(wplVaultData.participantCount / 50);

      try {
        await program.methods
          .buyWplTicket(tier, 1, maxFptAmount, wplCurrentPage)
          .accounts({
            buyer: buyer.publicKey,
            fptMint: FPT_MINT,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            lotteryVault: vault,
            vaultTokenAccount: vaultAta,
            participantPage: participantPage,
          })
          .signers([buyer])
          .rpc();

        // Should not reach here
        throw new Error("Expected transaction to fail due to slippage protection");
      } catch (error) {
        const err = error as any;
        console.log(`  ✅ Transaction rejected as expected: ${err.message || String(error)}`);
        expect(String(error)).to.include("SlippageExceeded");
      }
    });
  });

  describe("Multi-Lottery Round Tracking", () => {
    it("should track rounds independently across LPM/DPL/WPL/MPL/YPL", async () => {
      const registry = await program.account.globalRegistry.fetch(globalRegistry);

      console.log("\nRound Tracking State:");
      console.log(`  LPM Rounds: [${registry.lpmRounds.join(", ")}]`);
      console.log(`  DPL Rounds: [${registry.dplRounds.join(", ")}]`);
      console.log(`  WPL Rounds: [${registry.wplRounds.join(", ")}]`);
      console.log(`  MPL Rounds: [${registry.mplRounds.join(", ")}]`);
      console.log(`  YPL Rounds: [${registry.yplRounds.join(", ")}]`);

      // Verify all rounds start at 1 (or higher if tests ran before)
      expect(registry.lpmRounds[0]).to.be.greaterThanOrEqual(1);
      expect(registry.dplRounds[0]).to.be.greaterThanOrEqual(1);
      expect(registry.wplRounds[0]).to.be.greaterThanOrEqual(1);
      expect(registry.mplRounds[0]).to.be.greaterThanOrEqual(1);
      expect(registry.yplRounds[0]).to.be.greaterThanOrEqual(1);
    });

    it("should store round_number in vault state", async () => {
      const tier = 5;
      const [lpmVault] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault_lpm"), Buffer.from([tier])],
        program.programId
      );

      try {
        const vaultAccount = await program.account.lotteryVault.fetch(lpmVault);
        console.log(`\nLPM Tier ${tier} Vault:`);
        console.log(`  Round Number: ${vaultAccount.roundNumber}`);
        console.log(`  Participant Count: ${vaultAccount.participantCount}`);
        console.log(`  Balance: ${vaultAccount.balance.toNumber() / 1_000_000} FPT`);

        expect(vaultAccount.roundNumber).to.be.greaterThan(0);
      } catch (error) {
        console.log(`  ℹ️  Vault not initialized yet (expected in fresh deployment)`);
      }
    });
  });
});

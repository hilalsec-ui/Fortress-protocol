import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { Program, BN } from "@coral-xyz/anchor";
import * as fs from "fs";
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

const PROGRAM_ID = new PublicKey("2JHDbUz11kLe7q44nneougHcJCQqD6t26XeEFFNQJpHY");
const FPT_MINT = new PublicKey("3YTnzmFTECtyKDxaghWPQcjzX7g1Cj3NxMq41JdWk2rj");

async function main() {
  console.log("═══════════════════════════════════════════════════════════════════════════");
  console.log(" ADMIN: EMERGENCY REFUND ALL LPM TIERS");
  console.log("═══════════════════════════════════════════════════════════════════════════\n");

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const idl = JSON.parse(fs.readFileSync("target/idl/fortress_protocol.json", "utf8"));
  const program = new Program(idl, provider);

  // Get registry for round tracking
  const [registryPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("global_registry")],
    PROGRAM_ID
  );

  // LPM only - all 4 tiers
  const lpmTiers = [5, 10, 20, 50];
  const lotteryType = 0; // LPM

  console.log("Refunding all LPM tiers and resetting...\n");
  console.log("═".repeat(79));

  for (const tier of lpmTiers) {
    try {
      // Derive vault PDA
      const [vaultPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault_lpm"), Buffer.from([tier])],
        PROGRAM_ID
      );

      // Get vault account
      const vault: any = await (program.account as any).lotteryVault.fetch(vaultPDA);
      
      // Get vault token account
      const vaultTokenAccount = getAssociatedTokenAddressSync(
        FPT_MINT,
        vaultPDA,
        true,
        TOKEN_2022_PROGRAM_ID
      );

      // Get admin ATA
      const adminAta = getAssociatedTokenAddressSync(
        FPT_MINT,
        provider.wallet.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      const currentParticipants = vault.participantCount;
      const currentBalance = vault.balance.toNumber();

      console.log(`\nLPM Tier ${tier}:`);
      console.log(`  Vault PDA: ${vaultPDA.toString().slice(0, 20)}...`);
      console.log(`  Current State: ${currentParticipants} participants, ${currentBalance / 1_000_000} FPT`);

      if (currentBalance > 0) {
        console.log(`  ⚠️  Refunding ${currentBalance / 1_000_000} FPT to admin...`);
        
        const tx = await (program.methods as any)
          .adminEmergencyRefund(lotteryType, tier)
          .accounts({
            admin: provider.wallet.publicKey,
            fptMint: FPT_MINT,
            lotteryVault: vaultPDA,
            vaultTokenAccount: vaultTokenAccount,
            adminAta: adminAta,
            registry: registryPDA,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();

        console.log(`  ✅ Refunded! TX: ${tx.slice(0, 20)}...`);
        
        // Verify
        const vaultAfter: any = await (program.account as any).lotteryVault.fetch(vaultPDA);
        console.log(`  ✅ Reset complete: ${vaultAfter.participantCount} participants, ${vaultAfter.balance.toNumber() / 1_000_000} FPT, Round ${vaultAfter.roundNumber}`);
      } else {
        console.log(`  ℹ️  Already empty (${currentParticipants} participants recorded)`);
        
        // Still reset participant count even if balance is 0
        if (currentParticipants > 0) {
          console.log(`  ⚠️  Resetting participant count...`);
          
          const tx = await (program.methods as any)
            .adminEmergencyRefund(lotteryType, tier)
            .accounts({
              admin: provider.wallet.publicKey,
              fptMint: FPT_MINT,
              lotteryVault: vaultPDA,
              vaultTokenAccount: vaultTokenAccount,
              adminAta: adminAta,
              registry: registryPDA,
              tokenProgram: TOKEN_2022_PROGRAM_ID,
              associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
              systemProgram: anchor.web3.SystemProgram.programId,
            })
            .rpc();

          console.log(`  ✅ Reset! TX: ${tx.slice(0, 20)}...`);
          
          // Verify
          const vaultAfter: any = await (program.account as any).lotteryVault.fetch(vaultPDA);
          console.log(`  ✅ Reset complete: ${vaultAfter.participantCount} participants, Round ${vaultAfter.roundNumber}`);
        }
      }
    } catch (error: any) {
      console.log(`\nLPM Tier ${tier}:`);
      console.log(`  ❌ Error: ${error.message}`);
    }
  }

  console.log("\n" + "═".repeat(79));
  console.log("\n✅ ALL LPM TIERS REFUNDED AND RESET\n");
}

main().catch(console.error);

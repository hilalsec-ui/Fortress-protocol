#!/usr/bin/env npx ts-node
/**
 * Force reset stuck LPM vault using admin_reset_lpm_vault
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { FortressProtocol } from "../target/types/fortress_protocol";
import { PublicKey } from "@solana/web3.js";

async function main() {
  const tier = parseInt(process.argv[2]) || 5;

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log(`   ADMIN RESET LPM TIER $${tier}`);
  console.log("═══════════════════════════════════════════════════════════\n");

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.FortressProtocol as Program<FortressProtocol>;

  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_lpm"), Buffer.from([tier])],
    program.programId
  );

  // Check before state
  const vaultBefore = await program.account.lotteryVault.fetch(vault);
  console.log("Before Reset:");
  console.log(`  Participant Count: ${vaultBefore.participantCount}`);
  console.log(`  Balance: ${vaultBefore.balance.toNumber() / 1_000_000} FPT`);
  console.log(`  Is Drawn: ${vaultBefore.isDrawn}`);
  console.log(`  Round: ${vaultBefore.roundNumber}`);
  console.log(`  Current Page: ${vaultBefore.currentPage}\n`);

  // Execute admin reset
  console.log("Executing admin_reset_lpm_vault...");
  try {
    const tx = await program.methods
      .adminResetLpmVault(tier)
      .accounts({
        admin: provider.wallet.publicKey,
        lotteryVault: vault,
      })
      .rpc();

    console.log(`✅ Reset successful! TX: ${tx}\n`);

    // Check after state
    const vaultAfter = await program.account.lotteryVault.fetch(vault);
    console.log("After Reset:");
    console.log(`  Participant Count: ${vaultBefore.participantCount} → ${vaultAfter.participantCount}`);
    console.log(`  Balance: ${vaultBefore.balance.toNumber() / 1_000_000} → ${vaultAfter.balance.toNumber() / 1_000_000} FPT`);
    console.log(`  Is Drawn: ${vaultBefore.isDrawn} → ${vaultAfter.isDrawn}`);
    console.log(`  Round: ${vaultBefore.roundNumber} → ${vaultAfter.roundNumber}`);
    console.log(`  Current Page: ${vaultBefore.currentPage} → ${vaultAfter.currentPage}\n`);

    if (vaultAfter.participantCount === 0 && vaultAfter.balance.toNumber() === 0 && vaultAfter.isDrawn === false) {
      console.log("✅ LPM vault successfully reset and ready for new round!\n");
    } else {
      console.log("⚠️  Vault partially reset - may need additional action\n");
    }

  } catch (error: any) {
    console.error(`❌ Reset failed: ${error.message}`);
    if (error.logs) {
      console.error("\nProgram logs:");
      error.logs.forEach((log: string) => console.error(`  ${log}`));
    }
    console.log();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

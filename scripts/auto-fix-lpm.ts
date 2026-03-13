#!/usr/bin/env npx ts-node
/**
 * Auto-fix stuck LPM vaults - check and reset if needed
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { FortressProtocol } from "../target/types/fortress_protocol";
import { PublicKey } from "@solana/web3.js";

async function main() {
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("   AUTO-FIX STUCK LPM VAULTS");
  console.log("═══════════════════════════════════════════════════════════\n");

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.FortressProtocol as Program<FortressProtocol>;

  const tiers = [5, 10, 20, 50];
  let fixedCount = 0;

  for (const tier of tiers) {
    const [vault] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_lpm"), Buffer.from([tier])],
      program.programId
    );

    try {
      const vaultData = await program.account.lotteryVault.fetch(vault);
      
      const isStuck = (vaultData.participantCount === 100 && vaultData.isDrawn) || 
                      (vaultData.participantCount > 0 && vaultData.isDrawn);

      console.log(`LPM Tier $${tier}:`);
      console.log(`  Participants: ${vaultData.participantCount}`);
      console.log(`  Is Drawn: ${vaultData.isDrawn}`);
      console.log(`  Round: ${vaultData.roundNumber}`);

      if (isStuck) {
        console.log(`  ⚠️  STUCK - Resetting...`);
        
        try {
          const tx = await program.methods
            .adminResetLpmVault(tier)
            .accounts({
              admin: provider.wallet.publicKey,
              lotteryVault: vault,
            })
            .rpc();

          console.log(`  ✅ Reset successful: ${tx.slice(0, 8)}...`);
          fixedCount++;
          
          const updated = await program.account.lotteryVault.fetch(vault);
          console.log(`  ✅ Now: ${updated.participantCount} participants, is_drawn=${updated.isDrawn}`);
        } catch (error: any) {
          console.error(`  ❌ Reset failed: ${error.message}`);
        }
      } else {
        console.log(`  ✅ OK`);
      }
      console.log();

    } catch (error: any) {
      if (!error.message?.includes("Account does not exist")) {
        console.error(`LPM Tier $${tier}: Error - ${error.message}\n`);
      }
    }
  }

  console.log("═══════════════════════════════════════════════════════════");
  console.log(`Fixed ${fixedCount} stuck vault(s)`);
  console.log("═══════════════════════════════════════════════════════════\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

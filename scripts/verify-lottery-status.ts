#!/usr/bin/env npx ts-node
/**
 * Verify all time-based lotteries are clean and ready for new rounds
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { FortressProtocol } from "../target/types/fortress_protocol";
import { PublicKey } from "@solana/web3.js";

const LOTTERIES = [
  { type: "DPL", typeNum: 1, tiers: [5, 10, 15, 20] },
  { type: "WPL", typeNum: 2, tiers: [5, 10, 15, 20] },
  { type: "MPL", typeNum: 3, tiers: [5, 10, 15, 20] },
  { type: "YPL", typeNum: 4, tiers: [5, 10, 15, 20] },
];

async function main() {
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("   VERIFICATION: TIME-BASED LOTTERY STATUS");
  console.log("═══════════════════════════════════════════════════════════\n");

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.FortressProtocol as Program<FortressProtocol>;

  const currentTime = Math.floor(Date.now() / 1000);
  let allClean = true;

  for (const lottery of LOTTERIES) {
    console.log(`\n${lottery.type} Lotteries:`);
    console.log("─".repeat(60));

    for (const tier of lottery.tiers) {
      const vaultPrefix = `vault_${lottery.type.toLowerCase()}`;
      const [vault] = PublicKey.findProgramAddressSync(
        [Buffer.from(vaultPrefix), Buffer.from([tier])],
        program.programId
      );

      try {
        const vaultData = await program.account.lotteryVault.fetch(vault);
        
        const participantCount = vaultData.participantCount;
        const balance = vaultData.balance.toNumber();
        const endTime = vaultData.endTime;
        const isDrawn = vaultData.isDrawn;
        const roundNumber = vaultData.roundNumber;
        const isExpired = currentTime >= endTime;
        const timeRemaining = Math.max(0, endTime - currentTime);
        const hoursRemaining = Math.floor(timeRemaining / 3600);

        const status = participantCount === 0 && balance === 0 ? "✅ CLEAN" : "⚠️  HAS DATA";
        const expiredStatus = isExpired ? "⏰ EXPIRED" : `⏳ ${hoursRemaining}h left`;

        console.log(`  Tier $${tier.toString().padStart(2)}: ${status.padEnd(12)} | Round ${roundNumber} | ${expiredStatus.padEnd(15)} | ${participantCount} participants | ${(balance / 1_000_000).toFixed(1)} FPT`);

        if (participantCount > 0 || balance > 0) {
          allClean = false;
        }

      } catch (error: any) {
        if (error.message?.includes("Account does not exist")) {
          console.log(`  Tier $${tier.toString().padStart(2)}: ⚪ Not initialized`);
        } else {
          console.error(`  Tier $${tier.toString().padStart(2)}: ❌ Error - ${error.message}`);
          allClean = false;
        }
      }
    }
  }

  console.log("\n═══════════════════════════════════════════════════════════");
  if (allClean) {
    console.log("✅ ALL TIME-BASED LOTTERIES ARE CLEAN AND READY!");
    console.log("   - No corrupted participant data");
    console.log("   - All balances refunded");
    console.log("   - Ready for new rounds");
  } else {
    console.log("⚠️  SOME VAULTS STILL HAVE DATA - May need additional reset");
  }
  console.log("═══════════════════════════════════════════════════════════\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

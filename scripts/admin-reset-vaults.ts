#!/usr/bin/env npx ts-node
/**
 * Admin: Reset all corrupted time-based lottery vaults
 * These vaults have participant_count > 0 but no actual participant pages
 * Solution: Close participant pages and then manually reset vaults via emergency refund
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { FortressProtocol } from "../target/types/fortress_protocol";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";

const FPT_MINT = new PublicKey("3YTnzmFTECtyKDxaghWPQcjzX7g1Cj3NxMq41JdWk2rj");

interface LotteryInfo {
  type: string;
  typeNum: number;
  tiers: number[];
}

const LOTTERIES: LotteryInfo[] = [
  { type: "DPL", typeNum: 1, tiers: [5, 10, 15, 20] },
  { type: "WPL", typeNum: 2, tiers: [5, 10, 15, 20] },
  { type: "MPL", typeNum: 3, tiers: [5, 10, 15, 20] },
  { type: "YPL", typeNum: 4, tiers: [5, 10, 15, 20] },
];

async function main() {
  const tier = parseInt(process.argv[2]) || 0;
  const lotteryTypeArg = process.argv[3]?.toUpperCase();
  
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("   ADMIN: RESET CORRUPTED VAULTS VIA EMERGENCY REFUND");
  console.log("═══════════════════════════════════════════════════════════\n");

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.FortressProtocol as Program<FortressProtocol>;

  const [globalRegistry] = PublicKey.findProgramAddressSync(
    [Buffer.from("global_registry")],
    program.programId
  );

  let resetCount = 0;

  const lotteriesToProcess = lotteryTypeArg 
    ? LOTTERIES.filter(l => l.type === lotteryTypeArg)
    : LOTTERIES;

  if (lotteryTypeArg && lotteriesToProcess.length === 0) {
    console.log(`❌ Invalid lottery type: ${lotteryTypeArg}`);
    console.log(`Valid types: DPL, WPL, MPL, YPL\n`);
    return;
  }

  for (const lottery of lotteriesToProcess) {
    const tiersToProcess = tier > 0 ? [tier] : lottery.tiers;

    for (const tierValue of tiersToProcess) {
      const vaultPrefix = `vault_${lottery.type.toLowerCase()}`;
      const [vault] = PublicKey.findProgramAddressSync(
        [Buffer.from(vaultPrefix), Buffer.from([tierValue])],
        program.programId
      );

      try {
        const vaultData = await program.account.lotteryVault.fetch(vault);
        const participantCount = vaultData.participantCount;
        const balance = vaultData.balance.toNumber();
        const isDrawn = vaultData.isDrawn;

        console.log(`\n${lottery.type} Tier $${tierValue}:`);
        console.log(`  Vault: ${vault.toString()}`);
        console.log(`  Participants: ${participantCount}`);
        console.log(`  Balance: ${balance / 1_000_000} FPT`);
        console.log(`  Is Drawn: ${isDrawn}`);

        // Reset if has participants or balance
        if (participantCount > 0 || balance > 0) {
          console.log(`  ⚠️  Corrupted state - performing emergency refund...`);
          
          const vaultAta = getAssociatedTokenAddressSync(
            FPT_MINT,
            vault,
            true,
            TOKEN_2022_PROGRAM_ID
          );

          try {
            // Use emergency refund to reset vault - Anchor auto-derives accounts
            const tx = await program.methods
              .adminEmergencyRefund(lottery.typeNum, tierValue)
              .rpc();

            console.log(`  ✅ Emergency refund successful! TX: ${tx.slice(0, 8)}...`);
            resetCount++;

            // Verify reset
            const updatedVault = await program.account.lotteryVault.fetch(vault);
            console.log(`  ✅ Vault reset: participants=${updatedVault.participantCount}, balance=${updatedVault.balance.toNumber() / 1_000_000} FPT`);

          } catch (error: any) {
            console.error(`  ❌ Reset failed: ${error.message}`);
            if (error.logs) {
              console.error("  Program logs:");
              error.logs.slice(-5).forEach((log: string) => console.error(`    ${log}`));
            }
          }
        } else {
          console.log(`  ✅ Already clean`);
        }

      } catch (error: any) {
        if (error.message?.includes("Account does not exist")) {
          console.log(`\n${lottery.type} Tier $${tierValue}: Not initialized`);
        } else {
          console.error(`\n${lottery.type} Tier $${tierValue}: Error - ${error.message}`);
        }
      }
    }
  }

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log(`✅ Reset ${resetCount} vault(s)`);
  console.log("═══════════════════════════════════════════════════════════\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

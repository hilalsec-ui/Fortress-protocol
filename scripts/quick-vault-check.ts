/**
 * Quick check LPM vault states
 */
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { FortressProtocol } from "../target/types/fortress_protocol";
import { PublicKey } from "@solana/web3.js";

const TIERS = [5, 10, 20, 50];

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.FortressProtocol as Program<FortressProtocol>;

  for (const tier of TIERS) {
    const [vault] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_lpm"), Buffer.from([tier])],
      program.programId,
    );

    try {
      const data = await program.account.lotteryVault.fetch(vault);
      console.log(`LPM Tier ${tier}: participants=${data.participantCount}, isDrawn=${data.isDrawn}, balance=${data.balance.toString()}, round=${data.roundNumber}`);
    } catch (e: any) {
      console.log(`LPM Tier ${tier}: NOT FOUND or error: ${e.message?.slice(0, 80)}`);
    }
  }

  // Also check DPL tiers
  const DPL_TIERS = [1, 5, 10, 25];
  for (const tier of DPL_TIERS) {
    const [vault] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_dpl"), Buffer.from([tier])],
      program.programId,
    );
    try {
      const data = await program.account.lotteryVault.fetch(vault);
      console.log(`DPL Tier ${tier}: participants=${data.participantCount}, isDrawn=${data.isDrawn}, balance=${data.balance.toString()}, round=${data.roundNumber}, endTime=${data.endTime.toString()}`);
    } catch (e: any) {
      console.log(`DPL Tier ${tier}: NOT FOUND or error: ${e.message?.slice(0, 80)}`);
    }
  }
}

main().catch(console.error);

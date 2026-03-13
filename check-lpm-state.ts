import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { FortressProtocol } from "./target/types/fortress_protocol";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  
  const programId = new PublicKey("BLNY4gLMg4MnPhBGin5p1vxhtY47nYPMw4XGJf63QMHW");
  const program = new anchor.Program<FortressProtocol>(
    require("./target/idl/fortress_protocol.json"),
    programId,
    provider
  );

  const tiers = [5, 10, 20, 50];
  
  for (const tier of tiers) {
    const vault = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_lpm"), Buffer.from([tier])],
      programId
    )[0];
    
    try {
      const state = await (program.account as any).lotteryVault.fetch(vault);
      const count = state.participantCount?.toNumber?.() || state.participant_count || 0;
      const isDrawn = state.isDrawn ?? state.is_drawn ?? false;
      console.log(`[LPM-T${tier}] Participants: ${count}/100 | Drawn: ${isDrawn}`);
    } catch (e) {
      console.log(`[LPM-T${tier}] Error: ${(e as any).message}`);
    }
  }
}

main().catch(console.error);

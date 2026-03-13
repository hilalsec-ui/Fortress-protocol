import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { FortressProtocol } from "./target/types/fortress_protocol";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  
  const program = new Program<FortressProtocol>(
    require("./target/idl/fortress_protocol.json"),
    new PublicKey("BLNY4gLMg4MnPhBGin5p1vxhtY47nYPMw4XGJf63QMHW"),
    provider
  );

  const vault = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_lpm"), Buffer.from([5])],
    program.programId
  )[0];

  try {
    const state = await (program.account as any).lotteryVault.fetch(vault);
    const count = state.participantCount?.toNumber?.() || state.participant_count || 0;
    const isDrawn = state.isDrawn ?? state.is_drawn ?? false;
    const round = state.roundNumber?.toNumber?.() || state.round_number || 0;
    
    console.log(`\n📊 BLOCKCHAIN STATE FOR LPM-T5:`);
    console.log(`   Participants: ${count}/100`);
    console.log(`   Round: ${round}`);
    console.log(`   Draw in progress: ${isDrawn}`);
    
    if (count >= 100) {
      console.log(`\n✅ READY TO DRAW! Bot should trigger within 5 seconds...`);
    } else {
      console.log(`\n⏳ Waiting... (${count}/100)`);
    }
  } catch (e) {
    console.error(`❌ Error reading vault:`, (e as any).message);
  }
  
  process.exit(0);
}

main();

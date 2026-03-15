import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { FortressProtocol } from "../target/types/fortress_protocol";

async function checkRegistry() {
  const fs = require('fs');
  const walletPath = '/home/dev/my-wallet.json';
  const walletKeypair = anchor.web3.Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(walletPath, 'utf-8')))
  );
  
  const connection = new anchor.web3.Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  const wallet = new anchor.Wallet(walletKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  anchor.setProvider(provider);

  const program = anchor.workspace.FortressProtocol as Program<FortressProtocol>;
  
  const [globalRegistryPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("global_registry")],
    program.programId
  );
  
  console.log("GlobalRegistry PDA:", globalRegistryPDA.toString());
  console.log("");
  
  try {
    const accountInfo = await connection.getAccountInfo(globalRegistryPDA);
    if (accountInfo) {
      console.log("✅ Account exists");
      console.log("Owner:", accountInfo.owner.toString());
      console.log("Data length:", accountInfo.data.length);
      console.log("Lamports:", accountInfo.lamports);
      console.log("First 20 bytes:", accountInfo.data.slice(0, 20));
      console.log("");
      
      // Try to decode
      try {
        const registry = await program.account.globalRegistry.fetch(globalRegistryPDA);
        console.log("✅ Successfully decoded!");
        console.log("Authority:", registry.authority.toString());
        console.log("Total participants:", registry.totalParticipants?.toString() || "N/A");
        console.log("Total lotteries:", registry.totalLotteries);
      } catch (e: any) {
        console.log("❌ Failed to decode:", e.message);
      }
    } else {
      console.log("❌ Account does not exist");
    }
  } catch (e: any) {
    console.error("Error:", e.message);
  }
}

checkRegistry();

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { FortressProtocol } from "../target/types/fortress_protocol";

async function initializeGlobalRegistry() {
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
    [Buffer.from("registry")],
    program.programId
  );
  
  console.log("🔧 Initializing Global Registry...");
  console.log("Program ID:", program.programId.toString());
  console.log("Authority:", provider.wallet.publicKey.toString());
  console.log("Global Registry PDA:", globalRegistryPDA.toString());
  console.log("");
  
  try {
    const tx = await program.methods.initializeGlobalRegistry()
      .rpc();
    
    console.log("✅ Global Registry initialized!");
    console.log("Transaction:", tx);
    
    // Verify
    const registry = await program.account.globalRegistry.fetch(globalRegistryPDA);
    console.log("");
    console.log("Registry data:");
    console.log("- Authority:", registry.authority.toString());
    console.log("- Total participants:", registry.totalParticipants.toString());
    console.log("- Total lotteries:", registry.totalLotteries);
    
  } catch (error: any) {
    console.error("❌ Failed to initialize:");
    console.error(error.message || error);
    if (error.logs) {
      console.error("\nProgram logs:");
      error.logs.forEach((log: string) => console.error(log));
    }
    process.exit(1);
  }
}

initializeGlobalRegistry();

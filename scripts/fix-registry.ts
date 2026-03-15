import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";

async function closeAndReinitializeRegistry() {
  const fs = require('fs');
  const walletPath = '/home/dev/my-wallet.json';
  const walletKeypair = anchor.web3.Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(walletPath, 'utf-8')))
  );
  
  const connection = new anchor.web3.Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  const wallet = new anchor.Wallet(walletKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  anchor.setProvider(provider);

  const program = anchor.workspace.FortressProtocol;
  const programId = new PublicKey("EB6kkg2sW5rnukjRH7Ljhz78gbfc36XZAuiFn5jdefF3");
  
  const [globalRegistryPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("registry")],
    programId
  );
  
  console.log("🔧 Closing old registry and creating new one...");
  console.log("Registry PDA:", globalRegistryPDA.toString());
  
  // Step 1: Get the lamports from the old account
  const accountInfo = await connection.getAccountInfo(globalRegistryPDA);
  if (!accountInfo) {
    console.log("❌ Registry doesn't exist");
    return;
  }
  
  console.log("Old registry balance:", accountInfo.lamports / 1e9, "SOL");
  console.log("Old registry size:", accountInfo.data.length, "bytes");
  
  // Since PDAs can't be closed easily and the account is owned by the program,
  // we need the program to have a "reallocate" or "migrate" instruction.
  // For now, let's just try to initialize with the correct size using a new seed.
  
  console.log("\n⚠️  The old registry cannot be easily closed because it's a PDA owned by the program.");
  console.log("We'll try to initialize with the 'global_registry' seed instead.");
  
  const [newRegistryPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("global_registry")],
    programId
  );
  
  console.log("\nNew Registry PDA:", newRegistryPDA.toString());
  
  try {
    const tx = await program.methods.initializeGlobalRegistry()
      .accounts({
        authority: provider.wallet.publicKey,
        registry: newRegistryPDA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    
    console.log("✅ New registry initialized!");
    console.log("Transaction:", tx);
  } catch (error: any) {
    console.error("❌ Failed:", error.message);
    if (error.logs) {
      error.logs.forEach((log: string) => console.error(log));
    }
  }
}

closeAndReinitializeRegistry();

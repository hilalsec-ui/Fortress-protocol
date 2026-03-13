import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

async function disableOracle() {
  const fs = require('fs');
  const walletPath = '/home/dev/my-wallet.json';
  const walletKeypair = anchor.web3.Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(walletPath, 'utf-8')))
  );
  
  const connection = new anchor.web3.Connection('https://api.devnet.solana.com', 'confirmed');
  const wallet = new anchor.Wallet(walletKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  anchor.setProvider(provider);

  const program = anchor.workspace.FortressProtocol;
  
  console.log("Disabling oracle mode...");
  
  try {
    const tx = await program.methods.toggleOracle(false)
      .rpc();
    
    console.log("✅ Oracle disabled!");
    console.log("Transaction:", tx);
    
    // Verify
    const [pricingConfigPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("pricing_config")],
      program.programId
    );
    const config = await program.account.pricingConfig.fetch(pricingConfigPDA);
    console.log("\nUpdated config:");
    console.log("- Use oracle:", config.useOracle);
    console.log("- FPT to USD rate:", config.fptToUsdRate?.toString());
  } catch (e: any) {
    console.error("❌ Error:", e.message);
    if (e.logs) {
      e.logs.forEach((log: string) => console.error(log));
    }
  }
}

disableOracle();

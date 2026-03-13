import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

async function updatePricingConfig() {
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
  const [pricingConfigPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("pricing_config")],
    program.programId
  );
  
  console.log("Updating Pricing Config...");
  console.log("PDA:", pricingConfigPDA.toString());
  
  try {
    // Set manual rate to 0.5 FPT per USD (500000 with 6 decimals)
    const newRate = new anchor.BN(500000);
    
    const tx = await program.methods.updateRate(newRate)
      .rpc();
    
    console.log("✅ Pricing rate updated!");
    console.log("Transaction:", tx);
    
    // Verify
    const config = await program.account.pricingConfig.fetch(pricingConfigPDA);
    console.log("\nUpdated config:");
    console.log("- Manual rate:", config.manualRate?.toString());
    console.log("- Use oracle:", config.useOracle);
  } catch (e: any) {
    console.error("❌ Error:", e.message);
    if (e.logs) {
      e.logs.forEach((log: string) => console.error(log));
    }
  }
}

updatePricingConfig();

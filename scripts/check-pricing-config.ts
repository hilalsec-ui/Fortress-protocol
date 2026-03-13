import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

async function checkPricingConfig() {
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
  
  console.log("Pricing Config PDA:", pricingConfigPDA.toString());
  
  try {
    const config = await program.account.pricingConfig.fetch(pricingConfigPDA);
    console.log("\nPricing Config:");
    console.log("- Authority:", config.authority.toString());
    console.log("- Manual rate:", config.manualRate?.toString() || "None");
    console.log("- Use oracle:", config.useOracle);
    console.log("- Oracle enabled:", config.oracleEnabled);
    console.log("- Dex oracle:", config.dexOracle?.toString() || "None");
  } catch (e: any) {
    console.error("❌ Error:", e.message);
  }
}

checkPricingConfig();

import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { Program, BN } from "@coral-xyz/anchor";
import * as fs from "fs";

const PROGRAM_ID = new PublicKey("EB6kkg2sW5rnukjRH7Ljhz78gbfc36XZAuiFn5jdefF3");

async function main() {
  console.log("═══════════════════════════════════════════════════════════════════════════");
  console.log(" FIX PRICING CONFIG");
  console.log("═══════════════════════════════════════════════════════════════════════════\n");

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const idl = JSON.parse(fs.readFileSync("target/idl/fortress_protocol.json", "utf8"));
  const program = new Program(idl, provider);

  // Get PricingConfig PDA
  const [pricingConfigPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("pricing_config")],
    PROGRAM_ID
  );

  console.log(`Pricing Config PDA: ${pricingConfigPDA.toString()}`);

  // Check current state
  const configBefore = await (program.account as any).pricingConfig.fetch(pricingConfigPDA);
  console.log(`\nCurrent State:`);
  console.log(`  fpt_to_usd_rate: ${configBefore.fptToUsdRate.toString()}`);
  console.log(`  Rate in decimal: ${configBefore.fptToUsdRate.toNumber() / 1_000_000} FPT per USD`);
  console.log(`  use_oracle: ${configBefore.useOracle}`);

  // Correct rate: 0.5 FPT per 1 USD = 500,000 (with 6 decimals)
  const correctRate = new BN(500_000);
  console.log(`\nCorrect Rate: 500,000 (0.5 FPT per USD)`);
  
  // Calculate what each tier should cost with correct rate
  console.log(`\nWith correct rate, ticket prices will be:`);
  const tiers = [5, 10, 15, 20, 50];
  tiers.forEach(tier => {
    const tierUsdPrice = tier * 1_000_000;
    const requiredFpt = Math.floor((tierUsdPrice * 500_000) / 1_000_000);
    console.log(`  Tier $${tier}: ${requiredFpt} base units (${requiredFpt / 1_000_000} FPT)`);
  });

  // Update the rate
  console.log(`\nUpdating pricing config...`);
  const tx = await (program.methods as any)
    .updateRate(correctRate)
    .accounts({
      admin: provider.wallet.publicKey,
      pricingConfig: pricingConfigPDA,
    })
    .rpc();

  console.log(`\n✅ Update TX: ${tx}`);

  // Verify
  const configAfter = await (program.account as any).pricingConfig.fetch(pricingConfigPDA);
  console.log(`\nUpdated State:`);
  console.log(`  fpt_to_usd_rate: ${configAfter.fptToUsdRate.toString()}`);
  console.log(`  Rate in decimal: ${configAfter.fptToUsdRate.toNumber() / 1_000_000} FPT per USD`);

  console.log("\n═══════════════════════════════════════════════════════════════════════════");
  console.log(" FIX COMPLETE");
  console.log("═══════════════════════════════════════════════════════════════════════════\n");
  console.log("✅ Pricing config is now correct!");
  console.log("✅ All future ticket purchases will use the correct rate");
  console.log("⚠️  You may need to run admin-sync-vault.ts to recalculate participant counts");
}

main().catch(console.error);

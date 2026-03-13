import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { FortressProtocol } from "../target/types/fortress_protocol";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL, Keypair } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.FortressProtocol as Program<FortressProtocol>;
  const adminWallet = provider.wallet.publicKey;

  console.log("\n🚀 Fresh Deployment Initialization");
  console.log("=====================================");
  console.log("Program ID:", program.programId.toBase58());
  console.log("Admin Wallet:", adminWallet.toBase58());

  // FPT Token
  const fptMint = new PublicKey("7vZbJ3WN4eGF6rGikB4MBLs4kiJwaRzNSX3smQRJJNw2");
  console.log("FPT Token:", fptMint.toBase58());

  // Step 1: Initialize Pricing Config
  console.log("\n📊 Step 1: Initialize Pricing Config");
  console.log("Converting 0.5 FPT/USD = 500,000 (with 6 decimals)");
  
  const [pricingConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("pricing_config")],
    program.programId
  );
  
  try {
    const pricingAccount = await program.account.pricingConfig.fetch(pricingConfigPda);
    console.log("✅ Pricing Config already initialized at:", pricingConfigPda.toBase58());
    console.log("   FPT to USD Rate:", pricingAccount.fptToUsdRate.toString());
  } catch (e) {
    console.log("Initializing Pricing Config...");
    const tx = await program.methods
      .initializePricingConfig(new BN(500_000)) // 0.5 FPT per USD (6 decimals)
      .rpc();
    console.log("✅ Pricing Config initialized:", tx);
    console.log("   PDA:", pricingConfigPda.toBase58());
  }

  // Step 2: Initialize Treasury
  console.log("\n💰 Step 2: Initialize Treasury & Treasury Vault");
  
  const [treasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    program.programId
  );
  
  const [treasuryVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury_vault")],
    program.programId
  );
  
  try {
    const treasuryAccount = await program.account.treasury.fetch(treasuryPda);
    console.log("✅ Treasury already initialized at:", treasuryPda.toBase58());
    console.log("   Authority:", treasuryAccount.authority.toBase58());
  } catch (e) {
    console.log("Initializing Treasury...");
    const tx = await program.methods
      .initializeTreasury()
      .rpc();
    console.log("✅ Treasury initialized:", tx);
    console.log("   Treasury PDA:", treasuryPda.toBase58());
  }

  // Step 3: Initialize & Fund Treasury Vault
  console.log("\n💸 Step 3: Initialize & Fund Treasury Vault");
  
  const vaultBalance = await provider.connection.getBalance(treasuryVaultPda);
  console.log("Current Treasury Vault balance:", vaultBalance / LAMPORTS_PER_SOL, "SOL");
  
  if (vaultBalance === 0) {
    console.log("Initializing Treasury Vault with 0.5 SOL (minimal for 16 vaults)...");
    const fundAmount = 0.5 * LAMPORTS_PER_SOL;
    const tx = await program.methods
      .initializeTreasuryVault(new BN(fundAmount))
      .rpc();
    console.log("✅ Treasury Vault initialized:", tx);
    const newBalance = await provider.connection.getBalance(treasuryVaultPda);
    console.log("   New balance:", newBalance / LAMPORTS_PER_SOL, "SOL");
  } else if (vaultBalance < 0.3 * LAMPORTS_PER_SOL) {
    console.log("Treasury Vault balance low, topping up...");
    const topUpAmount = 0.3 * LAMPORTS_PER_SOL;
    const tx = await program.methods
      .topUpTreasuryVault(new BN(topUpAmount))
      .rpc();
    console.log("✅ Treasury Vault topped up:", tx);
    const newBalance = await provider.connection.getBalance(treasuryVaultPda);
    console.log("   New balance:", newBalance / LAMPORTS_PER_SOL, "SOL");
  } else {
    console.log("✅ Treasury Vault has sufficient balance");
  }

  // Step 4: Initialize all 16 vaults (4 lottery types x 4 tiers)
  console.log("\n🎰 Step 4: Initialize All Vaults");
  console.log("=====================================");
  
  const lotteryTypes = [
    { name: "LPM", variant: { lpm: {} } },
    { name: "DPL", variant: { dpl: {} } },
    { name: "WPL", variant: { wpl: {} } },
    { name: "MPL", variant: { mpl: {} } }
  ];
  
  const tiers = [
    { name: "Bronze", index: 0 },
    { name: "Silver", index: 1 },
    { name: "Gold", index: 2 },
    { name: "Diamond", index: 3 }
  ];

  let initialized = 0;
  let skipped = 0;

  for (const lottery of lotteryTypes) {
    for (const tier of tiers) {
      const vaultName = `${lottery.name} ${tier.name}`;
      
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("vault"),
          Buffer.from(lottery.name.toLowerCase()),
          Buffer.from([tier.index])
        ],
        program.programId
      );
      
      try {
        const vaultAccount = await provider.connection.getAccountInfo(vaultPda);
        if (vaultAccount && vaultAccount.data.length > 0) {
          console.log(`✅ ${vaultName} already initialized`);
          skipped++;
        } else {
          throw new Error("Vault not found");
        }
      } catch (e) {
        try {
          console.log(`Initializing ${vaultName}...`);
          
          let tx;
          if (lottery.name === "LPM") {
            tx = await program.methods
              .initializeLpmTier(tier.index)
              .rpc();
          } else if (lottery.name === "DPL") {
            tx = await program.methods
              .initializeDplTier(tier.index)
              .rpc();
          } else if (lottery.name === "WPL") {
            tx = await program.methods
              .initializeWplTier(tier.index)
              .rpc();
          } else if (lottery.name === "MPL") {
            tx = await program.methods
              .initializeMplTier(tier.index)
              .rpc();
          }
          
          console.log(`   ✅ ${vaultName} initialized`);
          console.log(`   PDA: ${vaultPda.toBase58()}`);
          console.log(`   Tx: ${tx}`);
          initialized++;
          
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error: any) {
          console.error(`   ❌ Failed to initialize ${vaultName}:`, error.message);
        }
      }
    }
  }

  // Summary
  console.log("\n📋 Initialization Summary");
  console.log("=====================================");
  console.log("✅ Pricing Config: Ready");
  console.log("✅ Treasury: Ready");
  console.log("✅ Treasury Vault: Funded");
  console.log(`✅ Vaults Initialized: ${initialized}`);
  console.log(`⏭️  Vaults Skipped: ${skipped}`);
  console.log(`📊 Total Vaults: ${initialized + skipped}/16`);
  
  if (initialized + skipped === 16) {
    console.log("\n🎉 ALL SYSTEMS READY! You can now buy tickets!");
  } else {
    console.log("\n⚠️  Some vaults failed to initialize. Check errors above.");
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);

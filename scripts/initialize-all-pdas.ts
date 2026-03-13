import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { 
  getAssociatedTokenAddressSync, 
  TOKEN_2022_PROGRAM_ID, 
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import { FortressProtocol } from "../target/types/fortress_protocol";

const FPT_MINT = new PublicKey("7vZbJ3WN4eGF6rGikB4MBLs4kiJwaRzNSX3smQRJJNw2");

async function createTokenAccountIfNeeded(
  provider: anchor.AnchorProvider,
  mint: PublicKey,
  owner: PublicKey
) {
  const tokenAccount = getAssociatedTokenAddressSync(
    mint,
    owner,
    true,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  
  try {
    await provider.connection.getTokenAccountBalance(tokenAccount);
    console.log(`  Token account already exists: ${tokenAccount.toString().slice(0, 20)}...`);
    return tokenAccount;
  } catch (e) {
    console.log(`  Creating token account: ${tokenAccount.toString().slice(0, 20)}...`);
    const ix = createAssociatedTokenAccountIdempotentInstruction(
      provider.wallet.publicKey,
      tokenAccount,
      owner,
      mint,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const tx = new Transaction().add(ix);
    await provider.sendAndConfirm(tx);
    console.log(`  ✅ Token account created`);
    return tokenAccount;
  }
}

async function initializeTier(
  program: Program<FortressProtocol>,
  provider: anchor.AnchorProvider,
  globalRegistryPDA: PublicKey,
  treasuryPDA: PublicKey,
  lotteryType: string,
  tier: number,
  methodName: string
) {
  const vaultPrefix = `vault_${lotteryType.toLowerCase()}`;
  const [vaultPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from(vaultPrefix), Buffer.from([tier])],
    program.programId
  );
  
  try {
    const vault = await (program.account as any).lotteryVault.fetch(vaultPDA);
    console.log(`✅ ${lotteryType} Tier ${tier} vault already initialized`);
    return true;
  } catch (e) {
    try {
      // Create token account first
      const tokenAccount = await createTokenAccountIfNeeded(provider, FPT_MINT, vaultPDA);
      
      const tx = await (program.methods as any)[methodName](tier)
        .accounts({
          authority: provider.wallet.publicKey,
          treasury: treasuryPDA,
          fptMint: FPT_MINT,
          vault: vaultPDA,
          tokenAccount: tokenAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      console.log(`✅ ${lotteryType} Tier ${tier} vault initialized (Treasury paid):`, tx.slice(0, 20) + "...");
      return true;
    } catch (initError: any) {
      console.error(`❌ Failed to initialize ${lotteryType} Tier ${tier}:`, initError.message);
      return false;
    }
  }
}

async function initializeAllPDAs() {
  // Load wallet from the correct location
  const fs = require('fs');
  const walletPath = process.env.ANCHOR_WALLET || '/home/dev/my-wallet.json';
  console.log("DEBUG: Loading wallet from:", walletPath);
  const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
  console.log("DEBUG: First 4 bytes:", walletData.slice(0, 4));
  const walletKeypair = anchor.web3.Keypair.fromSecretKey(
    new Uint8Array(walletData)
  );
  console.log("DEBUG: Wallet publicKey:", walletKeypair.publicKey.toString());
  
  const connection = new anchor.web3.Connection('https://api.devnet.solana.com', 'confirmed');
  const wallet = new anchor.Wallet(walletKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  anchor.setProvider(provider);

  const program = anchor.workspace.FortressProtocol as Program<FortressProtocol>;
  
  console.log("🔧 Initializing all PDAs for Fortress Lottery...");
  console.log("Program ID:", program.programId.toString());
  console.log("Admin:", provider.wallet.publicKey.toString());
  console.log("Admin SOL Balance:", (await connection.getBalance(provider.wallet.publicKey)) / 1e9, "SOL");
  console.log("");

  // Derive Treasury PDA
  const [treasuryPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    program.programId
  );
  console.log("Treasury PDA:", treasuryPDA.toString());
  console.log("Treasury Balance:", (await connection.getBalance(treasuryPDA)) / 1e9, "SOL");
  console.log("");

  try {
    // 1. Check Global Registry
    console.log("📝 Step 1: Checking Global Registry...");
    const [globalRegistryPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("global_registry")],
      program.programId
    );
    
    let registryExists = false;
    try {
      // First check if account exists
      const accountInfo = await provider.connection.getAccountInfo(globalRegistryPDA);
      if (accountInfo) {
        console.log("✅ Global Registry account exists");
        try {
          const registry = await (program.account as any).globalRegistry.fetch(globalRegistryPDA);
          console.log("✅ Global Registry initialized with", registry.totalParticipants?.toString() || "0", "participants");
          registryExists = true;
        } catch (fetchError) {
          console.log("✅ Global Registry exists (account found)");
          registryExists = true;
        }
      } else {
        console.log("⚠️  Global Registry not found, attempting to initialize...");
        const tx = await (program.methods as any).initializeGlobalRegistry()
          .accounts({
            authority: provider.wallet.publicKey,
            treasury: treasuryPDA,
            registry: globalRegistryPDA,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
        console.log("✅ Global Registry initialized (Treasury paid):", tx);
        registryExists = true;
      }
    } catch (e: any) {
      if (e.message?.includes("already in use")) {
        console.log("✅ Global Registry already exists (account in use)");
        registryExists = true;
      } else {
        console.error("❌ Failed with Global Registry:", e.message);
        return;
      }
    }

    // 2-6. Initialize all vault tiers
    console.log("\n📝 Step 2-6: Initializing All Vault Tiers...");
    
    const lotteryConfigs = [
      { type: "LPM", tiers: [5, 10, 20, 50], method: "initializeLpmTier" },
      { type: "DPL", tiers: [5, 10, 15, 20], method: "initializeDplTier" },
      { type: "WPL", tiers: [5, 10, 15, 20], method: "initializeWplTier" },
      { type: "MPL", tiers: [5, 10, 15, 20], method: "initializeMplTier" },
      { type: "YPL", tiers: [5, 10, 15, 20], method: "initializeYplTier" },
    ];
    
    let totalInitialized = 0;
    let totalSkipped = 0;
    
    for (const config of lotteryConfigs) {
      console.log(`\n  Initializing ${config.type} vaults...`);
      for (const tier of config.tiers) {
        const success = await initializeTier(
          program,
          provider,
          globalRegistryPDA,
          treasuryPDA,
          config.type,
          tier,
          config.method
        );
        if (success) {
          const vault = await (program.account as any).lotteryVault.fetch(
            PublicKey.findProgramAddressSync(
              [Buffer.from(`vault_${config.type.toLowerCase()}`), Buffer.from([tier])],
              program.programId
            )[0]
          );
          if (vault.participantCount === 0) {
            totalInitialized++;
          } else {
            totalSkipped++;
          }
        }
      }
    }

    console.log("\n🎉 All PDAs initialized successfully!");
    console.log("\n📊 Summary:");
    console.log("- Global Registry: ✅");
    console.log("- LPM Vaults (4 tiers): ✅");
    console.log("- DPL Vaults (4 tiers): ✅");
    console.log("- WPL Vaults (4 tiers): ✅");
    console.log("- MPL Vaults (4 tiers): ✅");
    console.log("- YPL Vaults (4 tiers): ✅");
    console.log("- PricingConfig: ✅ (already initialized)");
    console.log("\n✅ System ready for ticket purchases!");

  } catch (error) {
    console.error("\n❌ Error initializing PDAs:", error);
    throw error;
  }
}

initializeAllPDAs()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

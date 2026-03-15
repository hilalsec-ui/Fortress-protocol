import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import fs from "fs";

// Load program IDL
const IDL_PATH = "./target/idl/fortress_protocol.json";
const PROGRAM_ID = new PublicKey("2JHDbUz11kLe7q44nneougHcJCQqD6t26XeEFFNQJpHY");
const FPT_MINT = new PublicKey("3YTnzmFTECtyKDxaghWPQcjzX7g1Cj3NxMq41JdWk2rj"); // FPT token
const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

async function initializeLotteries() {
    console.log("PROGRAM_ID used for PDA derivation:", PROGRAM_ID.toBase58());
  console.log("🚀 Initializing Fortress Lottery System...\n");

  // Setup connection and provider
  const rpcUrl = process.env.ANCHOR_PROVIDER_URL || "http://localhost:8899";
  const connection = new Connection(rpcUrl, "confirmed");
  
  // Load wallet from file
  const walletPath = process.env.ANCHOR_WALLET || '/home/dev/my-wallet.json';
  const walletKeypair = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
  );
  
  const wallet = new anchor.Wallet(walletKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  // Load program
  const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf-8")) as any;
  const program = new anchor.Program(idl, provider) as any;

  console.log("📋 Program ID:", PROGRAM_ID.toString());
  console.log("👤 Authority:", wallet.publicKey.toString());
  console.log("💰 FPT Mint:", FPT_MINT.toString());
  console.log("");

  try {
    // Step 1: Initialize Treasury
    console.log("1️⃣  Initializing Treasury...");
    // Derive treasury PDA using the same seed as the Anchor program (b"treasury")
    const [treasuryPDA, treasuryBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("treasury")],
      PROGRAM_ID
    );
    console.log("Derived Treasury PDA:", treasuryPDA.toBase58(), "Bump:", treasuryBump);
    // For debugging: print the expected admin authority from the Anchor program
    console.log("Expected Admin Authority (from Anchor): EANi5dM5CUbtoiJAN72JgKMSNM6bMWsSWMX1w1t2yWcv");

    try {
      await program.methods
        .initializeTreasury()
        .accounts({
          admin: wallet.publicKey,
          treasury: treasuryPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      console.log("✅ Treasury initialized:", treasuryPDA.toString());
    } catch (err: any) {
      if (err.message.includes("already in use")) {
        console.log("⚠️  Treasury already exists");
      } else {
        throw err;
      }
    }
    console.log("");

    // Step 2: Initialize Treasury Vault
    console.log("2️⃣  Initializing Treasury Vault...");
    const [treasuryVaultPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("sol_vault")],
      PROGRAM_ID
    );

    try {
      const initialDeposit = new anchor.BN(1 * anchor.web3.LAMPORTS_PER_SOL); // 1 SOL
      await program.methods
        .initializeTreasuryVault(initialDeposit)
        .accounts({
          payer: wallet.publicKey,
          treasuryVault: treasuryVaultPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      console.log("✅ Treasury Vault initialized:", treasuryVaultPDA.toString());
    } catch (err: any) {
      if (err.message.includes("already in use")) {
        console.log("⚠️  Treasury Vault already exists");
      } else {
        throw err;
      }
    }
    console.log("");

    // Step 3: Initialize Global Registry
    console.log("3️⃣  Initializing Global Registry...");
    const [registryPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("global_registry")],
      PROGRAM_ID
    );

    try {
      await program.methods
        .initializeGlobalRegistry()
        .accounts({
          authority: wallet.publicKey,
          treasuryVault: treasuryVaultPDA,
          treasury: treasuryPDA,
          registry: registryPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      console.log("✅ Global Registry initialized:", registryPDA.toString());
    } catch (err: any) {
      if (err.message.includes("already in use")) {
        console.log("⚠️  Global Registry already exists");
      } else {
        throw err;
      }
    }
    console.log("");

    // Step 3b: Initialize Pricing Config
    console.log("3️⃣  Initializing Pricing Config...");
    const [pricingConfigPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("pricing_config")],
      PROGRAM_ID
    );

    try {
      const initialRate = new anchor.BN(500_000); // 0.5 FPT per USD
      await program.methods
        .initializePricingConfig(initialRate)
        .accounts({
          admin: wallet.publicKey,
          pricingConfig: pricingConfigPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      console.log("✅ Pricing Config initialized:", pricingConfigPDA.toString());
    } catch (err: any) {
      if (err.message.includes("already in use")) {
        console.log("⚠️  Pricing Config already exists");
      } else {
        throw err;
      }
    }
    console.log("");

    // Step 4: Initialize LPM Main + Tiers
    console.log("4️⃣  Initializing LPM Lottery (Lightning Pool Monthly)...");
    await initializeLpmLottery(program, wallet.publicKey, FPT_MINT, treasuryVaultPDA, treasuryPDA);
    console.log("");

    // Step 5: Initialize DPL Main + Tiers
    console.log("5️⃣  Initializing DPL Lottery (Daily Pool)...");
    await initializeDplLottery(program, wallet.publicKey, FPT_MINT, treasuryVaultPDA, treasuryPDA);
    console.log("");

    // Step 6: Initialize WPL Main + Tiers
    console.log("6️⃣  Initializing WPL Lottery (Weekly Pool)...");
    await initializeWplLottery(program, wallet.publicKey, FPT_MINT, treasuryVaultPDA, treasuryPDA);
    console.log("");

    // Step 7: Initialize MPL Main + Tiers
    console.log("7️⃣  Initializing MPL Lottery (Monthly Pool)...");
    await initializeMplLottery(program, wallet.publicKey, FPT_MINT, treasuryVaultPDA, treasuryPDA);
    console.log("");

    // Step 8: Initialize YPL Main + Tiers
    console.log("8️⃣  Initializing YPL Lottery (Yearly Pool)...");
    await initializeYplLottery(program, wallet.publicKey, FPT_MINT, treasuryVaultPDA, treasuryPDA);
    console.log("");

    console.log("🎉 All lotteries initialized successfully!");
    console.log("\n📊 Summary:");
    console.log("   - Global Registry: ✅");
    console.log("   - LPM (4 tiers: 5, 10, 20, 50): ✅");
    console.log("   - DPL (4 tiers: 5, 10, 15, 20): ✅");
    console.log("   - WPL (4 tiers: 5, 10, 15, 20): ✅");
    console.log("   - MPL (4 tiers: 5, 10, 15, 20): ✅");
    console.log("   - YPL (4 tiers: 5, 10, 15, 20): ✅");
    console.log("\n✨ Total: 20 independent lottery vaults created!");

  } catch (error) {
    console.error("❌ Error initializing lotteries:", error);
    process.exit(1);
  }
}

async function initializeLpmLottery(
  program: Program,
  authority: PublicKey,
  fptMint: PublicKey,
  treasuryVault: PublicKey,
  treasury: PublicKey
) {
  const [lpmLottery] = PublicKey.findProgramAddressSync(
    [Buffer.from("lpm_lottery")],
    program.programId
  );

  // Initialize main LPM lottery account
  try {
    await program.methods
      .initializeLpmLottery()
      .accounts({
        authority,
        treasuryVault,
        treasury,
        lpmLottery,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    console.log("  ✅ LPM Lottery main account initialized");
  } catch (err: any) {
    if (!err.message.includes("already in use")) {
      throw err;
    }
    console.log("  ⚠️  LPM Lottery main account already exists");
  }

  // Initialize each tier
  const tiers = [5, 10, 20, 50];
  for (const tier of tiers) {
    const [vault] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_lpm"), Buffer.from([tier])],
      program.programId
    );

    const vaultAta = await PublicKey.findProgramAddress(
      [vault.toBuffer(), TOKEN_2022_PROGRAM_ID.toBuffer(), fptMint.toBuffer()],
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    try {
      await program.methods
        .initializeLpmTier(tier)
        .accounts({
          authority,
          treasuryVault,
          treasury,
          fptMint,
          vault,
          tokenAccount: vaultAta[0],
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      console.log(`  ✅ LPM Tier ${tier} USD initialized`);
    } catch (err: any) {
      if (!err.message.includes("already in use")) {
        throw err;
      }
      console.log(`  ⚠️  LPM Tier ${tier} USD already exists`);
    }
  }
}

async function initializeDplLottery(
  program: Program,
  authority: PublicKey,
  fptMint: PublicKey,
  treasuryVault: PublicKey,
  treasury: PublicKey
) {
  const [dplLottery] = PublicKey.findProgramAddressSync(
    [Buffer.from("dpl_lottery")],
    program.programId
  );

  try {
    await program.methods
      .initializeDplLottery()
      .accounts({
        authority,
        treasuryVault,
        treasury,
        dplLottery,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    console.log("  ✅ DPL Lottery main account initialized");
  } catch (err: any) {
    if (!err.message.includes("already in use")) {
      throw err;
    }
    console.log("  ⚠️  DPL Lottery main account already exists");
  }

  const tiers = [5, 10, 15, 20];
  for (const tier of tiers) {
    const [vault] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_dpl"), Buffer.from([tier])],
      program.programId
    );

    const vaultAta = await PublicKey.findProgramAddress(
      [vault.toBuffer(), TOKEN_2022_PROGRAM_ID.toBuffer(), fptMint.toBuffer()],
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    try {
      await program.methods
        .initializeDplTier(tier)
        .accounts({
          authority,
          treasuryVault,
          treasury,
          fptMint,
          vault,
          tokenAccount: vaultAta[0],
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      console.log(`  ✅ DPL Tier ${tier} USD initialized`);
    } catch (err: any) {
      if (!err.message.includes("already in use")) {
        throw err;
      }
      console.log(`  ⚠️  DPL Tier ${tier} USD already exists`);
    }
  }
}

async function initializeWplLottery(
  program: Program,
  authority: PublicKey,
  fptMint: PublicKey,
  treasuryVault: PublicKey,
  treasury: PublicKey
) {
  const [wplLottery] = PublicKey.findProgramAddressSync(
    [Buffer.from("wpl_lottery")],
    program.programId
  );

  try {
    await program.methods
      .initializeWplLottery()
      .accounts({
        authority,
        treasuryVault,
        treasury,
        wplLottery,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    console.log("  ✅ WPL Lottery main account initialized");
  } catch (err: any) {
    if (!err.message.includes("already in use")) {
      throw err;
    }
    console.log("  ⚠️  WPL Lottery main account already exists");
  }

  const tiers = [5, 10, 15, 20];
  for (const tier of tiers) {
    const [vault] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_wpl"), Buffer.from([tier])],
      program.programId
    );

    const vaultAta = await PublicKey.findProgramAddress(
      [vault.toBuffer(), TOKEN_2022_PROGRAM_ID.toBuffer(), fptMint.toBuffer()],
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    try {
      await program.methods
        .initializeWplTier(tier)
        .accounts({
          authority,
          treasuryVault,
          treasury,
          fptMint,
          vault,
          tokenAccount: vaultAta[0],
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      console.log(`  ✅ WPL Tier ${tier} USD initialized`);
    } catch (err: any) {
      if (!err.message.includes("already in use")) {
        throw err;
      }
      console.log(`  ⚠️  WPL Tier ${tier} USD already exists`);
    }
  }
}

async function initializeMplLottery(
  program: Program,
  authority: PublicKey,
  fptMint: PublicKey,
  treasuryVault: PublicKey,
  treasury: PublicKey
) {
  const [mplLottery] = PublicKey.findProgramAddressSync(
    [Buffer.from("mpl_lottery")],
    program.programId
  );

  try {
    await program.methods
      .initializeMplLottery()
      .accounts({
        authority,
        treasuryVault,
        treasury,
        mplLottery,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    console.log("  ✅ MPL Lottery main account initialized");
  } catch (err: any) {
    if (!err.message.includes("already in use")) {
      throw err;
    }
    console.log("  ⚠️  MPL Lottery main account already exists");
  }

  const tiers = [5, 10, 15, 20];
  for (const tier of tiers) {
    const [vault] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_mpl"), Buffer.from([tier])],
      program.programId
    );

    const vaultAta = await PublicKey.findProgramAddress(
      [vault.toBuffer(), TOKEN_2022_PROGRAM_ID.toBuffer(), fptMint.toBuffer()],
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    try {
      await program.methods
        .initializeMplTier(tier)
        .accounts({
          authority,
          treasuryVault,
          treasury,
          fptMint,
          vault,
          tokenAccount: vaultAta[0],
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      console.log(`  ✅ MPL Tier ${tier} USD initialized`);
    } catch (err: any) {
      if (!err.message.includes("already in use")) {
        throw err;
      }
      console.log(`  ⚠️  MPL Tier ${tier} USD already exists`);
    }
  }
}

async function initializeYplLottery(
  program: Program,
  authority: PublicKey,
  fptMint: PublicKey,
  treasuryVault: PublicKey,
  treasury: PublicKey
) {
  const [yplLottery] = PublicKey.findProgramAddressSync(
    [Buffer.from("ypl_lottery")],
    program.programId
  );

  try {
    await program.methods
      .initializeYplLottery()
      .accounts({
        authority,
        treasuryVault,
        treasury,
        yplLottery,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    console.log("  ✅ YPL Lottery main account initialized");
  } catch (err: any) {
    if (!err.message.includes("already in use")) {
      throw err;
    }
    console.log("  ⚠️  YPL Lottery main account already exists");
  }

  const tiers = [5, 10, 15, 20];
  for (const tier of tiers) {
    const [vault] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_ypl"), Buffer.from([tier])],
      program.programId
    );

    const vaultAta = await PublicKey.findProgramAddress(
      [vault.toBuffer(), TOKEN_2022_PROGRAM_ID.toBuffer(), fptMint.toBuffer()],
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    try {
      await program.methods
        .initializeYplTier(tier)
        .accounts({
          authority,
          treasuryVault,
          treasury,
          fptMint,
          vault,
          tokenAccount: vaultAta[0],
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      console.log(`  ✅ YPL Tier ${tier} USD initialized`);
    } catch (err: any) {
      if (!err.message.includes("already in use")) {
        throw err;
      }
      console.log(`  ⚠️  YPL Tier ${tier} USD already exists`);
    }
  }
}

// Run initialization
initializeLotteries().then(
  () => process.exit(0),
  err => {
    console.error(err);
    process.exit(1);
  }
);

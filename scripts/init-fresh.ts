import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { FortressProtocol } from "../target/types/fortress_protocol";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.FortressProtocol as anchor.Program<FortressProtocol>;
  const admin = provider.wallet.publicKey;
  const PROGRAM_ID = program.programId;

  console.log("🚀 Fresh Initialization");
  console.log("Program ID:", PROGRAM_ID.toBase58());
  console.log("Admin:", admin.toBase58());

  const step = async (name: string, fn: () => Promise<void>) => {
    try { await fn(); } catch (e: any) {
      if (e.message?.includes("already in use") || e.logs?.some((l: string) => l.includes("already in use"))) {
        console.log(`  ⏭  ${name} already initialized`);
      } else {
        console.error(`  ❌ ${name} failed:`, e.message?.slice(0, 150));
      }
    }
  };

  // 1. GlobalRegistry
  const [registryPda] = PublicKey.findProgramAddressSync([Buffer.from("global_registry")], PROGRAM_ID);
  await step("GlobalRegistry", async () => {
    const tx = await program.methods.initializeGlobalRegistry()
      .accounts({ admin, registry: registryPda, systemProgram: SystemProgram.programId } as any)
      .rpc();
    console.log("  ✅ GlobalRegistry:", tx);
  });

  // 2. PricingConfig (0.5 FPT/USD = 500,000)
  const [pricingPda] = PublicKey.findProgramAddressSync([Buffer.from("pricing_config")], PROGRAM_ID);
  await step("PricingConfig", async () => {
    const tx = await program.methods.initializePricingConfig(new BN(500_000))
      .accounts({ admin, pricingConfig: pricingPda, systemProgram: SystemProgram.programId } as any)
      .rpc();
    console.log("  ✅ PricingConfig:", tx);
  });

  // 3. Treasury
  const [treasuryPda] = PublicKey.findProgramAddressSync([Buffer.from("treasury")], PROGRAM_ID);
  await step("Treasury", async () => {
    const tx = await program.methods.initializeTreasury()
      .accounts({ admin, treasury: treasuryPda, systemProgram: SystemProgram.programId } as any)
      .rpc();
    console.log("  ✅ Treasury:", tx);
  });

  // 4. Fund sol_vault with 2 SOL for page rent refunds
  const [solVaultPda] = PublicKey.findProgramAddressSync([Buffer.from("sol_vault")], PROGRAM_ID);
  const solVaultBalance = await provider.connection.getBalance(solVaultPda);
  if (solVaultBalance < 0.5 * LAMPORTS_PER_SOL) {
    await step("Fund sol_vault", async () => {
      const tx = await program.methods.topUpTreasuryVault(new BN(2 * LAMPORTS_PER_SOL))
        .accounts({ payer: admin, treasuryVault: solVaultPda, treasury: treasuryPda, systemProgram: SystemProgram.programId } as any)
        .rpc();
      console.log("  ✅ sol_vault funded:", tx);
    });
  } else {
    console.log("  ⏭  sol_vault already funded:", (solVaultBalance / LAMPORTS_PER_SOL).toFixed(3), "SOL");
  }

  // 5. Initialize all vaults + winner histories
  const LOTTERY_CONFIGS = [
    { id: 0, prefix: "vault_lpm", name: "LPM", tiers: [5, 10, 20, 50] },
    { id: 1, prefix: "vault_dpl", name: "DPL", tiers: [5, 10, 15, 20] },
    { id: 2, prefix: "vault_wpl", name: "WPL", tiers: [5, 10, 15, 20] },
    { id: 3, prefix: "vault_mpl", name: "MPL", tiers: [5, 10, 15, 20] },
  ];

  for (const lc of LOTTERY_CONFIGS) {
    for (const tier of lc.tiers) {
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from(lc.prefix), Buffer.from([tier])], PROGRAM_ID
      );
      const [whPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("winner_history"), Buffer.from([lc.id]), Buffer.from([tier])], PROGRAM_ID
      );

      const existing = await provider.connection.getAccountInfo(vaultPda);
      if (existing) {
        console.log(`  ⏭  ${lc.name} Tier ${tier} already exists`);
        continue;
      }

      await step(`${lc.name} Tier ${tier}`, async () => {
        const tx = await program.methods.initializeVault(lc.id, tier)
          .accounts({
            admin,
            lotteryVault: vaultPda,
            winnerHistory: whPda,
            systemProgram: SystemProgram.programId
          } as any)
          .rpc();
        console.log(`  ✅ ${lc.name} Tier ${tier}:`, tx.slice(0, 25) + "...");
      });
      await new Promise(r => setTimeout(r, 800));
    }
  }

  console.log("\n🎉 All initialization complete!");
  
  // Summary of PDAs
  console.log("\nPDA Summary:");
  console.log("  GlobalRegistry:", registryPda.toBase58());
  console.log("  PricingConfig:", pricingPda.toBase58());
  console.log("  Treasury:", treasuryPda.toBase58());
  console.log("  sol_vault:", solVaultPda.toBase58());
}

main().catch(e => { console.error(e); process.exit(1); });

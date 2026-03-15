import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { FortressProtocol } from "../target/types/fortress_protocol";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.FortressProtocol as Program<FortressProtocol>;
  const adminWallet = provider.wallet.publicKey;

  console.log("\n🎰 Initialize All 16 Vaults");
  console.log("=====================================");
  console.log("Program ID:", program.programId.toBase58());

  const fptMint = new PublicKey("3YTnzmFTECtyKDxaghWPQcjzX7g1Cj3NxMq41JdWk2rj");
  
  const [treasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    program.programId
  );
  
  const [treasuryVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury_vault")],
    program.programId
  );

  const lotteryTypes = [
    { name: "LPM", seed: "vault_lpm", tiers: [5, 10, 20, 50] },
    { name: "DPL", seed: "vault_dpl", tiers: [5, 10, 15, 20] },
    { name: "WPL", seed: "vault_wpl", tiers: [5, 10, 15, 20] },
    { name: "MPL", seed: "vault_mpl", tiers: [5, 10, 15, 20] }
  ];
  
  const tierNames = ["Bronze", "Silver", "Gold", "Diamond"];

  let initialized = 0;
  let skipped = 0;
  let failed = 0;

  for (const lottery of lotteryTypes) {
    for (let i = 0; i < lottery.tiers.length; i++) {
      const tier = lottery.tiers[i];
      const vaultName = `${lottery.name} ${tierNames[i]}`;
      
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from(lottery.seed), Buffer.from([tier])],
        program.programId
      );
      
      // Derive token account (ATA for vault PDA)
      const [tokenAccount] = PublicKey.findProgramAddressSync(
        [vaultPda.toBuffer(), TOKEN_2022_PROGRAM_ID.toBuffer(), fptMint.toBuffer()],
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      
      try {
        const vaultAccount = await provider.connection.getAccountInfo(vaultPda);
        if (vaultAccount && vaultAccount.data.length > 0) {
          console.log(`✅ ${vaultName} already initialized`);
          skipped++;
          continue;
        }
      } catch (e) {}
      
      try {
        console.log(`Initializing ${vaultName}...`);
        
        let tx;
        if (lottery.name === "LPM") {
          tx = await program.methods
            .initializeLpmTier(tier)
            .accounts({
              authority: adminWallet,
              fptMint: fptMint,
              tokenAccount: tokenAccount,
              tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .rpc({ skipPreflight: false });
        } else if (lottery.name === "DPL") {
          tx = await program.methods
            .initializeDplTier(tier)
            .accounts({
              authority: adminWallet,
              fptMint: fptMint,
              tokenAccount: tokenAccount,
              tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .rpc({ skipPreflight: false });
        } else if (lottery.name === "WPL") {
          tx = await program.methods
            .initializeWplTier(tier)
            .accounts({
              authority: adminWallet,
              fptMint: fptMint,
              tokenAccount: tokenAccount,
              tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .rpc({ skipPreflight: false });
        } else if (lottery.name === "MPL") {
          tx = await program.methods
            .initializeMplTier(tier)
            .accounts({
              authority: adminWallet,
              fptMint: fptMint,
              tokenAccount: tokenAccount,
              tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .rpc({ skipPreflight: false });
        }
        
        console.log(`   ✅ Initialized`);
        console.log(`   PDA: ${vaultPda.toBase58()}`);
        console.log(`   Token Account: ${tokenAccount.toBase58()}`);
        console.log(`   Tx: ${tx?.slice(0, 32)}...`);
        initialized++;
        
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error: any) {
        console.error(`   ❌ Failed: ${error.message}`);
        if (error.logs) {
          console.error(`   Logs:`, error.logs.slice(-3).join('\n         '));
        }
        failed++;
      }
    }
  }

  console.log("\n📋 Summary");
  console.log("=====================================");
  console.log(`✅ Initialized: ${initialized}`);
  console.log(`⏭️  Skipped: ${skipped}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Total: ${initialized + skipped}/16`);
  
  if (initialized + skipped === 16) {
    console.log("\n🎉 ALL 16 VAULTS READY!");
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);

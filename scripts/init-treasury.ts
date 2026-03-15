import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import * as fs from "fs";

// Load IDL
const idlPath = "./target/idl/fortress_protocol.json";
const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));

const PROGRAM_ID = new PublicKey("2JHDbUz11kLe7q44nneougHcJCQqD6t26XeEFFNQJpHY");

async function main() {
  // Setup provider
  const connection = new anchor.web3.Connection(
    "https://api.mainnet-beta.solana.com",
    "confirmed"
  );
  
  // Load wallet from file
  const walletPath = process.env.HOME + "/my-wallet.json";
  const walletKeypair = anchor.web3.Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(walletPath, "utf8")))
  );
  
  const wallet = new anchor.Wallet(walletKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const program = new Program(idl, provider);

  console.log("=== Initialize Treasury ===");
  console.log("Program ID:", PROGRAM_ID.toBase58());
  console.log("Admin wallet:", wallet.publicKey.toBase58());

  // Derive Treasury PDA
  const [treasuryPda, treasuryBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    PROGRAM_ID
  );
  console.log("Treasury PDA:", treasuryPda.toBase58());
  console.log("Treasury bump:", treasuryBump);

  // Check if Treasury already exists
  const treasuryInfo = await connection.getAccountInfo(treasuryPda);
  if (treasuryInfo) {
    console.log("\n✅ Treasury already initialized!");
    console.log("Balance:", treasuryInfo.lamports / LAMPORTS_PER_SOL, "SOL");
    return;
  }

  console.log("\n🔧 Initializing Treasury...");

  try {
    const tx = await program.methods
      .initializeTreasury()
      .accounts({
        admin: wallet.publicKey,
        treasury: treasuryPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("✅ Treasury initialized!");
    console.log("Transaction:", tx);

    // Check new balance
    const newInfo = await connection.getAccountInfo(treasuryPda);
    if (newInfo) {
      console.log("Treasury balance:", newInfo.lamports / LAMPORTS_PER_SOL, "SOL");
    }
  } catch (error) {
    console.error("❌ Error initializing treasury:", error);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

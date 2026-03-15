import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import fs from "fs";
import os from "os";

const PROGRAM_ID = new PublicKey("EB6kkg2sW5rnukjRH7Ljhz78gbfc36XZAuiFn5jdefF3");
const PRICING_CONFIG_PDA = new PublicKey("982GraduHuXxwgoQFeecxnTR8ED9pggcHgXBotJH1dgh");
const RPC = "https://api.mainnet-beta.solana.com";

async function main() {
  const connection = new Connection(RPC, "confirmed");

  const walletPath = `${os.homedir()}/my-wallet.json`;
  const raw = JSON.parse(fs.readFileSync(walletPath, "utf8"));
  const admin = Keypair.fromSecretKey(Uint8Array.from(raw));
  console.log("Admin:", admin.publicKey.toBase58());

  const idlPath = `${os.homedir()}/fortress/app/src/idl/fortress_protocol.json`;
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));

  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(admin),
    { commitment: "confirmed" }
  );
  anchor.setProvider(provider);

  const program = new anchor.Program(idl as anchor.Idl, provider);

  // Check current state
  try {
    const config = await (program.account as any).pricingConfig.fetch(PRICING_CONFIG_PDA);
    console.log("Current pricing config:", JSON.stringify(config, null, 2));
  } catch (e) {
    console.log("Could not fetch pricing config:", e);
  }

  console.log("\nEnabling Pyth oracle (toggle_oracle = true)...");
  try {
    const tx = await (program.methods as any)
      .toggleOracle(true)
      .accountsStrict({
        admin: admin.publicKey,
        pricingConfig: PRICING_CONFIG_PDA,
      })
      .rpc({ commitment: "confirmed" });

    console.log("✅ Oracle enabled! TX:", tx);
  } catch (e: any) {
    console.error("❌ Failed:", e.message);
    if (e.logs) e.logs.forEach((l: string) => console.error(" ", l));
  }

  // Verify
  try {
    const config = await (program.account as any).pricingConfig.fetch(PRICING_CONFIG_PDA);
    console.log("\nUpdated pricing config:", JSON.stringify(config, null, 2));
    console.log("\nuseOracle:", config.useOracle);
  } catch (e) {
    console.log("Could not verify:", e);
  }
}

main().catch(console.error);

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { FortressProtocol } from "../target/types/fortress_protocol";

describe("fortress", () => {
  // Configure the client to use the devnet cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.FortressProtocol as Program<FortressProtocol>;

  it("Is initialized!", async () => {
    // This is where we will call your lottery initialization later
    console.log("Fortress Protocol is ready for battle!");
  });
});

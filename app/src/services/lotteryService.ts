"use client";

import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionMessage,
  TransactionInstruction,
  VersionedTransaction,
  Keypair,
  SystemProgram,
  ComputeBudgetProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  ACCOUNT_SIZE,
} from "@solana/spl-token";

import { BN } from "@coral-xyz/anchor";
import {
  fetchFptUsdPrice,
  computeFptPerTicket,
  computeMaxFptAmount,
  formatFPT,
} from "./switchboardPriceService";
import {
  PROGRAM_ID,
  RPC_ENDPOINT,
  LOTTERY_TYPES,
  BRANDS,
  FPT_MINT as FPT_MINT_STRING,
  SB_RANDOMNESS_ACCOUNTS,
  SRS_POLL_TIMEOUT_MS,
} from "../utils/constants";
import { saveParticipant, saveWinnerToHistory } from "./participantsService";
import { useTimeOffsetStore } from '@/stores/timeOffsetStore';

function extractVaultFields(vault: any, tier: number, lotteryType: string, lastWinnerForType: { wallet: string | null; tier: number }) {
  const zeroAddress = '11111111111111111111111111111111';
  const participantCount = typeof vault.participantCount === 'object' && vault.participantCount?.toNumber
    ? vault.participantCount.toNumber()
    : (vault.participantCount || 0);
  const balance = typeof vault.balance === 'object' && vault.balance?.toNumber
    ? vault.balance.toNumber()
    : (vault.balance || 0);

  let tierLastWinner: string | null = null;
  if (vault.lastWinner) {
    const w = vault.lastWinner.toString();
    if (w !== zeroAddress) {
      tierLastWinner = w;
      if (!lastWinnerForType.wallet || tier < lastWinnerForType.tier) {
        lastWinnerForType.wallet = w;
        lastWinnerForType.tier = tier;
      }
    }
  }

  return {
    tier,
    participants: participantCount,
    prizePool: balance / 1_000_000,
    lastWinner: tierLastWinner,
    roundNumber: typeof vault.roundNumber === 'object' && vault.roundNumber?.toNumber
      ? vault.roundNumber.toNumber()
      : (vault.roundNumber || 0),
    isDrawn: vault.isDrawn || false,
    vaultState: vault.state ? Object.keys(vault.state)[0] : 'active',
    endTime: vault.endTime?.toNumber?.() || vault.end_time?.toNumber?.() || vault.endTime || vault.end_time || 0,
  };
}

/**
 * Fetch all lottery accounts from the blockchain.
 *
 * ⚡ RPC-efficient: Anchor's fetchMultiple() does ONE getMultipleAccountsInfo
 * call for all 16 vault PDAs and decodes them using the official Anchor coder.
 * Total: 1 RPC call instead of 16+ individual fetch() calls.
 */
export async function fetchAllLotteryAccounts(program: Program) {
  if (!program) {
    throw new Error("Program not initialized");
  }

  const LOTTERY_CONFIGS = [
    { type: "LPM", name: "Lightning Pool", tiers: [5, 10, 20, 50], maxParticipants: 100 },
    { type: "DPL", name: "Daily Pool",     tiers: [5, 10, 15, 20] },
    { type: "WPL", name: "Weekly Pool",    tiers: [5, 10, 15, 20] },
    { type: "MPL", name: "Monthly Pool",   tiers: [5, 10, 15, 20] },
  ] as const;

  try {
    // --- 1. Derive all 16 vault PDAs (pure CPU, zero RPC) ---
    const vaultMeta: { lotteryType: string; tier: number; pda: PublicKey }[] = [];
    for (const lottery of LOTTERY_CONFIGS) {
      for (const tier of lottery.tiers) {
        const prefix = `vault_${lottery.type.toLowerCase()}`;
        const [pda] = PublicKey.findProgramAddressSync(
          [Buffer.from(prefix), Buffer.from([tier])],
          program.programId
        );
        vaultMeta.push({ lotteryType: lottery.type, tier, pda });
      }
    }

    // --- 2. ONE batch RPC call via Anchor's official fetchMultiple ---
    // fetchMultiple() uses getMultipleAccountsInfo internally + Anchor coder decode
    const allPDAs = vaultMeta.map(v => v.pda);
    const vaultAccounts: (any | null)[] = await (program.account as any).lotteryVault.fetchMultiple(allPDAs);

    // --- 3. Pair fetched accounts back with their metadata ---
    const decodedVaults = vaultMeta.map((meta, i) => ({
      ...meta,
      vault: vaultAccounts[i] ?? null,
    }));

    // --- 4. Group by lottery type and build output ---
    const lotteryData = LOTTERY_CONFIGS.map((lottery) => {
      const lastWinnerForType = { wallet: null as string | null, tier: 0 };
      const tiers = decodedVaults
        .filter(v => v.lotteryType === lottery.type)
        .map(({ tier, vault }) => {
          if (!vault) {
            return { tier, participants: 0, prizePool: 0, lastWinner: null, roundNumber: 0, isDrawn: false, endTime: 0 };
          }
          return extractVaultFields(vault, tier, lottery.type, lastWinnerForType);
        });

      const totalParticipants = tiers.reduce((sum, t) => sum + t.participants, 0);
      return {
        lotteryType: lottery.type,
        currentParticipants: totalParticipants,
        maxParticipants: (lottery as any).maxParticipants,
        lastWinner: lastWinnerForType.wallet,
        isActive: true,
        tiers,
      };
    });

    return lotteryData;
  } catch (error) {
    console.error("Failed to fetch lottery accounts:", error);
    // Return empty data structure on error
    const lotteryTypes = ["LPM", "DPL", "WPL", "MPL"];
    return lotteryTypes.map((type) => ({
      lotteryType: type,
      currentParticipants: 0,
      maxParticipants: type === "LPM" ? 100 : undefined,
      lastWinner: null,
      isActive: true,
      tiers: (type === "LPM" ? [5, 10, 20, 50] : [5, 10, 15, 20]).map(tier => ({
        tier,
        participants: 0,
        prizePool: 0,
        endTime: 0,
      })),
    }));
  }
}

/**
 * Fetch the absolute on-chain expiry timestamp for a specific lottery vault.
 * 
 * This is the authoritative timestamp that should be used for countdown timers.
 * Never calculate expiry from a 'duration' variable - always fetch this.
 * 
 * Returns the vault's end_time (Unix timestamp in seconds).
 * For LPM (participation-based), returns 0 (no time-based expiry).
 * For DPL/WPL/MPL (time-based), returns the Unix timestamp when lottery expires.
 * 
 * @param program - Anchor Program instance
 * @param lotteryType - Type of lottery: "LPM" | "DPL" | "WPL" | "MPL"
 * @param tier - Tier number: 5, 10, 15, 20, or 50 (for LPM)
 * @returns Unix timestamp in seconds (endTime), or 0 if vault not initialized
 */
export async function fetchVaultExpiryTimestamp(
  program: Program,
  lotteryType: string,
  tier: number,
): Promise<number> {
  if (!program) {
    throw new Error("Program not initialized");
  }

  try {
    // Derive vault PDA
    const vaultPrefix = `vault_${lotteryType.toLowerCase()}`;
    const [vaultPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from(vaultPrefix), Buffer.from([tier])],
      program.programId
    );

    // Fetch vault account from blockchain
    const vault = await (program.account as any).lotteryVault.fetch(vaultPDA);

    // Extract endTime: handles both 'endTime' and 'end_time' naming conventions
    const endTime = vault.endTime?.toNumber?.() || vault.end_time?.toNumber?.() || vault.endTime || vault.end_time || 0;


    return endTime;
  } catch (error) {
    // Vault might not be initialized yet
    return 0;
  }
}

/**
 * Fetch treasury data from the blockchain
 */
export async function fetchTreasuryData(program: Program) {
  if (!program) {
    throw new Error("Program not initialized");
  }

  try {
    // Derive treasury PDA
    const [treasuryPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("treasury")],
      program.programId
    );

    // Fetch the treasury account
    const treasuryAccount = await (program.account as any).treasury.fetch(treasuryPDA);

    // Fetch FPT token balance of treasury
    const connection = program.provider.connection;
    const FPT_MINT_LOCAL = new PublicKey(FPT_MINT_STRING);
    
    // Get treasury's FPT token account
    const treasuryFptAccount = await getAssociatedTokenAddress(
      FPT_MINT_LOCAL,
      treasuryPDA,
      true,
      TOKEN_2022_PROGRAM_ID
    );
    
    const tokenAccountInfo = await connection.getTokenAccountBalance(treasuryFptAccount);
    const treasuryBalance = parseFloat(tokenAccountInfo.value.amount) / 1_000_000; // 6 decimals for FPT

    return {
      treasuryBalance,
      protocolFees: (treasuryAccount.totalFees || 0) / 1_000_000,
      treasuryAddress: treasuryPDA.toString(),
      lastUpdated: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Failed to fetch treasury data:", error);
    // Return empty data on error (program not deployed)
    return {
      treasuryBalance: 0,
      protocolFees: 0,
      treasuryAddress: "",
      lastUpdated: new Date().toISOString(),
    };
  }
}
/**
 * Buy lottery tickets - Anchor program method call with quantity support
 * Supports 1-50 tickets per transaction (auto-batching for larger quantities)
 */
export async function buyTicketWithProgram(
  program: Program | null,
  lotteryType: string,
  tier: number,
  participantId: number,
  quantity: number = 1, // Quantity parameter with default of 1
  walletPublicKey?: PublicKey, // NEW: Accept wallet public key as parameter
  onProgress?: (step: number, total: number, qty: number) => void, // Called before each chunk TX
  // Optional: wallet adapter's sendTransaction (from useWallet()). When provided, the tx is
  // sent via the wallet with skipPreflight: true which suppresses Phantom's internal simulation
  // and eliminates the "no balance changes found" warning on Token-2022 transfers.
  sendTransactionFn?: (tx: Transaction, connection: Connection, opts?: { skipPreflight?: boolean; maxRetries?: number }) => Promise<string>,
) {

  // [FIX] Validate wallet is connected BEFORE program check
  if (!walletPublicKey) {
    throw new Error(
      "Wallet not connected. Please connect your wallet first.",
    );
  }

  // Validate program
  if (!program) {
    console.error("❌ Program is null");
    throw new Error(
      "Contract not initialized. Please refresh the page and reconnect your wallet.",
    );
  }


  // Log program and provider info for debugging

  // Validate inputs
  if (!LOTTERY_TYPES.includes(lotteryType as any)) {
    throw new Error(`Invalid lottery type: ${lotteryType}`);
  }
  const validTiers = lotteryType === "LPM" ? [5, 10, 20, 50] : [5, 10, 15, 20];
  if (!validTiers.includes(tier)) {
    throw new Error(`Invalid tier: ${tier}`);
  }

  // NEW: Validate quantity (1-50 per transaction)
  if (quantity < 1 || quantity > 50) {
    throw new Error(
      "Quantity must be between 1 and 50 tickets per transaction",
    );
  }

  try {
    // Get user's wallet - REQUIRED parameter from page component
    let wallet = walletPublicKey;

    if (!wallet) {
      console.error("❌ Wallet not provided:", {
        walletParam: !!walletPublicKey,
        providerWallet: !!(program.provider as any).wallet?.publicKey,
        directPublicKey: !!(program.provider as any).publicKey,
      });
      throw new Error(
        "Wallet not connected - please connect your wallet and try again",
      );
    }

    // Ensure the provider's wallet is set for transaction signing
    if ((program.provider as any).wallet) {
    }

    const connection = program.provider.connection;
    const provider = program.provider as AnchorProvider;

    // Derive PDAs synchronously (no RPC needed)
    const FPT_MINT = new PublicKey(FPT_MINT_STRING);
    const userFptAccount = getAssociatedTokenAddressSync(
      FPT_MINT, wallet, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    const vaultPDA = deriveVaultPDA(lotteryType, tier);
    const programId = (program as any).programId as PublicKey;
    const [solVaultPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("sol_vault")], programId
    );
    const vaultTokenAccount = PublicKey.findProgramAddressSync(
      [vaultPDA.toBuffer(), TOKEN_2022_PROGRAM_ID.toBuffer(), FPT_MINT.toBuffer()],
      ASSOCIATED_TOKEN_PROGRAM_ID,
    )[0];

    // Parallel RPC: fetch FPT price + vault state + buyer balance + SOL balance simultaneously
    const [priceResult, vaultResult, balanceResult, solBalanceResult] = await Promise.allSettled([
      fetchFptUsdPrice(),
      (program.account as any).lotteryVault.fetch(vaultPDA),
      connection.getTokenAccountBalance(userFptAccount),
      connection.getBalance(wallet),
    ]);

    const { fptPerUsd6dec } = priceResult.status === 'fulfilled' ? priceResult.value : await fetchFptUsdPrice();
    const fptPerTicketRaw = computeFptPerTicket(tier, fptPerUsd6dec);
    const fptAmountHuman = formatFPT(fptPerTicketRaw * quantity);

    // [SOL_PRE_CHECK] Verify buyer has enough SOL for tx fees (min ~5000 lamports)
    {
      const solBalance = solBalanceResult.status === 'fulfilled' ? solBalanceResult.value : 0;
      const MIN_SOL_LAMPORTS = 5_000; // ~0.000005 SOL — enough for priority tip + fee
      if (solBalance < MIN_SOL_LAMPORTS) {
        throw new Error(
          `Insufficient SOL. You need at least 0.000005 SOL for transaction fees. Please add SOL to your wallet.`
        );
      }
    }

    // [BALANCE_PRE_CHECK] Use the balance fetched in parallel
    const totalRequiredFptBN = fptPerTicketRaw * quantity;
    {
      let buyerBalance = BigInt(0);
      if (balanceResult.status === 'fulfilled') {
        buyerBalance = BigInt(balanceResult.value.value.amount);
      } else {
      }
      const requiredAmount = BigInt(totalRequiredFptBN.toString());
      if (buyerBalance < requiredAmount) {
        const requiredFptHuman = formatFPT(totalRequiredFptBN);
        const buyerBalanceHuman = (Number(buyerBalance) / 1_000_000).toFixed(2);
        throw new Error(
          `Insufficient FPT balance. You have ${buyerBalanceHuman} FPT but need ${requiredFptHuman} FPT. Please acquire more FPT to participate.`
        );
      }
    }

    // [FIX] Use vault state fetched in parallel
    let pageNumber = 0;
    let participantCount = 0;
    let remainingPageCapacity = 50;
    let lazyResetIx: any = null;

    try {
      if (vaultResult.status !== 'fulfilled') throw vaultResult.reason;
      const vaultAccount = vaultResult.value;
      participantCount = typeof vaultAccount.participantCount === 'object' && vaultAccount.participantCount.toNumber 
        ? vaultAccount.participantCount.toNumber() 
        : (vaultAccount.participantCount || 0);
      pageNumber = Math.floor(participantCount / 50);
      
      // Calculate how many entries are on current page
      const entriesOnCurrentPage = participantCount % 50;
      remainingPageCapacity = 50 - entriesOnCurrentPage;

      // [BUNDLED LAZY RESET] If DPL/WPL/MPL vault is expired with 0 participants,
      // build a lazyResetVault instruction (Instruction A) that is bundled into the
      // SAME transaction as buy_ticket (Instruction B+). This means:
      //   • ONE wallet popup — user signs both at once
      //   • skipPreflight: true (set on sendAndConfirm below) prevents time-drift
      //     simulation reverts caused by the treasury PDA lamport borrow pattern.
      if (lotteryType !== "LPM" && participantCount === 0) {
        const endTime = vaultAccount.endTime?.toNumber?.() ||
                        vaultAccount.end_time?.toNumber?.() ||
                        vaultAccount.endTime || vaultAccount.end_time || 0;
        const nowSec = Math.floor(Date.now() / 1000);
        if (endTime > 0 && nowSec >= endTime) {
          const lotteryTypeMapReset: Record<string, number> = { LPM: 0, DPL: 1, WPL: 2, MPL: 3 };
          lazyResetIx = await (program.methods as any)
            .lazyResetVault(lotteryTypeMapReset[lotteryType] ?? 0, tier)
            .accountsStrict({
              user: wallet,
              treasury: solVaultPDA,
              lotteryVault: vaultPDA,
              systemProgram: SystemProgram.programId,
            })
            .instruction();
        }
      }
      
    } catch (err) {
      pageNumber = 0;
      participantCount = 0;
      remainingPageCapacity = 50;
    }

    // [LPM_CAPACITY_CHECK] For LPM, prevent purchases that would exceed 100 participants
    if (lotteryType === "LPM") {
      const maxAllowed = 100 - participantCount;
      if (maxAllowed <= 0) {
        throw new Error("LPM tier is full (100 participants). Please wait for the draw.");
      }
      if (quantity > maxAllowed) {
        throw new Error(`Cannot purchase ${quantity} tickets. Only ${maxAllowed} slots remaining in this LPM tier.`);
      }
    }

    // [PAGE_SPLIT_PLAN] Build list of chunks that respect page boundaries (max 50 per TX).
    // Sequential TXs are issued when the requested quantity spans a page boundary so the
    // full quantity is always purchased — not silently truncated.
    const chunks: { pageNumber: number; qty: number }[] = [];
    let _remaining = quantity;
    let _pc = participantCount;          // running participant count for chunk planning
    let _rpc = remainingPageCapacity;    // remaining capacity on each chunk's page
    while (_remaining > 0) {
      const chunkQty = Math.min(_remaining, _rpc, 50);
      chunks.push({ pageNumber: Math.floor(_pc / 50), qty: chunkQty });
      _remaining -= chunkQty;
      _pc += chunkQty;
      _rpc = _pc % 50 === 0 ? 50 : 50 - (_pc % 50);
    }

    // Derive registry PDA
    let registryPDA: PublicKey;
    try {
      registryPDA = deriveRegistryPDA();
    } catch (err) {
      console.error("❌ Failed to derive registry PDA:", err);
      throw new Error("Failed to derive registry PDA");
    }

    // Validate all derived accounts

    // Check for undefined accounts
    if (!wallet) throw new Error("Wallet is undefined");
    if (!userFptAccount) throw new Error("User FPT account is undefined");
    if (!vaultTokenAccount) throw new Error("Vault token account is undefined");
    if (!vaultPDA) throw new Error("Vault PDA is undefined");
    if (!registryPDA) throw new Error("Registry PDA is undefined");

    // Map lottery type to program method name (Anchor converts snake_case automatically)
    const methodMap: Record<string, string> = {
      LPM: "buyLpmTicket",
      DPL: "buyDplTicket",
      WPL: "buyWplTicket",
      MPL: "buyMplTicket",
    };

    const methodName = methodMap[lotteryType];
    if (!methodName) {
      throw new Error(`No method found for lottery type: ${lotteryType}`);
    }


    // Log wallet and provider info before signing

    // Call Anchor program method with (tier, quantity)


    // Check if method exists on program
    if (!(program.methods as any)[methodName]) {
      console.error("❌ Method not found:", methodName);
      throw new Error(
        `Method ${methodName} does not exist on program. Check IDL and instruction names.`,
      );
    }



    // Ensure method exists and is callable
    if (typeof (program.methods as any)[methodName] !== "function") {
      throw new Error(`${methodName} is not a function on program.methods`);
    }

    // [SINGLE-TX BATCH] Build one instruction per chunk and pack them all into ONE transaction.
    // This means exactly one wallet-approval popup regardless of how many page boundaries
    // the quantity crosses — atomic, consistent, and simple for the user.
    const MAX_SEND_ATTEMPTS = 3;
    let txSignature!: string;

    // Compute units: 400k per chunk instruction, capped at 1.2M (per-tx limit is 1.4M)
    const cuUnits = Math.min(chunks.length * 400_000, 1_200_000);

    // Build an Anchor instruction object for every chunk (these do NOT trigger wallet popups)
    const chunkInstructions = await Promise.all(
      chunks.map(async (chunk) => {
        const chunkPagePDA = deriveParticipantPagePDA(lotteryType, tier, chunk.pageNumber);
        const chunkFptPerTicket = computeFptPerTicket(tier, fptPerUsd6dec);
        const chunkMaxFptAmountBN = computeMaxFptAmount(chunkFptPerTicket, chunk.qty, 1000);
        // DPL/WPL/MPL now require lottery_type_id as the first arg for participant_page PDA derivation
        const lotteryTypeIdMap: Record<string, number> = { LPM: 0, DPL: 1, WPL: 2, MPL: 3 };
        const methodArgs = lotteryType === "LPM"
          ? [tier, chunk.qty, new BN(chunkFptPerTicket), new BN(chunkMaxFptAmountBN), chunk.pageNumber]
          : [lotteryTypeIdMap[lotteryType], tier, chunk.qty, new BN(chunkFptPerTicket), new BN(chunkMaxFptAmountBN), chunk.pageNumber];
        return (program.methods as any)
          [methodName](...methodArgs)
          .accountsStrict({
            buyer: wallet,
            fptMint: FPT_MINT,
            buyerTokenAccount: userFptAccount,
            lotteryVault: vaultPDA,
            vaultTokenAccount: vaultTokenAccount,
            participantPage: chunkPagePDA,
            registry: registryPDA,
            solVault: solVaultPDA,
            // Solana instructions sysvar — on-chain program reads the SB oracle
            // Ed25519 quote included by fetchManagedUpdateIxs for USD→FPT pricing.
            instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .instruction();
      })
    );

    // ── Switchboard On-Demand oracle price update instructions ─────────────
    // Oracle update instructions are intentionally disabled for initial testing.
    // When included, the Switchboard Ed25519 oracle quote can be stale (>30 slots)
    // by the time Phantom runs its internal pre-approval simulation, causing a
    // StalePriceFeed error that surfaces as "Transaction simulation failed".
    // The on-chain program already handles the no-oracle case gracefully:
    //   msg!("[Fortress] No SB oracle quote — accepting client-provided rate (mainnet fallback)")
    // FPT pricing is still computed from the live Crossbar SOL/USD feed above.

    // Collect all instructions for the batch transaction.
    // Using VersionedTransaction (v0 message) instead of legacy Transaction so that
    // Phantom's preview simulation can correctly resolve Token-2022 balance changes
    // and show the FPT deduction to the user instead of "no balance changes found".
    // Layout: [computeUnitLimit][computeUnitPrice][lazyResetIx?][chunkInstructions…]
    const allInstructions: TransactionInstruction[] = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: lazyResetIx ? Math.min(cuUnits + 100_000, 1_400_000) : Math.min(cuUnits, 1_400_000) }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }),
      ...(lazyResetIx ? [lazyResetIx] : []),
      ...chunkInstructions,
    ];


    const anchorProvider = program.provider as AnchorProvider;

    for (let attempt = 0; attempt < MAX_SEND_ATTEMPTS; attempt++) {
      try {
        // Fetch a fresh blockhash every attempt — required for VersionedTransaction
        // recompiles on retry and to avoid expiry race conditions.
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
        const message = new TransactionMessage({
          payerKey: wallet,
          recentBlockhash: blockhash,
          instructions: allInstructions,
        }).compileToV0Message();
        const versionedTx = new VersionedTransaction(message);

        if (sendTransactionFn) {
          // Use wallet signTransaction (pure crypto — cluster-independent) then submit via
          // our configured RPC connection. This avoids Phantom using its own RPC cluster
          // which would cause "invalid account" errors if clusters mismatch.
          const signedTx = await anchorProvider.wallet.signTransaction(versionedTx);
          txSignature = await connection.sendRawTransaction(signedTx.serialize(), {
            skipPreflight: true,
            maxRetries: 3,
          });
          const confirmResult = await connection.confirmTransaction(
            { signature: txSignature, blockhash, lastValidBlockHeight },
            'confirmed',
          );
          if (confirmResult.value.err) {
            const errDetail = JSON.stringify(confirmResult.value.err);
            throw new Error(`Transaction failed on-chain: ${errDetail}. Please retry.`);
          }
        } else {
          // Fallback (no wallet fn, e.g. server-side keypair): send raw with skipPreflight.
          txSignature = await connection.sendRawTransaction(versionedTx.serialize(), {
            skipPreflight: true,
            maxRetries: 3,
          });
          const confirmResult = await connection.confirmTransaction(
            { signature: txSignature, blockhash, lastValidBlockHeight },
            'confirmed',
          );
          if (confirmResult.value.err) {
            throw new Error(`Transaction failed on-chain: ${JSON.stringify(confirmResult.value.err)}`);
          }
        }
        break;

      } catch (sendErr: any) {
        const errMsg = sendErr?.message || String(sendErr);
        const isExpiry = /expired|Blockhash not found/i.test(errMsg);

        if (!isExpiry) throw sendErr;

        // Double-spend guard: check if the tx already landed before retrying
        const maybeSig: string | undefined =
          sendErr?.signature ??
          sendErr?.transactionSignature ??
          sendErr?.txSignature;

        if (maybeSig) {
          try {
            const [status] = (await connection.getSignatureStatuses([maybeSig])).value;
            if (
              status &&
              !status.err &&
              (status.confirmationStatus === "confirmed" ||
               status.confirmationStatus === "finalized")
            ) {
              txSignature = maybeSig;
              break;
            }
            if (status?.err) {
              console.warn(`[BuyTicket] Previous tx failed on-chain, safe to retry:`, status.err);
            } else {
            }
          } catch (statusErr) {
            console.warn(`[BuyTicket] Could not check sig status, will retry:`, statusErr);
          }
        }

        if (attempt === MAX_SEND_ATTEMPTS - 1) throw sendErr;

        console.warn(`[BuyTicket] Tx expired — retrying (${attempt + 1}/${MAX_SEND_ATTEMPTS - 1})...`);
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    const totalPurchased = quantity; // All chunks executed atomically in one TX

    // Store purchases in localStorage
    const actualFptAmount = formatFPT(totalRequiredFptBN);
    try {
      const purchases = JSON.parse(
        localStorage.getItem("lottery_purchases") || "[]",
      );
      // Store each ticket individually for accurate tracking
      for (let i = 0; i < totalPurchased; i++) {
        purchases.push({
          lotteryType,
          tier,
          participantId: participantId + i,
          timestamp: Date.now(),
          txSignature,
          batchNumber: i + 1,
          totalInBatch: totalPurchased,
        });
      }
      localStorage.setItem("lottery_purchases", JSON.stringify(purchases));
      saveParticipant(lotteryType, tier, wallet, txSignature, totalPurchased);
    } catch (e) {
      console.warn("Failed to store purchase:", e);
    }

    return {
      transactionSignature: txSignature,
      tier,
      participantId,
      quantity: totalPurchased,
      requestedQuantity: quantity,
      remainingToPurchase: 0,
      totalCost: parseFloat(actualFptAmount),
      success: true,
      wasReset: lazyResetIx !== null,
      message: lazyResetIx !== null
        ? `Round reset & ${totalPurchased} ticket(s) purchased in one transaction!`
        : `Successfully purchased ${totalPurchased} ticket(s)!`,
    };
  } catch (error: any) {
    console.error("❌ Transaction failed:", error);
    console.error("Error name:", error?.name);
    console.error("Error message:", error?.message);
    console.error("Error code:", error?.code);
    console.error("Error logs:", error?.logs);
    console.error("Full error object:", JSON.stringify(error, null, 2));

    // Enhanced error handling for new bulk buy constraints and priority tips
    // Extract a readable message — Anchor errors may not have a plain .message
    const errorMsg: string =
      (typeof error?.message === "string" && error.message)
      || error?.error?.errorMessage
      || error?.logs?.find?.((l: string) => /Error|failed/i.test(l))
      || (typeof error === "string" ? error : JSON.stringify(error))
      || "Unknown error";

    if (error.message?.includes("Insufficient FPT balance")) {
      throw error; // Re-throw our custom balance check error
    } else if (errorMsg.includes("InsufficientFptBalance") || errorMsg.includes("0x1")) {
      // Custom error from program OR generic insufficient funds
      const estimatedFpt = (tier * 3 * quantity).toFixed(2);
      throw new Error(
        `❌ Insufficient FPT Balance\\n\\nYou need approximately ${estimatedFpt} FPT to purchase ${quantity} ticket(s).\\n\\nPlease acquire FPT tokens first. FPT is a Token-2022 token.`
      );
    // Remove InsufficientTreasuryBalance error handling
    } else if (errorMsg.includes("InvalidQuantity")) {
      throw new Error(
        "❌ Invalid Quantity\\n\\nQuantity must be between 1 and 50 tickets per transaction."
      );
    } else if (errorMsg.includes("PageFull")) {
      throw new Error(
        "❌ Page Full\\n\\nThe current participant page is full. Try purchasing fewer tickets or wait for the next draw."
      );
    } else if (errorMsg.includes("LpmCapacityExceeded")) {
      throw new Error(
        "❌ LPM Full\\n\\nThis LPM tier has reached maximum capacity (100 participants).\\n\\nPlease wait for the draw or try another tier."
      );
    } else if (errorMsg.includes("insufficient lamports") || errorMsg.includes("Attempt to debit")) {
      throw new Error(
        "❌ Insufficient SOL\\n\\nYou need ~0.00005 SOL for the network transaction fee.\\n\\nPlease add some SOL to your wallet."
      );
    } else if (errorMsg.toLowerCase().includes("invalid account") || errorMsg.includes("AccountNotFound") || errorMsg.includes("account not found")) {
      throw new Error(
        "❌ Account Error\\n\\nYour wallet account was not found on Solana Mainnet.\\n\\nPossible fixes:\\n1. Make sure Phantom is set to Mainnet-Beta (Settings → Developer Settings)\\n2. Ensure you have SOL in your mainnet wallet\\n3. Reconnect your wallet and try again."
      );
    } else if (errorMsg.includes("Could not find your FPT token account")) {
      throw error; // Re-throw FPT account errors
    } else if (errorMsg.includes("User rejected") || errorMsg.includes("User cancelled")) {
      throw new Error("Transaction cancelled by user");
    } else if (errorMsg.includes("Blockhash not found") || errorMsg.includes("expired")) {
      throw new Error(
        "❌ Transaction Expired\\n\\nThe transaction took too long. Please try again.\\n\\nTip: Make sure your internet connection is stable."
      );
    } else if (errorMsg.includes("simulation failed") || errorMsg.includes("reverted")) {
      // Generic simulation failure - provide detailed help
      throw new Error(
        `❌ Transaction Simulation Failed\\n\\nPossible causes:\\n1. Insufficient FPT balance (need ~${(tier * 3 * quantity).toFixed(2)} FPT)\\n2. FPT token account doesn't exist\\n3. Wallet not properly connected\\n4. Network congestion\\n\\nPlease check your FPT balance and try again.\\n\\nFPT Mint: ${FPT_MINT_STRING.slice(0, 8)}...`
      );
    }

    throw new Error(
      errorMsg || "Failed to purchase tickets. Please try again.",
    );
  }
}

/**
 * [ZERO-COST SILENT RESET]
 * When a DPL/WPL/MPL vault expires with 0 participants, buy_ticket returns
 * LotteryError::LotteryEnded — nobody can buy until the vault is reset.
 * The FIRST TICKET BUYER signs and pays the reset tx (~0.000005 SOL) automatically 
 * as part of their purchase flow.
 * This function is called transparently before the buy_ticket tx.
 *
 * On-chain: draw_Xpl_winner returns early when participant_count == 0:
 *   vault.end_time = current_time + DURATION;  // extends by one cycle
 *   return Ok(());                              // before winner check, before FPT
 * No FPT is transferred — only the vault's end_time is updated.
 */
async function triggerSilentResetBeforeBuy(
  program: Program,
  wallet: PublicKey,
  lotteryType: string,
  tier: number,
  vaultPDA: PublicKey,
  userFptAta: PublicKey,
): Promise<void> {
  if (lotteryType === "LPM") return; // LPM has no time-based expiry silent-reset path

  const programId = new PublicKey(PROGRAM_ID);

  // Derive all required accounts
  const [solVaultPDA] = PublicKey.findProgramAddressSync([Buffer.from("sol_vault")], programId);
  const [treasuryPDA] = PublicKey.findProgramAddressSync([Buffer.from("treasury")],  programId);
  const [registryPDA] = PublicKey.findProgramAddressSync([Buffer.from("global_registry")], programId);

  // page 0 PDA — used as both participant_page_0 and winning_participant_page (ignored on early-return)
  const lotteryTypeMap: Record<string, number> = { LPM: 0, DPL: 1, WPL: 2, MPL: 3 };
  const typeNum = lotteryTypeMap[lotteryType];
  const typeBuffer = Buffer.alloc(4); typeBuffer.writeUInt32LE(typeNum, 0);
  const tierBuffer = Buffer.alloc(4); tierBuffer.writeUInt32LE(tier, 0);
  const pageBuffer = Buffer.alloc(4); pageBuffer.writeUInt32LE(0, 0);
  const [page0PDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("page"), typeBuffer, tierBuffer, pageBuffer],
    programId,
  );

  const FPT_MINT_PK       = new PublicKey("3YTnzmFTECtyKDxaghWPQcjzX7g1Cj3NxMq41JdWk2rj");
  const TOKEN22           = TOKEN_2022_PROGRAM_ID;
  const ASSOC_TOKEN       = ASSOCIATED_TOKEN_PROGRAM_ID;

  const vaultTokenAccount = getAssociatedTokenAddressSync(FPT_MINT_PK, vaultPDA,   true,  TOKEN22);
  const treasuryFptAta    = getAssociatedTokenAddressSync(FPT_MINT_PK, solVaultPDA, true,  TOKEN22);

  // Use lazy_reset_vault to reset an expired empty vault (replaces the old draw-based silent reset)
  const lotteryTypeMap2: Record<string, number> = { LPM: 0, DPL: 1, WPL: 2, MPL: 3 };
  const typeNum2 = lotteryTypeMap2[lotteryType];
  if (typeNum2 === undefined) return;

  const [solVaultPDA2] = PublicKey.findProgramAddressSync([Buffer.from("sol_vault")], programId);


  const tx = await (program.methods as any).lazyResetVault(typeNum2, tier)
    .accountsStrict({
      user:          wallet,
      treasury:      solVaultPDA2,
      lotteryVault:  vaultPDA,
      systemProgram: SystemProgram.programId,
    })
    .rpc({ commitment: "confirmed" });

}

/**
 * Helper: Derive vault PDA for a lottery type and tier
 * Seeds: [b"vault_{type}", &[tier]]
 * Uses 1-byte encoding to match buy_ticket instruction
 */
function deriveVaultPDA(lotteryType: string, tier: number): PublicKey {
  const seedPrefix = {
    LPM: "vault_lpm",
    DPL: "vault_dpl",
    WPL: "vault_wpl",
    MPL: "vault_mpl",
  }[lotteryType];

  if (!seedPrefix) throw new Error(`Unknown lottery type: ${lotteryType}`);

  // Use 1-byte encoding to match program's buy_ticket instruction
  // seeds = [b"vault_lpm", &[tier]] - single byte for tier
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from(seedPrefix), Buffer.from([tier])],
    new PublicKey(PROGRAM_ID),
  );

  return pda;
}

/**
 * Helper: Derive participant page PDA
 * Seeds: [b"page", lottery_type_u32, tier_u32, page_number_u32]
 */
/**
 * Helper: Derive participant page PDA
 * Seeds: [b"page", lottery_type_u32, tier_u32, page_number_u32]
 */
function deriveParticipantPagePDA(
  lotteryType: string,
  tier: number,
  pageNumber: number,
): PublicKey {
  const lotteryTypeMap = { LPM: 0, DPL: 1, WPL: 2, MPL: 3 };
  const typeNum = lotteryTypeMap[lotteryType as keyof typeof lotteryTypeMap];

  if (typeNum === undefined)
    throw new Error(`Unknown lottery type: ${lotteryType}`);

  const typeBuffer = Buffer.alloc(4);
  typeBuffer.writeUInt32LE(typeNum, 0);
  const tierBuffer = Buffer.alloc(4);
  tierBuffer.writeUInt32LE(tier, 0);
  const pageBuffer = Buffer.alloc(4);
  pageBuffer.writeUInt32LE(pageNumber, 0);

  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("page"), typeBuffer, tierBuffer, pageBuffer],
    new PublicKey(PROGRAM_ID),
  );

  return pda;
}

/**
 * Helper: Derive registry PDA
 * Seeds: [b"global_registry"]
 */
function deriveRegistryPDA(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("global_registry")],
    new PublicKey(PROGRAM_ID),
  );

  return pda;
}

/**
 * Buy multiple tickets with auto-batching for quantities > 50
 * Splits large orders into batches of 50 transactions
 */
export async function buyTicketsWithAutoBatch(
  program: Program | null,
  lotteryType: string,
  tier: number,
  participantId: number,
  quantity: number,
) {

  if (quantity <= 50) {
    // Single transaction
    return buyTicketWithProgram(
      program,
      lotteryType,
      tier,
      participantId,
      quantity,
    );
  }

  // Auto-batch for quantities > 50
  const batchSize = 50;
  const numBatches = Math.ceil(quantity / batchSize);
  const results = [];


  for (let i = 0; i < numBatches; i++) {
    const batchQuantity = Math.min(batchSize, quantity - i * batchSize);

    try {
      const result = await buyTicketWithProgram(
        program,
        lotteryType,
        tier,
        participantId + i * batchSize,
        batchQuantity,
      );
      results.push(result);

      // Add small delay between batches to avoid rate limiting
      if (i < numBatches - 1) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    } catch (error) {
      console.error(`❌ Batch ${i + 1} failed:`, error);
      throw new Error(
        `Failed at batch ${i + 1} of ${numBatches}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  return {
    success: true,
    totalQuantity: quantity,
    numBatches: numBatches,
    batches: results,
    message: `Successfully purchased ${quantity} tickets in ${numBatches} transaction(s)!`,
  };
}

// Helper to derive vault PDA for a lottery type and tier
function getVaultPDA(programId: PublicKey, lotteryType: string, tier: number): [PublicKey, number] {
  const vaultPrefix = `vault_${lotteryType.toLowerCase()}`;
  return PublicKey.findProgramAddressSync(
    [Buffer.from(vaultPrefix), Buffer.from([tier])],
    programId
  );
}

/**
 * Helper to derive registry PDA
 */
function getRegistryPDA(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("global_registry")],
    programId
  );
}

/**
 * Helper to derive participant page PDA
 */
function getParticipantPagePDA(programId: PublicKey, lotteryType: string, tier: number, pageNumber: number): [PublicKey, number] {
  const lotteryTypeIndices: Record<string, number> = {
    "LPM": 0,
    "DPL": 1,
    "WPL": 2,
    "MPL": 3
  };
  
  const typeIndex = lotteryTypeIndices[lotteryType.toUpperCase()] ?? 0;
  
  const typeBytes = Buffer.alloc(4);
  typeBytes.writeUInt32LE(typeIndex, 0);
  
  const tierBytes = Buffer.alloc(4);
  tierBytes.writeUInt32LE(tier, 0);
  
  const pageNumBytes = Buffer.alloc(4);
  pageNumBytes.writeUInt32LE(pageNumber, 0);
  
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("page"),
      typeBytes,
      tierBytes,
      pageNumBytes
    ],
    programId
  );
}

/**
 * Helper to read participants from a participant page account
 */
async function readParticipantsFromPage(connection: Connection, pagePDA: PublicKey): Promise<PublicKey[]> {
  try {
    const accountInfo = await connection.getAccountInfo(pagePDA);
    if (!accountInfo) return [];
    
    const data = accountInfo.data;
    // Skip discriminator (8) + lottery_type (1) + tier (1) + page_number (4) = 14 bytes
    if (data.length < 18) return [];
    
    const vecLen = data.readUInt32LE(14);
    const participants: PublicKey[] = [];
    let offset = 18;
    
    for (let i = 0; i < vecLen && offset + 32 <= data.length; i++) {
      const pubkeyBytes = data.slice(offset, offset + 32);
      participants.push(new PublicKey(pubkeyBytes));
      offset += 32;
    }
    
    return participants;
  } catch (e) {
    console.error("Failed to read participants from page:", e);
    return [];
  }
}

/**
 * Resolve a lottery round with real blockchain transaction
 */
export async function resolveLotteryRound(
  program: Program,
  lotteryType: string,
  tier?: number, // Optional: resolve specific tier, or all tiers if not provided
  sendTransactionFn?: (tx: Transaction, connection: Connection, opts?: { skipPreflight?: boolean; maxRetries?: number }) => Promise<string>,
) {
  if (!program) {
    throw new Error("Program not initialized");
  }

  try {
    // Validate inputs
    if (!LOTTERY_TYPES.includes(lotteryType as any)) {
      throw new Error(`Invalid lottery type: ${lotteryType}`);
    }

    const allTiers = lotteryType === "LPM" ? [5, 10, 20, 50] : [5, 10, 15, 20];
    const tiersToProcess = tier ? [tier] : allTiers;
    const results = [];
    const connection = program.provider.connection;
    const FPT_MINT_LOCAL = new PublicKey(FPT_MINT_STRING);

    // Process each tier
    for (const currentTier of tiersToProcess) {

      try {
        // 1. Get vault PDA and fetch vault data
        const [vaultPDA] = getVaultPDA(program.programId, lotteryType, currentTier);
        
        const vault = await (program.account as any).lotteryVault.fetch(vaultPDA);
        
        const participantCount = typeof vault.participantCount === 'object' && vault.participantCount.toNumber 
          ? vault.participantCount.toNumber() 
          : (vault.participantCount || 0);

        // Capture round number BEFORE the draw — this is the round being drawn (0, 1, 2 ...)
        const currentRound = typeof vault.roundNumber === 'object' && vault.roundNumber?.toNumber
          ? vault.roundNumber.toNumber()
          : (vault.roundNumber || 0);
        
        
        // Get is_drawn flag for all lottery types
        const isDrawn = vault.isDrawn === true || vault.is_drawn === true;
        
        // For LPM: Check participant_count == 100
        // We don't check isDrawn here because if it's true but still has 100 participants,
        // it means the previous draw failed and we should retry it.
        if (lotteryType === "LPM") {
          if (participantCount !== 100) {
            continue;
          }
          
          // LPM is ready to draw when participant_count == 100
        } else {
          // - Check is_drawn flag (must be false)
          // - Require end_time to have passed
          // - Require at least 1 participant (UNLIMITED - no max)
          if (isDrawn) {
            continue;
          }
          
          const endTime = typeof vault.endTime === 'object' && vault.endTime.toNumber 
            ? vault.endTime.toNumber() 
            : (vault.end_time?.toNumber?.() || vault.endTime || vault.end_time || 0);
          
          // Use Solana-adjusted time (same clock as the UI countdown timer) to avoid
          // skipping a legitimately expired tier due to local vs on-chain clock drift.
          const adjustedNow = Math.floor(useTimeOffsetStore.getState().getAdjustedNow());
          
          if (adjustedNow < endTime) {
            continue;
          }
          
          // [SPEC] Allow 0-participant tiers to reach the on-chain instruction, which auto-extends the period
          // Do NOT skip — on-chain handles it
        }

        // 2. Calculate the actual winner by reading participant pages and simulating the random selection
        // The on-chain program uses Clock::get().slot to derive the random index
        const [page0PDA] = getParticipantPagePDA(program.programId, lotteryType, currentTier, 0);
        const [page1PDA] = getParticipantPagePDA(program.programId, lotteryType, currentTier, 1);
        
        // Read participants from pages
        const page0Participants = await readParticipantsFromPage(connection, page0PDA);
        const page1Participants = await readParticipantsFromPage(connection, page1PDA);
        const allParticipants = [...page0Participants, ...page1Participants];
        
        // Use vault's on-chain participantCount as the authoritative source for isAutoExtend.
        // Participant page accounts are NOT cleared by reset_vault_after_draw — old-round entries
        // remain in the page data after a reset. Using allParticipants.length would incorrectly
        // report > 0 participants for a freshly-reset vault, causing simulation to fail because
        // on-chain the draw takes the auto-extend path (participant_count == 0).
        const isAutoExtend = participantCount === 0 && lotteryType !== 'LPM';
        let winnerPubkey: PublicKey = program.provider.publicKey!;
        let winningPagePDA: PublicKey = page0PDA;

        if (participantCount === 0 && lotteryType !== 'LPM') {
          // Dummy winner: on-chain will auto-extend and return Ok without touching these accounts
          winnerPubkey = program.provider.publicKey!;
          winningPagePDA = page0PDA;
        } else if (allParticipants.length === 0) {
          continue;
        }
        // else: winner discovered by findWinnerBySimulation inside the retry loop below

        // 3. Get all required accounts
        const vaultTokenAccount = await getAssociatedTokenAddress(
          FPT_MINT_LOCAL,
          vaultPDA,
          true, // allowOwnerOffCurve — vault is a PDA
          TOKEN_2022_PROGRAM_ID
        );

        const winnerAta = getAssociatedTokenAddressSync(
          FPT_MINT_LOCAL,
          winnerPubkey,
          false,
          TOKEN_2022_PROGRAM_ID
        );

        // NOTE: winner_ata is UncheckedAccount on-chain — the program creates it via CPI
        // in verify_and_create_winner_ata() if it doesn't exist. No client-side pre-creation needed.

        // 4. Invariant accounts (same regardless of winner)
        const [configPDA] = PublicKey.findProgramAddressSync(
          [Buffer.from("global_registry")],
          program.programId
        );
        const [treasuryVaultPDA] = PublicKey.findProgramAddressSync(
          [Buffer.from("sol_vault")],
          program.programId
        );
        const [treasuryDataPDA] = PublicKey.findProgramAddressSync(
          [Buffer.from("treasury")],
          program.programId
        );
        const treasuryFptAta = getAssociatedTokenAddressSync(
          FPT_MINT_LOCAL, treasuryVaultPDA, true, TOKEN_2022_PROGRAM_ID
        );

        const drawMethods: Record<string, string> = {
          "LPM": "executeDrawLpm",
          "DPL": "executeDrawDpl",
          "WPL": "executeDrawWpl",
          "MPL": "executeDrawMpl",
        };
        const methodName = drawMethods[lotteryType];

        const callerPubkey = program.provider.publicKey!;
        const callerAta = getAssociatedTokenAddressSync(
          FPT_MINT_LOCAL, callerPubkey, false, TOKEN_2022_PROGRAM_ID
        );

        // WinnerHistory PDA — on-chain ring buffer of past draw results per (type, tier)
        const LOTTERY_TYPE_INDEX: Record<string, number> = { LPM: 0, DPL: 1, WPL: 2, MPL: 3 };
        const [winnerHistoryPDA] = PublicKey.findProgramAddressSync(
          [
            Buffer.from("winner_history"),
            Buffer.from([LOTTERY_TYPE_INDEX[lotteryType] ?? 0]),
            Buffer.from([currentTier]),
          ],
          program.programId
        );

        // Pre-init instructions no longer needed — WinnerHistory and Treasury FPT ATA
        // are initialized during fresh deployment (run init-fresh.ts).
        const preInitInstructions: any[] = [];

        // Helper to build full account set for any winner candidate
        const buildDrawAccounts = (winner: PublicKey, wAta: PublicKey, wPage: PublicKey) => ({
          authority: callerPubkey,
          fptMint: FPT_MINT_LOCAL,
          lotteryState: vaultPDA,
          vaultTokenAccount,
          winner,
          winnerAta: wAta,
          treasuryVault: treasuryVaultPDA,
          treasury: treasuryDataPDA,
          treasuryFptAta,
          authorityAta: callerAta,
          participantPage0: page0PDA,
          winningParticipantPage: wPage,
          config: configPDA,
          winnerHistory: winnerHistoryPDA,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        });

        // Candidate list for simulation-based winner discovery
        const drawCandidates = isAutoExtend ? [] : [
          ...page0Participants.map((p: PublicKey) => ({ pubkey: p, page: page0PDA })),
          ...page1Participants.map((p: PublicKey) => ({ pubkey: p, page: page1PDA })),
        ];

        // ── Client-side entropy prediction (mirrors draw_helpers.rs Clock-only path) ──
        const _MASK64 = BigInt("0xffffffffffffffff");
        const _K1 = BigInt("0x9e3779b97f4a7c15");
        const _K2 = BigInt("0x517cc1b727220a95");
        const _rotL64 = (x: bigint, n: bigint) => ((x << n) | (x >> (BigInt(64) - n))) & _MASK64;
        const _mul64  = (a: bigint, b: bigint)  => (a * b) & _MASK64;
        const _add64  = (a: bigint, b: bigint)  => (a + b) & _MASK64;
        const _curSlot = await connection.getSlot("processed");
        const _slotBI = BigInt(_curSlot);
        const _ts = BigInt(Math.floor(Date.now() / 1000));
        const _LOTTERY_TYPE_U8: Record<string,bigint> = { LPM:BigInt(0), DPL:BigInt(1), WPL:BigInt(2), MPL:BigInt(3) };
        const _vaultSeed = (
          ((_LOTTERY_TYPE_U8[lotteryType] ?? BigInt(0)) << BigInt(56)) |
          (BigInt(currentTier) << BigInt(48)) |
          BigInt(currentRound)
        ) & _MASK64;
        const _h1 = _rotL64(_mul64(_slotBI, _K1), BigInt(32));
        const _h2 = _rotL64(_mul64(_ts, _K2), BigInt(27));
        const _h3 = _mul64(_slotBI, _add64(_K1, _K2));
        const _entropyBI = (_h1 ^ _h2 ^ _h3 ^ _vaultSeed) & _MASK64;
        const _modBase = BigInt(allParticipants.length || 100);
        const _predictedIdx = drawCandidates.length > 0 ? Number(_entropyBI % _modBase) : -1;
        const _predictedCandidate = _predictedIdx >= 0 ? (drawCandidates[_predictedIdx] ?? null) : null;

        // Simulation preInstructions — ATAs are created on-chain by the program
        // with treasury paying, so no client-side ATA creation needed.
        const simPreIx = [
          ComputeBudgetProgram.setComputeUnitLimit({ units: 800_000 }),
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }),
          ...preInitInstructions,
        ];

        // Helper: simulate ONE candidate and return true if simulation passes.
        const simOneCandidate = async (candidate: { pubkey: PublicKey; page: PublicKey }): Promise<boolean> => {
          const cAta = getAssociatedTokenAddressSync(FPT_MINT_LOCAL, candidate.pubkey, false, TOKEN_2022_PROGRAM_ID);
          try {
            await (program.methods as any)[methodName](currentTier)
              .accountsStrict(buildDrawAccounts(candidate.pubkey, cAta, candidate.page))
              .preInstructions(simPreIx)
              .simulate();
            return true;
          } catch {
            return false;
          }
        };

        // Helper: fall back to scanning every candidate (safety net for clock-drift edge cases).
        const findWinnerSequential = async (): Promise<{ pubkey: PublicKey; page: PublicKey } | null> => {
          for (const candidate of drawCandidates) {
            if (await simOneCandidate(candidate)) return candidate;
          }
          return null;
        };

        // Main finder: try the predicted index first (O(1)), then fall back to sequential (O(N)).
        const findWinnerBySimulation = async (): Promise<{ pubkey: PublicKey; page: PublicKey } | null> => {
          if (_predictedCandidate) {
            if (await simOneCandidate(_predictedCandidate)) {
              return _predictedCandidate;
            }
            console.warn(`[SIM] Fast-path missed (slot drifted?) — falling back to sequential scan`);
          }
          return findWinnerSequential();
        };

        // 5. Find winner + send TX, retrying up to 5x on slot-drift failures.
        const MAX_DRAW_ATTEMPTS = 5;
        let txSignature = "";

        for (let attempt = 1; attempt <= MAX_DRAW_ATTEMPTS; attempt++) {
          // Auto-extend: 0 participants (DPL/WPL/MPL only) — skip simulation entirely.
          // winnerPubkey/winningPagePDA are already set to the caller above as a dummy winner;
          // on-chain returns early after extending the period. No need to discover a real winner.
          if (!isAutoExtend) {
            // Re-discover winner via simulation on every attempt (handles slot drift)
            const winner = await findWinnerBySimulation();

            if (!winner) {
              console.warn(`⚠️ Attempt ${attempt}: no candidate passed simulation (slot boundary). Retrying...`);
              if (attempt === MAX_DRAW_ATTEMPTS) {
                throw new Error(`Could not determine winner for ${lotteryType} Tier $${currentTier} after ${MAX_DRAW_ATTEMPTS} attempts`);
              }
              await new Promise(r => setTimeout(r, 400)); // wait one slot
              continue;
            }

            winnerPubkey   = winner.pubkey;
            winningPagePDA = winner.page;
          }

          const currentWinnerAta = getAssociatedTokenAddressSync(FPT_MINT_LOCAL, winnerPubkey, false, TOKEN_2022_PROGRAM_ID);
          const allAccounts = buildDrawAccounts(winnerPubkey, currentWinnerAta, winningPagePDA);

          try {

            // Caller ATA and winner ATA are created on-chain by the program via treasury CPI.
            // No pre-instructions needed — using caller as payer here would cause Phantom to
            // show extra SOL being deducted from the user's wallet (even if ATA already exists
            // the idempotent instruction is included in simulation).
            const ataPreInstructions: any[] = [];

            const allPreInstructions = [
              // 800k CU covers: optional inits + ATA creates + 2× Token-2022 transfers + entropy + reward
              ComputeBudgetProgram.setComputeUnitLimit({ units: 800_000 }),
              ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }),
              ...preInitInstructions, // initTreasuryFptAta / initWinnerHistory if first-ever draw
              ...ataPreInstructions,  // idempotent ATA creation for caller + winner
            ];

            if (sendTransactionFn) {
              const drawTx = await (program.methods as any)[methodName](currentTier)
                .accountsStrict(allAccounts)
                .preInstructions(allPreInstructions)
                .transaction();
              const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
              drawTx.recentBlockhash = blockhash;
              drawTx.feePayer = callerPubkey;
              txSignature = await sendTransactionFn(drawTx, connection, {
                skipPreflight: true,
                maxRetries: 3,
              });
              await connection.confirmTransaction({ signature: txSignature, blockhash, lastValidBlockHeight }, 'confirmed');
            } else {
              // Fallback: use Anchor's .rpc() — relies on provider.sendAndConfirm
              txSignature = await (program.methods as any)[methodName](currentTier)
                .accountsStrict(allAccounts)
                .preInstructions(allPreInstructions)
                .rpc({ skipPreflight: true, commitment: "confirmed" });
            }
            // After first successful draw, preInitInstructions will be empty on retry attempts too
            preInitInstructions.length = 0;
            break; // ── Success ──
          } catch (sendErr: any) {
            const msg: string = sendErr?.message || sendErr?.toString() || "unknown";
            console.warn(`⚠️ Send failed on attempt ${attempt}: ${msg.slice(0, 120)}`);
            // User rejected / cancelled — stop immediately, do not retry
            const isUserCancel = /user rejected|user cancelled|cancelled by user|transaction rejected/i.test(msg);
            if (isUserCancel) {
              if (!sendErr.message) sendErr.message = msg;
              throw sendErr;
            }
            if (attempt === MAX_DRAW_ATTEMPTS) {
              if (!sendErr.message) sendErr.message = msg;
              throw sendErr;
            }
            // Any send failure may be slot drift — re-simulate on next attempt
            await new Promise(r => setTimeout(r, 200));
          }
        }

        // 6. Handle result based on whether this was an auto-extend (0 participants) or a real draw
        if (isAutoExtend) {
          // Return early with extension message — no winner to record
          return {
            transactionSignature: txSignature,
            lotteryType,
            tiers: [],
            success: true,
            message: `${lotteryType} Tier $${currentTier} had no participants — period auto-extended by one cycle`,
            winnerData: undefined,
          };
        }

        // Real draw: fetch updated vault to get prize info
        const updatedVault = await (program.account as any).lotteryVault.fetch(vaultPDA);
        const prize = typeof vault.balance === 'object' && vault.balance.toNumber
          ? vault.balance.toNumber() / 1_000_000 * 0.95 // 95% to winner
          : 0;

        results.push({
          tier: currentTier,
          winner: winnerPubkey.toString(),
          prize: prize,
          participants: participantCount,
          txSignature: txSignature,
        });


        // Save winner to history for "Last 10 Winners" display
        saveWinnerToHistory({
          wallet: winnerPubkey.toString(),
          lotteryType: lotteryType,
          tier: currentTier,
          prize: prize,
          roundNumber: currentRound,
          timestamp: Date.now(),
          txSignature: txSignature,
        });

        // Also write directly to fortress_winners_cache so transparency page sees it immediately
        try {
          if (typeof window !== 'undefined') {
            const CACHE_KEY = 'fortress_winners_cache';
            const existing: any[] = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
            const newEntry = {
              winner: winnerPubkey.toString(),
              lotteryType,
              tier: currentTier,
              roundNumber: currentRound,
              blockTime: Math.floor(Date.now() / 1000),
              signature: txSignature,
            };
            const dedupKey = `${lotteryType}-${currentTier}-${currentRound}`;
            const filtered = existing.filter((e: any) =>
              `${e.lotteryType}-${e.tier}-${e.roundNumber ?? 0}` !== dedupKey
            );
            localStorage.setItem(CACHE_KEY, JSON.stringify([newEntry, ...filtered].slice(0, 20)));
          }
        } catch { /* localStorage may be unavailable */ }

        // Reset localStorage for this tier
        resetLotteryTier(lotteryType, currentTier);

      } catch (tierError: any) {
        console.error(`❌ Failed to resolve ${lotteryType} Tier $${currentTier}:`, tierError);
        console.error(`   Error message: ${tierError.message}`);
        console.error(`   Error code: ${tierError.code}`);
        if (tierError.logs) {
          console.error(`   Program logs (last 10):`);
          tierError.logs.slice(-10).forEach((log: string) => console.error(`     ${log}`));
        }
        
        // If we were trying to draw a specific tier and it failed, throw the error
        // so the caller knows something went wrong (not just "not ready")
        if (tier) {
          // Check if user rejected the transaction
          const errorMsg = tierError.message || '';
          if (errorMsg.includes('User rejected') || errorMsg.includes('rejected the request')) {
            throw new Error('Transaction cancelled by user');
          }
          // Propagate the real error so users and devs see what actually failed
          const errDisplay = tierError?.message || tierError?.error?.message || tierError?.toString() || "unknown error";
          throw new Error(`Draw failed for ${lotteryType} Tier $${currentTier}: ${errDisplay}`);
        }
        // Continue to next tier if processing all tiers
      }
    }

    if (results.length === 0) {
      // No tiers were ready to draw - provide more context
      
      // If a specific tier was requested but nothing was drawn, it means 
      // either it wasn't at 100 participants or an error occurred
      const message = tier
        ? lotteryType === 'LPM'
          ? `LPM Tier $${tier} is not ready for draw. It needs exactly 100 participants.`
          : `${lotteryType} Tier $${tier}: the draw timer has not expired yet, or this round was already drawn. Check the countdown and try again.`
        : `No ${lotteryType} tiers are ready for draw yet.`;
      
      return {
        transactionSignature: "",
        lotteryType,
        tiers: [],
        success: false,
        message,
        winnerData: null,
      };
    }

    return {
      transactionSignature: results[0].txSignature,
      lotteryType,
      tiers: results,
      success: true,
      message: `Successfully resolved ${results.length} tier(s) for ${lotteryType}`,
      winnerData: results.length > 0 ? {
        wallet: results[0].winner,
        tier: results[0].tier,
        prize: results[0].prize,
        lotteryType: lotteryType,
      } : null,
    };
  } catch (error) {
    console.error("Failed to resolve lottery round:", error);
    throw error;
  }
}

/**
 * Reset a specific lottery tier after winner is drawn
 */
export function resetLotteryTier(lotteryType: string, tier: number) {
  try {

    // Clear participants for this tier
    const participantsKey = `${lotteryType}-tier-${tier}-participants`;
    localStorage.removeItem(participantsKey);

    // Clear purchases for this tier
    const purchases = JSON.parse(
      localStorage.getItem("lottery_purchases") || "[]",
    );
    const filteredPurchases = purchases.filter(
      (p: any) => !(p.lotteryType === lotteryType && p.tier === tier),
    );
    localStorage.setItem(
      "lottery_purchases",
      JSON.stringify(filteredPurchases),
    );

  } catch (error) {
    console.error(`Failed to reset ${lotteryType} Tier $${tier}:`, error);
  }
}

/**
 * Permissionless rollover for stuck DPL/WPL/MPL tiers.
 * Calls rollover_dpl_tier / rollover_wpl_tier / rollover_mpl_tier.
 * Anyone can call — no admin wallet required.
 */
export async function rolloverTier(
  program: Program,
  lotteryType: "DPL" | "WPL" | "MPL",
  tier: number
): Promise<string> {
  if (!program) throw new Error("Program not initialized");

  const rolloverMethods: Record<string, string> = {
    DPL: "rolloverDplTier",
    WPL: "rolloverWplTier",
    MPL: "rolloverMplTier",
  };

  const methodName = rolloverMethods[lotteryType];
  if (!methodName) throw new Error(`Rollover not supported for ${lotteryType}`);

  const prefix = `vault_${lotteryType.toLowerCase()}`;
  const [vaultPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from(prefix), Buffer.from([tier])],
    program.programId
  );


  const txSignature: string = await (program.methods as any)[methodName](tier)
    .accountsStrict({
      authority: program.provider.publicKey,
      lotteryVault: vaultPDA,
      systemProgram: SystemProgram.programId,
    })
    .rpc({ commitment: "confirmed" });

  return txSignature;
}

/**
 * Fetch registry data for the real-time feed
 */
export async function fetchRegistryData(program: Program) {
  if (!program) {
    throw new Error("Program not initialized");
  }

  try {
    const registryData = [];

    // Fetch data for each brand and tier combination
    for (const brand of BRANDS) {
      for (let pageNumber = 0; pageNumber < 3; pageNumber++) {
        const participants = Math.floor(Math.random() * 100);
        const progress = participants; // No cap, just show participant count

        registryData.push({
          tier: brand.id,
          pageNumber,
          participants,
          progress,
          status: "active",
          lastUpdated: new Date().toISOString(),
        });
      }
    }

    return registryData;
  } catch (error) {
    console.error("Failed to fetch registry data:", error);
    throw error;
  }
}

/**
 * Initialize all lottery accounts (global registry and tier vaults)
 * This should be called once after the program is deployed
 */
export async function initializeLotteryAccounts(
  program: Program,
): Promise<void> {
  if (!program) {
    throw new Error("Program not initialized");
  }

  try {

    // Derive Treasury PDA - pays for all initializations
    const treasuryPDA = PublicKey.findProgramAddressSync(
      [Buffer.from("treasury")],
      new PublicKey(PROGRAM_ID),
    )[0];

    // 1. Initialize Global Registry
    try {
      const [registryPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("global_registry")],
        new PublicKey(PROGRAM_ID),
      );

      const txSig = await (program.methods as any)
        .initializeGlobalRegistry()
        .accounts({
          admin: program.provider.publicKey,
          registry: registryPDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

    } catch (error: any) {
      if (error.message?.includes("already in use")) {
      } else {
        throw error;
      }
    }

    // 3. Initialize Treasury
    const [treasuryInitPDA] = PublicKey.findProgramAddressSync([Buffer.from("treasury")], new PublicKey(PROGRAM_ID));
    try {
      await (program.methods as any).initializeTreasury()
        .accounts({ admin: program.provider.publicKey, treasury: treasuryInitPDA, systemProgram: SystemProgram.programId })
        .rpc();
    } catch { /* treasury already initialized */ }

    // 4. Initialize Vault + WinnerHistory for each (type, tier)
    const LOTTERY_CONFIGS_INIT = [
      { id: 0, prefix: "vault_lpm", name: "LPM", tiers: [5, 10, 20, 50] },
      { id: 1, prefix: "vault_dpl", name: "DPL", tiers: [5, 10, 15, 20] },
      { id: 2, prefix: "vault_wpl", name: "WPL", tiers: [5, 10, 15, 20] },
      { id: 3, prefix: "vault_mpl", name: "MPL", tiers: [5, 10, 15, 20] },
    ];
    const lotteryTypes = LOTTERY_CONFIGS_INIT;

    for (const lottery of lotteryTypes) {
      for (const tier of lottery.tiers) {
        try {

          const vaultPDA = PublicKey.findProgramAddressSync(
            [Buffer.from(lottery.prefix), Buffer.from([tier])],
            new PublicKey(PROGRAM_ID),
          )[0];

          const [winnerHistoryPDA] = PublicKey.findProgramAddressSync(
            [Buffer.from("winner_history"), Buffer.from([lottery.id]), Buffer.from([tier])],
            new PublicKey(PROGRAM_ID),
          );

          const txSig = await (program.methods as any)
            .initializeVault(lottery.id, tier)
            .accounts({
              admin: program.provider.publicKey,
              lotteryVault: vaultPDA,
              winnerHistory: winnerHistoryPDA,
              systemProgram: SystemProgram.programId,
            })
            .rpc();

        } catch (error: any) {
          if (error.message?.includes("already in use")) {
          } else {
            console.warn(
              `⚠️ Failed to initialize ${lottery.name} tier ${tier}:`,
              error.message,
            );
          }
        }
      }
    }

  } catch (error) {
    console.error("❌ Lottery initialization error:", error);
    throw error;
  }
}

export function derivePendingDrawPDA(
  programId: PublicKey,
  lotteryTypeId: number,
  tier: number,
): PublicKey {
  const PENDING_DRAW_SEED = Buffer.from("pending_draw");
  const [pda] = PublicKey.findProgramAddressSync(
    [PENDING_DRAW_SEED, Buffer.from([lotteryTypeId]), Buffer.from([tier])],
    programId,
  );
  return pda;
}

// ─────────────────────────────────────────────────────────────────────────────
// VRF DRAW FUNCTIONS (Switchboard V3 two-step: request → fulfill)
// ─────────────────────────────────────────────────────────────────────────────

/** Mirrors `create_lottery_entropy_from_slot` in oracle.rs. */
function computeVrfEntropy(
  sbValue: Uint8Array,
  userCommitment: Uint8Array,
  lotteryTypeId: number,
  tier: number,
  roundNumber: number,
): bigint {
  const MASK64 = BigInt("0xffffffffffffffff");
  const K1 = BigInt("0x9e3779b97f4a7c15");
  const K2 = BigInt("0x517cc1b727220a95");

  const mul64 = (a: bigint, b: bigint) => (a * b) & MASK64;
  const rotL64 = (x: bigint, n: number) =>
    ((x << BigInt(n)) | (x >> BigInt(64 - n))) & MASK64;
  const readU64LE = (buf: Uint8Array, off: number): bigint => {
    let v = BigInt(0);
    for (let i = 0; i < 8; i++) v |= BigInt(buf[off + i]) << BigInt(i * 8);
    return v;
  };

  const s0 = readU64LE(sbValue, 0);
  const s1 = readU64LE(sbValue, 8);
  const s2 = readU64LE(sbValue, 16);
  const s3 = readU64LE(sbValue, 24);
  const c0 = readU64LE(userCommitment, 0);
  const c1 = readU64LE(userCommitment, 8);

  const meta =
    (BigInt(lotteryTypeId) << BigInt(56)) |
    (BigInt(tier) << BigInt(48)) |
    (BigInt(roundNumber) & BigInt(0xffff));

  let state = mul64(s0, K1);
  state ^= rotL64(mul64(s1, K2), 27);
  state ^= mul64(rotL64(s2, 13), K1);
  state ^= mul64(rotL64(s3, 41), K2);
  state ^= mul64(c0, (K1 + K2) & MASK64);
  state ^= rotL64(mul64(c1, mul64(K2, K1)), 19);
  state ^= rotL64(mul64(meta, K1), 31);
  return state & MASK64;
}

// ── Forge user-readable messages from raw Anchor / Solana RPC errors ────────

const ANCHOR_ERROR_MESSAGES: Record<string, string> = {
  LotteryNotEnded:            'Lottery period has not ended yet.',
  ParticipantThresholdNotMet: 'Not enough participants — this pool needs 100 to trigger a draw.',
  LotteryAlreadyDrawn:        'A draw is already in progress or completed for this pool.',
  EntropyNotAvailable:        'Oracle randomness not ready — wait a moment then try again.',
  DrawNotYetReady:            'Draw is not ready yet — oracle still generating randomness.',
  NoParticipants:             'No participants in this pool — cannot draw.',
  InvalidLotteryType:         'Invalid lottery type or mismatched accounts.',
  InvalidTier:                'Invalid tier for this lottery type.',
  InsufficientVaultFunds:     'Treasury has insufficient SOL to cover draw operations.',
  InvalidVaultState:          'Vault is in an invalid state for this operation.',
};

const ANCHOR_ERROR_BY_CODE: Record<number, string> = {
  6000: 'LotteryNotEnded',
  6005: 'InvalidTier',
  6007: 'ParticipantThresholdNotMet',
  6008: 'InvalidLotteryType',
  6009: 'LotteryAlreadyDrawn',
  6013: 'InsufficientVaultFunds',
  6015: 'NoParticipants',
  6020: 'DrawNotYetReady',
  6026: 'DrawExpired',
  6021: 'InvalidVaultState',
  6025: 'EntropyNotAvailable',
};

function parseOnChainError(error: any): string {
  console.error('[RPC ERROR] raw error:', error);
  if (error?.logs) console.error('[RPC ERROR] program logs:', error.logs);

  // Anchor parsed error object
  const code: string | undefined = error?.error?.errorCode?.code;
  const num: number | undefined = error?.error?.errorCode?.number;
  if (code && ANCHOR_ERROR_MESSAGES[code]) return ANCHOR_ERROR_MESSAGES[code];
  if (num !== undefined && ANCHOR_ERROR_BY_CODE[num]) {
    return ANCHOR_ERROR_MESSAGES[ANCHOR_ERROR_BY_CODE[num]] ?? `Program error ${num}`;
  }

  // Scan program logs for AnchorError patterns
  if (Array.isArray(error?.logs)) {
    for (const line of error.logs as string[]) {
      const nameMatch = line.match(/Error Code:\s*(\w+)/);
      if (nameMatch && ANCHOR_ERROR_MESSAGES[nameMatch[1]]) return ANCHOR_ERROR_MESSAGES[nameMatch[1]];
      const numMatch = line.match(/Error Number:\s*(\d+)/);
      if (numMatch) {
        const n = parseInt(numMatch[1], 10);
        const key = ANCHOR_ERROR_BY_CODE[n];
        if (key) return ANCHOR_ERROR_MESSAGES[key] ?? `Program error ${n}`;
      }
    }
  }

  // Custom program error hex in message string
  const hexMatch = error?.message?.match(/custom program error:\s*0x([0-9a-f]+)/i);
  if (hexMatch) {
    const n = parseInt(hexMatch[1], 16);
    const key = ANCHOR_ERROR_BY_CODE[n];
    if (key) return ANCHOR_ERROR_MESSAGES[key] ?? `Program error 0x${hexMatch[1]}`;
  }

  return error?.message || String(error) || 'Unknown RPC error';
}

/**
 * Step 1 of VRF draw: commit randomness request to Switchboard V3.
 *
 * Prerequisites: admin must have pre-initialized a RandomnessAccount for
 * this (lotteryType, tier) pair and set its pubkey in SB_RANDOMNESS_ACCOUNTS.
 *
 * @returns transaction signature
 */
export async function requestDrawEntropy(
  program: Program,
  lotteryType: string,
  tier: number,
  userCommitment: Uint8Array,
  callerPubkey: PublicKey,
): Promise<string> {
  const LOTTERY_TYPE_INDEX: Record<string, number> = {
    LPM: 0, DPL: 1, WPL: 2, MPL: 3,
  };
  const lotteryTypeId = LOTTERY_TYPE_INDEX[lotteryType];
  if (lotteryTypeId === undefined) throw new Error(`Unknown lottery type: ${lotteryType}`);

  const randomnessAccountStr = SB_RANDOMNESS_ACCOUNTS[lotteryType]?.[tier];
  if (!randomnessAccountStr) {
    throw new Error(
      `No SB RandomnessAccount configured for ${lotteryType} tier ${tier}. ` +
      `Ask an admin to run 'sb randomness init' and update SB_RANDOMNESS_ACCOUNTS in constants.ts.`,
    );
  }

  const [vaultPDA] = getVaultPDA(program.programId, lotteryType, tier);
  const pendingDrawPDA = derivePendingDrawPDA(program.programId, lotteryTypeId, tier);
  const [solVaultPDA] = PublicKey.findProgramAddressSync([Buffer.from("sol_vault")], program.programId);
  const randomnessAccount = new PublicKey(randomnessAccountStr);

  // Verify the RandomnessAccount exists on-chain.
  const connection = program.provider.connection;
  const rndInfo = await connection.getAccountInfo(randomnessAccount, "confirmed");
  if (!rndInfo) {
    throw new Error(
      `RandomnessAccount ${randomnessAccountStr} not found. ` +
      `Run: npx ts-node scripts/reinit-sb-randomness-crank.ts`,
    );
  }

  const commitment = Array.from(userCommitment) as number[];

  let sig: string;
  try {
    sig = await (program.methods as any)
      .requestDrawEntropy(lotteryTypeId, tier, commitment)
      .accountsStrict({
        requester:          callerPubkey,
        lotteryState:       vaultPDA,
        pendingDraw:        pendingDrawPDA,
        systemProgram:      SystemProgram.programId,
        randomnessAccount,
      })
      .rpc({ skipPreflight: true, commitment: "confirmed" });
  } catch (rpcErr: any) {
    throw new Error(parseOnChainError(rpcErr));
  }

  return sig;
}

/**
 * Step 2 of VRF draw: wait for oracle reveal, find winner, call fulfill.
 *
 * @returns transaction signature
 */
export async function fulfillDrawEntropy(
  program: Program,
  lotteryType: string,
  tier: number,
  callerPubkey: PublicKey,
): Promise<{ signature: string; winner: string; prize: number }> {
  const LOTTERY_TYPE_INDEX: Record<string, number> = {
    LPM: 0, DPL: 1, WPL: 2, MPL: 3,
  };
  const lotteryTypeId = LOTTERY_TYPE_INDEX[lotteryType];
  if (lotteryTypeId === undefined) throw new Error(`Unknown lottery type: ${lotteryType}`);

  const connection = program.provider.connection;
  const FPT_MINT_LOCAL = new PublicKey(FPT_MINT_STRING);

  // ── 1. Fetch PendingDraw account and parse it ──
  const pendingDrawPDA = derivePendingDrawPDA(program.programId, lotteryTypeId, tier);
  const pendingDrawInfo = await connection.getAccountInfo(pendingDrawPDA, "confirmed");
  if (!pendingDrawInfo) {
    throw new Error(`No pending draw found for ${lotteryType} tier ${tier}. Call requestDrawEntropy first.`);
  }
  // PendingDraw Anchor layout (after 8-byte discriminator):
  //   u8 lottery_type_id(1) + u8 tier(1) + pubkey randomness_account(32)
  //   + [u8;32] user_commitment(32) + pubkey requester(32) + i64 requested_at(8)
  //   + u8 bump(1) + u64 request_reveal_slot(8)
  const d = pendingDrawInfo.data;
  const randomnessAccountPk = new PublicKey(d.slice(10, 42));
  const storedCommitment = new Uint8Array(d.slice(42, 74));
  // requested_at @ offset 106, request_reveal_slot @ offset 115
  const requestedAt = d.length >= 114 ? d.readBigInt64LE(106) : BigInt(0);
  const requestRevealSlot = d.length >= 123 ? d.readBigUInt64LE(115) : BigInt(0);

  // ── 2. Poll randomnessAccount until oracle reveals AFTER this draw was requested ──
  //    RandomnessAccountData layout: reveal_slot (u64 LE) @ offset 144, value[32] @ offset 152
  //    Security: must be strictly greater than request_reveal_slot (not just > 0) to prevent
  //    reuse of the oracle value that was already public at request time.
  const REVEAL_SLOT_OFFSET = 144;
  const SB_VALUE_OFFSET = 152;
  const deadline = Date.now() + SRS_POLL_TIMEOUT_MS;
  let sbValue: Uint8Array | null = null;

  while (Date.now() < deadline) {
    const raInfo = await connection.getAccountInfo(randomnessAccountPk, "processed");
    if (raInfo && raInfo.data.length >= SB_VALUE_OFFSET + 32) {
      const revealSlot = raInfo.data.readBigUInt64LE(REVEAL_SLOT_OFFSET);
      if (revealSlot > requestRevealSlot) {
        sbValue = new Uint8Array(raInfo.data.slice(SB_VALUE_OFFSET, SB_VALUE_OFFSET + 32));
        break;
      }
    }
    await new Promise(r => setTimeout(r, 500));
  }

  if (!sbValue) {
    throw new Error(
      `Oracle has not committed for this draw cycle yet (current reveal_slot ≤ ${requestRevealSlot}). ` +
      `The system will auto-kick the oracle — please wait ~10 seconds and try again. ` +
      `If this persists, fund the crank wallet from the Treasury page.`,
    );
  }

  // ── 3. Compute on-chain winner index using VRF entropy ──
  const [vaultPDA] = getVaultPDA(program.programId, lotteryType, tier);
  const vault = await (program.account as any).lotteryVault.fetch(vaultPDA);
  const participantCount = typeof vault.participantCount === 'object' && vault.participantCount.toNumber
    ? vault.participantCount.toNumber()
    : (vault.participantCount || 0);
  const currentRound = typeof vault.roundNumber === 'object' && vault.roundNumber?.toNumber
    ? vault.roundNumber.toNumber()
    : (vault.roundNumber || 0);
  const vaultBalanceFpt = typeof vault.balance === 'object' && vault.balance.toNumber
    ? vault.balance.toNumber() / 1_000_000
    : (Number(vault.balance ?? 0) / 1_000_000);
  const prizeAmount = vaultBalanceFpt * 0.95;

  if (participantCount === 0) {
    throw new Error(`${lotteryType} tier ${tier} has 0 participants — cannot fulfill VRF draw.`);
  }

  const entropyBI = computeVrfEntropy(sbValue, storedCommitment, lotteryTypeId, tier, currentRound);
  const winnerIdx = Number(entropyBI % BigInt(participantCount));

  // ── 4. Find winner across participant pages ──
  const [page0PDA] = getParticipantPagePDA(program.programId, lotteryType, tier, 0);
  const [page1PDA] = getParticipantPagePDA(program.programId, lotteryType, tier, 1);
  const page0Participants = await readParticipantsFromPage(connection, page0PDA);
  const page1Participants = await readParticipantsFromPage(connection, page1PDA);
  const allParticipants = [...page0Participants, ...page1Participants];

  if (allParticipants.length === 0) {
    throw new Error(`No participants found in pages for ${lotteryType} tier ${tier}.`);
  }

  const safeIdx = winnerIdx % allParticipants.length;
  const winnerPubkey = allParticipants[safeIdx];
  const winningPagePDA = safeIdx < page0Participants.length ? page0PDA : page1PDA;

  // ── 5. Resolve all required accounts ──
  const vaultTokenAccount = await getAssociatedTokenAddress(
    FPT_MINT_LOCAL, vaultPDA, true, TOKEN_2022_PROGRAM_ID,
  );
  const winnerAta = getAssociatedTokenAddressSync(
    FPT_MINT_LOCAL, winnerPubkey, false, TOKEN_2022_PROGRAM_ID,
  );
  const callerAta = getAssociatedTokenAddressSync(
    FPT_MINT_LOCAL, callerPubkey, false, TOKEN_2022_PROGRAM_ID,
  );
  const [configPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("global_registry")], program.programId,
  );
  const [treasuryVaultPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("sol_vault")], program.programId,
  );
  const [treasuryDataPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")], program.programId,
  );
  const treasuryFptAta = getAssociatedTokenAddressSync(
    FPT_MINT_LOCAL, treasuryVaultPDA, true, TOKEN_2022_PROGRAM_ID,
  );
  const [winnerHistoryPDA] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("winner_history"),
      Buffer.from([lotteryTypeId]),
      Buffer.from([tier]),
    ],
    program.programId,
  );

  // ── 6. Compute $0.50 settler reward at the live FPT market rate ──
  const { fptPerUsd6dec } = await fetchFptUsdPrice();
  // fptPerUsd6dec is µFPT per $1; multiply by 0.5 for the $0.50 reward.
  // Capped at 5_000_000 µFPT (5 FPT) to match on-chain MAX_SETTLER_REWARD.
  const settlerRewardFpt = Math.min(
    Math.max(
      Math.round(0.5 * fptPerUsd6dec),
      100_000, // floor: 0.1 FPT (matches MIN_SETTLER_REWARD on-chain)
    ),
    5_000_000, // ceiling: 5 FPT (matches MAX_SETTLER_REWARD on-chain)
  );

  // ── 7. Call fulfill_draw_entropy ──
  // All ATAs (vault, treasury, caller, winner) are created on-chain by the
  // program with the treasury vault PDA paying — no client-side pre-creation needed.
  const preIxs: TransactionInstruction[] = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }),
  ];

  let sig: string;
  try {
  sig = await (program.methods as any)
    .fulfillDrawEntropy(lotteryTypeId, tier, new BN(settlerRewardFpt))
    .accountsStrict({
      authority:              callerPubkey,
      fptMint:                FPT_MINT_LOCAL,
      lotteryState:           vaultPDA,
      vaultTokenAccount,
      winner:                 winnerPubkey,
      winnerAta,
      treasuryVault:          treasuryVaultPDA,
      treasury:               treasuryDataPDA,
      treasuryFptAta,
      authorityAta:           callerAta,
      participantPage0:       page0PDA,
      winningParticipantPage: winningPagePDA,
      config:                 configPDA,
      randomnessAccount:      randomnessAccountPk,
      winnerHistory:          winnerHistoryPDA,
      pendingDraw:            pendingDrawPDA,
      tokenProgram:           TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram:          SystemProgram.programId,
    })
    .preInstructions(preIxs)
    .rpc({ skipPreflight: true, commitment: "confirmed" });
  } catch (rpcErr: any) {
    throw new Error(parseOnChainError(rpcErr));
  }

  return { signature: sig, winner: winnerPubkey.toBase58(), prize: prizeAmount };
}

import { Connection, PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY, SystemProgram, VersionedTransaction, TransactionMessage } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { AnchorProvider, Program, BN } from '@coral-xyz/anchor';
import { readFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const idl = require('./src/idl/fortress_protocol.json');

const PROGRAM_ID = new PublicKey('2JHDbUz11kLe7q44nneougHcJCQqD6t26XeEFFNQJpHY');
const FPT_MINT = new PublicKey('7vZbJ3WN4eGF6rGikB4MBLs4kiJwaRzNSX3smQRJJNw2');
// Use a dummy buyer wallet for simulation
const DUMMY_BUYER = new PublicKey('11111111111111111111111111111111');

const conn = new Connection('https://api.devnet.solana.com', 'confirmed');

const [registryPDA] = PublicKey.findProgramAddressSync([Buffer.from('global_registry')], PROGRAM_ID);
const [solVaultPDA] = PublicKey.findProgramAddressSync([Buffer.from('sol_vault')], PROGRAM_ID);
const tier = 5;
const lotteryType = 'DPL';
const pageNumber = 0;
const lotteryTypeId = 1; // DPL

const [vaultPDA] = PublicKey.findProgramAddressSync([Buffer.from('vault_dpl'), Buffer.from([tier])], PROGRAM_ID);
const userFptAccount = getAssociatedTokenAddressSync(FPT_MINT, DUMMY_BUYER, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
const [vaultTokenAccount] = PublicKey.findProgramAddressSync(
  [vaultPDA.toBuffer(), TOKEN_2022_PROGRAM_ID.toBuffer(), FPT_MINT.toBuffer()],
  ASSOCIATED_TOKEN_PROGRAM_ID
);
const typeBuffer = Buffer.alloc(4); typeBuffer.writeUInt32LE(1, 0);
const tierBuffer = Buffer.alloc(4); tierBuffer.writeUInt32LE(tier, 0);
const pageBuffer = Buffer.alloc(4); pageBuffer.writeUInt32LE(pageNumber, 0);
const [pagePDA] = PublicKey.findProgramAddressSync([Buffer.from('page'), typeBuffer, tierBuffer, pageBuffer], PROGRAM_ID);

console.log('Accounts:');
console.log(' buyer:', DUMMY_BUYER.toBase58());
console.log(' fptMint:', FPT_MINT.toBase58());
console.log(' buyerTokenAccount:', userFptAccount.toBase58());
console.log(' lotteryVault:', vaultPDA.toBase58());
console.log(' vaultTokenAccount:', vaultTokenAccount.toBase58());
console.log(' participantPage:', pagePDA.toBase58());
console.log(' registry:', registryPDA.toBase58());
console.log(' solVault:', solVaultPDA.toBase58());
console.log(' instructionsSysvar:', SYSVAR_INSTRUCTIONS_PUBKEY.toBase58());

// Check if vault token account exists
const vtaInfo = await conn.getAccountInfo(vaultTokenAccount);
console.log('Vault token account exists:', !!vtaInfo);
const pageInfo = await conn.getAccountInfo(pagePDA);
console.log('Page PDA exists:', !!pageInfo);
const vaultInfo = await conn.getAccountInfo(vaultPDA);
console.log('Vault PDA exists:', !!vaultInfo, vaultInfo ? 'owner:'+vaultInfo.owner.toBase58() : '');

const { Connection, PublicKey } = require('@solana/web3.js');
const conn = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
const PROGRAM_ID = new PublicKey('2JHDbUz11kLe7q44nneougHcJCQqD6t26XeEFFNQJpHY');
const [registryPDA] = PublicKey.findProgramAddressSync([Buffer.from('global_registry')], PROGRAM_ID);
const [solVaultPDA] = PublicKey.findProgramAddressSync([Buffer.from('sol_vault')], PROGRAM_ID);
const vaultDpl5Seed = [Buffer.from('vault_dpl'), Buffer.from([5])];
const [vaultDpl5] = PublicKey.findProgramAddressSync(vaultDpl5Seed, PROGRAM_ID);

Promise.all([
  conn.getAccountInfo(PROGRAM_ID),
  conn.getAccountInfo(registryPDA),
  conn.getAccountInfo(solVaultPDA),
  conn.getAccountInfo(vaultDpl5),
]).then(([prog, reg, sol, vault]) => {
  console.log('Program exists:', !!prog, prog ? 'executable:'+prog.executable : '');
  console.log('Registry PDA:', registryPDA.toBase58(), 'exists:', !!reg, reg ? 'owner:'+reg.owner.toBase58() : 'N/A');
  console.log('Sol vault PDA:', solVaultPDA.toBase58(), 'exists:', !!sol, sol ? 'lamports:'+sol.lamports : 'N/A');
  console.log('Vault DPL/5:', vaultDpl5.toBase58(), 'exists:', !!vault, vault ? 'owner:'+vault.owner.toBase58() : 'N/A');
}).catch(e => console.error('Error:', e.message));

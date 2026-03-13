import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import * as spl from '@switchboard-xyz/on-demand';

const conn = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
const dummy = Keypair.generate();
const wallet = { publicKey: dummy.publicKey, signTransaction: async (t) => t, signAllTransactions: async (t) => t };

async function main() {
  const program = await spl.AnchorUtils.loadProgramFromConnection(conn, wallet);
  console.log('program id:', program.programId.toBase58());
  
  const rndAcct = new PublicKey('4dqvnPSuq9PEZaGojLke2oe3zd3q26iS7wBYEhQSkWC3');
  const queue = new PublicKey('3u9PpRz7fN8Lp693zPueppQf94v7N2jKj3C18j9o7oG1');
  const rnd = new spl.Randomness(program, rndAcct);
  
  try {
    const ix = await rnd.commitIx(queue);
    console.log('commitIx discriminator:', Array.from(ix.data.slice(0, 8)));
    console.log('commitIx accounts:', ix.keys.map(k => `${k.pubkey.toBase58().slice(0,8)} rw=${k.isWritable} sg=${k.isSigner}`));
  } catch (e) {
    console.error('commitIx error:', e.message);
  }
}
main().catch(e => console.error('top-level error:', e.message));

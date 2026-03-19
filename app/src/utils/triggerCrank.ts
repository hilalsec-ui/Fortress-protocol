/**
 * triggerCrank — fire-and-forget GitHub Actions dispatch.
 *
 * Called after a successful ticket purchase (or on vault expiry) when the
 * vault is draw-ready.  Posts to /api/trigger-crank (server route) which
 * makes the actual GitHub API call using the server-side GITHUB_PAT — the
 * token is NEVER in the browser.
 *
 * The GitHub Actions crank workflow wakes up, connects to Solana with the
 * crank keypair, and signs + submits the full draw transaction on-chain.
 *
 * Fire-and-forget — failures are logged to console but never shown to users.
 * The manual "Fallback Trigger" button is the safety net if this fails.
 */
export function triggerCrank(lotteryType: string, tier: number): void {
  console.log(`[triggerCrank] 🚀 Dispatching draw wake-up → ${lotteryType} $${tier}`);
  fetch('/api/trigger-crank', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ lotteryType, tier }),
  })
    .then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        console.log(`[triggerCrank] ✅ GitHub crank dispatched for ${lotteryType} $${tier}`);
      } else if (data.skipped) {
        console.error(
          `[triggerCrank] ⚠️  Dispatch skipped — GITHUB_PAT is not set.\n` +
          `  Add GITHUB_PAT=ghp_... to app/.env.local to enable auto-trigger.`
        );
      } else {
        console.warn(`[triggerCrank] ⚠️  Dispatch returned unexpected response:`, data);
      }
    })
    .catch((err) => {
      console.error(`[triggerCrank] ❌ Network error dispatching crank:`, err);
    });
}

/**
 * triggerCrank — fire-and-forget GitHub Actions dispatch.
 *
 * Called after a successful ticket purchase when the vault may be draw-ready.
 * Posts to /api/trigger-crank (server route) which makes the actual GitHub API
 * call using the server-side GITHUB_PAT — the token is NEVER in the browser.
 *
 * Always fire-and-forget (no await, no throw) — crank failure is invisible to
 * users; the hourly Actions schedule is the safety net.
 */
export function triggerCrank(lotteryType: string, tier: number): void {
  fetch('/api/trigger-crank', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ lotteryType, tier }),
  }).catch(() => { /* silent — hourly crank run covers any failure */ });
}

/**
 * POST /api/trigger-crank
 *
 * Fires a `repository_dispatch` event on hilalsec-ui/crank so the GitHub
 * Actions crank workflow runs immediately after a purchase.
 *
 * Security:
 *   • GITHUB_PAT is a server-side-only env var (no NEXT_PUBLIC_ prefix).
 *     It is NEVER sent to the browser or embedded in the JS bundle.
 *   • Required PAT scope: "Actions: Write" (fine-grained) on hilalsec-ui/crank
 *   • Rate-limited: reuses checkRateLimit from _guard.ts (10 req/IP/min)
 *   • Input validated with allowlists before the GitHub API call
 *
 * Add to your environment:
 *   app/.env.local       →  GITHUB_PAT=ghp_...
 *   Vercel env vars      →  GITHUB_PAT=ghp_...  (Production + Preview + Development)
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '../_guard';

const GITHUB_REPO  = 'hilalsec-ui/crank';
const EVENT_TYPE   = 'trigger-devnet-draw';

const VALID_LOTTERY_TYPES = new Set(['LPM', 'DPL', 'WPL', 'MPL']);
const VALID_TIERS         = new Set([5, 10, 15, 20, 50]);

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── Rate limit ───────────────────────────────────────────────────────────
  const rateLimitError = checkRateLimit(req, 'trigger-crank');
  if (rateLimitError) return rateLimitError;

  // ── Parse + validate body ────────────────────────────────────────────────
  let body: { lotteryType?: unknown; tier?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { lotteryType, tier } = body;

  if (typeof lotteryType !== 'string' || !VALID_LOTTERY_TYPES.has(lotteryType)) {
    return NextResponse.json({ error: 'Invalid lotteryType' }, { status: 400 });
  }
  if (typeof tier !== 'number' || !VALID_TIERS.has(tier)) {
    return NextResponse.json({ error: 'Invalid tier' }, { status: 400 });
  }

  // ── PAT — never reaches the client ──────────────────────────────────────
  const pat = process.env.GITHUB_PAT;
  if (!pat) {
    // Soft failure: crank runs on its hourly schedule as a fallback
    console.warn('[trigger-crank] GITHUB_PAT not configured — skipping dispatch');
    return NextResponse.json({ skipped: true, reason: 'GITHUB_PAT not set' }, { status: 200 });
  }

  // ── Dispatch to GitHub Actions ───────────────────────────────────────────
  let githubRes: Response;
  try {
    githubRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/dispatches`,
      {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${pat}`,
          Accept:         'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent':   'fortress-protocol-frontend/1.0',
        },
        body: JSON.stringify({
          event_type:     EVENT_TYPE,
          client_payload: { lotteryType, tier },
        }),
      },
    );
  } catch (fetchErr) {
    console.error('[trigger-crank] Network error reaching GitHub:', fetchErr);
    // Still 200 — crank failure is non-critical to the buyer
    return NextResponse.json({ ok: false, reason: 'network_error' }, { status: 200 });
  }

  if (githubRes.status === 204) {
    console.log(`[trigger-crank] Dispatched ${EVENT_TYPE} for ${lotteryType} $${tier}`);
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const text = await githubRes.text().catch(() => '');
  console.error(`[trigger-crank] GitHub returned ${githubRes.status}: ${text.slice(0, 200)}`);
  return NextResponse.json({ ok: false, status: githubRes.status }, { status: 200 });
}

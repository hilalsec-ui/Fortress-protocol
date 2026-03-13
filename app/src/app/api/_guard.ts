/**
 * Shared API security guard for all /api/draw/* routes.
 *
 * Provides:
 *  1. API key authentication (X-Api-Key header or Authorization: Bearer <key>)
 *  2. In-memory sliding-window rate limiting per IP
 *  3. Strict input validation helpers
 *  4. Safe error message formatting (never leaks internal details to HTTP clients)
 */

import { NextRequest, NextResponse } from 'next/server';

// ── 1. Authentication ─────────────────────────────────────────────────────────
//
// Set CRANK_API_SECRET in your environment (secrets manager / .env.local).
// All /api/draw/* routes require this secret in the request header:
//   X-Api-Key: <secret>       or
//   Authorization: Bearer <secret>
//
// If CRANK_API_SECRET is not set in the environment the routes run in
// open mode (devnet-only convenience — always set CRANK_API_SECRET in production). Log a warning at startup.

const API_SECRET = process.env.CRANK_API_SECRET;
if (!API_SECRET) {
  console.warn(
    '[SECURITY] CRANK_API_SECRET is not set — /api/draw/* routes accept unauthenticated requests. ' +
    'Set CRANK_API_SECRET in production.',
  );
}

export function checkAuth(req: NextRequest): NextResponse | null {
  if (!API_SECRET) return null; // no secret configured — open mode

  const apiKey = req.headers.get('x-api-key');
  const bearerMatch = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i);
  const bearerKey = bearerMatch?.[1];

  const provided = apiKey ?? bearerKey ?? '';

  // Constant-time comparison to prevent timing attacks
  if (!constantTimeEqual(provided, API_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// ── 2. Rate limiting ──────────────────────────────────────────────────────────
//
// Sliding-window in-memory store. Limits per (IP, route-label).
// For multi-instance deployments, replace with Redis (e.g., @upstash/ratelimit).

interface WindowEntry { count: number; windowStart: number }
const rateLimitStore = new Map<string, WindowEntry>();

// Default: 30 requests per 60 seconds per IP per route
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;

// Oracle route is more expensive (2 SB txs + 2.5 s sleep) — tighter limit
const ORACLE_RATE_LIMIT_MAX = 10;

export function checkRateLimit(req: NextRequest, label: string): NextResponse | null {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';

  const key = `${label}:${ip}`;
  const now = Date.now();
  const limit = label === 'oracle' ? ORACLE_RATE_LIMIT_MAX : RATE_LIMIT_MAX;

  const entry = rateLimitStore.get(key);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(key, { count: 1, windowStart: now });
    return null;
  }

  entry.count += 1;
  if (entry.count > limit) {
    return NextResponse.json(
      { error: 'Too many requests — please wait before retrying' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((RATE_LIMIT_WINDOW_MS - (now - entry.windowStart)) / 1000)),
        },
      },
    );
  }
  return null;
}

// Periodically purge expired entries to prevent unbounded memory growth
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
      rateLimitStore.delete(key);
    }
  }
}, 120_000);

// ── 3. Input validation ───────────────────────────────────────────────────────

const ALLOWED_LOTTERY_TYPES = new Set(['LPM', 'DPL', 'WPL', 'MPL']);
const ALLOWED_TIERS = new Set([5, 10, 15, 20, 50]);

export function validateInputs(
  lotteryType: unknown,
  tier: unknown,
): NextResponse | null {
  if (typeof lotteryType !== 'string' || !ALLOWED_LOTTERY_TYPES.has(lotteryType.toUpperCase())) {
    return NextResponse.json({ error: 'Invalid lottery type' }, { status: 400 });
  }
  const tierNum = Number(tier);
  if (!Number.isInteger(tierNum) || !ALLOWED_TIERS.has(tierNum)) {
    return NextResponse.json({ error: 'Invalid tier' }, { status: 400 });
  }
  return null;
}

// ── 4. Safe error responses ───────────────────────────────────────────────────
//
// Never expose raw Anchor / Solana / Node.js error messages to HTTP clients —
// they contain program IDs, instruction names, constraint names, PDA addresses,
// and Rust panic messages that aid adversarial reconnaissance.

export function safeError(label: string, msg: string, status = 500): NextResponse {
  // Log full detail server-side for debugging
  console.error(`[${label}] Error:`, msg);
  // Return only a generic message to the client
  const clientMsg =
    status === 409 ? msg  // 409 Conflict messages are intentionally descriptive (expected states)
    : status === 400 ? msg  // 400 Bad Request messages are intentionally descriptive (client mistakes)
    : status === 402 ? msg  // 402 Payment Required (low balance signal to frontend)
    : 'Request could not be completed. Please try again.';
  return NextResponse.json({ error: clientMsg }, { status });
}

// Combined guard — call at the top of every route handler.
// Returns a NextResponse if the request should be rejected, null if it passes.
export function guardRequest(
  req: NextRequest,
  label: string,
): NextResponse | null {
  return checkAuth(req) ?? checkRateLimit(req, label);
}

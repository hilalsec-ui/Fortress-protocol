#!/usr/bin/env npx ts-node
/**
 * test-dispatch.ts
 *
 * One-shot test to verify GITHUB_PAT can trigger the devnet crank workflow.
 *
 * Usage (from project root):
 *   npx ts-node test-dispatch.ts
 *
 * Expected output on success:
 *   ✅  204 No Content — workflow triggered!
 *   Check: https://github.com/hilalsec-ui/crank/actions
 *
 * Expected output when PAT is missing / wrong scope:
 *   ❌  401 / 404 — check PAT scope (needs Actions:Write on hilalsec-ui/crank)
 */

import * as fs   from "fs";
import * as path from "path";

// ── Load .env.local from app/ (one level down) ──────────────────────────────
const envPath = path.join(__dirname, "app", ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^([^#=][^=]*)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
}

const GITHUB_REPO = "hilalsec-ui/crank";
const EVENT_TYPE  = "trigger-devnet-draw";

async function main(): Promise<void> {
  const pat = process.env.GITHUB_PAT;
  if (!pat) {
    console.error("❌  GITHUB_PAT not found in app/.env.local");
    process.exit(1);
  }
  console.log(`🔑  PAT loaded (${pat.slice(0, 16)}…)`);
  console.log(`🚀  Dispatching '${EVENT_TYPE}' to ${GITHUB_REPO} …\n`);

  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/dispatches`,
    {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${pat}`,
        Accept:         "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        "User-Agent":   "fortress-test-dispatch/1.0",
      },
      body: JSON.stringify({
        event_type:     EVENT_TYPE,
        client_payload: { lotteryType: "LPM", tier: 5, source: "manual-test" },
      }),
    },
  );

  if (res.status === 204) {
    console.log("✅  204 No Content — workflow triggered successfully!\n");
    console.log(`🔍  Check Actions tab: https://github.com/${GITHUB_REPO}/actions`);
    console.log("    (The 'Devnet Crank' run should appear within 10–15 seconds)\n");
    return;
  }

  const body = await res.text().catch(() => "");
  console.error(`❌  HTTP ${res.status}: ${body.slice(0, 300)}`);

  if (res.status === 401) {
    console.error("\n   Cause: PAT is invalid or expired — regenerate it.");
  } else if (res.status === 404) {
    console.error(
      "\n   Cause: Repo not found OR PAT lacks 'Actions: Write' scope.\n" +
      `   Confirm the repo exists: https://github.com/${GITHUB_REPO}\n` +
      "   Confirm PAT scope: github.com/settings/tokens → Edit → Actions → Write",
    );
  } else if (res.status === 422) {
    console.error(
      "\n   Cause: The repo has no workflows with `on.repository_dispatch` yet.\n" +
      "   Make sure crank/.github/workflows/crank-devnet.yml is pushed to hilalsec-ui/crank.",
    );
  }
  process.exit(1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

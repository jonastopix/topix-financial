/**
 * check-edge-function-auth — CI guardrail
 *
 * INVARIANT: Every edge function that exposes an HTTP entry-point AND
 * constructs a service-role client must contain at least one auth or
 * signature-verification predicate.
 *
 * This checks EXISTENCE of an auth predicate — not ordering, not
 * exit-coupling. Each predicate in the union implies a rejection path
 * by contract; ordering correctness is a code-review concern.
 *
 * Background: all edge functions run with `verify_jwt = false`
 * (project-specific, see supabase/config.toml + CLAUDE.md). Without an
 * in-code auth gate, a service-role client gives an unauthenticated
 * caller full admin access. This script catches that omission at CI
 * time.
 *
 * Run: bun run scripts/check-edge-function-auth.ts [--verbose]
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const FUNCTIONS_DIR = "supabase/functions";

// HTTP entry-point: matches both `Deno.serve(` and the legacy
// `serve(` (imported from deno.land/std). The leading char check
// `(^|[^.])` rejects matches like `app.serve(` or `Deno.serve(` —
// the latter is caught by the second branch.
const HTTP_ENTRY = /(^|[^.])\bserve\s*\(|Deno\.serve\s*\(/m;

// Trigger anchors: file must have BOTH a createClient() call AND a
// reference to SUPABASE_SERVICE_ROLE_KEY. Covers both variable-bound
// (`const k = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); createClient(url, k)`)
// and inlined (`createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)`)
// forms.
const SR_KEY_REF = /SUPABASE_SERVICE_ROLE_KEY/;
const HAS_CREATECLIENT = /\bcreateClient\s*\(/;

/**
 * Shape-based detector for inbound `Bearer ${...}` auth compares.
 *
 * Distinguishes Klasse A (inbound auth — `authHeader === \`Bearer ${X}\``)
 * from Klasse B (outbound fetch headers — `{ Authorization: \`Bearer ${X}\` }`)
 * without inspecting variable names. The discriminator is purely
 * syntactic: inbound forms are paired with === / !==; outbound forms
 * are object-property assignments.
 *
 * Two forms handled:
 *  1. Direct:   `if (authHeader === \`Bearer ${X}\`)` — same line.
 *  2. Indirect: `const expected = \`Bearer ${X}\`;` then
 *               `if (authHeader !== expected)` — assign then compare.
 */
function hasBearerCompare(text: string): boolean {
  const lines = text.split("\n");
  const BEARER_TPL = /`Bearer \$\{[^}]+\}`/;
  const COMPARE_OP = /===|!==/;

  for (const line of lines) {
    if (BEARER_TPL.test(line) && COMPARE_OP.test(line)) return true;
  }

  const boundVars = new Set<string>();
  const BIND_RE =
    /(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=\s*`Bearer \$\{[^}]+\}`/;
  for (const line of lines) {
    const m = line.match(BIND_RE);
    if (m) boundVars.add(m[1]);
  }
  for (const v of boundVars) {
    const re = new RegExp(`(===|!==)\\s*${v}\\b|\\b${v}\\s*(===|!==)`);
    if (lines.some((l) => re.test(l))) return true;
  }
  return false;
}

type Predicate =
  | { name: string; pattern: RegExp }
  | { name: string; check: (text: string) => boolean };

/**
 * Auth-predicate union — calibrated from full recon of all 54 edge
 * functions. Each entry represents a pattern that, if present, proves
 * the file performs auth / signature verification before its
 * service-role surface is reachable.
 *
 * To add a new predicate: append to this list with a clear `name` and
 * either a `pattern` regex or a `check` function for shape-based
 * detection.
 */
const AUTH_PREDICATES: Predicate[] = [
  // Shared helpers (Bucket A + Bucket B from _shared/edgeFunctionAuth.ts)
  { name: "authenticateUser()",           pattern: /\bauthenticateUser\s*\(/ },
  { name: "authenticateServiceRole()",    pattern: /\bauthenticateServiceRole\s*\(/ },

  // Supabase JWT validation (server-side roundtrip)
  { name: "auth.getClaims()",             pattern: /\.\s*getClaims\s*\(/ },
  { name: "auth.getUser()",               pattern: /\.\s*getUser\s*\(/ },

  // Manual JWT-claims parser (used with verify_jwt=true to extract role)
  { name: "parseJwtClaims()",             pattern: /\bparseJwtClaims\s*\(/ },

  // External webhook signature verification (per-integration scheme)
  { name: "verifyStripeSignature()",      pattern: /\bverifyStripeSignature\s*\(/ },
  { name: "verifyMondayJwt()",            pattern: /\bverifyMondayJwt\s*\(/ },
  { name: "verifyWebhookRequest()",       pattern: /\bverifyWebhookRequest\s*\(/ },
  { name: "verifyCalendlySignature()",    pattern: /\bverifyCalendlySignature\s*\(/ },

  // Shape-based: `Bearer ${...}` template compared against a request
  // header (=== or !==). Excludes outbound fetch-header assignments
  // by syntactic shape, not by variable name.
  { name: "Bearer ${...} compare",        check: hasBearerCompare },
];

interface FileResult {
  file: string;
  status: "skip-no-http" | "skip-no-sr" | "pass" | "fail";
  srLine?: number;
  matched?: string[];
}

/**
 * Strip comments before running predicates so that commented-out auth
 * calls (e.g. `// TODO: authenticateUser(req)`) don't satisfy the rule.
 * Removes block and line comments; leaves string literals intact
 * structurally (a `//` inside a string is partially truncated, but
 * that can only remove text — never invent a false predicate match).
 */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

/**
 * Find the line where the service-role client is constructed, for
 * a precise error message. Two-pass: first collect variable names
 * bound to the env-var, then locate the createClient() call that
 * uses one of them (or has the env-var inlined within ~6 lines).
 *
 * Operates on the ORIGINAL text (with comments) to preserve line
 * numbers for error output.
 */
function findServiceRoleConstructionLine(text: string): number {
  const lines = text.split("\n");

  const srVars = new Set<string>();
  const bindRe =
    /(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=\s*Deno\.env\.get\s*\(\s*["']SUPABASE_SERVICE_ROLE_KEY["']/;
  for (const line of lines) {
    const m = line.match(bindRe);
    if (m) srVars.add(m[1]);
  }

  for (let i = 0; i < lines.length; i++) {
    if (!/\bcreateClient\s*\(/.test(lines[i])) continue;
    const window = lines.slice(i, Math.min(i + 6, lines.length)).join("\n");
    if (SR_KEY_REF.test(window)) return i + 1;
    for (const v of srVars) {
      const argRe = new RegExp(`\\bcreateClient\\s*\\([^)]*\\b${v}\\b`, "s");
      if (argRe.test(window)) return i + 1;
    }
  }
  return -1;
}

async function listIndexFiles(): Promise<string[]> {
  const entries = await readdir(FUNCTIONS_DIR, { withFileTypes: true });
  const files: string[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith("_")) continue; // skip _shared/
    const indexPath = join(FUNCTIONS_DIR, e.name, "index.ts");
    try {
      await stat(indexPath);
      files.push(indexPath);
    } catch {
      // function dir without index.ts — skip silently
    }
  }
  return files.sort();
}

function matchPredicate(p: Predicate, text: string): boolean {
  return "pattern" in p ? p.pattern.test(text) : p.check(text);
}

async function checkFile(path: string): Promise<FileResult> {
  const raw = await readFile(path, "utf-8");

  const hasHttp = HTTP_ENTRY.test(raw);

  // Skip files without an HTTP entry-point. This includes cron-only
  // functions (legat-reminder-cron, run-weekly-agent) — Deno.cron has
  // no HTTP overlay and is invoked internally by Supabase, so the
  // auth invariant doesn't apply.
  if (!hasHttp) return { file: path, status: "skip-no-http" };

  const hasSr = SR_KEY_REF.test(raw) && HAS_CREATECLIENT.test(raw);
  if (!hasSr) return { file: path, status: "skip-no-sr" };

  // Strip comments before matching so commented-out auth calls don't
  // satisfy the rule. Use original `raw` for line-number reporting.
  const stripped = stripComments(raw);

  const matched = AUTH_PREDICATES.filter((p) =>
    matchPredicate(p, stripped),
  ).map((p) => p.name);
  const srLine = findServiceRoleConstructionLine(raw);

  if (matched.length === 0) {
    return { file: path, status: "fail", srLine };
  }
  return { file: path, status: "pass", srLine, matched };
}

async function main(): Promise<void> {
  const verbose = process.argv.includes("--verbose");

  const files = await listIndexFiles();
  const results = await Promise.all(files.map(checkFile));

  const triggered = results.filter(
    (r) => r.status === "pass" || r.status === "fail",
  );
  const passes = results.filter((r) => r.status === "pass");
  const fails = results.filter((r) => r.status === "fail");
  const skipNoHttp = results.filter((r) => r.status === "skip-no-http");
  const skipNoSr = results.filter((r) => r.status === "skip-no-sr");

  console.log("edge-function-auth-check");
  console.log("========================");
  console.log(`Scanned:    ${files.length} index.ts files`);
  console.log(`Triggered:  ${triggered.length} (HTTP entry + service-role client)`);
  console.log(`Skipped:    ${skipNoHttp.length} (no HTTP entry)  +  ${skipNoSr.length} (no service-role)`);
  console.log("");

  if (verbose) {
    console.log("Per-file matched predicates (triggered files only):");
    console.log("---------------------------------------------------");
    for (const r of [...passes, ...fails].sort((a, b) => a.file.localeCompare(b.file))) {
      const matches = r.matched && r.matched.length > 0
        ? r.matched.join(", ")
        : "(none — FAIL)";
      console.log(`  ${r.file}`);
      console.log(`    ${matches}`);
    }
    console.log("");
  }

  if (fails.length === 0) {
    console.log(`PASS — all ${triggered.length} triggered files contain at least one auth predicate.`);
    process.exit(0);
  }

  console.log(`FAIL — ${fails.length} file(s) construct a service-role client without an auth predicate:`);
  console.log("");
  const predicateList = AUTH_PREDICATES.map((p) => p.name).join(", ");
  for (const f of fails) {
    const lineRef = f.srLine && f.srLine > 0 ? `:${f.srLine}` : "";
    console.log(`  ${f.file}${lineRef}`);
    console.log(`    Service-role client constructed without auth gate.`);
    console.log(`    Add one of: ${predicateList}`);
    console.log("");
  }
  process.exit(1);
}

main().catch((err) => {
  console.error("check-edge-function-auth crashed:", err);
  process.exit(2);
});

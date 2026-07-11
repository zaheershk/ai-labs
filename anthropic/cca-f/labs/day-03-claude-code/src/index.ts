import Anthropic from "@anthropic-ai/sdk";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

// ─── CI/CD invocation (TS 3.6) ────────────────────────────────────────────────
//
// Correct way to run Claude Code non-interactively in a CI pipeline:
//
//   claude -p "Review this PR for security issues" --output-format json
//
// Key flags:
//   -p / --print   → non-interactive mode; Claude responds once and exits.
//                    WITHOUT this flag the job hangs waiting for user input.
//   --output-format json → machine-readable output; pipe into jq or post as PR comments.
//
// Exam traps:
//   ✗ CLAUDE_HEADLESS=true   — this env var does not exist
//   ✗ --no-interactive       — not a real flag
//   ✗ omitting -p            — job will hang indefinitely
//
// This script uses the SDK directly (equivalent effect, no shell dependency).

// ─── Plan mode vs direct execution (TS 3.4) ───────────────────────────────────
//
// Rule: if you already know the complexity at the start, choose the right mode
//       upfront. Do NOT start direct and switch to plan mid-task.
//
// | Scenario                                          | Mode   | Why                                      |
// |---------------------------------------------------|--------|------------------------------------------|
// | Fix a null pointer crash with a clear stack trace | Direct | Single file, cause is known              |
// | Migrate 45 files from Express v4 to v5            | Plan   | Multi-file, architectural decisions      |
// | Add a date validation conditional                 | Direct | Single function, well-scoped             |
// | Restructure monolith into microservices           | Plan   | Service boundaries need exploration first|
// | Choose between two auth library approaches        | Plan   | Multiple valid approaches, compare first |
//
// Exam trap: "Start direct, switch to plan if complexity emerges" — WRONG.
// Complexity is already known before you start; choose plan mode from the beginning.

const client = new Anthropic();

// ─── Sample file to review ────────────────────────────────────────────────────
// This is the "PR diff" we're reviewing — deliberately contains issues.
const FILE_TO_REVIEW = {
  name: "src/api/users.ts",
  content: `
import db from "../db";
import { Request, Response } from "express";

const SECRET_KEY = "hardcoded-secret-abc123";   // line 5

export async function getUser(req: Request, res: Response) {
  const id = req.query.id;
  const user = await db.query("SELECT * FROM users WHERE id = " + id);  // line 9
  res.json(user);
}

export function updateEmail(req: Request, res: Response) {   // line 13 — not async
  db.query("UPDATE users SET email = $1", [req.body.email])
    .then(result => res.json(result));
    // rejection is not caught — line 15
}

export async function deleteUser(req: Request, res: Response) {
  const user = (req as any).user;   // line 19 — type assertion bypass
  await db.query("DELETE FROM users WHERE id = $1", [user.id]);
  res.json({ deleted: true });
}
`,
};

// ─── Explicit criteria (TS 4.1 crossover) ────────────────────────────────────
// Telling Claude exactly WHAT to report and WHAT to skip eliminates style noise.
// This is the key pattern: constrain the output domain, not just the format.
const REVIEW_CRITERIA = `
REPORT only these categories — nothing else:
  1. SQL_INJECTION     — string concatenation or interpolation in SQL queries
  2. HARDCODED_SECRET  — credentials, keys, tokens committed in source
  3. UNHANDLED_REJECTION — Promise chains without .catch(), or async calls without try/catch
  4. TYPE_BYPASS       — use of "as any" or non-null assertions that hide type errors

SKIP entirely:
  - Style preferences (naming, formatting, spacing)
  - Variable naming conventions
  - Comment quality or formatting
  - Performance suggestions not related to the above categories
`;

// ─── Second file — auth middleware ───────────────────────────────────────────
// This file looks clean in isolation, but combined with users.ts it reveals
// that the auth middleware is never actually applied to the user routes.
const AUTH_MIDDLEWARE_FILE = {
  name: "src/middleware/auth.ts",
  content: `
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    (req as any).user = jwt.verify(token, process.env.SECRET_KEY!);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}
`,
};

// ─── Pass 1: per-file review ──────────────────────────────────────────────────
async function reviewFile(file: { name: string; content: string }) {
  console.log(`\n=== PASS 1: Per-file review — ${file.name} ===`);
  console.log("Sending to Claude with explicit REPORT/SKIP criteria...\n");

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `You are a security-focused code reviewer running in CI.

${REVIEW_CRITERIA}

Return a JSON array of findings. Each finding must have:
  - file: string
  - line: number
  - category: one of SQL_INJECTION | HARDCODED_SECRET | UNHANDLED_REJECTION | TYPE_BYPASS
  - severity: "high" | "medium" | "low"
  - description: one sentence describing the issue
  - fix: one sentence suggesting the fix

Return ONLY the JSON array — no markdown, no explanation outside the array.

File: ${file.name}
\`\`\`typescript
${file.content}
\`\`\``,
      },
    ],
  });

  const raw = response.content[0].type === "text" ? response.content[0].text : "";

  console.log("Raw response from Claude:");
  console.log(raw);

  // Strip markdown code fences if Claude wraps the JSON despite instructions
  const json = raw.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();

  const findings = JSON.parse(json) as Array<{
    file: string;
    line: number;
    category: string;
    severity: string;
    description: string;
    fix: string;
  }>;

  console.log(`\nParsed ${findings.length} finding(s):`);
  findings.forEach((f, i) => {
    console.log(`  [${i + 1}] ${f.severity.toUpperCase()} — ${f.category} @ line ${f.line}`);
    console.log(`       ${f.description}`);
    console.log(`       Fix: ${f.fix}`);
  });

  return findings;
}

// ─── Pass 2: cross-file integration review ────────────────────────────────────
// Pass 1 reviews each file independently. Pass 2 sends all files together so
// Claude can spot issues that only appear across file boundaries — e.g. an auth
// middleware that exists but is never wired to the routes that need it.
async function reviewIntegration(files: Array<{ name: string; content: string }>) {
  console.log("\n=== PASS 2: Cross-file integration review ===");
  console.log("Sending all files together to detect inter-file issues...\n");

  const fileBlocks = files
    .map((f) => `File: ${f.name}\n\`\`\`typescript\n${f.content}\n\`\`\``)
    .join("\n\n");

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `You are a security-focused code reviewer doing a cross-file integration pass.

Look ONLY for issues that require seeing multiple files together:
  - Auth middleware defined but never applied to routes that need protection
  - Secrets or config values used inconsistently across files
  - A type assumed safe in one file but cast unsafely in another

SKIP per-file issues already caught in a prior pass.

Return a JSON array of findings. Each finding must have:
  - files: string[] — the files involved
  - category: "MISSING_AUTH" | "INCONSISTENT_SECRET" | "CROSS_FILE_TYPE_BYPASS"
  - severity: "high" | "medium" | "low"
  - description: one sentence describing the cross-file issue
  - fix: one sentence suggesting the fix

Return ONLY the JSON array — no markdown, no explanation.

${fileBlocks}`,
      },
    ],
  });

  const raw = response.content[0].type === "text" ? response.content[0].text : "";

  console.log("Raw response from Claude:");
  console.log(raw);

  const json = raw.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
  const findings = JSON.parse(json) as Array<{
    files: string[];
    category: string;
    severity: string;
    description: string;
    fix: string;
  }>;

  console.log(`\nParsed ${findings.length} integration finding(s):`);
  findings.forEach((f, i) => {
    console.log(`  [${i + 1}] ${f.severity.toUpperCase()} — ${f.category}`);
    console.log(`       Files: ${f.files.join(", ")}`);
    console.log(`       ${f.description}`);
    console.log(`       Fix: ${f.fix}`);
  });

  return findings;
}

async function main() {
  console.log("Day 03 — Claude Code Configuration & Workflows");
  console.log("================================================");
  console.log("Domain: D3 — Claude Code Configuration & Workflows (20%)");
  console.log("This script simulates a CI code-review pipeline using the Anthropic SDK.\n");

  const pass1Findings = await reviewFile(FILE_TO_REVIEW);

  const pass2Findings = await reviewIntegration([FILE_TO_REVIEW, AUTH_MIDDLEWARE_FILE]);

  const total = pass1Findings.length + pass2Findings.length;
  console.log("\n================================================");
  console.log(`Review complete. Total findings: ${total}`);
  console.log(`  Pass 1 (per-file):        ${pass1Findings.length} finding(s)`);
  console.log(`  Pass 2 (integration):     ${pass2Findings.length} finding(s)`);
  console.log("\nKey concepts demonstrated:");
  console.log("  • Explicit REPORT/SKIP criteria eliminates style noise from CI reviews");
  console.log("  • Two-pass architecture: per-file issues + cross-file integration gaps");
  console.log("  • Always strip markdown fences — models ignore format instructions occasionally");
  console.log("  • CI invocation: 'claude -p \"...\" --output-format json' (see top of file)");
  console.log("  • Plan mode: choose upfront for multi-file/architectural changes, not mid-task");
}

main().catch(console.error);

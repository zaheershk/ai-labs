# Day 03 — Claude Code Configuration & Workflows

## Domain alignment
- **Primary:** D3 — Claude Code Configuration & Workflows (20%)
- **Task statements:** 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
- **Exam scenarios:** Code Generation with Claude Code, Claude Code for CI

## What to build

Config artifacts and a TypeScript script that demonstrates CI/CD invocation.
Most of this lab is file creation, not SDK code.

---

## Part A — CLAUDE.md hierarchy (TS 3.1)

### Project-level `CLAUDE.md` (already exists at `cca-f/CLAUDE.md`)
- Universal standards applying to all labs
- Uses `@import` to pull in a sub-file:

```md
@import ./labs/day-03-claude-code/standards/api-conventions.md
```

### Create `standards/api-conventions.md`
Modular standards file covering API handler conventions.
Demonstrates `@import` keeps the root CLAUDE.md clean.

### Key hierarchy rules to understand:
- `~/.claude/CLAUDE.md` — user-level, NOT version-controlled, NOT shared with team
- `<project-root>/CLAUDE.md` or `.claude/CLAUDE.md` — project-level, committed, shared
- Subdirectory `CLAUDE.md` — directory-level, applies to that subtree only
- Use `/memory` command to verify which files are currently loaded

---

## Part B — Path-specific rules (TS 3.3)

Create two rule files in `.claude/rules/`:

### `.claude/rules/api-conventions.md`
```yaml
---
paths: ["src/api/**/*"]
---
# API Handler Conventions
- All handlers must use async/await
- Return structured errors with { error, code, retryable }
- Never throw raw exceptions — catch and return structured responses
```

### `.claude/rules/test-conventions.md`
```yaml
---
paths: ["**/*.test.ts", "**/*.spec.ts"]
---
# Test Conventions
- Use descriptive test names: "should [behavior] when [condition]"
- Each test must have exactly one assertion focus
- Mock external dependencies at the module boundary
```

Why rules over subdirectory CLAUDE.md: test files are spread throughout
the codebase — a directory-level CLAUDE.md can't handle cross-directory patterns.

---

## Part C — Custom slash command (TS 3.2)

Create `.claude/commands/review.md`:
```md
Review the current file for:
1. Security issues (injection, auth bypass, exposed secrets)
2. Error handling gaps (unhandled rejections, missing null checks)
3. Performance anti-patterns (N+1 queries, synchronous I/O in hot paths)

Output format: markdown list, each issue with file:line, severity (high/medium/low), and fix suggestion.
```

This command is project-scoped (committed) — available to all devs on clone.
Compare: `~/.claude/commands/` is personal, never shared.

---

## Part D — Skill with frontmatter (TS 3.2)

Create `.claude/skills/analyze-codebase/SKILL.md`:
```yaml
---
name: analyze-codebase
description: Explores and maps an unfamiliar codebase structure
context: fork
allowed-tools: Read, Grep, Glob
argument-hint: "Path to analyze (default: current directory)"
---

Explore the codebase at $ARGUMENTS and produce a structured map:
1. Entry points and main execution flows
2. Key abstractions and their responsibilities
3. External dependencies and integration points
4. Potential areas of risk or complexity

Use Grep to find entry points first, then Read to trace flows.
Do NOT use Write, Edit, or Bash.
```

Key frontmatter options:
- `context: fork` — runs in isolated sub-agent; verbose output doesn't pollute main conversation
- `allowed-tools` — restricts to read-only tools; prevents destructive actions
- `argument-hint` — prompts for the path parameter when invoked without arguments

---

## Part E — `src/index.ts`: CI/CD integration (TS 3.6)

Demonstrate non-interactive Claude Code invocation:

```ts
// Simulate what a CI pipeline does:
// claude -p "Review this PR for security issues" --output-format json
//
// Key points:
// -p / --print flag → non-interactive mode, exits after response
// --output-format json → machine-parseable output for inline PR comments
// Without -p → job hangs waiting for interactive input
```

The script should:
1. Show what the correct CI invocation looks like (as a comment/string, since we can't shell out to `claude` itself)
2. Use the Anthropic SDK directly to perform a code review with explicit criteria
3. Output structured JSON findings suitable for posting as PR comments
4. Demonstrate: per-file pass for local issues + separate integration pass

### Explicit criteria (TS 4.1 crossover)
```
REPORT: SQL injection, hardcoded secrets, unhandled promise rejections, type assertion bypasses
SKIP: style preferences, variable naming, comment formatting
```

---

## Part F — Plan mode vs direct execution decision matrix (TS 3.4)

Add a comment block in `src/index.ts` mapping scenarios to mode:

| Scenario | Mode | Why |
|---|---|---|
| Fix a null pointer crash with a clear stack trace | Direct | Single file, clear cause |
| Migrate 45 files from Express v4 to v5 | Plan | Multi-file, architectural decisions |
| Add a date validation conditional | Direct | Single function, well-scoped |
| Restructure monolith into microservices | Plan | Service boundaries require exploration first |
| Choose between two auth library approaches | Plan | Multiple valid approaches, compare tradeoffs |

---

## Key concepts (exam-relevant)

- Project-level CLAUDE.md is shared via git; user-level (`~/.claude/CLAUDE.md`) is not
- `context: fork` prevents a verbose skill from exhausting the main conversation context
- Glob-pattern rules handle files spread across directories; subdirectory CLAUDE.md cannot
- `-p` flag is the **only** correct way to run Claude Code in CI — without it the job hangs
- Plan mode is for architectural decisions and multi-file changes; direct for scoped single-file changes

## Exam traps

| Wrong answer | Why it's wrong |
|---|---|
| "Put team conventions in ~/.claude/CLAUDE.md" | User-level — not shared via version control (sample Q4 variant) |
| "Use a CLAUDE.md in each test subdirectory" | Test files span directories — glob rules in .claude/rules/ are correct (sample Q6) |
| "Skills are always-loaded like CLAUDE.md" | Skills are on-demand invocation; CLAUDE.md is always-loaded |
| "Use context: fork for simple one-liners" | Fork is for verbose/exploratory skills that would pollute main context |
| "CLAUDE_HEADLESS=true runs Claude Code non-interactively" | This env var doesn't exist — use `-p` flag (sample Q10) |
| "Start direct execution then switch to plan if complexity emerges" | Complexity is already known — use plan mode from the start (sample Q5) |

## Run & validate

```bash
cd anthropic/cca-f
npm run lab-03
```

### Expected output
1. Code review runs with structured JSON findings
2. Two-pass architecture: per-file issues + cross-file integration findings
3. Only explicit criteria categories reported (no style noise)

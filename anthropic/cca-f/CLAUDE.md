# CCA-F Prep — Lab Instructions

## Stack
- Language: TypeScript
- SDK: `@anthropic-ai/sdk` only — no LangChain, no vector DBs
- Runtime: Node.js (local)
- Default model: `claude-haiku-4-5-20251001`
- Upgrade to `claude-sonnet-4-6` only when a lab explicitly requires it

## Monorepo rules
- Single `node_modules/` and `package.json` at `anthropic/cca-f/`
- Single `.env` at `anthropic/cca-f/` — `ANTHROPIC_API_KEY` only
- Each lab loads dotenv with path `../../.env` relative to its `src/`
- No per-lab `package.json` or `node_modules`

## Running labs
```bash
cd anthropic/cca-f
npm run lab-01    # Day 01
npm run lab-02    # Day 02 agent
npm run mcp-02    # Day 02 MCP server (separate terminal)
npm run lab-03    # Day 03
npm run lab-04    # Day 04
npm run lab-05    # Day 05
```

## Agentic loop guard
Every agentic loop must set `MAX_STEPS = 10` to prevent runaway API calls.

## Secrets
- All secrets in `.env` — never hardcoded
- `.env` is git-ignored

@import ./labs/day-03-claude-code/standards/api-conventions.md

## Domain map
| Lab | Domain | Weight |
|-----|--------|--------|
| Day 01 | D1 Agentic Architecture & Orchestration | 27% |
| Day 02 | D2 Tool Design & MCP Integration | 18% |
| Day 03 | D3 Claude Code Configuration & Workflows | 20% |
| Day 04 | D4 Prompt Engineering & Structured Output | 20% |
| Day 05 | D5 Context Management & Reliability | 15% |

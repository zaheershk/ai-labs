# Claude Certified Architect – Foundations Exam Prep

Hands-on 5-day lab series for the **CCA-F** certification exam.
Covers all 5 exam domains through practical TypeScript exercises using the Anthropic SDK.

## Exam domains

| Domain | Weight |
|--------|--------|
| D1 — Agentic Architecture & Orchestration | 27% |
| D2 — Tool Design & MCP Integration | 18% |
| D3 — Claude Code Configuration & Workflows | 20% |
| D4 — Prompt Engineering & Structured Output | 20% |
| D5 — Context Management & Reliability | 15% |

## 5-Day plan

| Lab | Domain focus | Scenario |
|-----|-------------|---------|
| [Day 01 — Agentic Architecture](anthropic/cca-f/labs/day-01-agentic-arch/README.md) | D1 (27%) | Customer Support Resolution Agent |
| [Day 02 — Tool Design & MCP](anthropic/cca-f/labs/day-02-tool-mcp/README.md) | D2 (18%) | Developer Productivity with Claude |
| [Day 03 — Claude Code Config](anthropic/cca-f/labs/day-03-claude-code/README.md) | D3 (20%) | Code Generation & CI/CD |
| [Day 04 — Structured Output](anthropic/cca-f/labs/day-04-structured-output/README.md) | D4 (20%) | Structured Data Extraction |
| [Day 05 — Context & Reliability](anthropic/cca-f/labs/day-05-context-reliability/README.md) | D5 (15%) | Multi-Agent Research System |

## Quick start

```bash
cd anthropic/cca-f
cp .env.example .env    # add ANTHROPIC_API_KEY
npm install
npm run lab-01          # run a lab
```

## Stack

- **Language:** TypeScript
- **SDK:** `@anthropic-ai/sdk`
- **Runtime:** Node.js (local — no cloud deployment required)
- **Default model:** `claude-haiku-4-5-20251001`

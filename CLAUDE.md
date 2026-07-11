# Claude Certified Architect – Foundations Exam Prep

## Repo layout

All work lives under `anthropic/cca-f/`.

```
anthropic/cca-f/
├── docs/exam-guide.pdf       ← official exam guide
├── CLAUDE.md                 ← lab-level instructions (read this next)
├── .env.example
├── package.json              ← npm run lab-01 … lab-05 | mcp-02
├── tsconfig.json
└── labs/
    ├── day-01-agentic-arch/
    ├── day-02-tool-mcp/
    ├── day-03-claude-code/
    ├── day-04-structured-output/
    └── day-05-context-reliability/
```

## Quick start

```bash
cd anthropic/cca-f
cp .env.example .env          # add your ANTHROPIC_API_KEY
npm install
npm run lab-01                # run a lab
```

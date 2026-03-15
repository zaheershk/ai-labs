# Day 01 — First Agent: Tool Use & the ReAct Loop

## Problem Statement
A plain LLM call is stateless and can't act on the world — it can only generate text. This challenge builds the simplest form of an **agent**: a loop where the model reasons about what to do, calls a tool, observes the result, and repeats until it has enough information to answer. The concrete scenario is an AWS cost estimator that must look up prices and perform arithmetic across multiple steps.

## Industry Relevance
ReAct-style agents underpin most real-world AI assistants today:
- **FinOps / cloud cost management** — agents that query billing APIs, flag anomalies, and suggest right-sizing
- **IT helpdesk automation** — agent looks up tickets, runs diagnostics, updates records without human hand-off
- **Sales/RevOps copilots** — agent queries CRM, checks inventory, calculates quotes in one conversation turn
- **Customer support bots** — multi-step resolution: look up order → check policy → issue refund

The pattern is universal: any task requiring *fetch data → reason → act → repeat* maps to this loop.

## Architecture & Design

```
User prompt
  └─▶ Claude (reasons)  ──stop_reason=tool_use──▶  Tool executor
        ▲                                                │
        └──────── tool_result fed back ─────────────────┘
  └─▶ Claude (end_turn) ──▶ Final answer
```

**Key design decisions (ADRs):**

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Single agentic loop in one file | Keeps Day 1 minimal; no abstraction layers to distract from the core pattern |
| 2 | Hardcoded pricing catalog | Removes network dependency; focus is the loop, not real API integration |
| 3 | `new Function()` for calculator | Safer scope than raw `eval`; acceptable for a controlled internal tool |
| 4 | Max 10 steps safety ceiling | Prevents runaway loops; standard practice in production agents |
| 5 | Full message history passed each turn | Required by the API — Claude has no server-side memory; history IS the context |

## Alternative Tech Stack
Other frameworks/tools that implement the same pattern:

| Tool | Notes |
|------|-------|
| **LangChain (JS/Python)** | `AgentExecutor` + `Tool` — higher abstraction, more boilerplate |
| **LangGraph** | Adds explicit state graph; better for complex branching agents |
| **OpenAI Assistants API** | Managed loop + thread persistence; less control, vendor lock-in |
| **AWS Bedrock Agents** | Fully managed ReAct agent; integrates with Lambda for tool execution |
| **Semantic Kernel (C#/Python)** | Microsoft's agentic framework; strong Azure/M365 integration |
| **Vercel AI SDK** | Lightweight JS alternative with `useChat` + tool support for web UIs |

**When to use the raw SDK approach (like this challenge):** prototyping, learning, or when you need full control over the loop and message history.

## Run & Validate

**Setup:**
```bash
cd challenges/day-01-first-agent
cp .env.example .env          # then fill in ANTHROPIC_API_KEY
npm install
```

**Run:**
```bash
npm start                                                    # default question
npm start "5 EC2 t3.large instances — monthly and yearly cost?"  # custom question
```

**What to look for (validation):**
- Each step prints `stop_reason = "tool_use"` until the final `end_turn`
- `TOOL CALL` + `TOOL RESULT` lines confirm the loop is executing tools
- The agent should call `get_cloud_pricing` before `calculator` (correct ordering)
- Final answer should match manual calculation from the catalog prices

**Stretch tasks:**
1. Force 3+ tool calls with a complex multi-service question
2. Add a `convert_currency(usd, currency)` tool with hardcoded rates
3. Pass a service not in the catalog — observe how Claude handles the fallback message

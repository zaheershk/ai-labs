# AI Labs — Claude Code Context

## Who I am
Solution Architect at EPAM Systems (India). Engage in presales (RFP) and solution design/implementation for customers across: Financial Services/Insurance, Retail/Supply Chain, Manufacturing, Energy, Travel/Hospitality, IT/Operations.
Goal: build hands-on agentic AI skills to design and pitch AI-first solutions to customers.

## What this repo is
A daily "Challenge of the Day" series building up Agentic AI skills progressively.
Each challenge lives in its own folder under `challenges/`.

## Tech stack preferences
1. Anthropic ecosystem (`@anthropic-ai/sdk`, Claude models) — preferred but not exclusive
2. Most relevant OSS libraries (LangChain, LangGraph, etc. where appropriate)
3. AWS / GCP / Azure
4. TypeScript — all challenges use TypeScript
5. VS Code + Claude Code

## Curriculum approach
- Small, focused daily challenges — not overwhelming
- Breadth-first; depth on significant topics (RAG, multi-agent, evals)
- ~5 min theory + hands-on code each day
- Industry-relevant scenarios drawn from real customer domains
- Variety across ecosystems — different challenges may use different stacks

## 30-Day Curriculum

### Phase 1 — Agentic Foundations (Days 01–05)
| Day | Topic | Ecosystem | Industry Scenario | Status |
|-----|-------|-----------|-------------------|--------|
| 01 | First Agent — Tool Use & ReAct Loop | Anthropic SDK | Cloud cost estimator | 🔄 In Progress |
| 02 | Structured Outputs & Prompt Engineering | Anthropic SDK | Insurance claim triage | ⬜ |
| 03 | Multi-turn Conversations & System Prompts | Anthropic SDK | Retail customer support bot | ⬜ |
| 04 | Tool Use with Real External APIs | Anthropic SDK + REST | Travel: live flight/hotel lookup | ⬜ |
| 05 | Error Handling & Resilience in Agents | Anthropic SDK | IT/Ops: incident response agent | ⬜ |

### Phase 2 — Memory & State (Days 06–08)
| Day | Topic | Ecosystem | Industry Scenario | Status |
|-----|-------|-----------|-------------------|--------|
| 06 | In-Context Memory & Conversation Summarization | Anthropic SDK | Long-running support thread | ⬜ |
| 07 | External Memory — Vector Store (RAG intro) | Anthropic + pgvector | HR policy Q&A assistant | ⬜ |
| 08 | Persistent Agent State | Anthropic + Redis/file | Supply chain order tracker | ⬜ |

### Phase 3 — RAG Deep Dive ★ (Days 09–11)
| Day | Topic | Ecosystem | Industry Scenario | Status |
|-----|-------|-----------|-------------------|--------|
| 09 | RAG Pipeline — Ingest, Embed, Retrieve | LangChain + OpenAI embeddings | Legal/contract analysis (FinServ) | ⬜ |
| 10 | Advanced RAG — Chunking, Hybrid Search, Reranking | LangChain + Pinecone | Financial research assistant | ⬜ |
| 11 | RAG Evaluation — Measuring Retrieval Quality | RAGAs + LangSmith | Validate a RAG pipeline | ⬜ |

### Phase 4 — Multi-Agent Systems ★ (Days 12–15)
| Day | Topic | Ecosystem | Industry Scenario | Status |
|-----|-------|-----------|-------------------|--------|
| 12 | Orchestrator + Subagent Pattern | Anthropic SDK | RFP response generator | ⬜ |
| 13 | Stateful Workflows with LangGraph | LangGraph | Insurance claim processing workflow | ⬜ |
| 14 | Parallel Agent Execution | Anthropic SDK | Market research with parallel agents | ⬜ |
| 15 | Agent Routing & Handoffs | Anthropic SDK | Customer service triage (multi-domain) | ⬜ |

### Phase 5 — UX & Streaming (Days 16–17)
| Day | Topic | Ecosystem | Industry Scenario | Status |
|-----|-------|-----------|-------------------|--------|
| 16 | Streaming Responses | Anthropic SDK | Real-time analyst copilot | ⬜ |
| 17 | Simple Agent UI (chat interface) | Vercel AI SDK + Next.js | Internal knowledge base chat | ⬜ |

### Phase 6 — Safety & Observability (Days 18–19)
| Day | Topic | Ecosystem | Industry Scenario | Status |
|-----|-------|-----------|-------------------|--------|
| 18 | Guardrails & Input/Output Validation | Anthropic + custom validators | Banking: prevent data leakage | ⬜ |
| 19 | Observability & Tracing | LangSmith / OpenTelemetry | Debug and monitor a broken agent | ⬜ |

### Phase 7 — Domain Applications (Days 20–24)
| Day | Topic | Ecosystem | Industry Scenario | Status |
|-----|-------|-----------|-------------------|--------|
| 20 | Document Processing Agent | Anthropic SDK | Invoice & contract extraction (FinServ) | ⬜ |
| 21 | Data Analysis Agent | Anthropic + Python/pandas tools | Retail: sales trend Q&A | ⬜ |
| 22 | Code Generation & Review Agent | Anthropic SDK | IT/Ops: automated code review | ⬜ |
| 23 | Web Research Agent | Anthropic + search/browser tools | Manufacturing: supplier research | ⬜ |
| 24 | Notification & Communication Agent | Anthropic + email/Slack webhooks | Ops: intelligent alert summarization | ⬜ |

### Phase 8 — Deployment (Days 25–27)
| Day | Topic | Ecosystem | Industry Scenario | Status |
|-----|-------|-----------|-------------------|--------|
| 25 | Deploy Agent as REST API | AWS Lambda + API Gateway | Expose agent for enterprise integration | ⬜ |
| 26 | Multi-tenant Agent with Auth & Rate Limiting | AWS / Node.js | SaaS agent for multiple customers | ⬜ |
| 27 | Cost Optimisation — Caching & Prompt Compression | Anthropic + Redis | Reduce inference costs in production | ⬜ |

### Phase 9 — Evals & Capstone ★ (Days 28–30)
| Day | Topic | Ecosystem | Industry Scenario | Status |
|-----|-------|-----------|-------------------|--------|
| 28 | Agent Evaluation Framework | PromptFoo / custom harness | Measure agent quality systematically | ⬜ |
| 29 | Prompt Optimisation & A/B Testing | Anthropic evals + PromptFoo | Improve a production prompt pipeline | ⬜ |
| 30 | Capstone — End-to-End Agentic Application | Mixed stack | Full enterprise use case (TBD) | ⬜ |

★ = significant topic, receives extra depth across multiple days

## Starting a new challenge
```bash
./new-challenge.sh <NN> <slug>   # e.g. ./new-challenge.sh 02 structured-outputs
```
This scaffolds the full folder from `challenges/_template/` with correct tsconfig, package.json, .env.example, README, and agent boilerplate.

## Git conventions
- Commit once per completed challenge: `git commit -m "day-NN: <topic>"`
- Only commit source files — never `node_modules`, `.env`, `dist/`, or lock files
- `_template/` is committed as it is part of the project scaffold

## Ground rules
- Keep each day self-contained with its own `package.json` / `requirements.txt`
- Each challenge README must follow the 5-section structure: Problem Statement · Industry Relevance · Architecture & Design (ADRs) · Alternative Tech Stack · Run & Validate

## Sensitive data & secrets
- All secrets (API keys, credentials) **must** be stored in a `.env` file — never hardcoded
- `.env` is git-ignored at root level — it will never be committed
- Every challenge **must** include a `.env.example` listing the required keys with blank values
- The root `.env.example` is the master reference for all keys used across the 30 days
- When running a challenge: `cp .env.example .env` then fill in values

## Cost management
- **Default model for all challenges: `claude-haiku-4-5-20251001`** — cheap, fast, sufficient for learning patterns
- **Switch to `claude-sonnet-4-6` only** when explicitly noted in a challenge (e.g. complex reasoning, final demo runs)
- Every agent loop **must** have a `MAX_STEPS` ceiling (≤ 10) to prevent runaway calls
- Use **free tiers** for all third-party services: Pinecone (free), LangSmith (free dev), AWS (free tier), pgvector (Docker local)
- For challenges needing external APIs (flights, search, etc.) — use **mock/stub data by default**; note where a real API key would plug in
- Set a monthly spend limit in Anthropic Console as a hard safety net

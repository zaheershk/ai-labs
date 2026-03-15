# AI Labs

A daily hands-on challenge series for learning Agentic AI patterns — tool use, memory, multi-agent coordination, RAG, evals, and deployment.

**Stack:** TypeScript (primary) · Python · Anthropic SDK · LangChain · LangGraph · AWS · and more

---

## 30-Day Curriculum

### Phase 1 — Agentic Foundations
| Day | Topic | Ecosystem | Status |
|-----|-------|-----------|--------|
| 01 | [First Agent — Tool Use & ReAct Loop](challenges/day-01-first-agent/) | Anthropic SDK | 🔄 In Progress |
| 02 | Structured Outputs & Prompt Engineering | Anthropic SDK | ⬜ |
| 03 | Multi-turn Conversations & System Prompts | Anthropic SDK | ⬜ |
| 04 | Tool Use with Real External APIs | Anthropic SDK + REST | ⬜ |
| 05 | Error Handling & Resilience in Agents | Anthropic SDK | ⬜ |

### Phase 2 — Memory & State
| Day | Topic | Ecosystem | Status |
|-----|-------|-----------|--------|
| 06 | In-Context Memory & Conversation Summarization | Anthropic SDK | ⬜ |
| 07 | External Memory — Vector Store (RAG intro) | Anthropic + pgvector | ⬜ |
| 08 | Persistent Agent State | Anthropic + Redis | ⬜ |

### Phase 3 — RAG Deep Dive ★
| Day | Topic | Ecosystem | Status |
|-----|-------|-----------|--------|
| 09 | RAG Pipeline — Ingest, Embed, Retrieve | LangChain + OpenAI embeddings | ⬜ |
| 10 | Advanced RAG — Chunking, Hybrid Search, Reranking | LangChain + Pinecone | ⬜ |
| 11 | RAG Evaluation — Measuring Retrieval Quality | RAGAs + LangSmith | ⬜ |

### Phase 4 — Multi-Agent Systems ★
| Day | Topic | Ecosystem | Status |
|-----|-------|-----------|--------|
| 12 | Orchestrator + Subagent Pattern | Anthropic SDK | ⬜ |
| 13 | Stateful Workflows with LangGraph | LangGraph | ⬜ |
| 14 | Parallel Agent Execution | Anthropic SDK | ⬜ |
| 15 | Agent Routing & Handoffs | Anthropic SDK | ⬜ |

### Phase 5 — UX & Streaming
| Day | Topic | Ecosystem | Status |
|-----|-------|-----------|--------|
| 16 | Streaming Responses | Anthropic SDK | ⬜ |
| 17 | Simple Agent UI (chat interface) | Vercel AI SDK + Next.js | ⬜ |

### Phase 6 — Safety & Observability
| Day | Topic | Ecosystem | Status |
|-----|-------|-----------|--------|
| 18 | Guardrails & Input/Output Validation | Anthropic + custom validators | ⬜ |
| 19 | Observability & Tracing | LangSmith / OpenTelemetry | ⬜ |

### Phase 7 — Domain Applications
| Day | Topic | Ecosystem | Status |
|-----|-------|-----------|--------|
| 20 | Document Processing Agent | Anthropic SDK | ⬜ |
| 21 | Data Analysis Agent | Anthropic + Python/pandas | ⬜ |
| 22 | Code Generation & Review Agent | Anthropic SDK | ⬜ |
| 23 | Web Research Agent | Anthropic + search tools | ⬜ |
| 24 | Notification & Communication Agent | Anthropic + Slack/email | ⬜ |

### Phase 8 — Deployment
| Day | Topic | Ecosystem | Status |
|-----|-------|-----------|--------|
| 25 | Deploy Agent as REST API | AWS Lambda + API Gateway | ⬜ |
| 26 | Multi-tenant Agent with Auth & Rate Limiting | AWS / Node.js | ⬜ |
| 27 | Cost Optimisation — Caching & Prompt Compression | Anthropic + Redis | ⬜ |

### Phase 9 — Evals & Capstone ★
| Day | Topic | Ecosystem | Status |
|-----|-------|-----------|--------|
| 28 | Agent Evaluation Framework | PromptFoo / custom harness | ⬜ |
| 29 | Prompt Optimisation & A/B Testing | Anthropic evals + PromptFoo | ⬜ |
| 30 | Capstone — End-to-End Agentic Application | Mixed stack | ⬜ |

★ = significant topic, receives extra depth across multiple days

---

## Structure

Each challenge is self-contained under `challenges/day-NN-<topic>/`:
- `README.md` — problem statement · industry relevance · architecture & ADRs · alternative stack · run & validate
- `src/` — implementation
- `package.json` / `requirements.txt` — isolated dependencies

## Quick Start

```bash
export ANTHROPIC_API_KEY=your_key_here
cd challenges/day-NN-<topic>
npm install && npm start
```

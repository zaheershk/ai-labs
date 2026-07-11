# Day 01 — Agentic Architecture & Orchestration

## Domain alignment
- **Primary:** D1 — Agentic Architecture & Orchestration (27%)
- **Task statements:** 1.1, 1.2, 1.4, 1.5, 1.6, 1.7
- **Exam scenario:** Customer Support Resolution Agent

## What to build

A customer support agent that handles returns, billing disputes, and account issues.

### Tools (mock implementations — no real backend needed)
| Tool | Purpose |
|------|---------|
| `get_customer` | Look up customer by email or ID — must run before any other tool |
| `lookup_order` | Retrieve order details by order ID |
| `process_refund` | Issue a refund for an order |
| `escalate_to_human` | Hand off to a human agent with a structured summary |

### Agentic loop (TS 1.1)
- Continue when `stop_reason === "tool_use"`
- Terminate when `stop_reason === "end_turn"`
- `MAX_STEPS = 10` hard cap
- Never parse text content to decide loop termination

### Programmatic prerequisite gate (TS 1.4)
- `lookup_order` and `process_refund` are blocked until `get_customer` has returned a verified customer ID
- Implemented in code — not in the system prompt

### PostToolUse hook — data normalization (TS 1.5)
Intercept tool results and normalize before the model sees them:
- Unix timestamps → ISO 8601
- Numeric status codes → human-readable strings (`1` → `"active"`, `0` → `"inactive"`)
- Inconsistent date formats → `YYYY-MM-DD`

### Tool call interception hook (TS 1.5)
- Intercept outgoing `process_refund` calls
- Block if `amount > 500`
- Redirect to `escalate_to_human` with reason `"refund_exceeds_threshold"`

### Structured handoff summary (TS 1.4)
When escalating, compile:
```ts
{
  customer_id: string,
  customer_name: string,
  order_id: string,
  issue_summary: string,
  refund_amount: number,
  recommended_action: string,
  conversation_turns: number
}
```

### Session awareness (TS 1.7)
Add a comment block explaining:
- When to use `--resume <session-name>` (prior context mostly valid)
- When to start fresh with injected summary (prior tool results stale)
- What `fork_session` is for (divergent approach exploration)

## Key concepts (exam-relevant)

- `stop_reason` is the only correct loop termination signal — never text content
- Hooks provide **deterministic** guarantees; prompt instructions provide **probabilistic** compliance
- Programmatic prerequisites block at the code layer — a 12% skip rate in prod means prompt-only enforcement is insufficient
- Structured handoff summaries must be self-contained — the human agent has no access to the transcript

## Exam traps

| Wrong answer | Why it's wrong |
|---|---|
| "Add a system prompt instruction to always call get_customer first" | Probabilistic — still fails in ~12% of cases per sample Q1 |
| "Terminate the loop when the assistant message contains 'resolved'" | Parsing text content — anti-pattern per TS 1.1 |
| "Set an iteration cap of 5 as the primary stopping mechanism" | Iteration caps are a safety net, not the primary stop signal |
| "Use sentiment analysis to trigger escalation" | Sentiment ≠ case complexity — wrong proxy per sample Q3 |

## Run & validate

```bash
cd anthropic/cca-f
npm run lab-01
```

### Expected output
1. Agent calls `get_customer` first — always
2. Attempting `process_refund` with amount > $500 triggers interception → escalation
3. Attempting `lookup_order` before `get_customer` completes → blocked with explanation
4. Final escalation includes structured handoff JSON
5. Loop terminates on `end_turn`, not on text content

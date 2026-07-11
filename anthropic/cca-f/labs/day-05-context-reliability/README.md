# Day 05 — Context Management & Reliability

## Domain alignment
- **Primary:** D5 — Context Management & Reliability (15%)
- **Task statements:** 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
- **Cross-domain integration:** D1 (TS 1.2, 1.3), D2 (TS 2.2), D4 (TS 4.2)
- **Exam scenario:** Multi-Agent Research System

## What to build

A multi-agent research pipeline with a coordinator + 2 parallel subagents,
demonstrating all D5 reliability and context patterns.

---

## Architecture

```
Coordinator Agent
├── allowedTools: ["Task", "Write"]
├── Spawns both subagents in a single response (parallel)
│
├── Subagent A: Web Search
│   ├── Tools: search_web (mock), verify_source (mock)
│   └── Returns: structured claim-source mappings
│
└── Subagent B: Document Analysis
    ├── Tools: read_document (mock), extract_facts (mock)
    └── Returns: structured claim-source mappings + field confidence scores
```

---

## Part A — Case facts block (TS 5.1)

When tools return verbose output (e.g., a 40-field order record when only 5 fields matter),
trim at the source and extract into a persistent block:

```ts
interface CaseFacts {
  research_topic: string;
  key_claims: string[];         // extracted, not full tool output
  sources_consulted: string[];
  pending_questions: string[];
  session_start: string;        // ISO 8601
}
```

This block is injected at the **top** of every subsequent prompt — not buried in history.

Key rule: transactional facts (dates, amounts, IDs, statuses) must survive summarization intact.
Never condense `"$247.50 refund requested on 2024-03-15"` into `"customer wants a refund"`.

---

## Part B — Parallel subagent spawning (TS 1.2, 1.3)

The coordinator must emit **both** Task calls in a **single response** — not across two turns:

```ts
// CORRECT: two Task tool calls in one response
const response = await client.messages.create({
  tools: [taskTool],
  tool_choice: { type: "any" },
  messages: [...conversationHistory, {
    role: "user",
    content: "Research the topic and return structured findings"
  }]
});
// response.content will have two tool_use blocks — both subagents spawn in parallel
```

Each subagent prompt must include **complete prior findings** — subagents do not
inherit coordinator context automatically.

---

## Part C — Structured claim-source mappings (TS 5.6)

Subagents must return findings in this shape (not narrative summaries):

```ts
interface ClaimSource {
  claim: string;
  evidence_excerpt: string;
  source_url: string;
  source_name: string;
  publication_date: string;    // ISO 8601 — prevents temporal misinterpretation
  confidence: "high" | "medium" | "low";
}
```

The synthesis step must **preserve** these mappings — not compress into prose.

When sources conflict on a statistic: annotate both with attribution, do not arbitrarily pick one:
```ts
{
  claim: "Market size is $X (Source A) or $Y (Source B)",
  conflict_detected: true,
  source_a: { value: "X", url: "...", date: "..." },
  source_b: { value: "Y", url: "...", date: "..." }
}
```

---

## Part D — Structured error propagation (TS 5.3)

Simulate a subagent timeout. The subagent must return:

```ts
{
  status: "partial_failure",
  failure_type: "timeout",        // NOT just "search unavailable"
  attempted_query: "...",
  partial_results: [...],         // whatever was found before timeout
  alternative_approaches: [
    "retry with narrower query",
    "search alternative source"
  ],
  is_empty_result: false          // false = access failure; true = valid empty result
}
```

The coordinator uses `is_empty_result` to distinguish:
- `false` → access failure → retry or use alternative approach
- `true` → valid empty result (no matches exist) → proceed with partial coverage, annotate gap

Anti-patterns to avoid (add as comment block):
- Silent suppression: returning empty results as success
- Workflow termination: halting entire pipeline on one subagent failure
- Generic status: `"search unavailable"` hides context from coordinator

---

## Part E — Scratchpad file (TS 5.4)

The coordinator writes key findings to disk between phases:

```ts
// After phase 1 (parallel subagents complete):
const scratchpad: Scratchpad = {
  topic: researchTopic,
  phase: 1,
  claims: [...collectedClaims],
  coverage_gaps: [...identifiedGaps],
  sources_visited: [...urls],
  timestamp: new Date().toISOString()
};
fs.writeFileSync("./scratchpad.json", JSON.stringify(scratchpad, null, 2));

// Before phase 2 (spawning synthesis subagent):
const prior = JSON.parse(fs.readFileSync("./scratchpad.json", "utf-8"));
// Inject prior.claims and prior.coverage_gaps into synthesis subagent prompt
```

This enables crash recovery: if the coordinator crashes mid-workflow,
resuming loads the scratchpad and skips completed phases.

---

## Part F — Human review routing (TS 5.5)

Route extractions based on field-level confidence:

```ts
function routeForReview(claims: ClaimSource[]): {
  autoApproved: ClaimSource[];
  humanReview: ClaimSource[];
} {
  return {
    autoApproved: claims.filter(c => c.confidence === "high"),
    humanReview: claims.filter(c =>
      c.confidence === "low" ||
      c.confidence === "medium" ||
      (c as any).conflict_detected === true
    )
  };
}
```

Key insight: 97% aggregate accuracy can hide 40% failure on a specific field.
Validate accuracy by **document type AND field** before reducing human review.

---

## Part G — Escalation criteria (TS 5.2)

Add explicit escalation criteria with few-shot examples to the coordinator system prompt:

```
ESCALATE IMMEDIATELY (no investigation first):
- Customer explicitly requests a human agent
- Policy is silent or ambiguous on the specific request

DO NOT escalate:
- Customer expresses frustration (acknowledge + offer to resolve)
- Agent self-reports low confidence (confidence ≠ complexity)
- Multiple customers match — ask for additional identifiers instead

Example — escalate:
User: "I want to speak to a human right now"
Action: escalate_to_human immediately. Do not say "let me try to help first."

Example — do not escalate:
User: "This is ridiculous, my order is 3 weeks late!"
Action: acknowledge frustration, look up order, offer resolution.
Escalate only if customer reiterates after you offer to resolve.
```

---

## Key concepts (exam-relevant)

- "Lost in the middle" effect: place key summaries at the TOP of long inputs
- Tool results accumulate disproportionately — trim verbose output before it enters context
- Subagents do NOT inherit coordinator context — pass complete prior findings in each prompt
- Parallel subagents = multiple Task calls in ONE coordinator response, not across turns
- Scratchpad files counteract context degradation in extended sessions
- `is_empty_result` flag distinguishes access failure (retry needed) from valid empty (proceed with gap)

## Exam traps

| Wrong answer | Why it's wrong |
|---|---|
| "Emit Task calls across two separate coordinator turns for parallel execution" | Parallel = single response with multiple Task calls (TS 1.3) |
| "Summarize all findings into prose before passing to synthesis" | Loses claim-source attribution — synthesis can't preserve what it doesn't receive |
| "Escalate when customer sentiment score exceeds threshold" | Sentiment ≠ complexity; self-reported confidence unreliable (TS 5.2) |
| "Return empty results on subagent timeout to avoid blocking" | Silent suppression — coordinator cannot make recovery decisions (sample Q8) |
| "97% accuracy means human review can be reduced" | Aggregate masks field-level failures — validate by doc type AND field (TS 5.5) |
| "Use /compact to start fresh when context fills" | /compact reduces context while maintaining continuity — use it instead of restarting |

## Run & validate

```bash
cd anthropic/cca-f
npm run lab-05
```

### Expected output
1. Both subagents spawned in a single coordinator response (parallel)
2. Simulated timeout returns structured error with `is_empty_result: false`
3. Coordinator proceeds with partial results, annotates coverage gap in final output
4. All claims include `source_url` and `publication_date` (no provenance loss)
5. Conflicting statistics show both values with source attribution
6. Scratchpad file written to disk between phases
7. Low-confidence claims routed to human review queue
8. Explicit customer escalation request → immediate escalation (no investigation first)

# Day 04 — Prompt Engineering & Structured Output

## Domain alignment
- **Primary:** D4 — Prompt Engineering & Structured Output (20%)
- **Task statements:** 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
- **Exam scenarios:** Structured Data Extraction, Claude Code for CI

## What to build

A document extraction pipeline with validation-retry, few-shot prompting,
batch processing, and multi-pass review.

---

## Part A — Extraction tool with JSON schema (TS 4.3)

Define an extraction tool covering all schema design patterns:

```ts
const extractionTool = {
  name: "extract_contract_data",
  description: "Extract structured data from a contract document",
  input_schema: {
    type: "object",
    properties: {
      // Required fields
      contract_id:    { type: "string" },
      parties:        { type: "array", items: { type: "string" } },
      effective_date: { type: "string", description: "ISO 8601 date" },

      // Nullable fields — document may not contain these
      expiry_date:    { type: ["string", "null"], description: "null if open-ended" },
      total_value:    { type: ["number", "null"], description: "null if not stated" },
      penalty_clause: { type: ["string", "null"], description: "null if absent" },

      // Enum + "other" + detail pattern
      contract_type: {
        type: "string",
        enum: ["service", "employment", "nda", "partnership", "license", "other"]
      },
      contract_type_detail: {
        type: ["string", "null"],
        description: "Required when contract_type is 'other'"
      },

      // Confidence + ambiguity
      extraction_confidence: {
        type: "string",
        enum: ["high", "medium", "low", "unclear"]
      }
    },
    required: ["contract_id", "parties", "effective_date", "contract_type", "extraction_confidence"]
  }
}
```

### tool_choice demonstrations
Three separate API calls:
1. `tool_choice: { type: "auto" }` — may or may not extract
2. `tool_choice: { type: "any" }` — guarantees extraction is called
3. `tool_choice: { type: "tool", name: "extract_contract_data" }` — forces this specific tool

---

## Part B — Validation-retry loop (TS 4.4)

After extraction, validate:
- `effective_date` is a valid ISO 8601 date
- If `contract_type === "other"`, `contract_type_detail` must not be null
- If `total_value` is present, it must be > 0

On validation failure, retry with:
```
Original document: [document]
Your previous extraction: [failed extraction JSON]
Validation errors:
- effective_date "March 5th 2024" is not ISO 8601 — use "2024-03-05"
- contract_type is "other" but contract_type_detail is null — provide a description

Please re-extract correcting these specific errors.
```

Track two categories of retry outcomes:
- **Resolvable:** format mismatches, structural errors → retry succeeds
- **Unresolvable:** information simply absent from document → retry never helps

---

## Part C — Few-shot examples (TS 4.2)

Add 3 few-shot examples to the system prompt demonstrating:

**Example 1 — Inline citation vs bibliography:**
Show the model extracting `effective_date` from both:
- `"This agreement effective as of January 15, 2024"` → `"2024-01-15"`
- A document where date is only in a footer reference → extract correctly

**Example 2 — Ambiguous contract type:**
Show reasoning for choosing `"other"` over `"service"` when the contract spans
multiple categories, with `contract_type_detail` filled appropriately.

**Example 3 — Absent value → null (not fabricated):**
Show that when `penalty_clause` is not mentioned anywhere in the document,
the correct output is `null`, not a fabricated generic clause.

---

## Part D — Explicit review criteria (TS 4.1)

Demonstrate the difference in a code review scenario:

**Vague (wrong):**
```
Review this code and only report high-confidence issues.
```

**Explicit (correct):**
```
REPORT these categories:
- SQL injection (string concatenation in queries)
- Hardcoded secrets (API keys, passwords in source)
- Unhandled promise rejections (floating promises, missing catch)
- Unsafe type assertions (as any, as unknown casts)

SKIP these categories:
- Variable naming preferences
- Comment style
- Import ordering
- Code formatting
```

Implement both and compare output — explicit criteria produces fewer false positives.

---

## Part E — Message Batches API (TS 4.5)

Submit a small batch of 5 sample documents:
```ts
const batch = await anthropic.messages.batches.create({
  requests: documents.map((doc, i) => ({
    custom_id: `contract-${i}`,
    params: {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      tools: [extractionTool],
      tool_choice: { type: "any" },
      messages: [{ role: "user", content: doc }]
    }
  }))
});
```

Poll for completion and handle results by `custom_id`.
Demonstrate failure resubmission: identify failed `custom_id`s and resubmit only those.

Key facts to know (no implementation detail needed, just understanding):
- 50% cost savings vs synchronous API
- Up to 24-hour processing window — no guaranteed latency SLA
- Does NOT support multi-turn tool calling within a single request
- Appropriate for: overnight reports, weekly audits, nightly test generation
- NOT appropriate for: blocking pre-merge checks

---

## Part F — Multi-pass review architecture (TS 4.6)

Two-pass approach for a multi-file PR:
```
Pass 1 (per-file): Send each file individually → local issues per file
Pass 2 (integration): Send all file summaries together → cross-file data flow issues
```

Add a comment block explaining why this beats single-pass:
- Single-pass on 14 files → attention dilution → inconsistent depth, contradictory findings
- Larger context window does NOT solve attention quality issues
- Independent review instance (no generation context) catches subtle issues self-review misses

---

## Key concepts (exam-relevant)

- `tool_use` with JSON schema eliminates syntax errors but NOT semantic errors
- Nullable fields prevent fabrication — required fields with absent data cause hallucination
- Retry is effective for format errors; ineffective when information is simply absent from source
- Few-shot examples generalize to novel patterns; they don't just match pre-specified cases
- Batch API has no latency SLA — never use for blocking workflows
- `custom_id` is how you correlate batch requests to responses and resubmit failures

## Exam traps

| Wrong answer | Why it's wrong |
|---|---|
| "JSON schema guarantees correct output" | Eliminates syntax errors only — semantic errors (wrong field, values don't sum) still occur |
| "Add 'be conservative, only report high-confidence findings'" | Vague confidence filtering doesn't reduce false positives — explicit categorical criteria does (TS 4.1) |
| "Use batch API for pre-merge checks to save costs" | Batch has 24h window, no SLA — developers can't wait (sample Q11) |
| "Run 3 passes on full PR, flag issues appearing in 2+" | Suppresses real bugs that are only caught intermittently (sample Q12) |
| "Switch to a larger model for better multi-file attention" | Larger context window ≠ better attention quality — multi-pass is the fix |

## Run & validate

```bash
cd anthropic/cca-f
npm run lab-04
```

### Expected output
1. Extraction with nullable fields returns `null` (not fabricated values) for absent data
2. Validation failure triggers retry with specific error messages
3. Retry succeeds for format errors; marks unresolvable when data is absent
4. Batch submission completes with `custom_id` correlation
5. Two-pass review produces per-file + integration findings

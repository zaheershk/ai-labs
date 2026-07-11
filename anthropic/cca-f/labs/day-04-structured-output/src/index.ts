import Anthropic from "@anthropic-ai/sdk";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const client = new Anthropic();

// ─── Sample contract document ─────────────────────────────────────────────────
const SAMPLE_CONTRACT = `
CONSULTING SERVICES AGREEMENT

This agreement is entered into as of March 5th 2024 between Acme Corp ("Client")
and Bright Solutions Ltd ("Consultant").

The Consultant will provide software development services for a total value of
$45,000 USD. This agreement has no fixed expiry date.

In the event of early termination by the Client, a penalty of 20% of the
remaining contract value shall apply.

Contract reference: CSA-2024-0042
`;

// ─── Extraction tool schema (TS 4.3) ─────────────────────────────────────────
// Schema design patterns demonstrated here:
//   - required fields: always present, extraction must fill them
//   - nullable fields: use ["string", "null"] — forces explicit null vs fabrication
//   - enum + "other" + detail: structured enumeration with an escape hatch
//   - confidence field: lets the model signal uncertainty rather than guess
const extractionTool: Anthropic.Tool = {
  name: "extract_contract_data",
  description: "Extract structured data from a contract document",
  input_schema: {
    type: "object" as const,
    properties: {
      contract_id:    { type: "string", description: "Contract reference number" },
      parties:        { type: "array", items: { type: "string" }, description: "All named parties" },
      effective_date: { type: "string", description: "ISO 8601 date e.g. 2024-03-05" },

      // Nullable — document may not mention these; null prevents fabrication
      expiry_date:    { type: ["string", "null"] as any, description: "ISO 8601 date, or null if open-ended" },
      total_value:    { type: ["number", "null"] as any, description: "Numeric USD amount, or null if not stated" },
      penalty_clause: { type: ["string", "null"] as any, description: "Summary of penalty clause, or null if absent" },

      // Enum + "other" escape hatch + detail field
      contract_type: {
        type: "string",
        enum: ["service", "employment", "nda", "partnership", "license", "other"],
      },
      contract_type_detail: {
        type: ["string", "null"] as any,
        description: "Required when contract_type is 'other' — describe the type",
      },

      // Confidence signal — exam key: model flags uncertainty rather than fabricates
      extraction_confidence: {
        type: "string",
        enum: ["high", "medium", "low", "unclear"],
      },
    },
    required: [
      "contract_id",
      "parties",
      "effective_date",
      "contract_type",
      "extraction_confidence",
    ],
  },
};

// ─── tool_choice demo (TS 4.3) ────────────────────────────────────────────────
// Three modes, three different guarantees:
//   auto  → Claude decides whether to call any tool (may respond in plain text)
//   any   → Claude must call at least one tool (but picks which one)
//   tool  → Claude must call this specific tool (strongest guarantee)
async function demoToolChoice() {
  console.log("\n=== STEP 1: tool_choice modes ===\n");

  const modes: Array<{ label: string; tool_choice: Anthropic.ToolChoice }> = [
    {
      label: "auto  — Claude decides whether to extract",
      tool_choice: { type: "auto" },
    },
    {
      label: "any   — extraction guaranteed, Claude picks the tool",
      tool_choice: { type: "any" },
    },
    {
      label: "tool  — forces extract_contract_data specifically",
      tool_choice: { type: "tool", name: "extract_contract_data" },
    },
  ];

  for (const { label, tool_choice } of modes) {
    console.log(`--- ${label} ---`);

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      tools: [extractionTool],
      tool_choice,
      messages: [
        {
          role: "user",
          content: `Extract the contract data from this document:\n\n${SAMPLE_CONTRACT}`,
        },
      ],
    });

    const toolUse = response.content.find((b) => b.type === "tool_use");
    if (toolUse && toolUse.type === "tool_use") {
      const extracted = toolUse.input as Record<string, unknown>;
      console.log("stop_reason:      ", response.stop_reason);
      console.log("contract_id:      ", extracted.contract_id);
      console.log("parties:          ", extracted.parties);
      console.log("effective_date:   ", extracted.effective_date);
      console.log("expiry_date:      ", extracted.expiry_date, "  ← null = open-ended, not fabricated");
      console.log("total_value:      ", extracted.total_value);
      console.log("penalty_clause:   ", extracted.penalty_clause);
      console.log("contract_type:    ", extracted.contract_type);
      console.log("confidence:       ", extracted.extraction_confidence);
    } else {
      console.log("No tool call made — Claude responded in plain text (only possible with auto)");
      const text = response.content.find((b) => b.type === "text");
      if (text && text.type === "text") console.log(text.text.slice(0, 120) + "...");
    }
    console.log();
  }

  console.log("--- Step 1 complete ---");
  console.log("Notice: nullable fields return null (not invented values) when data is absent.");
  console.log("Next: Step 2 adds validation and retry when extraction has errors.");
}

// ─── Flawed contract — triggers validation failures ───────────────────────────
// effective_date is a natural-language date (not ISO 8601)
// contract_type will be "other" but no detail → second validation rule fires
const FLAWED_CONTRACT = `
HYBRID RETAINER AGREEMENT

This retainer is effective as of March 5th 2024 between Nova Labs ("Client")
and Dev Collective ("Consultant").

The engagement covers both software development and advisory services
under a hybrid arrangement not covered by standard categories.

Contract reference: HRA-2024-0007
Total value not specified — billed hourly at agreed rates.
`;

// ─── Validation logic (TS 4.4) ───────────────────────────────────────────────
type Extraction = Record<string, unknown>;

function validate(data: Extraction): string[] {
  const errors: string[] = [];

  // Rule 1: effective_date must be ISO 8601 (YYYY-MM-DD)
  if (typeof data.effective_date === "string" && !/^\d{4}-\d{2}-\d{2}$/.test(data.effective_date)) {
    errors.push(
      `effective_date "${data.effective_date}" is not ISO 8601 — use "YYYY-MM-DD" format e.g. "2024-03-05"`
    );
  }

  // Rule 2: contract_type "other" requires contract_type_detail
  if (data.contract_type === "other" && !data.contract_type_detail) {
    errors.push(
      `contract_type is "other" but contract_type_detail is null — provide a brief description of the contract type`
    );
  }

  // Rule 3: total_value must be positive if present (only fires for actual numbers)
  if (typeof data.total_value === "number" && data.total_value <= 0) {
    errors.push(`total_value must be a positive number, got ${data.total_value}`);
  }

  // Rule 4 (business rule the model can't know without being told):
  // Open-ended contracts (null expiry_date) have inherent uncertainty —
  // extraction_confidence must be "medium" or "low", never "high".
  // This will always fail on first pass and succeed after retry explains the rule.
  if (data.expiry_date === null && data.extraction_confidence === "high") {
    errors.push(
      `extraction_confidence is "high" but expiry_date is null — open-ended contracts have inherent uncertainty, use "medium" or "low"`
    );
  }

  return errors;
}

// ─── Single extraction call (reused by retry) ─────────────────────────────────
async function extractOnce(document: string, priorExtraction?: string, priorErrors?: string[]): Promise<Extraction> {
  let userContent: string;

  if (priorExtraction && priorErrors) {
    // Retry prompt: original doc + failed output + specific errors
    // Key insight: tell the model WHAT was wrong, not just "try again"
    userContent = `Original document:
${document}

Your previous extraction:
${priorExtraction}

Validation errors found:
${priorErrors.map((e) => `- ${e}`).join("\n")}

Please re-extract, correcting only the errors listed above.
Important: use JSON null (not empty string "") for any field whose value is absent from the document.`;
  } else {
    userContent = `Extract the contract data from this document:\n\n${document}`;
  }

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    tools: [extractionTool],
    tool_choice: { type: "tool", name: "extract_contract_data" },
    messages: [{ role: "user", content: userContent }],
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") throw new Error("No tool_use block returned");
  return toolUse.input as Extraction;
}

// ─── Validation-retry loop (TS 4.4) ──────────────────────────────────────────
async function demoValidationRetry() {
  console.log("\n=== STEP 2: Validation-retry loop ===\n");
  console.log("Validation has a business rule the model cannot know without being told:");
  console.log("  Rule: open-ended contracts (null expiry_date) must use confidence 'medium' or 'low'");
  console.log("  Model will return 'high' on attempt 1 — validation fails → RESOLVABLE via retry\n");

  // Attempt 1
  console.log("--- Attempt 1: initial extraction ---");
  let extraction = await extractOnce(FLAWED_CONTRACT);
  console.log("Extracted:", JSON.stringify(extraction, null, 2));

  let errors = validate(extraction);

  if (errors.length === 0) {
    console.log("Passed validation on first attempt.");
    return;
  }

  console.log(`\nValidation failed with ${errors.length} error(s):`);
  errors.forEach((e) => console.log(`  ✗ ${e}`));

  // Attempt 2 — retry with specific error feedback
  console.log("\n--- Attempt 2: retry with specific error feedback ---");
  extraction = await extractOnce(FLAWED_CONTRACT, JSON.stringify(extraction, null, 2), errors);
  console.log("Re-extracted:", JSON.stringify(extraction, null, 2));

  errors = validate(extraction);
  if (errors.length === 0) {
    console.log("\n✓ Retry resolved all format errors.");
  } else {
    console.log(`\nStill failing after retry (${errors.length} error(s)):`);
    errors.forEach((e) => console.log(`  ✗ ${e}`));
  }

  console.log("\n--- Retry outcome categories ---");
  console.log("  RESOLVABLE:   format mismatches (wrong date format, missing required detail)");
  console.log("                → retry with specific error message succeeds");
  console.log("  UNRESOLVABLE: information absent from the source document");
  console.log("                → retrying never helps; mark as needs-human-review");

  console.log("\n--- Step 2 complete ---");
  console.log("Next: Step 3 adds few-shot examples to guide edge-case extraction.");
}

// ─── Edge-case document for few-shot demo ────────────────────────────────────
// Three traps:
//   1. Date only appears in the footer reference, not the main body
//   2. Contract spans service + license — ambiguous type, should be "other"
//   3. Penalty clause never mentioned — must be null, not fabricated
const EDGE_CASE_CONTRACT = `
SOFTWARE LICENSE AND SUPPORT AGREEMENT

Between Meridian Technologies Inc ("Licensor") and Orbit Dynamics ("Licensee").

The Licensee is granted a non-exclusive license to use the Meridian Platform
software. The Licensor will also provide ongoing technical support and
customisation services as part of this engagement.

Annual fee: $120,000 USD. Agreement renews automatically unless terminated
with 90 days written notice.

Document reference: MLSA/2024/0091 | Executed: 2024-04-22
`;

// ─── System prompt WITHOUT few-shot examples ─────────────────────────────────
const SYSTEM_PLAIN = `You are a contract data extraction specialist.
Extract all available fields accurately from the document provided.`;

// ─── System prompt WITH few-shot examples (TS 4.2) ───────────────────────────
// Three examples, each targeting one specific edge case.
// Key principle: examples generalise to novel patterns — the model learns
// the RULE, not just the specific case shown.
const SYSTEM_WITH_EXAMPLES = `You are a contract data extraction specialist.
Extract all available fields accurately from the document provided.

## Examples

### Example 1 — Date in footer only (not in main body)
Document excerpt:
  "The parties agree to the terms set out herein regarding software delivery.
   Ref: SDA-2023-0014 | Signed: 2023-11-08"
Correct extraction:
  effective_date: "2023-11-08"   ← date comes from footer reference, still valid
  extraction_confidence: "high"

### Example 2 — Ambiguous contract type spanning multiple categories
Document excerpt:
  "This agreement covers both the supply of proprietary software licences
   and the provision of professional consulting services."
Correct extraction:
  contract_type: "other"
  contract_type_detail: "Combined software licence and professional services engagement"
  extraction_confidence: "medium"   ← dual-nature increases uncertainty

### Example 3 — Absent clause must be null, not fabricated
Document excerpt:
  "Either party may terminate with 30 days written notice."
Correct extraction:
  penalty_clause: null    ← termination notice is NOT a penalty clause
                          ← absent means null; do NOT invent a generic penalty
`;

// ─── Few-shot demo (TS 4.2) ───────────────────────────────────────────────────
async function demoFewShot() {
  console.log("\n=== STEP 3: Few-shot examples ===\n");
  console.log("Same edge-case document, two runs:");
  console.log("  Run A — no examples in system prompt");
  console.log("  Run B — three targeted examples in system prompt");
  console.log("Watch: contract_type, penalty_clause, extraction_confidence\n");

  const runs = [
    { label: "A — without few-shot examples", system: SYSTEM_PLAIN },
    { label: "B — with few-shot examples",    system: SYSTEM_WITH_EXAMPLES },
  ];

  for (const { label, system } of runs) {
    console.log(`--- Run ${label} ---`);

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system,
      tools: [extractionTool],
      tool_choice: { type: "tool", name: "extract_contract_data" },
      messages: [
        {
          role: "user",
          content: `Extract the contract data from this document:\n\n${EDGE_CASE_CONTRACT}`,
        },
      ],
    });

    const toolUse = response.content.find((b) => b.type === "tool_use");
    if (toolUse && toolUse.type === "tool_use") {
      const e = toolUse.input as Record<string, unknown>;
      console.log("contract_type:        ", e.contract_type);
      console.log("contract_type_detail: ", e.contract_type_detail);
      console.log("penalty_clause:       ", e.penalty_clause, " ← should be null");
      console.log("effective_date:       ", e.effective_date, " ← from footer");
      console.log("confidence:           ", e.extraction_confidence);
    }
    console.log();
  }

  console.log("--- Step 3 complete ---");
  console.log("Key insight: examples teach the model a RULE, not just one case.");
  console.log("  contract_type 'other' generalises to any multi-category contract.");
  console.log("  penalty_clause null generalises to any absent clause, not just termination.");
  console.log("Next: Step 4 adds the Message Batches API with custom_id tracking.");
}

// ─── Sample documents for batch processing ───────────────────────────────────
const BATCH_DOCUMENTS = [
  { id: "contract-0", text: `NDA AGREEMENT\nBetween Alpha Corp and Beta Ltd. Effective 2024-01-10.\nRef: NDA-2024-001. No penalty clause.` },
  { id: "contract-1", text: `EMPLOYMENT CONTRACT\nBetween Jordan Smith ("Employee") and Gamma Inc ("Employer").\nStart date: 2024-02-01. Salary: $90,000. Ref: EMP-2024-042.` },
  { id: "contract-2", text: `SERVICE AGREEMENT\nBetween Delta LLC and Epsilon GmbH. Effective 15th March 2024.\nTotal value: $25,000. Penalty for late delivery: 5% per week. Ref: SVC-2024-007.` },
  { id: "contract-3", text: `PARTNERSHIP AGREEMENT\nBetween Zeta Partners and Eta Ventures. Signed April 3 2024.\nRevenue share: 60/40. Open-ended. Ref: PART-2024-003.` },
  { id: "contract-4", text: `LICENSE AGREEMENT\nBetween Theta Software and Iota Corp. Effective 2024-05-01.\nAnnual license fee: $12,000. Expires 2025-04-30. Ref: LIC-2024-011.` },
];

// ─── Message Batches API demo (TS 4.5) ────────────────────────────────────────
// Key facts (exam-relevant):
//   • 50% cost savings vs synchronous API
//   • Up to 24-hour processing window — NO guaranteed latency SLA
//   • Does NOT support multi-turn tool calling within a single request
//   • Use for: overnight reports, weekly audits, nightly test generation
//   • Do NOT use for: blocking pre-merge checks, real-time user flows
async function demoBatches() {
  console.log("\n=== STEP 4: Message Batches API ===\n");
  console.log("Submitting 5 contracts as a single batch...");
  console.log("Exam facts: 50% cost saving | up to 24h window | no latency SLA\n");

  // Submit the batch — one API call for all 5 documents
  const batch = await client.messages.batches.create({
    requests: BATCH_DOCUMENTS.map((doc) => ({
      custom_id: doc.id,           // correlate responses back to source documents
      params: {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        tools: [extractionTool],
        tool_choice: { type: "any" as const },
        messages: [{ role: "user" as const, content: `Extract contract data:\n\n${doc.text}` }],
      },
    })),
  });

  console.log(`Batch submitted. ID: ${batch.id}`);
  console.log(`Status: ${batch.processing_status}`);
  console.log("Polling for completion...\n");

  // Poll until batch ends (small batches usually finish in under a minute)
  let current = batch;
  const MAX_POLLS = 30;
  for (let i = 0; i < MAX_POLLS && current.processing_status === "in_progress"; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    current = await client.messages.batches.retrieve(batch.id);
    process.stdout.write(`  poll ${i + 1}: ${current.processing_status} — ` +
      `succeeded=${current.request_counts.succeeded} ` +
      `errored=${current.request_counts.errored} ` +
      `processing=${current.request_counts.processing}\n`);
  }

  if (current.processing_status !== "ended") {
    console.log("Batch still running after max polls — in production, store the batch ID and check later.");
    return;
  }

  console.log("\nBatch complete. Processing results by custom_id...\n");

  // Collect results — custom_id links each response back to the source document
  const succeeded: string[] = [];
  const failed: string[] = [];

  for await (const result of await client.messages.batches.results(batch.id)) {
    if (result.result.type === "succeeded") {
      const toolUse = result.result.message.content.find((b) => b.type === "tool_use");
      if (toolUse && toolUse.type === "tool_use") {
        const e = toolUse.input as Record<string, unknown>;
        console.log(`✓ ${result.custom_id}: ${e.contract_type} | ${e.effective_date} | confidence=${e.extraction_confidence}`);
        succeeded.push(result.custom_id);
      }
    } else {
      console.log(`✗ ${result.custom_id}: ${result.result.type}`);
      failed.push(result.custom_id);
    }
  }

  // Failure resubmission — only retry the failed custom_ids, not the whole batch
  console.log(`\nResults: ${succeeded.length} succeeded, ${failed.length} failed`);
  if (failed.length > 0) {
    console.log(`Resubmitting failed requests: ${failed.join(", ")}`);
    const retryDocs = BATCH_DOCUMENTS.filter((d) => failed.includes(d.id));
    console.log(`Would create a new batch with ${retryDocs.length} request(s) — skipping in lab.`);
  } else {
    console.log("No failures — in production, store failed custom_ids and resubmit as a new batch.");
  }

  console.log("\n--- Step 4 complete ---");
  console.log("Next: Step 5 adds the multi-pass review architecture and explicit vs vague criteria.");
}

// ─── Code snippet for criteria comparison ─────────────────────────────────────
const CODE_SNIPPET = `
// user-service.ts
import db from "../db";

const API_KEY = "sk-prod-abc123xyz";   // line 4

export async function getUser(id: string) {
  const result = await db.query("SELECT * FROM users WHERE id = " + id);  // line 7
  return result.rows[0];
}

export function listUsers() {       // line 11 — not async
  return db.query("SELECT * FROM users")
    .then(r => r.rows);             // line 13 — rejection unhandled
}
`;

// ─── Explicit vs vague criteria demo (TS 4.1) ─────────────────────────────────
async function demoExplicitCriteria() {
  console.log("\n=== STEP 5: Explicit vs vague review criteria ===\n");
  console.log("Same code, two prompts — watch how much noise the vague prompt adds.\n");

  // ── Vague prompt ──────────────────────────────────────────────────────────
  console.log("--- Run A: vague criteria ---");
  console.log('Prompt: "Review this code and only report high-confidence issues."\n');

  const vagueResponse = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: `Review this code and only report high-confidence issues.\n\n\`\`\`typescript\n${CODE_SNIPPET}\n\`\`\`\n\nReturn a JSON array of findings with: line, severity, description.`,
    }],
  });

  const vagueText = vagueResponse.content[0].type === "text" ? vagueResponse.content[0].text : "";
  console.log("Vague findings:");
  console.log(vagueText);

  // ── Explicit prompt ───────────────────────────────────────────────────────
  console.log("\n--- Run B: explicit REPORT/SKIP criteria ---");

  const explicitResponse = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: `REPORT only these categories:
  - SQL_INJECTION: string concatenation or interpolation in SQL queries
  - HARDCODED_SECRET: credentials or API keys committed in source
  - UNHANDLED_REJECTION: promise chains without .catch(), async without try/catch

SKIP entirely:
  - Variable naming preferences
  - Missing return type annotations
  - Code style or formatting
  - Performance suggestions unrelated to the above

Return a JSON array of findings with: line, category, severity, description.

\`\`\`typescript\n${CODE_SNIPPET}\n\`\`\``,
    }],
  });

  const explicitText = explicitResponse.content[0].type === "text" ? explicitResponse.content[0].text : "";
  console.log("Explicit findings:");
  console.log(explicitText);

  console.log("\n--- Comparison ---");
  console.log("Vague:    likely includes naming, style, return types — noise that buries real issues");
  console.log("Explicit: only SQL_INJECTION, HARDCODED_SECRET, UNHANDLED_REJECTION — signal only");
  console.log("Exam trap: 'only report high-confidence issues' sounds strict but produces more noise,");
  console.log("           not less. Explicit categorical REPORT/SKIP is the correct pattern.");
}

// ─── Multi-pass review architecture (TS 4.6) ─────────────────────────────────
//
// For a PR touching 14 files, two approaches:
//
// ✗ Single-pass (wrong):
//   Send all 14 files in one prompt → attention dilutes across files →
//   shallow findings on files 8-14, contradictory findings across files,
//   misses cross-file issues because context is too crowded.
//   NOTE: switching to a larger context model does NOT fix this —
//         more tokens ≠ better attention quality across the full window.
//
// ✓ Two-pass (correct):
//   Pass 1 — per-file: send each file independently → deep, consistent findings per file
//   Pass 2 — integration: send all Pass 1 summaries together → find cross-file data flow issues
//
//   Benefits:
//   • Each file gets full model attention
//   • Pass 2 operates on concise summaries, not raw code — attention stays focused
//   • An independent review instance in Pass 2 catches what self-review misses
//   • Scales linearly: adding files adds Pass 1 calls, not prompt size

async function main() {
  console.log("Day 04 — Prompt Engineering & Structured Output");
  console.log("================================================");
  console.log("Domain: D4 — Prompt Engineering & Structured Output (20%)\n");

  await demoToolChoice();
  await demoValidationRetry();
  await demoFewShot();
  await demoBatches();
  await demoExplicitCriteria();

  console.log("\n================================================");
  console.log("Day 04 complete. Key concepts:");
  console.log("  • tool_choice: auto/any/tool — three levels of extraction guarantee");
  console.log("  • Nullable fields prevent fabrication — required fields on absent data cause hallucination");
  console.log("  • Retry works for format/rule errors; never for genuinely absent information");
  console.log("  • Few-shot examples teach rules, not just cases — generalise to novel patterns");
  console.log("  • Batch API: 50% saving, 24h ceiling, no SLA — async pipelines only");
  console.log("  • Explicit REPORT/SKIP beats vague 'high-confidence' — categorical beats qualitative");
  console.log("  • Two-pass review beats single-pass — larger context window ≠ better attention");
}

main().catch(console.error);

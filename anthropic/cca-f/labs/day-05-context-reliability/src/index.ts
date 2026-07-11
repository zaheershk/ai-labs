import Anthropic from "@anthropic-ai/sdk";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const MAX_STEPS = 10;
const client = new Anthropic();

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClaimSource {
  claim: string;
  evidence_excerpt: string;
  source_url: string;
  source_name: string;
  publication_date: string;       // ISO 8601 — prevents temporal misinterpretation
  confidence: "high" | "medium" | "low";
  conflict_detected?: boolean;
}

// ─── Case facts block (TS 5.1) ────────────────────────────────────────────────
// Extracted from verbose tool output — only what the coordinator needs going forward.
// Injected at the TOP of every subsequent prompt (not bottom, not buried in history).
// Transactional facts (dates, IDs, amounts) preserved verbatim — never summarised away.
interface CaseFacts {
  research_topic: string;
  key_claims: string[];           // extracted from tool output, not the raw output itself
  sources_consulted: string[];
  pending_questions: string[];
  session_start: string;          // ISO 8601
}

function formatCaseFacts(facts: CaseFacts): string {
  return `## Current Research State (injected at top — do not move)
Topic: ${facts.research_topic}
Session started: ${facts.session_start}

Key claims found so far:
${facts.key_claims.length > 0 ? facts.key_claims.map((c) => `  - ${c}`).join("\n") : "  (none yet)"}

Sources consulted: ${facts.sources_consulted.length > 0 ? facts.sources_consulted.join(", ") : "none yet"}

Pending questions:
${facts.pending_questions.length > 0 ? facts.pending_questions.map((q) => `  - ${q}`).join("\n") : "  (none)"}
`;
}

// ─── Simulate a verbose tool result ──────────────────────────────────────────
// In a real pipeline, a search tool might return 40 fields.
// We trim to only what matters before it enters context.
function simulateVerboseToolResult() {
  return {
    query_id: "q-20240315-001",
    request_timestamp: "2024-03-15T09:00:00Z",
    response_timestamp: "2024-03-15T09:00:02Z",
    latency_ms: 2041,
    cache_hit: false,
    region: "us-east-1",
    index_version: "v2.4.1",
    total_results: 847,
    returned_results: 5,
    // ↓ These are the only fields we actually care about
    results: [
      { title: "Global AI Market 2024", snippet: "Market valued at $142B in 2024, projected $1.8T by 2030", url: "https://example.com/ai-market-2024", date: "2024-01-10" },
      { title: "AI Adoption Survey", snippet: "67% of enterprises deployed AI in production as of Q4 2023", url: "https://example.com/ai-survey-2024", date: "2024-02-20" },
    ],
    // ↓ Noise — never needs to enter the LLM context
    debug_info: { shard_ids: ["s1", "s2"], replica: "r3" },
    billing: { tokens_charged: 150, cost_usd: 0.0003 },
    rate_limit_remaining: 4850,
  };
}

function trimToolResult(raw: ReturnType<typeof simulateVerboseToolResult>) {
  // Only extract what downstream steps need — everything else is dropped
  return raw.results.map((r) => ({
    title: r.title,
    snippet: r.snippet,
    url: r.url,
    date: r.date,
  }));
}

// ─── Step 1 demo ──────────────────────────────────────────────────────────────
async function demoCaseFacts() {
  console.log("\n=== STEP 1: Case facts block ===\n");

  const researchTopic = "Global AI market size and enterprise adoption rates";

  // Simulate a verbose tool call returning 40+ fields
  console.log("Tool returned verbose result with 12 fields (latency, billing, debug info...)");
  const verboseResult = simulateVerboseToolResult();
  console.log(`Raw field count: ${Object.keys(verboseResult).length + verboseResult.results.length}`);

  // Trim at the source — before it touches context
  const trimmed = trimToolResult(verboseResult);
  console.log(`After trimming: ${trimmed.length} result(s), only title/snippet/url/date kept\n`);

  // Build the case facts block from trimmed results
  const facts: CaseFacts = {
    research_topic: researchTopic,
    key_claims: trimmed.map((r) => `${r.snippet} (${r.date})`),
    sources_consulted: trimmed.map((r) => r.url),
    pending_questions: [
      "What is the projected CAGR for AI infrastructure specifically?",
      "Do adoption rates differ by industry vertical?",
    ],
    session_start: new Date().toISOString(),
  };

  // Show what the top-injected prompt looks like
  const factsBlock = formatCaseFacts(facts);
  console.log("Case facts block (injected at TOP of every subsequent prompt):");
  console.log("─".repeat(60));
  console.log(factsBlock);
  console.log("─".repeat(60));

  // Send to Claude with facts block at the top
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    messages: [{
      role: "user",
      // Facts block at the TOP — not appended at the bottom
      content: `${factsBlock}

Based on the research state above, what are the two most important pending questions to resolve next? Answer in one sentence each.`,
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  console.log("Coordinator response (using injected facts):");
  console.log(text);

  console.log("\n--- Step 1 complete ---");
  console.log("Notice: verbose tool output was trimmed BEFORE entering context.");
  console.log("Notice: facts block placed at TOP of prompt — not buried in history.");
  console.log("Next: Step 2 spawns both subagents in a single coordinator response (parallel).");

  return facts;
}

// ─── Mock tool definitions for subagents ─────────────────────────────────────
const searchWebTool: Anthropic.Tool = {
  name: "search_web",
  description: "Search the web for information on a topic. Returns title, snippet, url, date.",
  input_schema: {
    type: "object" as const,
    properties: {
      query: { type: "string", description: "Search query" },
    },
    required: ["query"],
  },
};

const readDocumentTool: Anthropic.Tool = {
  name: "read_document",
  description: "Read and extract facts from a document by URL.",
  input_schema: {
    type: "object" as const,
    properties: {
      url: { type: "string", description: "Document URL to read" },
      focus: { type: "string", description: "What aspect to focus on" },
    },
    required: ["url", "focus"],
  },
};

// ─── Simulated tool responses ─────────────────────────────────────────────────
function handleToolCall(name: string, input: Record<string, string>): string {
  if (name === "search_web") {
    return JSON.stringify([
      { claim: "AI market valued at $142B in 2024", source_url: "https://example.com/ai-market", source_name: "Tech Research Group", publication_date: "2024-01-10", confidence: "high" },
      { claim: "Projected to reach $1.8T by 2030 at 38% CAGR", source_url: "https://example.com/ai-forecast", source_name: "Market Analysts Inc", publication_date: "2024-02-15", confidence: "medium" },
    ]);
  }
  if (name === "read_document") {
    return JSON.stringify([
      { claim: "67% of enterprises deployed AI in production as of Q4 2023", source_url: input.url, source_name: "Enterprise AI Survey", publication_date: "2024-02-20", confidence: "high" },
      { claim: "AI market size estimated at $150B in 2024", source_url: input.url, source_name: "Enterprise AI Survey", publication_date: "2024-02-20", confidence: "medium" },
    ]);
  }
  return JSON.stringify({ error: "unknown tool" });
}

// ─── Run a single subagent with its own tool loop ─────────────────────────────
async function runSubagent(
  name: string,
  tools: Anthropic.Tool[],
  systemPrompt: string,
  userPrompt: string
): Promise<ClaimSource[]> {
  console.log(`  [${name}] starting...`);

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userPrompt }];
  let steps = 0;

  while (steps < MAX_STEPS) {
    steps++;
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: systemPrompt,
      tools,
      messages,
    });

    // Collect any tool calls
    const toolUses = response.content.filter((b) => b.type === "tool_use");

    if (toolUses.length === 0 || response.stop_reason === "end_turn") {
      // Subagent is done — extract the final text as claim-source JSON
      const text = response.content.find((b) => b.type === "text");
      if (text && text.type === "text") {
        try {
          const json = text.text.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
          const claims = JSON.parse(json) as ClaimSource[];
          console.log(`  [${name}] done — ${claims.length} claim(s) found`);
          return claims;
        } catch {
          console.log(`  [${name}] done — could not parse JSON, returning empty`);
          return [];
        }
      }
      return [];
    }

    // Handle tool calls and continue
    const toolResults: Anthropic.ToolResultBlockParam[] = toolUses.map((block) => {
      if (block.type !== "tool_use") return { type: "tool_result" as const, tool_use_id: "", content: "" };
      console.log(`  [${name}] called tool: ${block.name}(${JSON.stringify(block.input)})`);
      return {
        type: "tool_result" as const,
        tool_use_id: block.id,
        content: handleToolCall(block.name, block.input as Record<string, string>),
      };
    });

    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });
  }

  return [];
}

// ─── Parallel subagent spawning (TS 1.2, 1.3) ────────────────────────────────
// Both subagents run via Promise.all — equivalent to a coordinator emitting
// two Task tool calls in a SINGLE response.
// Exam trap: spawning across two turns = sequential, not parallel.
// Subagents are stateless — we pass the full research topic + facts in each prompt.
async function demoParallelSubagents(facts: CaseFacts): Promise<ClaimSource[]> {
  console.log("\n=== STEP 2: Parallel subagent spawning ===\n");
  console.log("Coordinator spawning Subagent A (web search) and Subagent B (document analysis)");
  console.log("Both launched in a single Promise.all — parallel, not sequential.\n");

  const factsBlock = formatCaseFacts(facts);

  // Both subagent prompts include the full case facts block — they are stateless
  // and inherit nothing from the coordinator unless explicitly passed
  const subagentSystemPrompt = `You are a research subagent. You have been given a research topic and must
use your tools to find relevant claims. Return your findings as a JSON array of ClaimSource objects with:
claim, evidence_excerpt, source_url, source_name, publication_date (ISO 8601), confidence (high/medium/low).
Return ONLY the JSON array.`;

  // Promise.all = both run in parallel (single coordinator "turn")
  const [claimsA, claimsB] = await Promise.all([
    runSubagent(
      "Subagent-A (web search)",
      [searchWebTool],
      subagentSystemPrompt,
      `${factsBlock}\n\nSearch the web for current statistics on: ${facts.research_topic}`
    ),
    runSubagent(
      "Subagent-B (document analysis)",
      [readDocumentTool],
      subagentSystemPrompt,
      `${factsBlock}\n\nRead and extract facts from this document about ${facts.research_topic}: https://example.com/ai-enterprise-report-2024`
    ),
  ]);

  const allClaims = [...claimsA, ...claimsB];

  console.log(`\nBoth subagents complete. Total claims collected: ${allClaims.length}`);
  allClaims.forEach((c, i) => {
    console.log(`  [${i + 1}] "${c.claim}" — confidence=${c.confidence} | source=${c.source_name}`);
  });

  console.log("\n--- Step 2 complete ---");
  console.log("Notice: both subagents ran in parallel via Promise.all (single coordinator turn).");
  console.log("Notice: each subagent received the full case facts block — they share no implicit context.");
  console.log("Next: Step 3 simulates a subagent timeout and shows structured error propagation.");

  return allClaims;
}

// ─── Structured error propagation (TS 5.3) ───────────────────────────────────
// Subagent timeout returns a structured failure — not silence, not "error occurred".
// is_empty_result distinguishes two very different situations:
//   false → access failure (timeout, network) → coordinator should retry
//   true  → valid empty result (nothing found) → coordinator proceeds, annotates gap
interface SubagentError {
  status: "partial_failure";
  failure_type: "timeout" | "network" | "rate_limit";
  attempted_query: string;
  partial_results: ClaimSource[];
  alternative_approaches: string[];
  is_empty_result: boolean;
}

function simulateSubagentTimeout(query: string): SubagentError {
  return {
    status: "partial_failure",
    failure_type: "timeout",
    attempted_query: query,
    partial_results: [
      // Got one result before timing out
      {
        claim: "AI infrastructure spend growing at 42% annually",
        evidence_excerpt: "Infrastructure investment reached $48B in 2023...",
        source_url: "https://example.com/ai-infra-partial",
        source_name: "Infrastructure Weekly (partial)",
        publication_date: "2024-01-05",
        confidence: "low",   // low because source wasn't fully read
      },
    ],
    alternative_approaches: [
      "retry with narrower query: 'AI infrastructure CAGR 2024'",
      "search alternative source: Gartner or IDC reports",
    ],
    is_empty_result: false,  // false = access failure, not "nothing exists"
  };
}

async function demoErrorPropagation(facts: CaseFacts): Promise<ClaimSource[]> {
  console.log("\n=== STEP 3: Structured error propagation ===\n");
  console.log("Simulating Subagent-C timing out mid-search...\n");

  const query = "AI infrastructure CAGR breakdown by segment 2024";
  const error = simulateSubagentTimeout(query);

  console.log("Subagent-C returned structured failure:");
  console.log(`  failure_type:     ${error.failure_type}`);
  console.log(`  attempted_query:  ${error.attempted_query}`);
  console.log(`  partial_results:  ${error.partial_results.length} claim(s) recovered`);
  console.log(`  is_empty_result:  ${error.is_empty_result}  ← false = ACCESS failure, not "nothing exists"`);
  console.log(`  alternatives:     ${error.alternative_approaches[0]}`);

  // Coordinator decision logic based on is_empty_result
  console.log("\nCoordinator recovery decision:");
  if (!error.is_empty_result) {
    console.log("  is_empty_result=false → access failure → coordinator retries with narrower query");
    console.log(`  Retrying: "${error.alternative_approaches[0]}"\n`);

    // Retry with a narrower query (simulated as a successful subagent run)
    const retryResults = await runSubagent(
      "Subagent-C (retry)",
      [searchWebTool],
      `You are a research subagent. Return findings as a JSON array with:
claim, evidence_excerpt, source_url, source_name, publication_date (ISO 8601), confidence.
Return ONLY the JSON array.`,
      `${formatCaseFacts(facts)}\n\nSearch for: AI infrastructure CAGR 2024`
    );

    const allClaims = [...error.partial_results, ...retryResults];
    console.log(`Retry succeeded. Total claims from Subagent-C: ${allClaims.length}`);
    allClaims.forEach((c) => console.log(`  • "${c.claim}" — confidence=${c.confidence}`));

    console.log("\n--- Anti-patterns (exam-relevant) ---");
    console.log("  ✗ Silent suppression: returning [] as success — coordinator can't recover");
    console.log("  ✗ Workflow termination: halting entire pipeline on one subagent failure");
    console.log("  ✗ Generic status: 'search unavailable' — hides failure_type from coordinator");
    console.log("  ✓ Structured error: failure_type + partial_results + is_empty_result + alternatives");

    console.log("\n--- Step 3 complete ---");
    console.log("Next: Step 4 writes a scratchpad file to disk for crash recovery.");

    return allClaims;
  } else {
    console.log("  is_empty_result=true → valid empty result → proceed, annotate coverage gap");
    return [];
  }
}

// ─── Scratchpad file (TS 5.4) ─────────────────────────────────────────────────
// Written to disk after phase 1 completes, read back before phase 2 starts.
// Enables crash recovery: if coordinator crashes mid-pipeline, resume loads
// the scratchpad and skips already-completed phases.
// Also fixes context degradation: facts come from disk, not from a long
// conversation history that may have been summarised or drifted.
interface Scratchpad {
  topic: string;
  phase: number;
  claims: ClaimSource[];
  coverage_gaps: string[];
  sources_visited: string[];
  timestamp: string;
}

const SCRATCHPAD_PATH = path.resolve(__dirname, "../scratchpad.json");

function writeScratchpad(data: Scratchpad) {
  fs.writeFileSync(SCRATCHPAD_PATH, JSON.stringify(data, null, 2));
  console.log(`  Scratchpad written → ${SCRATCHPAD_PATH}`);
}

function readScratchpad(): Scratchpad | null {
  if (!fs.existsSync(SCRATCHPAD_PATH)) return null;
  return JSON.parse(fs.readFileSync(SCRATCHPAD_PATH, "utf-8")) as Scratchpad;
}

async function demoScratchpad(facts: CaseFacts, phase1Claims: ClaimSource[]) {
  console.log("\n=== STEP 4: Scratchpad file ===\n");

  // ── Write after phase 1 ───────────────────────────────────────────────────
  console.log("Phase 1 complete. Writing scratchpad to disk before starting phase 2...");

  const scratchpad: Scratchpad = {
    topic: facts.research_topic,
    phase: 1,
    claims: phase1Claims,
    coverage_gaps: facts.pending_questions,
    sources_visited: facts.sources_consulted,
    timestamp: new Date().toISOString(),
  };

  writeScratchpad(scratchpad);

  // ── Simulate a coordinator crash and resume ───────────────────────────────
  console.log("\nSimulating coordinator crash...");
  console.log("Restarting coordinator — loading scratchpad from disk instead of re-running phase 1.\n");

  const recovered = readScratchpad();
  if (!recovered) {
    console.log("No scratchpad found — would restart from scratch (costly).");
    return phase1Claims;
  }

  console.log(`Recovered from disk:`);
  console.log(`  topic:           ${recovered.topic}`);
  console.log(`  phase completed: ${recovered.phase}`);
  console.log(`  claims loaded:   ${recovered.claims.length}`);
  console.log(`  coverage gaps:   ${recovered.coverage_gaps.length}`);
  console.log(`  timestamp:       ${recovered.timestamp}`);

  // ── Phase 2: synthesis subagent uses scratchpad claims ────────────────────
  console.log("\nStarting phase 2 — synthesis subagent receives scratchpad claims (not full history)...");

  const synthesisPrompt = `You are a synthesis subagent. You have been given structured research claims from phase 1.
Produce a concise 3-bullet summary. Preserve exact statistics and source names — do not paraphrase numbers.
Return plain text.`;

  const claimsList = recovered.claims
    .map((c) => `- "${c.claim}" (${c.source_name}, ${c.publication_date}, confidence=${c.confidence})`)
    .join("\n");

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    system: synthesisPrompt,
    messages: [{
      role: "user",
      content: `Topic: ${recovered.topic}\n\nPhase 1 claims:\n${claimsList}\n\nCoverage gaps:\n${recovered.coverage_gaps.map((g) => `- ${g}`).join("\n")}\n\nProduce a 3-bullet synthesis.`,
    }],
  });

  const summary = response.content[0].type === "text" ? response.content[0].text : "";
  console.log("\nPhase 2 synthesis (built from scratchpad, not conversation history):");
  console.log(summary);

  // Update scratchpad to phase 2
  writeScratchpad({ ...scratchpad, phase: 2, timestamp: new Date().toISOString() });

  console.log("\n--- Step 4 complete ---");
  console.log("Notice: phase 2 never saw the original conversation — it worked from scratchpad only.");
  console.log("Notice: statistics preserved verbatim in synthesis (not paraphrased).");
  console.log("Next: Step 5 adds human review routing and escalation criteria.");

  return recovered.claims;
}

// ─── Human review routing (TS 5.5) ───────────────────────────────────────────
// Route by field-level confidence — NOT aggregate accuracy.
// 97% aggregate can hide 40% failure on a specific field (e.g. publication_date).
// Conflicts must be preserved with both source attributions — not resolved arbitrarily.
function routeForReview(claims: ClaimSource[]): {
  autoApproved: ClaimSource[];
  humanReview: ClaimSource[];
} {
  return {
    autoApproved: claims.filter((c) => c.confidence === "high" && !c.conflict_detected),
    humanReview: claims.filter((c) =>
      c.confidence === "low" ||
      c.confidence === "medium" ||
      c.conflict_detected === true
    ),
  };
}

// ─── Conflict detection ───────────────────────────────────────────────────────
// When two sources report different values for the same stat, annotate both.
// Never pick one arbitrarily — preserve both with full attribution.
function detectConflicts(claims: ClaimSource[]): ClaimSource[] {
  // Find claims about market size — sources A and B report different values
  const marketSizeClaims = claims.filter((c) =>
    c.claim.toLowerCase().includes("market") && c.claim.toLowerCase().includes("$")
  );

  if (marketSizeClaims.length >= 2) {
    // Mark both as conflicting — coordinator must surface both to human review
    return claims.map((c) =>
      marketSizeClaims.includes(c) ? { ...c, conflict_detected: true, confidence: "low" } : c
    );
  }
  return claims;
}

// ─── Escalation criteria (TS 5.2) ────────────────────────────────────────────
// Explicit rules + few-shot examples in system prompt.
// Vague rules ("escalate if frustrated") produce wrong escalations.
// Key distinction: sentiment ≠ complexity; self-reported confidence ≠ escalation signal.
const ESCALATION_SYSTEM_PROMPT = `You are a customer support coordinator. Apply these escalation rules exactly.

ESCALATE IMMEDIATELY (no investigation first):
- Customer explicitly requests a human agent
- Policy is silent or ambiguous on the specific request

DO NOT escalate:
- Customer expresses frustration (acknowledge + offer to resolve)
- Agent self-reports low confidence (confidence ≠ complexity)
- Multiple customers match — ask for additional identifiers instead

## Examples

Example 1 — ESCALATE:
User: "I want to speak to a human right now"
Action: escalate_to_human immediately. Do not say "let me try to help first."

Example 2 — DO NOT escalate:
User: "This is ridiculous, my order is 3 weeks late!"
Action: acknowledge frustration, look up order, offer resolution.
Escalate only if customer reiterates after you offer to resolve.

Example 3 — DO NOT escalate:
User: "I'm not sure if I qualify for a refund"
Action: check the refund policy and answer directly. Low agent confidence is not a reason to escalate.

Respond with JSON: { "action": "escalate" | "resolve", "reason": string, "response": string }`;

async function demoReviewAndEscalation(claims: ClaimSource[]) {
  console.log("\n=== STEP 5: Human review routing + escalation criteria ===\n");

  // ── Conflict detection ────────────────────────────────────────────────────
  console.log("Checking claims for conflicting statistics across sources...");
  const annotatedClaims = detectConflicts(claims);
  const conflicts = annotatedClaims.filter((c) => c.conflict_detected);
  console.log(`Found ${conflicts.length} conflicting claim(s):`);
  conflicts.forEach((c) => console.log(`  ⚠ "${c.claim}" — marked for human review with both source values`));

  // ── Routing ───────────────────────────────────────────────────────────────
  console.log("\nRouting claims by field-level confidence...");
  const { autoApproved, humanReview } = routeForReview(annotatedClaims);

  console.log(`  Auto-approved (high confidence, no conflict): ${autoApproved.length}`);
  autoApproved.forEach((c) => console.log(`    ✓ "${c.claim}"`));

  console.log(`  Routed to human review (medium/low/conflict): ${humanReview.length}`);
  humanReview.forEach((c) => console.log(`    ⚑ "${c.claim}" — confidence=${c.confidence}${c.conflict_detected ? ", CONFLICT" : ""}`));

  console.log("\nKey insight: never reduce human review based on aggregate accuracy.");
  console.log("97% overall accuracy can hide 40% failure on publication_date specifically.");

  // ── Escalation demo ───────────────────────────────────────────────────────
  console.log("\nTesting escalation criteria with three customer messages...\n");

  const testMessages = [
    "I want to speak to a human right now",
    "This is ridiculous, my order is 3 weeks late!",
    "I'm not sure if I qualify for a refund",
  ];

  for (const message of testMessages) {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      system: ESCALATION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: message }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "{}";
    const json = text.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
    try {
      const result = JSON.parse(json) as { action: string; reason: string; response: string };
      console.log(`User: "${message}"`);
      console.log(`  Action: ${result.action.toUpperCase()} — ${result.reason}`);
      console.log();
    } catch {
      console.log(`User: "${message}"`);
      console.log(`  Response: ${text.slice(0, 120)}`);
      console.log();
    }
  }

  console.log("--- Step 5 complete ---");
  console.log("Notice: explicit request → escalate immediately.");
  console.log("Notice: frustration + late order → resolve, not escalate.");
  console.log("Notice: agent uncertainty → resolve, not escalate (confidence ≠ complexity).");
}

async function main() {
  console.log("Day 05 — Context Management & Reliability");
  console.log("==========================================");
  console.log("Domain: D5 — Context Management & Reliability (15%)\n");

  const facts = await demoCaseFacts();
  const phase1Claims = await demoParallelSubagents(facts);
  const errorClaims = await demoErrorPropagation(facts);
  const allClaims = await demoScratchpad(facts, [...phase1Claims, ...errorClaims]);
  await demoReviewAndEscalation(allClaims);

  console.log("\n==========================================");
  console.log("Day 05 complete. Key concepts:");
  console.log("  • Trim verbose tool output before it enters context — lost in the middle is real");
  console.log("  • Case facts block at the TOP of every prompt, not buried in history");
  console.log("  • Parallel subagents = single coordinator turn (Promise.all), not two turns");
  console.log("  • Subagents are stateless — pass all context explicitly in their prompt");
  console.log("  • Structured errors: failure_type + is_empty_result + alternatives");
  console.log("  • is_empty_result=false → retry; true → proceed with gap annotation");
  console.log("  • Scratchpad enables crash recovery — phase 2 reads disk, not history");
  console.log("  • Route by field-level confidence, not aggregate accuracy");
  console.log("  • Escalation: explicit criteria + few-shot examples; frustration ≠ escalate");
}

main().catch(console.error);

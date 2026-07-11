import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });

// ─── Mock issue catalog ───────────────────────────────────────────────────────
// Simulates a GitHub/GitLab issue tracker. In production this would call
// the GitHub API using process.env.GITHUB_TOKEN.
const ISSUES = [
  { id: "GH-101", title: "Auth tokens not expiring correctly",       status: "open",   labels: ["bug", "auth"],        priority: "high"   },
  { id: "GH-102", title: "Search results missing pagination",        status: "open",   labels: ["bug", "search"],      priority: "medium" },
  { id: "GH-103", title: "Add dark mode support",                    status: "open",   labels: ["feature", "ui"],      priority: "low"    },
  { id: "GH-104", title: "Rate limiter throws 500 on burst traffic", status: "open",   labels: ["bug", "performance"], priority: "high"   },
  { id: "GH-105", title: "Refactor database connection pooling",     status: "closed", labels: ["refactor", "db"],     priority: "medium" },
  { id: "GH-106", title: "MCP tool descriptions cause misrouting",   status: "open",   labels: ["bug", "mcp"],         priority: "high"   },
];

// ─── Server setup ─────────────────────────────────────────────────────────────
const server = new Server(
  { name: "dev-productivity", version: "1.0.0" },
  { capabilities: { tools: {}, resources: {} } }
);

// ─── Tool: search_issues ──────────────────────────────────────────────────────
// Tools = actions the agent can invoke with input.
// search_issues accepts a query string and returns matching issues.
// The agent decides when to call it and what query to use.
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "search_issues",
      description:
        "Search the issue tracker for issues matching a query. " +
        "Matches against title, labels, and status. " +
        "Use this when you need to find specific issues — e.g. 'open auth bugs' or 'high priority performance issues'. " +
        "Returns id, title, status, labels, and priority for each match.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search terms e.g. 'auth bug', 'high priority', 'open feature'",
          },
        },
        required: ["query"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "search_issues") {
    return {
      content: [{ type: "text", text: `Unknown tool: ${request.params.name}` }],
      isError: true,
    };
  }

  const query = (request.params.arguments?.query as string ?? "").toLowerCase();
  console.error(`[search_issues] query="${query}"`);   // stderr so it doesn't corrupt stdio transport

  const terms = query.split(/\s+/).filter(Boolean);
  const matches = ISSUES.filter((issue) => {
    const haystack = [issue.title, issue.status, issue.priority, ...issue.labels]
      .join(" ")
      .toLowerCase();
    return terms.every((t) => haystack.includes(t));
  });

  if (matches.length === 0) {
    return {
      content: [{ type: "text", text: `No issues found matching "${query}".` }],
      isError: false,
    };
  }

  const summary = matches
    .map((i) => `${i.id}  [${i.status}] [${i.priority}]  ${i.title}  labels: ${i.labels.join(", ")}`)
    .join("\n");

  console.error(`[search_issues] ${matches.length} match(es) returned`);
  return { content: [{ type: "text", text: summary }], isError: false };
});

// ─── Resource: issues://summary ──────────────────────────────────────────────
// Resources = readable content the agent can browse without providing input.
// Think of it as a document or catalog: "what issues exist?" with no filtering.
//
// Tool vs Resource — the key distinction (exam trap):
//   Tool    → agent invokes an ACTION   (search_issues with a query string)
//   Resource → agent READS a catalog   (issues://summary — no input required)
//
// When to use each:
//   - Resource: agent needs orientation — "what's in this system?"
//   - Tool:     agent needs targeted results — "find issues matching X"
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: "issues://summary",
      name: "Issue Catalog",
      description: "Full list of all issues in the tracker — open and closed. " +
                   "Read this to get an overview of what exists before searching.",
      mimeType: "text/plain",
    },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  if (request.params.uri !== "issues://summary") {
    throw new Error(`Unknown resource: ${request.params.uri}`);
  }

  console.error("[issues://summary] resource read");

  const catalog = [
    `Issue Catalog — ${ISSUES.length} total (${ISSUES.filter(i => i.status === "open").length} open)\n`,
    "─".repeat(60),
    ...ISSUES.map(
      (i) => `${i.id}  [${i.status.padEnd(6)}] [${i.priority.padEnd(6)}]  ${i.title}\n         labels: ${i.labels.join(", ")}`
    ),
  ].join("\n");

  return {
    contents: [{ uri: "issues://summary", mimeType: "text/plain", text: catalog }],
  };
});

// ─── Start ────────────────────────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP server 'dev-productivity' running on stdio");
  console.error("  tool:     search_issues(query)  — filtered search");
  console.error("  resource: issues://summary      — full catalog read");
}

main().catch(console.error);

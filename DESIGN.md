# Company Analyzer — Design Document

**Version**: 1.0
**Target audience**: Claude Code (implementation agent)
**Status**: Ready for implementation

---

## 0. Executive Summary

A web app that analyzes companies using AI + web search. User uploads an Excel of companies (or enters one manually), writes a prompt describing what to analyze, picks a search provider and an LLM provider, and receives results as a downloadable Excel + email notification.

**Stack**: Nuxt 3 + Hono (via Nitro) + Cloudflare Workers + D1 + R2 + Queues
**Why this stack**: Free Cloudflare quotas, single-codebase frontend+backend, native deployment via Wrangler, pluggable provider architecture.

---

## 1. High-Level Design

### 1.1 Goals

1. Run a user-defined research prompt against 1–1000 companies.
2. Support **swappable** web-search providers (Tavily, OpenAI, Anthropic) and **swappable** LLM providers (Anthropic Claude, OpenAI GPT) — selectable via UI buttons.
3. Two execution modes: **Individual** (1 company, instant) and **Batch** (Excel upload, async, emailed result).
4. Deploy entirely on Cloudflare's free tier.

### 1.2 Non-Goals (v1)

- No multi-user auth (single-tenant — keys via Wrangler secrets).
- No real-time collaborative editing.
- No fine-tuned models or embeddings.
- No payment processing.

### 1.3 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Cloudflare Workers                      │
│                                                              │
│  ┌───────────────┐         ┌──────────────────────────┐      │
│  │  Nuxt Pages   │────────▶│  Server API (Nitro/Hono) │      │
│  │  (Vue 3)      │  fetch  │                          │      │
│  └───────────────┘         └────────┬─────────────────┘      │
│                                     │                         │
│       ┌─────────────────────────────┼─────────────────┐      │
│       ▼                             ▼                 ▼      │
│  ┌─────────┐                  ┌──────────┐      ┌─────────┐  │
│  │   D1    │                  │   R2     │      │ Queues  │  │
│  │ (SQLite)│                  │ (xlsx)   │      │(jobs)   │  │
│  └─────────┘                  └──────────┘      └────┬────┘  │
│                                                      │       │
│                                                      ▼       │
│                                          ┌──────────────────┐│
│                                          │ Queue Consumer   ││
│                                          │ (1 job = 1 row)  ││
│                                          └────────┬─────────┘│
└───────────────────────────────────────────────────┼──────────┘
                                                    │
                                ┌───────────────────┼─────────────────┐
                                ▼                   ▼                 ▼
                          ┌──────────┐       ┌──────────┐      ┌──────────┐
                          │ Tavily   │       │ OpenAI   │      │Anthropic │
                          │ search   │       │ search   │      │ search   │
                          └──────────┘       └──────────┘      └──────────┘
                                                    │
                                                    ▼
                                          ┌──────────────────┐
                                          │  LLM (Claude/GPT)│
                                          └──────────────────┘
                                                    │
                                                    ▼
                                          ┌──────────────────┐
                                          │ MailChannels     │
                                          │ (notify on done) │
                                          └──────────────────┘
```

### 1.4 Key Architectural Decisions

| # | Decision | Reason |
|---|----------|--------|
| 1 | Nuxt 3 + Nitro (not Express) | Workers compatibility, single-repo dev |
| 2 | D1 for state | SQL, free, fits row-count for 1k jobs |
| 3 | R2 for Excel files | S3-compatible, free egress, 10GB free |
| 4 | Queues for batch jobs | Avoids 30s Worker CPU limit, retries free |
| 5 | Provider interfaces | Swap Tavily ↔ OpenAI ↔ Anthropic with one line |
| 6 | API keys via Wrangler secrets | Single-tenant, no DB exposure, no UI input |
| 7 | Polling (not SSE) for live progress | Simpler on Workers, good enough at 2s interval |
| 8 | MailChannels for email | Free for Cloudflare Workers, no signup |

### 1.5 Major User Flows

#### Flow A: Individual Analysis
1. User opens app → enters company name + domain → writes prompt → picks providers → clicks Run.
2. Frontend calls `POST /api/analyze` (synchronous, awaits result).
3. Server: search → LLM → return JSON `{ verdict, reasoning, sources, latency }`.
4. UI renders the result card.

#### Flow B: Batch Analysis
1. User uploads `companies.xlsx` → writes prompt → picks providers → enters email → clicks Start.
2. Frontend calls `POST /api/batch/start` with file + config.
3. Server: parses xlsx (max 1000 rows), creates `batch` row in D1, enqueues 1 message per row.
4. UI redirects to `/batch/[id]` and polls `GET /api/batch/[id]/status` every 2s.
5. Queue consumer processes each row: search → LLM → write result to D1.
6. When all rows complete: server generates `results.xlsx`, uploads to R2, sends email with download link.
7. User clicks link → `GET /api/batch/[id]/download` → streams the xlsx.

---

## 2. Low-Level Design

### 2.1 Project Layout

```
company-analyzer/
├── nuxt.config.ts
├── wrangler.toml
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── .env.example
│
├── pages/
│   ├── index.vue                       # main dashboard
│   └── batch/
│       └── [id].vue                    # batch detail / live progress
│
├── components/
│   ├── ModeToggle.vue
│   ├── PromptEditor.vue
│   ├── ProviderCard.vue                # reusable for search & LLM
│   ├── UploadZone.vue
│   ├── DeliveryOptions.vue
│   ├── ResultsTable.vue
│   ├── ResultDetailCard.vue
│   └── ui/                             # primitives (Button, Pill, etc.)
│
├── composables/
│   ├── useAnalyzer.ts                  # client-side state for current run
│   └── useBatchPolling.ts              # 2s poll loop for batch status
│
├── server/
│   ├── api/
│   │   ├── analyze.post.ts             # individual mode
│   │   ├── batch/
│   │   │   ├── start.post.ts           # upload xlsx + start batch
│   │   │   ├── [id]/
│   │   │   │   ├── status.get.ts       # poll status
│   │   │   │   ├── download.get.ts     # serve final xlsx
│   │   │   │   └── cancel.post.ts      # mark batch cancelled
│   │   │   └── index.get.ts            # list recent batches
│   │   └── health.get.ts
│   │
│   ├── utils/
│   │   ├── providers/
│   │   │   ├── types.ts                # SearchProvider, LLMProvider interfaces
│   │   │   ├── search/
│   │   │   │   ├── index.ts            # factory by id
│   │   │   │   ├── tavily.ts
│   │   │   │   ├── openai.ts
│   │   │   │   └── anthropic.ts
│   │   │   └── llm/
│   │   │       ├── index.ts
│   │   │       ├── anthropic.ts
│   │   │       └── openai.ts
│   │   ├── analyze.ts                  # core orchestrator: search → LLM
│   │   ├── excel.ts                    # parse + generate xlsx
│   │   ├── email.ts                    # MailChannels helper
│   │   ├── db.ts                       # D1 helpers
│   │   └── r2.ts                       # R2 helpers
│   │
│   └── routes/
│       └── _queue.ts                   # queue consumer entry point
│
├── shared/
│   └── types.ts                        # shared types between client & server
│
└── migrations/
    ├── 0001_init.sql
    └── 0002_indexes.sql
```

### 2.2 Database Schema (D1 / SQLite)

`migrations/0001_init.sql`:

```sql
-- Each batch run (one upload = one batch)
CREATE TABLE batches (
  id              TEXT PRIMARY KEY,              -- ulid
  created_at      INTEGER NOT NULL,              -- unix ms
  prompt          TEXT NOT NULL,
  search_provider TEXT NOT NULL,                 -- 'tavily' | 'openai' | 'anthropic'
  llm_provider    TEXT NOT NULL,                 -- 'claude-sonnet-4-7' | 'gpt-4o' | 'claude-haiku-4-5'
  total_rows      INTEGER NOT NULL,
  done_rows       INTEGER NOT NULL DEFAULT 0,
  failed_rows     INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL,                 -- 'running' | 'completed' | 'failed' | 'cancelled'
  email           TEXT,                          -- nullable
  upload_r2_key   TEXT,                          -- original xlsx in R2
  result_r2_key   TEXT,                          -- generated results xlsx
  completed_at    INTEGER
);

-- Each individual analysis (1 row from xlsx OR 1 individual run)
CREATE TABLE analyses (
  id              TEXT PRIMARY KEY,              -- ulid
  batch_id        TEXT,                          -- nullable: null = individual run
  row_index       INTEGER,                       -- nullable: position in original xlsx
  created_at      INTEGER NOT NULL,
  company_name    TEXT NOT NULL,
  company_domain  TEXT,
  extra_input     TEXT,                          -- JSON: any extra columns from xlsx
  status          TEXT NOT NULL,                 -- 'queued' | 'running' | 'done' | 'failed'
  answer          TEXT,                          -- the LLM response
  sources         TEXT,                          -- JSON array of {url, title}
  search_provider TEXT NOT NULL,
  llm_provider    TEXT NOT NULL,
  latency_ms      INTEGER,
  error           TEXT,
  FOREIGN KEY (batch_id) REFERENCES batches(id)
);

CREATE INDEX idx_analyses_batch ON analyses(batch_id);
CREATE INDEX idx_analyses_status ON analyses(status);
CREATE INDEX idx_batches_created ON batches(created_at DESC);
```

### 2.3 wrangler.toml

```toml
name = "company-analyzer"
main = ".output/server/index.mjs"
compatibility_date = "2026-04-01"
compatibility_flags = ["nodejs_compat"]

[[d1_databases]]
binding = "DB"
database_name = "company-analyzer-db"
database_id = "<created via: wrangler d1 create>"

[[r2_buckets]]
binding = "FILES"
bucket_name = "company-analyzer-files"

[[queues.producers]]
binding = "ANALYSIS_QUEUE"
queue = "analysis-jobs"

[[queues.consumers]]
queue = "analysis-jobs"
max_batch_size = 10
max_batch_timeout = 5
max_retries = 3
dead_letter_queue = "analysis-jobs-dlq"

[vars]
APP_BASE_URL = "https://company-analyzer.workers.dev"
EMAIL_FROM   = "noreply@yourdomain.com"

# Secrets (set via: wrangler secret put <NAME>)
# TAVILY_API_KEY
# OPENAI_API_KEY
# ANTHROPIC_API_KEY
```

### 2.4 Provider Interface Contracts

`server/utils/providers/types.ts`:

```typescript
export type SearchProviderId = "tavily" | "openai" | "anthropic";
export type LLMProviderId =
  | "claude-sonnet-4-7"
  | "claude-haiku-4-5"
  | "gpt-4o"
  | "gpt-4o-mini";

export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  publishedAt?: string;
}

export interface SearchProvider {
  id: SearchProviderId;
  search(query: string, opts?: { maxResults?: number }): Promise<SearchResult[]>;
}

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMProvider {
  id: LLMProviderId;
  complete(messages: LLMMessage[], opts?: { maxTokens?: number; temperature?: number }): Promise<{
    text: string;
    inputTokens: number;
    outputTokens: number;
  }>;
}
```

`server/utils/providers/search/index.ts`:

```typescript
import type { SearchProvider, SearchProviderId } from "../types";
import { TavilySearch } from "./tavily";
import { OpenAISearch } from "./openai";
import { AnthropicSearch } from "./anthropic";

export function getSearchProvider(id: SearchProviderId, env: Env): SearchProvider {
  switch (id) {
    case "tavily":    return new TavilySearch(env.TAVILY_API_KEY);
    case "openai":    return new OpenAISearch(env.OPENAI_API_KEY);
    case "anthropic": return new AnthropicSearch(env.ANTHROPIC_API_KEY);
    default: throw new Error(`Unknown search provider: ${id}`);
  }
}
```

(Same pattern for `server/utils/providers/llm/index.ts` returning `LLMProvider`.)

### 2.5 Core Orchestrator

`server/utils/analyze.ts`:

```typescript
export interface AnalyzeInput {
  companyName: string;
  companyDomain?: string;
  extraFields?: Record<string, unknown>;  // any extra xlsx columns
  prompt: string;
  searchProviderId: SearchProviderId;
  llmProviderId: LLMProviderId;
  env: Env;
}

export interface AnalyzeOutput {
  answer: string;
  sources: { url: string; title: string }[];
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
}

export async function analyzeCompany(input: AnalyzeInput): Promise<AnalyzeOutput> {
  const start = Date.now();
  const search = getSearchProvider(input.searchProviderId, input.env);
  const llm = getLLMProvider(input.llmProviderId, input.env);

  // 1. Build a search query from company info
  const query = buildSearchQuery(input);

  // 2. Run web search (top 8 results)
  const results = await search.search(query, { maxResults: 8 });

  // 3. Compose the LLM prompt with research context
  const messages = buildLLMMessages(input, results);

  // 4. Get LLM response
  const completion = await llm.complete(messages, { maxTokens: 800 });

  return {
    answer: completion.text,
    sources: results.map(r => ({ url: r.url, title: r.title })),
    latencyMs: Date.now() - start,
    inputTokens: completion.inputTokens,
    outputTokens: completion.outputTokens,
  };
}

function buildSearchQuery(input: AnalyzeInput): string {
  // Combines name, domain, and extracts intent keywords from prompt
  const parts = [input.companyName];
  if (input.companyDomain) parts.push(input.companyDomain);
  return parts.join(" ");
}

function buildLLMMessages(input: AnalyzeInput, results: SearchResult[]): LLMMessage[] {
  const research = results
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet}`)
    .join("\n\n");

  return [
    {
      role: "system",
      content: "You are a business analyst. Answer the user's question about the company strictly using the research provided. Cite sources by [number].",
    },
    {
      role: "user",
      content: `COMPANY: ${input.companyName}${input.companyDomain ? ` (${input.companyDomain})` : ""}

RESEARCH:
${research}

QUESTION:
${input.prompt}

Respond concisely (under 200 words). End with a line: "Sources: [1], [3], ..."`,
    },
  ];
}
```

### 2.6 API Endpoints

#### `POST /api/analyze` — Individual mode

**Request:**
```json
{
  "companyName": "Acme Robotics",
  "companyDomain": "acme-robotics.io",
  "prompt": "Is this a fit for our B2B SaaS?",
  "searchProviderId": "tavily",
  "llmProviderId": "claude-sonnet-4-7"
}
```

**Response (200):**
```json
{
  "id": "01J...",
  "answer": "FIT. Acme Robotics recently raised...",
  "sources": [{ "url": "...", "title": "..." }],
  "latencyMs": 4234,
  "createdAt": 1719000000000
}
```

**Errors:** `400` (bad input), `429` (provider rate limit), `500` (provider failure — return `error.code` and `error.message`).

#### `POST /api/batch/start` — Batch mode

**Request:** `multipart/form-data`
- `file`: the .xlsx
- `prompt`: string
- `searchProviderId`: string
- `llmProviderId`: string
- `email`: string (optional)

**Server logic:**
1. Validate file size < 5MB and rows ≤ 1000.
2. Parse xlsx with `xlsx` npm package; extract `name`, `domain`, and any extra columns.
3. Upload original xlsx to R2 at key `uploads/{batchId}.xlsx`.
4. Insert `batches` row + N `analyses` rows (status='queued').
5. Send N messages to `ANALYSIS_QUEUE`.
6. Return `{ batchId, totalRows }`.

**Response (200):**
```json
{ "batchId": "01J...", "totalRows": 847 }
```

#### `GET /api/batch/[id]/status`

**Response (200):**
```json
{
  "id": "01J...",
  "status": "running",
  "totalRows": 847,
  "doneRows": 312,
  "failedRows": 4,
  "recentAnalyses": [
    { "id": "...", "companyName": "...", "status": "done", "answer": "...", "latencyMs": 4200 }
  ]
}
```

`recentAnalyses` returns the last 50 completed/running rows for live UI updates.

#### `GET /api/batch/[id]/download`
Streams `results.xlsx` from R2. Returns `404` if batch not yet complete.

### 2.7 Queue Consumer

`server/routes/_queue.ts`:

```typescript
export interface QueueMessage {
  analysisId: string;
  batchId: string;
}

export default {
  async queue(batch: MessageBatch<QueueMessage>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      try {
        await processOne(msg.body, env);
        msg.ack();
      } catch (err) {
        // Cloudflare retries automatically up to max_retries
        msg.retry();
      }
    }
  },
};

async function processOne(body: QueueMessage, env: Env): Promise<void> {
  // 1. Load analysis row from D1
  const analysis = await env.DB.prepare(
    "SELECT * FROM analyses WHERE id = ?"
  ).bind(body.analysisId).first();

  if (!analysis || analysis.status === "done") return;  // idempotent

  // 2. Load batch config
  const b = await env.DB.prepare("SELECT * FROM batches WHERE id = ?")
    .bind(body.batchId).first();

  // 3. Mark running
  await env.DB.prepare("UPDATE analyses SET status='running' WHERE id=?")
    .bind(body.analysisId).run();

  // 4. Run analysis
  const result = await analyzeCompany({
    companyName: analysis.company_name,
    companyDomain: analysis.company_domain,
    extraFields: JSON.parse(analysis.extra_input || "{}"),
    prompt: b.prompt,
    searchProviderId: b.search_provider,
    llmProviderId: b.llm_provider,
    env,
  });

  // 5. Persist
  await env.DB.prepare(`
    UPDATE analyses
    SET status='done', answer=?, sources=?, latency_ms=?
    WHERE id=?
  `).bind(result.answer, JSON.stringify(result.sources), result.latencyMs, body.analysisId).run();

  // 6. Increment batch counter; check completion
  const updated = await env.DB.prepare(`
    UPDATE batches SET done_rows = done_rows + 1
    WHERE id = ?
    RETURNING done_rows, total_rows
  `).bind(body.batchId).first();

  if (updated.done_rows + (updated.failed_rows || 0) >= updated.total_rows) {
    await finalizeBatch(body.batchId, env);
  }
}

async function finalizeBatch(batchId: string, env: Env): Promise<void> {
  // 1. Load all analyses for batch
  // 2. Generate results.xlsx (original cols + answer + sources + latency)
  // 3. Upload to R2 at results/{batchId}.xlsx
  // 4. Update batch status='completed', result_r2_key=...
  // 5. If batch.email: send notification via MailChannels with download link
}
```

### 2.8 Excel Handling

`server/utils/excel.ts`:

```typescript
import * as XLSX from "xlsx";

export interface ParsedRow {
  name: string;
  domain?: string;
  extra: Record<string, unknown>;
}

export function parseUploadedXlsx(buffer: ArrayBuffer): ParsedRow[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

  return rows.map(row => {
    // Find name and domain columns case-insensitively
    const lower = Object.fromEntries(
      Object.entries(row).map(([k, v]) => [k.toLowerCase().trim(), v])
    );
    const name = String(lower.name ?? lower.company ?? lower["company name"] ?? "").trim();
    const domain = String(lower.domain ?? lower.website ?? lower.url ?? "").trim() || undefined;
    const extra = { ...row };
    delete extra.name; delete extra.domain;  // also case variants
    return { name, domain, extra };
  }).filter(r => r.name.length > 0);
}

export function generateResultsXlsx(
  originalRows: ParsedRow[],
  analyses: AnalysisRow[]
): ArrayBuffer {
  const data = originalRows.map((row, i) => {
    const a = analyses[i];
    return {
      ...row.extra,
      "Company Name": row.name,
      "Domain": row.domain ?? "",
      "Answer": a?.answer ?? "",
      "Sources": (JSON.parse(a?.sources ?? "[]") as any[]).map(s => s.url).join(" | "),
      "Status": a?.status ?? "",
      "Latency (ms)": a?.latency_ms ?? "",
      "Error": a?.error ?? "",
    };
  });

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Results");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" });
}
```

### 2.9 Email Notification

`server/utils/email.ts`:

```typescript
export async function sendBatchCompleteEmail(opts: {
  to: string;
  batchId: string;
  totalRows: number;
  doneRows: number;
  failedRows: number;
  downloadUrl: string;
  env: Env;
}): Promise<void> {
  const body = {
    personalizations: [{ to: [{ email: opts.to }] }],
    from: { email: opts.env.EMAIL_FROM, name: "Company Analyzer" },
    subject: `Your batch is ready (${opts.doneRows}/${opts.totalRows})`,
    content: [{
      type: "text/html",
      value: `
        <p>Your analysis is complete.</p>
        <ul>
          <li>${opts.doneRows} of ${opts.totalRows} succeeded</li>
          <li>${opts.failedRows} failed</li>
        </ul>
        <p><a href="${opts.downloadUrl}">Download results.xlsx</a></p>
        <p>This link works for 7 days.</p>
      `,
    }],
  };

  const res = await fetch("https://api.mailchannels.net/tx/v1/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Email failed: ${res.status}`);
}
```

### 2.10 Frontend State Model

`composables/useAnalyzer.ts`:

```typescript
export const useAnalyzer = () => {
  const mode = useState<"individual" | "batch">("mode", () => "batch");
  const prompt = useState<string>("prompt", () => "");
  const searchProvider = useState<SearchProviderId>("search", () => "tavily");
  const llmProvider = useState<LLMProviderId>("llm", () => "claude-sonnet-4-7");
  const email = useState<string>("email", () => "");
  const file = useState<File | null>("file", () => null);

  // Individual-mode fields
  const companyName = useState<string>("companyName", () => "");
  const companyDomain = useState<string>("companyDomain", () => "");

  // Result for individual mode
  const result = useState<AnalyzeOutput | null>("result", () => null);
  const loading = useState<boolean>("loading", () => false);

  async function runIndividual() { /* ... */ }
  async function startBatch() { /* ... */ }

  return { mode, prompt, searchProvider, llmProvider, email, file,
           companyName, companyDomain, result, loading,
           runIndividual, startBatch };
};
```

### 2.11 Frontend: Batch Polling

`composables/useBatchPolling.ts`:

```typescript
export const useBatchPolling = (batchId: string) => {
  const status = ref<BatchStatus | null>(null);
  let timer: ReturnType<typeof setInterval> | null = null;

  async function tick() {
    const data = await $fetch<BatchStatus>(`/api/batch/${batchId}/status`);
    status.value = data;
    if (data.status === "completed" || data.status === "failed" || data.status === "cancelled") {
      stop();
    }
  }
  function start() { tick(); timer = setInterval(tick, 2000); }
  function stop() { if (timer) clearInterval(timer); timer = null; }

  onMounted(start);
  onUnmounted(stop);

  return { status };
};
```

---

## 3. Implementation Plan (Order of Work)

### Phase 1 — Foundation (≈2 hours)
1. `npx nuxi init company-analyzer && cd company-analyzer`
2. Install: `nitropack`, `@cloudflare/workers-types`, `xlsx`, `ulid`, `tailwindcss`, `lucide-vue-next`
3. Configure `nuxt.config.ts` with `nitro: { preset: 'cloudflare_module' }`
4. Create `wrangler.toml` (without IDs yet)
5. Run: `wrangler d1 create company-analyzer-db` → paste ID
6. Run: `wrangler r2 bucket create company-analyzer-files`
7. Run: `wrangler queues create analysis-jobs && wrangler queues create analysis-jobs-dlq`
8. Apply migrations: `wrangler d1 execute company-analyzer-db --file=migrations/0001_init.sql`

### Phase 2 — Core Backend (≈4 hours)
9. Create provider type definitions (`server/utils/providers/types.ts`)
10. Implement Tavily search + Anthropic LLM (the two most critical)
11. Implement `analyzeCompany()` orchestrator
12. Implement `POST /api/analyze`
13. **Test with curl** — confirm individual flow works end-to-end

### Phase 3 — Batch Pipeline (≈3 hours)
14. Implement Excel parser
15. Implement `POST /api/batch/start` (parse, persist, enqueue)
16. Implement queue consumer (`server/routes/_queue.ts`)
17. Implement `GET /api/batch/[id]/status`
18. Implement results.xlsx generation + R2 upload
19. Implement email notification

### Phase 4 — Frontend (≈4 hours)
20. Port the JSX mockup to Vue components
21. Wire `useAnalyzer` composable to `/api/analyze`
22. Wire upload + batch start
23. Build `pages/batch/[id].vue` with `useBatchPolling`
24. Polish: loading states, error toasts, empty states

### Phase 5 — Remaining Providers (≈2 hours)
25. Implement OpenAI search + Anthropic search
26. Implement OpenAI LLM
27. Verify factory functions select correctly

### Phase 6 — Deploy (≈1 hour)
28. `wrangler secret put TAVILY_API_KEY` (and the other two)
29. `npm run build && wrangler deploy`
30. Smoke-test the deployed URL with one company + a 5-row xlsx

---

## 4. Provider Implementation Details

### 4.1 Tavily

```typescript
export class TavilySearch implements SearchProvider {
  readonly id = "tavily" as const;
  constructor(private apiKey: string) {}

  async search(query: string, opts = {}): Promise<SearchResult[]> {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: this.apiKey,
        query,
        max_results: opts.maxResults ?? 8,
        search_depth: "advanced",
        include_answer: false,
      }),
    });
    if (!res.ok) throw new Error(`Tavily ${res.status}`);
    const data = await res.json() as any;
    return data.results.map((r: any) => ({
      url: r.url, title: r.title, snippet: r.content,
      publishedAt: r.published_date,
    }));
  }
}
```

### 4.2 Anthropic LLM (Claude Sonnet 4.7)

```typescript
export class AnthropicLLM implements LLMProvider {
  constructor(private apiKey: string, readonly id: LLMProviderId = "claude-sonnet-4-7") {}

  async complete(messages: LLMMessage[], opts = {}) {
    const system = messages.find(m => m.role === "system")?.content;
    const rest = messages.filter(m => m.role !== "system");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.id,
        max_tokens: opts.maxTokens ?? 1024,
        temperature: opts.temperature ?? 0.3,
        system,
        messages: rest.map(m => ({ role: m.role, content: m.content })),
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
    const data = await res.json() as any;
    return {
      text: data.content[0].text,
      inputTokens: data.usage.input_tokens,
      outputTokens: data.usage.output_tokens,
    };
  }
}
```

### 4.3 Anthropic Search (web_search tool)

Use Claude with the built-in `web_search_20250305` tool. Send the company query, let Claude run searches, parse the `mcp_tool_result` blocks for sources. Implementation pattern: same as `AnthropicLLM` but include `tools: [{ type: "web_search_20250305", name: "web_search" }]` and parse the tool-use blocks.

### 4.4 OpenAI Search

Use `gpt-4o` with the `responses` API and the `web_search_preview` tool. Parse the `output` array for citations.

---

## 5. Error Handling

| Scenario | Behavior |
|---|---|
| Provider 5xx | Retry up to 3x via Queues. After max retries → mark analysis `failed`, store error, increment `batches.failed_rows`. |
| Invalid xlsx (no `name` column) | Return `400` with explanation; nothing persists. |
| Row > 1000 | Return `400`; suggest splitting. |
| LLM context too long | Truncate research snippets to 500 chars each before sending. |
| Email send failure | Log; do not fail the batch. User can still download. |
| User cancels mid-batch | Set `batches.status='cancelled'`; queue messages still process but `processOne` checks status and exits early. |

---

## 6. Security & Privacy Notes

- **API keys** live only in Wrangler secrets, never in D1 or client.
- **Excel uploads** in R2 use opaque ULIDs as keys; not enumerable.
- **Download links** in emails include a signed token (HMAC of batchId + expiry); valid for 7 days.
- **No company data** is sent to third parties beyond the chosen search/LLM providers.
- **Single-tenant deployment** — no auth needed for v1, but app should be deployed behind Cloudflare Access in production.

---

## 7. Testing Checklist

Manual smoke tests (run before declaring v1 done):

- [ ] Individual mode with each search provider × each LLM provider (3 × 3 = 9 combos all work)
- [ ] Batch with 1 row, 10 rows, 100 rows, 1000 rows
- [ ] Upload xlsx with extra columns → those columns appear in results
- [ ] Upload xlsx without `domain` column → still works
- [ ] Upload xlsx missing `name` column → 400 error message is clear
- [ ] Cancel batch mid-run → no further rows processed
- [ ] Email arrives with working download link
- [ ] Download link still works 1 hour later
- [ ] One row's provider call fails 3x → marked failed, batch continues
- [ ] Page refresh during batch → progress still visible

---

## 8. Out-of-Scope (Future)

- Multi-tenant auth (Cloudflare Access or Clerk)
- Custom output schemas (structured fields, not just free text)
- Saved prompt templates per user
- Bring-your-own-API-keys mode
- Re-run failed rows from a batch
- Compare results across providers side-by-side
- Webhook integrations (Slack, Notion)

---

## 9. References for Implementation

- Nuxt on Cloudflare: https://nuxt.com/deploy/cloudflare
- Cloudflare Queues: https://developers.cloudflare.com/queues/
- Cloudflare D1: https://developers.cloudflare.com/d1/
- Tavily API: https://docs.tavily.com/docs/rest-api/api-reference
- Anthropic API: https://docs.claude.com/en/api/messages
- OpenAI Responses API: https://platform.openai.com/docs/api-reference/responses
- MailChannels on Workers: https://developers.cloudflare.com/email-routing/

---

**End of design document.** Hand this to Claude Code with: *"Implement Phase 1 from the plan in section 3."* Then progress phase by phase.

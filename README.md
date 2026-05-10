# 🔍 Baseera — Company Analyzer

> **AI-powered company research at scale.** Feed it a company website, ask anything, and get a sourced answer in seconds. Built for sales-qualification workflows where you need to screen hundreds of leads quickly.

<p align="center">
  <a href="#-live-demo">Live Demo</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-tech-stack">Tech Stack</a> •
  <a href="#-deployment">Deployment</a> •
  <a href="#-architecture">Architecture</a>
</p>

---

## 🎯 What it does

Pick an LLM, a search strategy, and either:

1. **Individual mode** → analyze one company in real-time (server-side)
2. **Batch mode** → upload an Excel of up to 1,000 companies. **Runs entirely in your browser** (no Cloudflare Queues / paid plan needed). Optional email notification when finished.

The agent reads **only the company's own website** (domain-restricted search), then writes a sourced answer with citations.

### Excel input format

The xlsx must contain at least **one** of these columns (case-insensitive):

- `name` / `company` / `company name` — company name
- `domain` / `website` / `url` — company URL or domain

If only a URL column is provided, the company name is auto-derived (e.g. `https://www.ejada.com` → name **Ejada**, domain **ejada.com**). Any extra columns are preserved and re-emitted in the output xlsx.

---

## 🚀 Live Demo

**Production URL:** [https://company-analyzer.thinktech-baseera.workers.dev](https://company-analyzer.thinktech-baseera.workers.dev)

> 🔒 Protected by HTTP Basic Auth. Contact [mahmoud.abdelhamid@thinktech-it.com](mailto:mahmoud.abdelhamid@thinktech-it.com) for credentials.

---

## 🛠️ Tech Stack

### Frontend

| Layer | Technology | Why |
|-------|------------|-----|
| **Framework** | [Nuxt 4](https://nuxt.com) (Vue 3) | File-based routing, SSR-ready, Cloudflare-native |
| **Styling** | [Tailwind CSS v4](https://tailwindcss.com) | Utility-first, zero-config with Vite plugin |
| **State** | Nuxt `useState` composables | Reactive, SSR-safe shared state |
| **Icons** | [Lucide Vue](https://lucide.dev) | Tree-shakeable SVG icons |
| **Build** | Vite (via Nuxt) | Sub-second HMR |

### Backend

| Layer | Technology | Why |
|-------|------------|-----|
| **Runtime** | [Cloudflare Workers](https://workers.cloudflare.com) | Edge-deployed, ~50ms cold start |
| **Server framework** | [Nitro](https://nitro.unjs.io) (Nuxt's engine) | Single-codebase frontend + API |
| **HTTP layer** | [H3](https://h3.unjs.io) | Built-in to Nitro, lightweight |
| **Language** | TypeScript 5+ | Type safety end-to-end |

### Data & Infrastructure

| Layer | Technology | Free tier |
|-------|------------|-----------|
| **Database** | [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite at the edge) | 5 GB, 25M reads/day |
| **File storage** | [Cloudflare R2](https://developers.cloudflare.com/r2/) (S3-compatible) | 10 GB, unlimited egress |
| **Background jobs** | [Cloudflare Queues](https://developers.cloudflare.com/queues/) | Requires Workers Paid ($5/mo) |
| **Email** | [Resend](https://resend.com) | 100/day, 3,000/month free |

### AI & Observability

| Layer | Technology | Use |
|-------|------------|-----|
| **LLM** | OpenAI `gpt-4o`, `gpt-5.4-mini-2026-03-17` | Reasoning + answer generation |
| **Web Search (built-in)** | OpenAI Responses API `web_search` tool | Domain-filtered agentic search |
| **Web Search (external)** | [Tavily API](https://tavily.com) | Two-step search → LLM flow |
| **Tracing** | [Langfuse](https://langfuse.com) | Full request/response logging |

---

## ⚡ Quick Start

### Prerequisites

- Node.js 18+
- A Cloudflare account ([free signup](https://dash.cloudflare.com/sign-up))
- API keys: [OpenAI](https://platform.openai.com/api-keys), [Tavily](https://tavily.com), [Resend](https://resend.com), [Langfuse](https://langfuse.com)

### 1️⃣ Install

```bash
git clone <this-repo>
cd Baseera
npm install
```

### 2️⃣ Configure local env

Create `.dev.vars` in the project root:

```ini
OPENAI_API_KEY=sk-...
TAVILY_API_KEY=tvly-dev-...
RESEND_API_KEY=re_...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_BASE_URL=https://us.cloud.langfuse.com
```

### 3️⃣ Build & run locally

```bash
npm run build
npx wrangler dev
```

Open **http://127.0.0.1:8787**.

> **Note:** Use `wrangler dev`, **not** `npm run dev`. Nuxt 4's dev server has Windows ESM issues with the Cloudflare preset.

---

## 🌍 Deployment

### Step 1 — Login to Cloudflare

```bash
npx wrangler login
```

### Step 2 — Create infrastructure

```bash
# D1 database — copy the printed database_id into wrangler.toml line 9
npx wrangler d1 create company-analyzer-db

# R2 bucket
npx wrangler r2 bucket create company-analyzer-files

# Apply schema (managed via migrations folder)
npx wrangler d1 migrations apply company-analyzer-db --remote

# Queues — ONLY if you upgrade to Workers Paid plan ($5/mo) and want server-side batch.
# Skip this on the free plan; batch will run in the browser instead.
# npx wrangler queues create analysis-jobs
# npx wrangler queues create analysis-jobs-dlq
```

### Step 3 — Set secrets

```bash
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put TAVILY_API_KEY
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put LANGFUSE_SECRET_KEY
npx wrangler secret put LANGFUSE_PUBLIC_KEY
```

### Step 4 — Deploy

```bash
npm run build
npx wrangler deploy
```

You'll get a `https://<app>.<subdomain>.workers.dev` URL. Done.

### Future updates

```bash
npm run build
npx wrangler deploy
```

---

## 🏗️ Architecture

### High-Level System Topology

The entire system is deployed as a single **Cloudflare Worker**. Frontend (Nuxt 4 / Vue 3) and backend (Nitro / H3) ship together.

```mermaid
graph TB
    subgraph Browser["🖥️ Browser (Client)"]
        UI["index.vue<br/>Vue 3 SPA"]
        PS["ProviderSelector.vue"]
        UZ["UploadZone.vue"]
        RC["ResultCard.vue"]
        UA["useAnalyzer.ts<br/>Composable"]
        XLSX_C["SheetJS (xlsx)<br/>Client-side parsing"]
    end

    subgraph CF["☁️ Cloudflare Edge"]
        subgraph Worker["Nuxt 4 + Nitro Worker"]
            AUTH["auth.ts<br/>Basic Auth Middleware"]
            API_A["POST /api/analyze"]
            API_N["POST /api/notify"]
            API_H["GET /api/health"]
            ORCH["analyze.ts<br/>Core Orchestrator"]
            DB_H["db.ts<br/>D1 Helpers"]
            TRACE["tracing.ts<br/>Langfuse Client"]
        end

        subgraph Providers["Provider Layer"]
            SP_IDX["Search Provider Factory"]
            SP_TAV["TavilySearch"]
            SP_OAI["OpenAISearch"]
            LLM_IDX["LLM Provider Factory"]
            LLM_OAI["OpenAI LLM<br/>gpt-4o / gpt-5.4-mini"]
        end

        D1[("D1 (SQLite)<br/>analyses table")]
        R2[("R2 Bucket<br/>company-analyzer-files")]
    end

    subgraph External["🌐 External Services"]
        TAVILY["Tavily API<br/>Web Search"]
        OPENAI["OpenAI API<br/>Responses + Chat"]
        RESEND["Resend API<br/>Email"]
        LANGFUSE["Langfuse<br/>Observability"]
    end

    UI --> UA
    PS --> UA
    UZ --> UA
    UA -->|"$fetch POST"| API_A
    UA -->|"$fetch POST"| API_N
    UA --> XLSX_C

    AUTH -.->|"guards all routes<br/>(except /api/health)"| API_A
    AUTH -.-> API_N

    API_A --> ORCH
    ORCH --> SP_IDX
    ORCH --> LLM_IDX
    ORCH --> TRACE
    API_A --> DB_H

    SP_IDX --> SP_TAV
    SP_IDX --> SP_OAI
    LLM_IDX --> LLM_OAI

    SP_TAV -->|"HTTPS"| TAVILY
    SP_OAI -->|"HTTPS"| OPENAI
    LLM_OAI -->|"HTTPS"| OPENAI
    API_N -->|"HTTPS"| RESEND
    TRACE -->|"HTTPS"| LANGFUSE
    DB_H --> D1

    RC --> UI
```

### Individual Analysis — Request Flow

Single company analysis: user fills form → `POST /api/analyze` → search → LLM → response.

```mermaid
sequenceDiagram
    actor User
    participant Vue as index.vue
    participant Comp as useAnalyzer
    participant Auth as auth.ts Middleware
    participant API as POST /api/analyze
    participant Orch as analyzeCompany()
    participant Search as Search Provider
    participant LLM as LLM Provider
    participant DB as D1 Database
    participant LF as Langfuse

    User->>Vue: Enter company + prompt, click Analyze
    Vue->>Comp: runIndividual()
    Comp->>API: $fetch POST /api/analyze
    API->>Auth: Request intercepted
    Auth-->>API: ✓ Authorized (Basic Auth)

    API->>Orch: analyzeCompany(input)
    Orch->>LF: trace.start("analyzeCompany")

    alt Path A — OpenAI Built-in Search
        Orch->>LLM: complete(messages, webSearch config)
        LLM->>LLM: Model runs web_search tool internally
        LLM-->>Orch: text + citations + allSources
    else Path B — Tavily Two-Step
        Orch->>Search: search(query, allowedDomains)
        Search-->>Orch: SearchResult[] (max 8)
        Orch->>LF: span("web-search")
        Orch->>LLM: complete(messages with research context)
        LLM-->>Orch: text + token counts
    end

    Orch->>LF: generation("llm-completion")
    Orch->>LF: flushAsync()
    Orch-->>API: AnalyzeOutput

    API->>DB: insertAnalysis(result)
    API-->>Comp: { id, answer, sources, latencyMs }
    Comp-->>Vue: Update result state
    Vue->>User: Render ResultCard
```

### Batch Analysis — Browser-Side Flow

Batch mode: the browser orchestrates everything. No server-side queues needed.

```mermaid
sequenceDiagram
    actor User
    participant Vue as index.vue
    participant Comp as useAnalyzer
    participant XLSX as SheetJS (browser)
    participant API as POST /api/analyze
    participant Notify as POST /api/notify
    participant Resend as Resend API

    User->>Vue: Upload .xlsx + enter prompt
    User->>Vue: Click "Start Batch"
    Vue->>Comp: startBatch()

    Comp->>XLSX: Read file ArrayBuffer
    XLSX-->>Comp: Parsed rows[]
    Note over Comp: Detect website column<br/>Clean domains<br/>Derive company names<br/>Detect duplicates<br/>Max 1,000 rows

    Comp->>Comp: Spawn 6 worker coroutines

    par Worker 1..6 (concurrent)
        loop Each row from queue
            alt Duplicate row
                Comp->>Comp: Wait for primary row result
                Comp->>Comp: Copy primary's answer
            else Unique row
                Comp->>API: POST /api/analyze (per row)
                API-->>Comp: { answer, sources, latencyMs }
            end
            Comp->>Vue: Update batchRows[] (reactive)
            Vue->>User: Progress bar + table update
        end
    end

    Note over Comp: All rows processed

    opt Email provided & not cancelled
        Comp->>Notify: POST /api/notify (summary)
        Notify->>Resend: Send completion email
    end

    User->>Vue: Click "Download results.xlsx"
    Comp->>XLSX: buildResultsXlsx(rows)
    XLSX-->>User: Browser download .xlsx
```

### AI Provider Strategy — Decision Tree

The orchestrator picks a fundamentally different execution path based on the user's search provider choice.

```mermaid
flowchart TD
    START(["User request arrives<br/>at analyzeCompany()"])
    CHECK{"searchProviderId<br/>== 'openai'?"}
    LLM_CHECK{"llmProviderId ∈<br/>{gpt-4o, gpt-5.4-mini}?"}

    subgraph PathA["Path A: Single-Call Agentic"]
        A1["Build system + user messages<br/>(no pre-fetched research)"]
        A2["Call OpenAI Responses API<br/>with web_search tool attached"]
        A3["Model autonomously searches<br/>allowed_domains filter applied"]
        A4["Extract citations +<br/>allSources from response"]
    end

    subgraph PathB["Path B: Two-Step Search → LLM"]
        B1["getSearchProvider(id)"]
        B2{"Provider?"}
        B3["TavilySearch.search()<br/>include_domains filter<br/>max 8 results"]
        B4["OpenAISearch.search()<br/>(standalone search)"]
        B5["Build messages with<br/>numbered research context"]
        B6["Call LLM via Chat Completions<br/>temp=0.3, max_tokens=800"]
    end

    DONE(["Return AnalyzeOutput<br/>answer + sources + latency"])

    START --> CHECK
    CHECK -->|Yes| LLM_CHECK
    CHECK -->|No| PathB
    LLM_CHECK -->|Yes| PathA
    LLM_CHECK -->|No| PathB

    A1 --> A2 --> A3 --> A4 --> DONE
    B1 --> B2
    B2 -->|"tavily"| B3
    B2 -->|"openai"| B4
    B3 --> B5
    B4 --> B5
    B5 --> B6 --> DONE
```

### Server-Side Batch (Disabled — In Codebase)

These components exist in the codebase but are **disabled** in `wrangler.toml`. Requires Cloudflare Workers Paid ($5/mo). Uncomment the `[[queues.*]]` blocks to re-enable.

```mermaid
flowchart LR
    subgraph Disabled["⛔ Disabled — Uncomment in wrangler.toml"]
        CLIENT["Browser"] -->|"POST /api/batch/start"| START_EP["start.post.ts<br/>Parse xlsx, insert DB rows"]
        START_EP --> D1_B[("D1<br/>batches + analyses")]
        START_EP --> R2_UP[("R2<br/>Upload xlsx")]
        START_EP -->|"Enqueue each row"| QUEUE["Cloudflare Queue<br/>analysis-jobs"]

        QUEUE --> CONSUMER["cloudflare-queue.ts<br/>Nitro Plugin"]
        CONSUMER --> QP["queue-processor.ts"]
        QP --> ANALYZE["analyzeCompany()"]
        QP --> D1_B
        QP -->|"All rows done?"| FINALIZE["finalizeBatch()"]
        FINALIZE --> R2_DL[("R2<br/>results.xlsx")]
        FINALIZE --> EMAIL["email.ts<br/>sendBatchCompleteEmail()"]
        EMAIL -->|"HTTPS"| RESEND["Resend API"]

        DLQ["Dead Letter Queue<br/>analysis-jobs-dlq"]
        QUEUE -.->|"max_retries: 3"| DLQ

        CLIENT -->|"GET /api/batch/:id"| STATUS["[id]/index.get.ts"]
        STATUS --> D1_B
        CLIENT -->|"GET /api/batch/:id/download"| DL["[id]/download.get.ts"]
        DL --> R2_DL
    end
```

### Data Model — D1 Schema

```mermaid
erDiagram
    BATCHES {
        text id PK "ULID"
        integer created_at "epoch ms"
        text status "running | completed | failed | cancelled"
        integer total_rows
        integer done_rows "default 0"
        integer failed_rows "default 0"
        text prompt
        text search_provider "tavily | openai"
        text llm_provider "gpt-4o | gpt-5.4-mini-..."
        text email "nullable — notification addr"
        text upload_r2_key "nullable — original xlsx"
        text result_r2_key "nullable — results xlsx"
        integer completed_at "nullable — epoch ms"
    }

    ANALYSES {
        text id PK "ULID"
        text batch_id FK "nullable — null for individual"
        integer row_index "nullable — position in batch"
        integer created_at "epoch ms"
        text company_name
        text company_domain "nullable"
        text extra_input "nullable — JSON extra columns"
        text status "queued | running | done | failed"
        text answer "nullable"
        text sources "nullable — JSON array"
        text search_provider
        text llm_provider
        integer latency_ms "nullable"
        text error "nullable"
    }

    BATCHES ||--o{ ANALYSES : "has many"
```

### Frontend Component Hierarchy

```mermaid
graph TD
    subgraph Nuxt["Nuxt 4 App Shell"]
        APP["app.vue<br/>NuxtPage router-view"]
    end

    subgraph Page["index.vue (single page)"]
        HEADER["Header<br/>Logo + Title"]
        MODE["Mode Toggle<br/>Individual | Batch"]
        SUBMIT["Submit / Cancel Button"]
        ERROR["Error Banner"]
        PROGRESS["Batch Progress Panel<br/>Progress bar + stats"]
        TABLE["Results Table<br/>Row-by-row status"]
        MODAL["Result Detail Modal<br/>Full answer + sources"]
    end

    subgraph Components["Reusable Components"]
        PS_C["ProviderSelector.vue<br/>Search + LLM dropdowns"]
        UZ_C["UploadZone.vue<br/>Drag & drop xlsx"]
        RC_C["ResultCard.vue<br/>Individual result display"]
    end

    subgraph State["Shared State (useAnalyzer composable)"]
        S1["mode: individual | batch"]
        S2["prompt, searchProvider, llmProvider"]
        S3["companyName, companyDomain, email, file"]
        S4["result, loading, error"]
        S5["batchRows[], batchRunning, batchCancelled"]
        S6["runIndividual(), startBatch()"]
        S7["cancelBatch(), downloadBatchResults()"]
    end

    APP --> Page
    Page --> PS_C
    Page --> UZ_C
    Page --> RC_C
    Page --> PROGRESS
    Page --> TABLE
    Page --> MODAL

    PS_C -.->|"v-model"| S2
    UZ_C -.->|"v-model"| S3
    RC_C -.->|"props"| S4
    MODE -.->|"v-model"| S1
    TABLE -.->|"reads"| S5
    SUBMIT -.->|"calls"| S6
```

---

## 🧠 The Agent

Two execution paths depending on your provider choice:

### Path A: External search → LLM (two-step)

Triggered when **SEARCH = Tavily**. The flow:

1. Build a query from `companyName + domain + website`
2. Tavily searches, restricted to the company domain via `include_domains`
3. Top 8 results passed to LLM as numbered context
4. LLM (`gpt-4o` or `gpt-5.4-mini`) writes a sourced answer

### Path B: Agentic LLM with built-in search (single call)

Triggered when **SEARCH = OpenAI**. The flow:

1. The LLM is called via OpenAI Responses API
2. The `web_search` tool is attached with `filters.allowed_domains: [<company domain>]`
3. The model **decides** what to search for, can run multiple searches, and reads pages
4. Returns the final answer with `url_citation` annotations + complete `sources` list

For `gpt-5.4-mini`, `reasoning.effort: "low"` is set to keep latency reasonable while still benefiting from chain-of-thought.

---

## ⚙️ Active Configuration

These are the parameters the app currently uses. Tune them by editing the file noted in each row.

### LLM

| Parameter | Value | Where it's set |
|---|---|---|
| Default LLM | `gpt-5.4-mini-2026-03-17` | UI selector (`app/components/ProviderSelector.vue`) |
| Alternate LLM | `gpt-4o` | UI selector |
| `max_output_tokens` | **800** | `server/utils/analyze.ts` |
| `temperature` | `0.3` (chat models only) | `server/utils/providers/llm/openai.ts` |
| `reasoning.effort` (gpt-5/o-models) | **`low`** | `server/utils/providers/llm/openai.ts` |
| API used | OpenAI **Responses API** for reasoning models OR when web_search is needed; otherwise **Chat Completions** | `server/utils/providers/llm/openai.ts` |

### Web search

| Parameter | Value | Where it's set |
|---|---|---|
| Built-in search (OpenAI) — `search_context_size` | **`high`** | `server/utils/analyze.ts` |
| Built-in search — `tool_choice` | `{ type: "web_search" }` (forced) | `server/utils/providers/llm/openai.ts` |
| Built-in search — domain filter | `filters.allowed_domains: [<companyDomain>]` (max 100) | `server/utils/providers/llm/openai.ts` |
| External search (Tavily) — `max_results` | **8** | `server/utils/analyze.ts` |
| External search (Tavily) — `searchContextSize` | **`high`** | `server/utils/analyze.ts` |
| External search (Tavily) — domain filter | `include_domains: [<companyDomain>]` | `server/utils/providers/search/tavily.ts` |

### Batch mode (browser-side)

| Parameter | Value | Where it's set |
|---|---|---|
| Execution | Runs **in the browser tab** — no server queue | `app/composables/useAnalyzer.ts` |
| Concurrency | **6 rows in parallel** | `app/composables/useAnalyzer.ts` (`CONCURRENCY`) |
| Max rows | **1,000** | `app/composables/useAnalyzer.ts` |
| Email notify | Optional. Browser POSTs `/api/notify` after the loop completes (Resend) | `server/api/notify.post.ts` |
| Output | Client-side xlsx download, no R2 storage | `app/composables/useAnalyzer.ts` (`downloadBatchResults`) |

> **Want server-side batch back?** It's already wired (queue producer/consumer, R2 result storage, scheduled emails). Uncomment the `[[queues.*]]` blocks in `wrangler.toml`, run `npx wrangler queues create analysis-jobs && npx wrangler queues create analysis-jobs-dlq`, and switch `startBatch()` in `useAnalyzer.ts` back to the server flow. Requires Workers Paid ($5/mo).

---

## 💰 Cost Comparison

Measured on real 20-row batches (one analysis per row), then linearly extrapolated. Numbers are **OpenAI cost only** — add Tavily fees if you exceed its free tier (1,000 calls/month).

| Combo | Per 20 (measured) | Per 1,000 (estimated) |
|-------|---|---|
| OpenAI search + **GPT-5.4 Mini** (`ctx=high`, current default) | $0.7297 | **~$36.49** |
| OpenAI search + **GPT-4o-mini** equivalent (cheap LLM, `ctx=high`) | $0.1635 | **~$8.17** ⭐ cheapest |
| Tavily + GPT-5.4 Mini | ~$0.10 | **~$5–10** |

**Tavily fees:** free up to 1,000 calls/month. Beyond that ~$30/mo for 4,000 calls.

> Tip: For high-volume screening, use **Tavily + GPT-5.4 Mini**. For best quality on important leads, use **OpenAI search + GPT-5.4 Mini** with `ctx=high` (the current default).

---

## 📂 Project Structure

```
Baseera/
├── app/                          # Frontend (Vue + Nuxt)
│   ├── pages/                    # Routes — single-page (index.vue)
│   ├── components/               # ProviderSelector, ResultCard, UploadZone
│   ├── composables/              # useAnalyzer (parses xlsx + runs batch in browser)
│   └── assets/css/main.css       # Tailwind entry
│
├── server/                       # Backend (Nitro)
│   ├── api/                      # API routes
│   │   ├── analyze.post.ts       # Per-row analysis (called from individual + browser-batch)
│   │   ├── notify.post.ts        # Sends batch-complete email (Resend)
│   │   ├── batch/                # Server-side batch (kept for when Queues are enabled)
│   │   └── health.get.ts
│   ├── plugins/cloudflare-queue.ts
│   └── utils/
│       ├── analyze.ts            # Core orchestrator
│       ├── providers/            # Search & LLM providers
│       │   ├── search/{tavily,openai}.ts
│       │   └── llm/openai.ts
│       ├── queue-processor.ts    # Batch worker
│       ├── excel.ts              # XLSX parse/generate
│       ├── email.ts              # Resend integration
│       ├── db.ts                 # D1 helpers
│       ├── r2.ts                 # R2 helpers
│       └── tracing.ts            # Langfuse
│
├── shared/types.ts               # Shared TS types (client + server)
├── migrations/0001_init.sql      # D1 schema
├── wrangler.toml                 # Cloudflare deploy config
├── nuxt.config.ts
└── package.json
```

---

## 🧪 Test the API

### Individual mode

```bash
curl -X POST https://company-analyzer.thinktech-baseera.workers.dev/api/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "companyName": "ThinkTech IT",
    "companyDomain": "thinktech-it.com",
    "prompt": "What does this company do?",
    "searchProviderId": "openai",
    "llmProviderId": "gpt-5.4-mini-2026-03-17"
  }'
```

### Health check

```bash
curl https://company-analyzer.thinktech-baseera.workers.dev/api/health
```

---

## 🔭 Observability

Every analysis is traced in [Langfuse](https://cloud.langfuse.com):

- Root trace: `analyzeCompany` with input/output
- Span: `web-search` with query + result count
- Generation: `llm-completion` with full prompt, model, tokens, answer

View live logs in the Cloudflare dashboard → Workers → `company-analyzer` → Logs, or run:

```bash
npx wrangler tail
```

---

## ⚙️ Configuration Reference

### Environment Variables (`wrangler.toml [vars]`)

| Var | Purpose |
|-----|---------|
| `APP_BASE_URL` | Used in batch download links sent in emails |
| `EMAIL_FROM` | Sender for batch completion emails (Resend) |

### Secrets (`wrangler secret put <NAME>`)

| Secret | Source |
|--------|--------|
| `OPENAI_API_KEY` | https://platform.openai.com/api-keys |
| `TAVILY_API_KEY` | https://app.tavily.com/home |
| `RESEND_API_KEY` | https://resend.com/api-keys |
| `LANGFUSE_SECRET_KEY` | https://cloud.langfuse.com (project settings) |
| `LANGFUSE_PUBLIC_KEY` | https://cloud.langfuse.com (project settings) |

---

## 📝 License & Credits

Built by [ThinkTech IT](https://thinktech-it.com) for internal lead-qualification workflows.

Powered by:
- [Nuxt](https://nuxt.com) — full-stack Vue framework
- [Cloudflare Workers](https://workers.cloudflare.com) — edge compute
- [OpenAI](https://openai.com) — LLM + agentic web search
- [Tavily](https://tavily.com) — research-grade web search
- [Resend](https://resend.com) — transactional email
- [Langfuse](https://langfuse.com) — LLM observability

---

<p align="center">
  <sub>Made with ☕ in Cairo</sub>
</p>

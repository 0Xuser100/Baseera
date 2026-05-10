import type { SearchProviderId, LLMProviderId, AnalyzeOutput } from "~/shared/types";
import * as XLSX from "xlsx";

function cleanDomain(raw: string): string | undefined {
  if (!raw) return undefined;
  let s = raw.trim();
  if (!s) return undefined;
  // Strip protocol
  s = s.replace(/^https?:\/\//i, "");
  // Strip leading www.
  s = s.replace(/^www\./i, "");
  // Strip path/query/hash
  s = s.split(/[/?#]/)[0] ?? s;
  s = s.toLowerCase();
  return s || undefined;
}

function nameFromDomain(domain: string): string {
  // "ejada.com" -> "Ejada", "my-company.co.uk" -> "My Company"
  const label = domain.split(".")[0] ?? domain;
  return label
    .split(/[-_]/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

export interface BatchRow {
  index: number;
  companyName: string;
  companyDomain?: string;
  website?: string;
  extra: Record<string, unknown>;
  originalRow: Record<string, unknown>;
  status: "queued" | "running" | "done" | "failed";
  answer?: string;
  sources?: { url: string; title: string }[];
  latencyMs?: number;
  error?: string;
}

function buildResultsXlsx(rows: BatchRow[]): ArrayBuffer {
  const data = rows.map((r) => ({
    ...r.originalRow,
    Answer: r.answer ?? "",
    Sources: (r.sources ?? []).map((s) => s.url).join(" | "),
    Status: r.status,
    "Latency (ms)": r.latencyMs ?? "",
    Error: r.error ?? "",
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Results");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" });
}

export const useAnalyzer = () => {
  const mode = useState<"individual" | "batch">("mode", () => "individual");
  const prompt = useState<string>("prompt", () => "");
  const searchProvider = useState<SearchProviderId>("searchProvider", () => "tavily");
  const llmProvider = useState<LLMProviderId>("llmProvider", () => "gpt-4o");
  const email = useState<string>("email", () => "");
  const file = useState<File | null>("file", () => null);
  const companyName = useState<string>("companyName", () => "");
  const companyDomain = useState<string>("companyDomain", () => "");
  const result = useState<AnalyzeOutput | null>("result", () => null);
  const loading = useState<boolean>("loading", () => false);
  const error = useState<string | null>("error", () => null);

  // Client-side batch state
  const batchRows = useState<BatchRow[]>("batchRows", () => []);
  const batchRunning = useState<boolean>("batchRunning", () => false);
  const batchCancelled = useState<boolean>("batchCancelled", () => false);

  async function runIndividual() {
    if (!companyName.value || !prompt.value) return;
    loading.value = true;
    error.value = null;
    result.value = null;
    try {
      result.value = await $fetch<AnalyzeOutput>("/api/analyze", {
        method: "POST",
        body: {
          companyName: companyName.value,
          companyDomain: companyDomain.value || undefined,
          prompt: prompt.value,
          searchProviderId: searchProvider.value,
          llmProviderId: llmProvider.value,
        },
      });
    } catch (e: any) {
      error.value = e?.data?.message ?? e?.message ?? "Something went wrong";
    } finally {
      loading.value = false;
    }
  }

  async function startBatch(): Promise<void> {
    if (!file.value || !prompt.value) return;
    loading.value = true;
    error.value = null;
    batchRows.value = [];
    batchCancelled.value = false;

    try {
      // 1. Parse xlsx in the browser
      const buf = await file.value.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const firstSheet = wb.Sheets[wb.SheetNames[0]!];
      if (!firstSheet) throw new Error("Empty xlsx file");
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet);

      // The only column the system genuinely *needs* is the website (so we can
      // do a web search). Every other column — whatever it is named — is
      // forwarded verbatim to the LLM as labeled key/value context.
      //
      // Website-column detection is flexible: pick the first column whose
      // header looks website-y (website / domain / url / site / homepage /
      // web / link), case-insensitive. If none matches by name, fall back to
      // the first column whose value looks like a URL or domain.
      const WEB_HEADER_RE = /\b(website|domain|url|site|homepage|web|link)\b/i;
      const URL_VALUE_RE = /^(https?:\/\/|www\.)|\.[a-z]{2,}(\/|$)/i;
      // Social-media / generic-platform domains. A row whose only URL-shaped
      // value points at one of these is NOT a corporate website — analyzing
      // it would mean searching facebook.com / twitter.com etc. as if it
      // were the company's own site, which is virtually never useful.
      const SOCIAL_DOMAIN_RE =
        /(^|\.)(facebook|fb|twitter|x|linkedin|instagram|youtube|tiktok|pinterest|threads|t|wa|whatsapp|telegram|reddit|medium|github|gitlab)\.(com|me|co|io)(\/|$)/i;
      // Header names that explicitly identify a social profile column.
      // Used so the value-based fallback never picks them up either.
      const SOCIAL_HEADER_RE =
        /\b(facebook|fb|twitter|x|linkedin|instagram|ig|youtube|yt|tiktok|pinterest|threads|whatsapp|telegram|reddit|medium|github|gitlab|social)\b/i;

      function isCorporateUrl(v: string): boolean {
        if (!URL_VALUE_RE.test(v)) return false;
        return !SOCIAL_DOMAIN_RE.test(v);
      }

      function pickWebsiteKey(row: Record<string, unknown>): string | undefined {
        const keys = Object.keys(row);
        // Header pass: must match website-y keyword AND must NOT be a social
        // header (so a column literally called "Facebook URL" never wins).
        const byHeader = keys.find(
          (k) => WEB_HEADER_RE.test(k) && !SOCIAL_HEADER_RE.test(k)
        );
        if (byHeader) {
          const v = String(row[byHeader] ?? "").trim();
          // If the value at the header-matched column is itself a social URL,
          // skip it and fall through to the value-based search.
          if (v.length > 0 && !SOCIAL_DOMAIN_RE.test(v)) return byHeader;
        }
        // Value-based fallback: first column with a non-social URL value,
        // and whose header is not flagged as social.
        return keys.find((k) => {
          if (SOCIAL_HEADER_RE.test(k)) return false;
          const v = String(row[k] ?? "").trim();
          return v.length > 0 && isCorporateUrl(v);
        });
      }

      const rows: BatchRow[] = json
        .map((row, i) => {
          const websiteKey = pickWebsiteKey(row);
          const rawWebsite = websiteKey ? String(row[websiteKey] ?? "").trim() : "";
          const domain = cleanDomain(rawWebsite);
          // Display label only — derived from the domain. The LLM sees every
          // original column (including any "name"/"company" column) inside
          // `extra`, so the label here does not influence analysis.
          const name = domain ? nameFromDomain(domain) : (rawWebsite || `Row ${i + 1}`);
          // Pass every column to the LLM EXCEPT the website column itself
          // (which is already represented as `companyDomain` / `website`).
          const extra: Record<string, unknown> = { ...row };
          if (websiteKey) delete extra[websiteKey];
          return {
            index: i,
            companyName: name,
            companyDomain: domain,
            website: rawWebsite || undefined,
            extra,
            originalRow: { ...row },
            status: "queued" as const,
          };
        })
        .filter((r) => !!r.website);

      if (rows.length === 0) {
        throw new Error(
          "No rows with a website were found. Each row needs at least one column containing a website URL or domain."
        );
      }
      if (rows.length > 1000) {
        throw new Error(`Too many rows (${rows.length}). Max 1000.`);
      }

      batchRows.value = rows;
      batchRunning.value = true;

      // Pre-compute duplicates: map array-position -> primary array-position
      // for rows pointing at the same site. Prefer the cleaned domain when
      // available; otherwise dedupe on the raw website string.
      const siteToPrimary = new Map<string, number>();
      const duplicateOf = new Map<number, number>();
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]!;
        const key = (r.companyDomain || r.website || "").toLowerCase();
        if (!key) continue;
        if (siteToPrimary.has(key)) {
          duplicateOf.set(i, siteToPrimary.get(key)!);
        } else {
          siteToPrimary.set(key, i);
        }
      }

      // 2. Process with limited concurrency
      const CONCURRENCY = 6;
      let cursor = 0;

      async function worker() {
        while (cursor < rows.length && !batchCancelled.value) {
          const idx = cursor++;
          const row = batchRows.value[idx];
          if (!row) continue;
          row.status = "running";
          batchRows.value = [...batchRows.value];

          const primaryIdx = duplicateOf.get(idx);
          if (primaryIdx !== undefined) {
            // Wait for the primary row to finish, then copy its result
            while (!batchCancelled.value) {
              const primary = batchRows.value[primaryIdx];
              if (!primary || primary.status === "done" || primary.status === "failed") break;
              await new Promise((r) => setTimeout(r, 300));
            }
            const primary = batchRows.value[primaryIdx];
            if (primary?.status === "done") {
              row.status = "done";
              row.answer = primary.answer;
              row.sources = primary.sources;
              row.latencyMs = primary.latencyMs;
            } else {
              row.status = "failed";
              row.error = primary?.error ?? "Primary row failed";
            }
            batchRows.value = [...batchRows.value];
            continue;
          }

          const start = Date.now();
          try {
            const res = await $fetch<AnalyzeOutput>("/api/analyze", {
              method: "POST",
              body: {
                companyName: row.companyName,
                companyDomain: row.companyDomain,
                website: row.website,
                extraFields: row.extra,
                prompt: prompt.value,
                searchProviderId: searchProvider.value,
                llmProviderId: llmProvider.value,
              },
            });
            row.status = "done";
            row.answer = res.answer;
            row.sources = res.sources;
            row.latencyMs = res.latencyMs ?? Date.now() - start;
          } catch (e: any) {
            row.status = "failed";
            row.error = e?.data?.message ?? e?.message ?? "Failed";
          }
          batchRows.value = [...batchRows.value];
        }
      }

      await Promise.all(Array.from({ length: CONCURRENCY }, worker));

      // Send completion email if requested and not cancelled
      if (email.value && !batchCancelled.value) {
        const done = batchRows.value.filter((r) => r.status === "done").length;
        const failed = batchRows.value.filter((r) => r.status === "failed").length;
        try {
          await $fetch("/api/notify", {
            method: "POST",
            body: {
              to: email.value,
              totalRows: batchRows.value.length,
              doneRows: done,
              failedRows: failed,
            },
          });
        } catch (e: any) {
          // Don't fail the batch over a failed email; just log to console
          console.warn("Email notification failed:", e?.data?.message ?? e?.message);
        }
      }
    } catch (e: any) {
      error.value = e?.message ?? "Batch failed";
    } finally {
      batchRunning.value = false;
      loading.value = false;
    }
  }

  function cancelBatch() {
    batchCancelled.value = true;
  }

  function downloadBatchResults() {
    if (batchRows.value.length === 0) return;
    const blob = buildResultsXlsx(batchRows.value);
    const url = URL.createObjectURL(new Blob([blob], { type: "application/octet-stream" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `batch-results-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return {
    mode, prompt, searchProvider, llmProvider, email, file,
    companyName, companyDomain, result, loading, error,
    batchRows, batchRunning, batchCancelled,
    runIndividual, startBatch, cancelBatch, downloadBatchResults,
  };
};

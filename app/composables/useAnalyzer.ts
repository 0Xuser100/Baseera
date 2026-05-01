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
  extra: Record<string, unknown>;
  status: "queued" | "running" | "done" | "failed";
  answer?: string;
  sources?: { url: string; title: string }[];
  latencyMs?: number;
  error?: string;
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

      const rows: BatchRow[] = json
        .map((row, i) => {
          const lower = Object.fromEntries(
            Object.entries(row).map(([k, v]) => [k.toLowerCase().trim(), v])
          );
          const rawName = String(
            lower.name ?? lower.company ?? lower["company name"] ?? ""
          ).trim();
          const rawDomain = String(
            lower.domain ?? lower.website ?? lower.url ?? ""
          ).trim();
          const domain = cleanDomain(rawDomain);
          // Fall back to deriving name from domain (e.g. "ejada.com" -> "Ejada")
          const name = rawName || (domain ? nameFromDomain(domain) : "");
          const extra = { ...row };
          for (const k of Object.keys(extra)) {
            const lk = k.toLowerCase().trim();
            if (["name", "company", "company name", "domain", "website", "url"].includes(lk)) {
              delete extra[k];
            }
          }
          return {
            index: i,
            companyName: name,
            companyDomain: domain,
            extra,
            status: "queued" as const,
          };
        })
        .filter((r) => r.companyName.length > 0);

      if (rows.length === 0) {
        throw new Error(
          "No valid rows found. Need a 'name', 'company', 'domain', 'website' or 'url' column."
        );
      }
      if (rows.length > 1000) {
        throw new Error(`Too many rows (${rows.length}). Max 1000.`);
      }

      batchRows.value = rows;
      batchRunning.value = true;

      // 2. Process with limited concurrency (3 parallel)
      const CONCURRENCY = 6;
      let cursor = 0;

      async function worker() {
        while (cursor < rows.length && !batchCancelled.value) {
          const idx = cursor++;
          const row = batchRows.value[idx];
          if (!row) continue;
          row.status = "running";
          batchRows.value = [...batchRows.value]; // trigger reactivity
          const start = Date.now();
          try {
            const res = await $fetch<AnalyzeOutput>("/api/analyze", {
              method: "POST",
              body: {
                companyName: row.companyName,
                companyDomain: row.companyDomain,
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
    const data = batchRows.value.map((r) => ({
      ...r.extra,
      "Company Name": r.companyName,
      Domain: r.companyDomain ?? "",
      Answer: r.answer ?? "",
      Sources: (r.sources ?? []).map((s) => s.url).join(" | "),
      Status: r.status,
      "Latency (ms)": r.latencyMs ?? "",
      Error: r.error ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Results");
    const blob = XLSX.write(wb, { type: "array", bookType: "xlsx" });
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

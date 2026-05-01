import * as XLSX from "xlsx";
import type { AnalysisRow } from "~/shared/types";

export interface ParsedRow {
  name: string;
  domain?: string;
  website?: string;          // original raw URL from the spreadsheet
  extra: Record<string, unknown>;
}

export function parseUploadedXlsx(buffer: ArrayBuffer): ParsedRow[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

  return rows
    .map((row) => {
      const lower = Object.fromEntries(
        Object.entries(row).map(([k, v]) => [k.toLowerCase().trim(), v])
      );
      const rawDomain =
        String(lower.domain ?? lower.website ?? lower.url ?? "").trim() || undefined;
      const domain = rawDomain ? extractDomain(rawDomain) : undefined;
      const nameRaw = String(
        lower.name ?? lower.company ?? lower["company name"] ?? ""
      ).trim();
      // If no explicit name column, derive it from the domain
      const name = nameRaw || (domain ? domainToName(domain) : "");
      const extra: Record<string, unknown> = { ...row };
      const recognized = ["name", "company", "company name", "domain", "website", "url"];
      for (const k of Object.keys(row)) {
        if (recognized.includes(k.toLowerCase().trim())) delete extra[k];
      }
      return { name, domain, website: rawDomain, extra };
    })
    .filter((r) => r.name.length > 0);
}

function extractDomain(raw: string): string {
  try {
    const url = raw.startsWith("http") ? raw : `https://${raw}`;
    const host = new URL(url).hostname;
    return host.replace(/^www\./, "");
  } catch {
    return raw.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  }
}

function domainToName(domain: string): string {
  // "ejada.com" → "Ejada",  "sary.com.sa" → "Sary"
  const parts = domain.split(".");
  const meaningful = parts.find((p) => p.length > 2 && !["com", "net", "org", "io", "co", "sa", "ae"].includes(p)) ?? parts[0];
  return meaningful.charAt(0).toUpperCase() + meaningful.slice(1);
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
      Domain: row.domain ?? "",
      Answer: a?.answer ?? "",
      Sources: (JSON.parse(a?.sources ?? "[]") as any[])
        .map((s: any) => s.url)
        .join(" | "),
      Status: a?.status ?? "",
      "Latency (ms)": a?.latency_ms ?? "",
      Error: a?.error ?? "",
    };
  });

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Results");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" });
}

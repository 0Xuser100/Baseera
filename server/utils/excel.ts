import * as XLSX from "xlsx";
import type { AnalysisRow } from "~/shared/types";

export interface ParsedRow {
  name: string;
  domain?: string;
  website?: string;          // original raw URL from the spreadsheet
  extra: Record<string, unknown>;
  originalRow: Record<string, unknown>; // all original columns, preserved for output
}

export function parseUploadedXlsx(buffer: ArrayBuffer): ParsedRow[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

  // Flexible column handling: the only column we actually need is the
  // website (for web search). Every other column is forwarded to the LLM
  // verbatim under its original header.
  const WEB_HEADER_RE = /\b(website|domain|url|site|homepage|web|link)\b/i;
  const URL_VALUE_RE = /^(https?:\/\/|www\.)|\.[a-z]{2,}(\/|$)/i;
  const SOCIAL_DOMAIN_RE =
    /(^|\.)(facebook|fb|twitter|x|linkedin|instagram|youtube|tiktok|pinterest|threads|t|wa|whatsapp|telegram|reddit|medium|github|gitlab)\.(com|me|co|io)(\/|$)/i;
  const SOCIAL_HEADER_RE =
    /\b(facebook|fb|twitter|x|linkedin|instagram|ig|youtube|yt|tiktok|pinterest|threads|whatsapp|telegram|reddit|medium|github|gitlab|social)\b/i;

  function pickWebsiteKey(row: Record<string, unknown>): string | undefined {
    const keys = Object.keys(row);
    const byHeader = keys.find(
      (k) => WEB_HEADER_RE.test(k) && !SOCIAL_HEADER_RE.test(k)
    );
    if (byHeader) {
      const v = String(row[byHeader] ?? "").trim();
      if (v.length > 0 && !SOCIAL_DOMAIN_RE.test(v)) return byHeader;
    }
    return keys.find((k) => {
      if (SOCIAL_HEADER_RE.test(k)) return false;
      const v = String(row[k] ?? "").trim();
      return v.length > 0 && URL_VALUE_RE.test(v) && !SOCIAL_DOMAIN_RE.test(v);
    });
  }

  return rows
    .map((row, i) => {
      const websiteKey = pickWebsiteKey(row);
      const rawWebsite = websiteKey ? String(row[websiteKey] ?? "").trim() || undefined : undefined;
      const domain = rawWebsite ? extractDomain(rawWebsite) : undefined;
      const name = domain ? domainToName(domain) : (rawWebsite || `Row ${i + 1}`);
      const extra: Record<string, unknown> = { ...row };
      if (websiteKey) delete extra[websiteKey];
      return { name, domain, website: rawWebsite, extra, originalRow: { ...row } };
    })
    .filter((r) => !!r.website);
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
      ...row.originalRow,
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

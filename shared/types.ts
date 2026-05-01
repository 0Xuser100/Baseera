export type SearchProviderId = "tavily" | "openai" | "anthropic";
export type LLMProviderId =
  | "claude-sonnet-4-7"
  | "claude-haiku-4-5"
  | "gpt-4o"
  | "gpt-4o-mini"
  | "gpt-5.4-mini-2026-03-17";

export type BatchStatus = "running" | "completed" | "failed" | "cancelled";
export type AnalysisStatus = "queued" | "running" | "done" | "failed";

export interface AnalyzeOutput {
  id: string;
  answer: string;
  sources: { url: string; title: string }[];
  latencyMs: number;
  createdAt: number;
}

export interface BatchStatusResponse {
  id: string;
  status: BatchStatus;
  totalRows: number;
  doneRows: number;
  failedRows: number;
  recentAnalyses: {
    id: string;
    companyName: string;
    status: AnalysisStatus;
    answer?: string;
    latencyMs?: number;
  }[];
}

export interface AnalysisRow {
  id: string;
  batch_id: string | null;
  row_index: number | null;
  created_at: number;
  company_name: string;
  company_domain: string | null;
  extra_input: string | null;
  status: AnalysisStatus;
  answer: string | null;
  sources: string | null;
  search_provider: SearchProviderId;
  llm_provider: LLMProviderId;
  latency_ms: number | null;
  error: string | null;
}

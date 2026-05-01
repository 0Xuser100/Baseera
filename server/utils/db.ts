import { ulid } from "ulid";
import type { AnalysisRow } from "~/shared/types";

export { ulid };

export async function insertAnalysis(
  db: D1Database,
  fields: Omit<AnalysisRow, "id" | "created_at">
): Promise<string> {
  const id = ulid();
  await db
    .prepare(
      `INSERT INTO analyses
         (id, batch_id, row_index, created_at, company_name, company_domain,
          extra_input, status, answer, sources, search_provider, llm_provider, latency_ms, error)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .bind(
      id,
      fields.batch_id,
      fields.row_index,
      Date.now(),
      fields.company_name,
      fields.company_domain ?? null,
      fields.extra_input ?? null,
      fields.status,
      fields.answer ?? null,
      fields.sources ?? null,
      fields.search_provider,
      fields.llm_provider,
      fields.latency_ms ?? null,
      fields.error ?? null
    )
    .run();
  return id;
}

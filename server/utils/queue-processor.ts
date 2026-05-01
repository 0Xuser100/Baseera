import { analyzeCompany } from "./analyze";
import { generateResultsXlsx, type ParsedRow } from "./excel";
import { uploadToR2 } from "./r2";
import { sendBatchCompleteEmail } from "./email";
import type { AnalysisRow } from "~/shared/types";

export interface QueueMessage {
  analysisId: string;
  batchId: string;
}

export async function processQueueBatch(
  batch: MessageBatch<QueueMessage>,
  env: any
): Promise<void> {
  for (const msg of batch.messages) {
    try {
      await processOne(msg.body, env);
      msg.ack();
    } catch (err) {
      console.error(`Queue job failed for analysis ${msg.body.analysisId}:`, err);
      msg.retry();
    }
  }
}

async function processOne(body: QueueMessage, env: any): Promise<void> {
  const analysis = await env.DB.prepare(
    "SELECT * FROM analyses WHERE id = ?"
  )
    .bind(body.analysisId)
    .first<AnalysisRow>();

  if (!analysis || analysis.status === "done" || analysis.status === "failed") return;

  const b = await env.DB.prepare("SELECT * FROM batches WHERE id = ?")
    .bind(body.batchId)
    .first<any>();

  if (!b || b.status === "cancelled") return;

  await env.DB.prepare("UPDATE analyses SET status='running' WHERE id=?")
    .bind(body.analysisId)
    .run();

  try {
    const extra = JSON.parse(analysis.extra_input ?? "{}");
    const result = await analyzeCompany({
      companyName: analysis.company_name,
      companyDomain: analysis.company_domain ?? undefined,
      website: extra._website,
      extraFields: extra,
      prompt: b.prompt,
      searchProviderId: b.search_provider,
      llmProviderId: b.llm_provider,
      env,
    });

    await env.DB.prepare(
      `UPDATE analyses SET status='done', answer=?, sources=?, latency_ms=?, error=NULL WHERE id=?`
    )
      .bind(
        result.answer,
        JSON.stringify(result.sources),
        result.latencyMs,
        body.analysisId
      )
      .run();

    await incrementAndCheck(body.batchId, "done", env);
  } catch (err: any) {
    await env.DB.prepare(
      `UPDATE analyses SET status='failed', error=? WHERE id=?`
    )
      .bind(String(err?.message ?? err), body.analysisId)
      .run();

    await incrementAndCheck(body.batchId, "failed", env);
  }
}

async function incrementAndCheck(
  batchId: string,
  outcome: "done" | "failed",
  env: any
): Promise<void> {
  const col = outcome === "done" ? "done_rows" : "failed_rows";

  const updated = await env.DB.prepare(
    `UPDATE batches SET ${col} = ${col} + 1
     WHERE id = ?
     RETURNING id, done_rows, failed_rows, total_rows, status, email, prompt`
  )
    .bind(batchId)
    .first<any>();

  if (!updated) return;

  if (
    updated.status === "running" &&
    updated.done_rows + updated.failed_rows >= updated.total_rows
  ) {
    await finalizeBatch(batchId, updated, env);
  }
}

async function finalizeBatch(
  batchId: string,
  batch: any,
  env: any
): Promise<void> {
  // Atomic claim — only one worker proceeds
  const claimed = await env.DB.prepare(
    `UPDATE batches SET status='completed', completed_at=?
     WHERE id=? AND status='running'
     RETURNING id`
  )
    .bind(Date.now(), batchId)
    .first<any>();

  if (!claimed) return;

  const analyses = await env.DB.prepare(
    "SELECT * FROM analyses WHERE batch_id = ? ORDER BY row_index ASC"
  )
    .bind(batchId)
    .all<AnalysisRow>();

  const uploadRow = await env.DB.prepare(
    "SELECT upload_r2_key FROM batches WHERE id = ?"
  )
    .bind(batchId)
    .first<any>();

  // Reconstruct original rows from stored data
  const originalRows: ParsedRow[] = analyses.results.map((a) => ({
    name: a.company_name,
    domain: a.company_domain ?? undefined,
    extra: JSON.parse(a.extra_input ?? "{}"),
  }));

  const xlsxBuffer = generateResultsXlsx(originalRows, analyses.results);
  const resultKey = `results/${batchId}.xlsx`;
  await uploadToR2(env.FILES, resultKey, xlsxBuffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

  await env.DB.prepare(
    "UPDATE batches SET result_r2_key=? WHERE id=?"
  )
    .bind(resultKey, batchId)
    .run();

  if (batch.email) {
    const downloadUrl = `${env.APP_BASE_URL}/api/batch/${batchId}/download`;
    await sendBatchCompleteEmail({
      to: batch.email,
      batchId,
      totalRows: batch.total_rows ?? 0,
      doneRows: batch.done_rows ?? 0,
      failedRows: batch.failed_rows ?? 0,
      downloadUrl,
      env,
    }).catch(console.error);
  }
}

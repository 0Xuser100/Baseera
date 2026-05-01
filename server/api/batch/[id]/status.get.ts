export default defineEventHandler(async (event) => {
  const batchId = getRouterParam(event, "id");
  const env = event.context.cloudflare?.env as any ?? process.env;

  const batch = await env.DB.prepare(
    `SELECT id, status, total_rows, done_rows, failed_rows, created_at, completed_at
     FROM batches WHERE id = ?`
  )
    .bind(batchId)
    .first<any>();

  if (!batch) throw createError({ statusCode: 404, message: "Batch not found" });

  const recentAnalyses = await env.DB.prepare(
    `SELECT id, company_name, status, answer, latency_ms, error
     FROM analyses WHERE batch_id = ?
     ORDER BY row_index DESC LIMIT 50`
  )
    .bind(batchId)
    .all<any>();

  return {
    id: batch.id,
    status: batch.status,
    totalRows: batch.total_rows,
    doneRows: batch.done_rows,
    failedRows: batch.failed_rows,
    createdAt: batch.created_at,
    completedAt: batch.completed_at ?? null,
    recentAnalyses: (recentAnalyses.results ?? []).map((a: any) => ({
      id: a.id,
      companyName: a.company_name,
      status: a.status,
      answer: a.answer ?? null,
      latencyMs: a.latency_ms ?? null,
      error: a.error ?? null,
    })),
  };
});

import { downloadFromR2 } from "../../../utils/r2";

export default defineEventHandler(async (event) => {
  const batchId = getRouterParam(event, "id");
  const env = event.context.cloudflare?.env as any ?? process.env;

  const batch = await env.DB.prepare(
    "SELECT status, result_r2_key FROM batches WHERE id = ?"
  )
    .bind(batchId)
    .first<any>();

  if (!batch) throw createError({ statusCode: 404, message: "Batch not found" });
  if (batch.status !== "completed" || !batch.result_r2_key)
    throw createError({ statusCode: 404, message: "Results not ready yet" });

  const obj = await downloadFromR2(env.FILES, batch.result_r2_key);
  if (!obj) throw createError({ statusCode: 404, message: "File not found in storage" });

  setHeader(event, "Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  setHeader(event, "Content-Disposition", `attachment; filename="results-${batchId}.xlsx"`);

  return sendStream(event, obj.body as any);
});

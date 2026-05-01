export default defineEventHandler(async (event) => {
  const batchId = getRouterParam(event, "id");
  const env = event.context.cloudflare?.env as any ?? process.env;

  const result = await env.DB.prepare(
    `UPDATE batches SET status='cancelled'
     WHERE id=? AND status='running'
     RETURNING id`
  )
    .bind(batchId)
    .first<any>();

  if (!result) throw createError({ statusCode: 400, message: "Batch not found or not running" });

  return { success: true };
});

export default defineEventHandler(async (event) => {
  const env = event.context.cloudflare?.env as any ?? process.env;

  const batches = await env.DB.prepare(
    `SELECT id, created_at, status, total_rows, done_rows, failed_rows, email, completed_at
     FROM batches ORDER BY created_at DESC LIMIT 20`
  ).all();

  return batches.results ?? [];
});

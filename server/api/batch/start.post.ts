import { ulid } from "ulid";
import { parseUploadedXlsx } from "../../utils/excel";
import { uploadToR2 } from "../../utils/r2";
import type { SearchProviderId, LLMProviderId } from "~/shared/types";

const MAX_ROWS = 1000;
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

export default defineEventHandler(async (event) => {
  const env = event.context.cloudflare?.env as any ?? process.env;

  const parts = await readMultipartFormData(event);
  if (!parts) throw createError({ statusCode: 400, message: "Expected multipart form data" });

  const get = (name: string) =>
    parts.find((p) => p.name === name)?.data?.toString("utf8")?.trim() ?? "";

  const prompt = get("prompt");
  const searchProviderId = (get("searchProviderId") || "tavily") as SearchProviderId;
  const llmProviderId = (get("llmProviderId") || "gpt-4o") as LLMProviderId;
  const email = get("email") || null;
  const filePart = parts.find((p) => p.name === "file");

  if (!prompt) throw createError({ statusCode: 400, message: "prompt is required" });
  if (!filePart?.data) throw createError({ statusCode: 400, message: "file is required" });
  if (filePart.data.byteLength > MAX_FILE_BYTES)
    throw createError({ statusCode: 400, message: "File exceeds 5 MB limit" });

  let rows;
  try {
    rows = parseUploadedXlsx(filePart.data.buffer as ArrayBuffer);
  } catch {
    throw createError({ statusCode: 400, message: "Could not parse xlsx file" });
  }

  if (rows.length === 0)
    throw createError({ statusCode: 400, message: "No valid rows found. Ensure a 'name' or 'company' column exists." });
  if (rows.length > MAX_ROWS)
    throw createError({ statusCode: 400, message: `Too many rows (${rows.length}). Max is ${MAX_ROWS}.` });

  const batchId = ulid();
  const uploadKey = `uploads/${batchId}.xlsx`;

  await uploadToR2(env.FILES, uploadKey, filePart.data.buffer as ArrayBuffer,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

  await env.DB.prepare(
    `INSERT INTO batches (id, created_at, prompt, search_provider, llm_provider,
       total_rows, done_rows, failed_rows, status, email, upload_r2_key)
     VALUES (?,?,?,?,?,?,0,0,'running',?,?)`
  )
    .bind(batchId, Date.now(), prompt, searchProviderId, llmProviderId, rows.length, email, uploadKey)
    .run();

  const analyses = rows.map((row, i) => ({
    id: ulid(),
    batchId,
    rowIndex: i,
    companyName: row.name,
    companyDomain: row.domain ?? null,
    extraInput: JSON.stringify({ ...row.extra, ...(row.website ? { _website: row.website } : {}) }),
    searchProvider: searchProviderId,
    llmProvider: llmProviderId,
  }));

  const CHUNK = 100;
  for (let i = 0; i < analyses.length; i += CHUNK) {
    const chunk = analyses.slice(i, i + CHUNK);
    await env.DB.batch(
      chunk.map((a) =>
        env.DB.prepare(
          `INSERT INTO analyses (id, batch_id, row_index, created_at, company_name, company_domain,
             extra_input, status, search_provider, llm_provider)
           VALUES (?,?,?,?,?,?,?,'queued',?,?)`
        ).bind(
          a.id, a.batchId, a.rowIndex, Date.now(),
          a.companyName, a.companyDomain, a.extraInput,
          a.searchProvider, a.llmProvider
        )
      )
    );
  }

  const queueMessages = analyses.map((a) => ({
    body: { analysisId: a.id, batchId },
  }));
  for (let i = 0; i < queueMessages.length; i += 100) {
    await env.ANALYSIS_QUEUE.sendBatch(queueMessages.slice(i, i + 100));
  }

  return { batchId, totalRows: rows.length };
});

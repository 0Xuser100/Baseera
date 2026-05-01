import { ulid } from "ulid";
import { analyzeCompany } from "../utils/analyze";
import { insertAnalysis } from "../utils/db";
import type { SearchProviderId, LLMProviderId } from "~/shared/types";

export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  const companyName: string = body?.companyName?.trim();
  const companyDomain: string | undefined = body?.companyDomain?.trim() || undefined;
  const website: string | undefined = body?.website?.trim() || undefined;
  const prompt: string = body?.prompt?.trim();
  const searchProviderId: SearchProviderId = body?.searchProviderId ?? "tavily";
  const llmProviderId: LLMProviderId = body?.llmProviderId ?? "gpt-4o";

  if (!companyName || !prompt) {
    throw createError({ statusCode: 400, message: "companyName and prompt are required" });
  }

  const env = event.context.cloudflare?.env as any ?? process.env;

  let result;
  try {
    result = await analyzeCompany({
      companyName,
      companyDomain,
      website,
      prompt,
      searchProviderId,
      llmProviderId,
      env,
    });
  } catch (err: any) {
    const msg: string = err?.message ?? "Provider error";
    if (msg.includes("429")) throw createError({ statusCode: 429, message: msg });
    throw createError({ statusCode: 500, message: msg });
  }

  const id = ulid();
  const createdAt = Date.now();

  if (env.DB) {
    await insertAnalysis(env.DB, {
      batch_id: null,
      row_index: null,
      company_name: companyName,
      company_domain: companyDomain ?? null,
      extra_input: null,
      status: "done",
      answer: result.answer,
      sources: JSON.stringify(result.sources),
      search_provider: searchProviderId,
      llm_provider: llmProviderId,
      latency_ms: result.latencyMs,
      error: null,
    });
  }

  return {
    id,
    answer: result.answer,
    sources: result.sources,
    latencyMs: result.latencyMs,
    createdAt,
  };
});

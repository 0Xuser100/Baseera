import type { SearchProviderId, LLMProviderId } from "../../shared/types";
import type { SearchResult, LLMMessage } from "./providers/types";
import { getSearchProvider } from "./providers/search/index";
import { getLLMProvider } from "./providers/llm/index";
import { getLangfuse } from "./tracing";

export interface AnalyzeInput {
  companyName: string;
  companyDomain?: string;
  website?: string;
  extraFields?: Record<string, unknown>;
  prompt: string;
  searchProviderId: SearchProviderId;
  llmProviderId: LLMProviderId;
  env: any;
}

export interface AnalyzeOutput {
  answer: string;
  sources: { url: string; title: string }[];
  allSources: { url: string; title?: string }[];
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
}

export async function analyzeCompany(input: AnalyzeInput): Promise<AnalyzeOutput> {
  const start = Date.now();
  const lf = getLangfuse(input.env);
  const llm = getLLMProvider(input.llmProviderId, input.env);

  const allowedDomains = collectAllowedDomains(input);
  const query = buildSearchQuery(input);

  // Single-call agentic flow only when user explicitly picks OpenAI as the search provider
  // (Tavily path always runs as a separate two-step search → LLM, even with gpt-4o / gpt-5.4-mini)
  const llmSupportsBuiltInSearch =
    input.llmProviderId === "gpt-4o" ||
    input.llmProviderId === "gpt-5.4-mini-2026-03-17";
  const llmHasBuiltInSearch =
    input.searchProviderId === "openai" && llmSupportsBuiltInSearch;

  console.log(
    `[analyzeCompany] company=${JSON.stringify(input.companyName)} llm=${input.llmProviderId} builtin_search=${llmHasBuiltInSearch} allowed_domains=${JSON.stringify(allowedDomains)}`
  );

  const trace = lf.trace({
    name: "analyzeCompany",
    input: { company: input.companyName, domain: input.companyDomain, prompt: input.prompt },
    metadata: {
      searchProvider: llmHasBuiltInSearch ? "llm-builtin" : input.searchProviderId,
      llmProvider: input.llmProviderId,
    },
  });

  let results: SearchResult[] = [];
  let allSources: { url: string; title?: string }[] = [];

  if (!llmHasBuiltInSearch) {
    // Two-step flow: external search provider → LLM
    const search = getSearchProvider(input.searchProviderId, input.env);
    const searchSpan = trace.span({
      name: "web-search",
      input: { query, allowedDomains },
    });
    const searchOutput = await search.search(query, {
      maxResults: 8,
      allowedDomains,
      searchContextSize: "high",
    });
    results = searchOutput.results;
    allSources = searchOutput.allSources;
    searchSpan.end({
      output: {
        citationCount: results.length,
        allSourceCount: allSources.length,
        // Full payload so the search results are visible in Langfuse, not
        // just summary counts.
        citations: results.map((r) => ({
          url: r.url,
          title: r.title,
          snippet: (r.snippet ?? "").slice(0, 600),
        })),
        allSources,
      },
    });
  }

  const messages = llmHasBuiltInSearch
    ? buildLLMMessagesNoResearch(input)
    : buildLLMMessages(input, results);

  const generation = trace.generation({
    name: "llm-completion",
    model: input.llmProviderId,
    modelParameters: { maxTokens: 800, temperature: 0.3, builtInSearch: llmHasBuiltInSearch },
    input: messages,
  });

  const completion = await llm.complete(messages, {
    maxTokens: 800,
    webSearch: llmHasBuiltInSearch
      ? { allowedDomains, searchContextSize: "high" }
      : undefined,
  });

  generation.end({
    output: completion.text,
    usage: {
      input: completion.inputTokens,
      output: completion.outputTokens,
      unit: "TOKENS",
    },
  });

  // For built-in search flow, citations + sources come from the LLM response
  if (llmHasBuiltInSearch) {
    results = (completion.citations ?? []).map((c) => ({
      url: c.url,
      title: c.title,
      snippet: c.snippet,
    }));
    allSources = completion.allSources ?? [];
  }

  const output: AnalyzeOutput = {
    answer: completion.text,
    sources: results.map((r) => ({ url: r.url, title: r.title })),
    allSources,
    latencyMs: Date.now() - start,
    inputTokens: completion.inputTokens,
    outputTokens: completion.outputTokens,
  };

  trace.update({ output: { answer: output.answer, latencyMs: output.latencyMs } });
  await lf.flushAsync();

  return output;
}

function buildSearchQuery(input: AnalyzeInput): string {
  // Always include the raw website URL — domain extraction can fail on
  // malformed/edge URLs, and the URL itself is the most reliable lookup hint.
  const parts: string[] = [];
  if (input.companyName) parts.push(input.companyName);
  if (input.companyDomain) parts.push(input.companyDomain);
  if (input.website && input.website !== input.companyDomain) parts.push(input.website);
  return parts.filter(Boolean).join(" ").trim() || (input.website ?? "");
}

function formatExtraFields(extra?: Record<string, unknown>): string {
  if (!extra) return "";
  const entries = Object.entries(extra)
    .filter(([_, v]) => v !== undefined && v !== null && String(v).trim().length > 0)
    .map(([k, v]) => `- ${k}: ${String(v).trim()}`);
  if (entries.length === 0) return "";
  return `ADDITIONAL ROW CONTEXT (from spreadsheet columns; treat as supplementary, not authoritative):\n${entries.join("\n")}\n\n`;
}

function collectAllowedDomains(input: AnalyzeInput): string[] {
  const raw: string[] = [];
  if (input.companyDomain) raw.push(input.companyDomain);
  if (input.website) raw.push(input.website);
  const cleaned = raw
    .map((d) => {
      let s = d.trim().toLowerCase();
      s = s.replace(/^https?:\/\//, "");
      s = s.replace(/^www\./, "");
      s = (s.split("/")[0] ?? "").split("?")[0] ?? "";
      return s;
    })
    .filter((s) => s.length > 0 && s.includes("."));
  return Array.from(new Set(cleaned));
}

function buildLLMMessagesNoResearch(input: AnalyzeInput): LLMMessage[] {
  return [
    {
      role: "system",
      content:
        "You are a business analyst. Use the web_search tool to research the company strictly within its own domain (already filtered for you). Cite sources inline. Answer the user's question concisely.",
    },
    {
      role: "user",
      content: `COMPANY: ${input.companyName}${input.companyDomain ? ` (${input.companyDomain})` : ""}${input.website ? ` | Website: ${input.website}` : ""}

${formatExtraFields(input.extraFields)}QUESTION:
${input.prompt}

Respond concisely (under 200 words) with inline citations.`,
    },
  ];
}

function buildLLMMessages(input: AnalyzeInput, results: SearchResult[]): LLMMessage[] {
  const research = results
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet.slice(0, 500)}`)
    .join("\n\n");

  return [
    {
      role: "system",
      content:
        "You are a business analyst. Answer the user's question about the company strictly using the research provided. Do not cite sources or add reference numbers.",
    },
    {
      role: "user",
      content: `COMPANY: ${input.companyName}${input.companyDomain ? ` (${input.companyDomain})` : ""}${input.website ? ` | Website: ${input.website}` : ""}

${formatExtraFields(input.extraFields)}RESEARCH:
${research}

QUESTION:
${input.prompt}

Respond concisely (under 200 words). Do not add a sources or citations line at the end.`,
    },
  ];
}

import type {
  SearchProvider,
  SearchResult,
  SearchOptions,
  SearchOutput,
} from "../types";

export class OpenAISearch implements SearchProvider {
  readonly id = "openai" as const;
  constructor(private apiKey: string) {}

  async search(query: string, opts: SearchOptions = {}): Promise<SearchOutput> {
    const allowedDomains = (opts.allowedDomains ?? [])
      .map(normalizeDomain)
      .filter((d): d is string => !!d)
      .slice(0, 100);

    if (allowedDomains.length === 0) {
      throw new Error(
        "OpenAISearch: refusing to search the open web — no allowed_domains provided. " +
          "Pass companyDomain or website so the agent stays inside the target site."
      );
    }

    const tool: Record<string, unknown> = {
      type: "web_search",
      filters: { allowed_domains: allowedDomains },
      search_context_size: opts.searchContextSize ?? "high",
    };

    const reqBody = {
      model: "gpt-4o",
      tools: [tool],
      tool_choice: { type: "web_search" },
      input: `Research this company strictly using its own website. Look across the homepage, about page, products/services pages, and any case studies or news. Topic: ${query}`,
    };

    console.log(
      `[OpenAISearch] query=${JSON.stringify(query)} allowed_domains=${JSON.stringify(allowedDomains)} ctx=${tool.search_context_size}`
    );

    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(reqBody),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[OpenAISearch] HTTP ${res.status}: ${errText}`);
      throw new Error(`OpenAI search ${res.status}: ${errText}`);
    }

    const data = (await res.json()) as any;

    const results: SearchResult[] = [];
    const allSources: { url: string; title?: string }[] = [];
    let searchCallCount = 0;

    for (const block of data.output ?? []) {
      if (block.type === "web_search_call") {
        searchCallCount++;
        const action = block.action ?? {};
        console.log(
          `[OpenAISearch] web_search_call id=${block.id} action=${action.type ?? "?"} query=${JSON.stringify(action.query ?? "")}`
        );
        // capture sources off the search_call if present
        for (const src of block.sources ?? []) {
          if (src?.url) allSources.push({ url: src.url, title: src.title });
        }
        continue;
      }
      if (block.type === "message") {
        for (const content of block.content ?? []) {
          if (content.type !== "output_text") continue;
          for (const ann of content.annotations ?? []) {
            if (ann.type === "url_citation") {
              results.push({
                url: ann.url,
                title: ann.title ?? ann.url,
                snippet:
                  content.text?.slice(ann.start_index ?? 0, ann.end_index ?? 300) ?? "",
              });
            }
          }
          if ((content.annotations ?? []).length === 0 && content.text) {
            results.push({
              url: "",
              title: "OpenAI web search result",
              snippet: content.text.slice(0, 800),
            });
          }
        }
      }
    }

    // Top-level sources field on Responses API
    for (const src of data.sources ?? []) {
      if (src?.url) allSources.push({ url: src.url, title: src.title });
    }

    // Dedupe sources by URL
    const seen = new Set<string>();
    const dedupedSources = allSources.filter((s) => {
      if (seen.has(s.url)) return false;
      seen.add(s.url);
      return true;
    });

    console.log(
      `[OpenAISearch] done — search_calls=${searchCallCount} citations=${results.length} sources=${dedupedSources.length}`
    );

    // Enforce domain restriction post-hoc as a safety net
    const offDomain = [...results.map((r) => r.url), ...dedupedSources.map((s) => s.url)]
      .filter((u) => u && !allowedDomains.some((d) => u.includes(d)));
    if (offDomain.length > 0) {
      console.warn(
        `[OpenAISearch] WARNING: ${offDomain.length} URL(s) outside allowed_domains: ${offDomain.join(", ")}`
      );
    }

    return {
      results: results.slice(0, opts.maxResults ?? 8),
      allSources: dedupedSources,
    };
  }
}

function normalizeDomain(input: string): string | null {
  if (!input) return null;
  let s = input.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "");
  s = s.replace(/^www\./, "");
  s = (s.split("/")[0] ?? "").split("?")[0] ?? "";
  return s || null;
}

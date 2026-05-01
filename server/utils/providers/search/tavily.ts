import type {
  SearchProvider,
  SearchResult,
  SearchOptions,
  SearchOutput,
} from "../types";

export class TavilySearch implements SearchProvider {
  readonly id = "tavily" as const;
  constructor(private apiKey: string) {}

  async search(query: string, opts: SearchOptions = {}): Promise<SearchOutput> {
    const allowedDomains = (opts.allowedDomains ?? [])
      .map(normalizeDomain)
      .filter((d): d is string => !!d);

    if (allowedDomains.length === 0) {
      throw new Error(
        "TavilySearch: refusing to search the open web — no allowed_domains provided. " +
          "Pass companyDomain or website so the search stays inside the target site."
      );
    }

    const body: Record<string, unknown> = {
      api_key: this.apiKey,
      query,
      max_results: opts.maxResults ?? 8,
      search_depth: "advanced",
      include_answer: false,
      include_raw_content: false,
      include_domains: allowedDomains,
    };

    console.log(
      `[TavilySearch] query=${JSON.stringify(query)} include_domains=${JSON.stringify(allowedDomains)}`
    );

    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[TavilySearch] HTTP ${res.status}: ${errText}`);
      throw new Error(`Tavily ${res.status}: ${errText}`);
    }

    const data = (await res.json()) as any;
    const results: SearchResult[] = (data.results as any[]).map((r) => ({
      url: r.url,
      title: r.title,
      snippet: r.content,
      publishedAt: r.published_date,
    }));

    // For Tavily, the full source list = the same `results` array (no separate sources field)
    const allSources = results.map((r) => ({ url: r.url, title: r.title }));

    console.log(`[TavilySearch] done — results=${results.length}`);

    const offDomain = results.filter(
      (r) => r.url && !allowedDomains.some((d) => r.url.includes(d))
    );
    if (offDomain.length > 0) {
      console.warn(
        `[TavilySearch] WARNING: ${offDomain.length} result(s) outside include_domains: ${offDomain.map((r) => r.url).join(", ")}`
      );
    }

    return { results, allSources };
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

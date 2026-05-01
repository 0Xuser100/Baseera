import { OpenAI } from "openai";
import type {
  LLMProvider,
  LLMMessage,
  LLMProviderId,
  LLMCompleteOptions,
  LLMCompleteResult,
} from "../types";

export class OpenAILLM implements LLMProvider {
  private client: OpenAI;
  private apiKey: string;

  constructor(
    apiKey: string,
    readonly id: LLMProviderId = "gpt-4o",
    client?: OpenAI
  ) {
    this.apiKey = apiKey;
    this.client = client ?? new OpenAI({ apiKey });
  }

  async complete(
    messages: LLMMessage[],
    opts: LLMCompleteOptions = {}
  ): Promise<LLMCompleteResult> {
    const isReasoning =
      this.id.startsWith("gpt-5") || this.id.startsWith("o");
    const wantsWebSearch = !!opts.webSearch && opts.webSearch.allowedDomains.length > 0;

    // Use Responses API for: reasoning models OR any model that needs web_search
    if (isReasoning || wantsWebSearch) {
      return this.completeViaResponses(messages, opts, isReasoning);
    }
    return this.completeViaChat(messages, opts);
  }

  private async completeViaChat(
    messages: LLMMessage[],
    opts: LLMCompleteOptions
  ): Promise<LLMCompleteResult> {
    console.log(`[OpenAILLM] chat.completions model=${this.id}`);
    const completion = await this.client.chat.completions.create({
      model: this.id,
      messages: messages.map((m) => ({ role: m.role as any, content: m.content })),
      max_tokens: opts.maxTokens ?? 1024,
      temperature: opts.temperature ?? 0.3,
    });
    return {
      text: completion.choices[0]?.message?.content ?? "",
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
    };
  }

  private async completeViaResponses(
    messages: LLMMessage[],
    opts: LLMCompleteOptions,
    isReasoning: boolean
  ): Promise<LLMCompleteResult> {
    const system = messages.find((m) => m.role === "system")?.content ?? "";
    const userParts = messages
      .filter((m) => m.role !== "system")
      .map((m) => m.content)
      .join("\n\n");
    const input = system ? `${system}\n\n${userParts}` : userParts;

    const reqBody: Record<string, unknown> = {
      model: this.id,
      input,
      max_output_tokens: opts.maxTokens ?? 1024,
    };

    if (isReasoning) {
      reqBody.reasoning = { effort: "low" };
    }

    if (opts.webSearch && opts.webSearch.allowedDomains.length > 0) {
      const domains = opts.webSearch.allowedDomains
        .map(normalizeDomain)
        .filter((d): d is string => !!d)
        .slice(0, 100);
      reqBody.tools = [
        {
          type: "web_search",
          filters: { allowed_domains: domains },
          search_context_size: opts.webSearch.searchContextSize ?? "medium",
        },
      ];
      reqBody.tool_choice = { type: "web_search" };
      console.log(
        `[OpenAILLM] responses model=${this.id} reasoning=${isReasoning} web_search allowed_domains=${JSON.stringify(domains)} ctx=${opts.webSearch.searchContextSize ?? "medium"}`
      );
    } else {
      console.log(
        `[OpenAILLM] responses model=${this.id} reasoning=${isReasoning} (no web_search)`
      );
    }

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
      console.error(`[OpenAILLM] responses HTTP ${res.status}: ${errText}`);
      throw new Error(`OpenAI responses ${res.status}: ${errText}`);
    }
    const data = (await res.json()) as any;

    let text = "";
    const citations: { url: string; title: string; snippet: string }[] = [];
    const allSources: { url: string; title?: string }[] = [];
    let searchCallCount = 0;

    for (const block of data.output ?? []) {
      if (block.type === "web_search_call") {
        searchCallCount++;
        const action = block.action ?? {};
        console.log(
          `[OpenAILLM] web_search_call id=${block.id} action=${action.type ?? "?"} query=${JSON.stringify(action.query ?? "")}`
        );
        for (const src of block.sources ?? []) {
          if (src?.url) allSources.push({ url: src.url, title: src.title });
        }
        continue;
      }
      if (block.type === "message") {
        for (const c of block.content ?? []) {
          if (c.type === "output_text" && c.text) {
            text += c.text;
            for (const ann of c.annotations ?? []) {
              if (ann.type === "url_citation") {
                citations.push({
                  url: ann.url,
                  title: ann.title ?? ann.url,
                  snippet:
                    c.text.slice(ann.start_index ?? 0, ann.end_index ?? 300) ?? "",
                });
              }
            }
          }
        }
      }
    }

    for (const src of data.sources ?? []) {
      if (src?.url) allSources.push({ url: src.url, title: src.title });
    }
    const seen = new Set<string>();
    const dedupedSources = allSources.filter((s) => {
      if (seen.has(s.url)) return false;
      seen.add(s.url);
      return true;
    });

    if (opts.webSearch) {
      console.log(
        `[OpenAILLM] done — search_calls=${searchCallCount} citations=${citations.length} sources=${dedupedSources.length}`
      );
    }

    return {
      text,
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
      citations: citations.length > 0 ? citations : undefined,
      allSources: dedupedSources.length > 0 ? dedupedSources : undefined,
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

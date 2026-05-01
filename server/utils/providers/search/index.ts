import type { SearchProvider, SearchProviderId } from "../types";
import { TavilySearch } from "./tavily";
import { OpenAISearch } from "./openai";

export function getSearchProvider(id: SearchProviderId, env: Env): SearchProvider {
  switch (id) {
    case "tavily":  return new TavilySearch(env.TAVILY_API_KEY);
    case "openai":  return new OpenAISearch(env.OPENAI_API_KEY);
    default: throw new Error(`Unknown search provider: ${id}`);
  }
}

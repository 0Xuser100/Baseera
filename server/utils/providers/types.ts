import type { SearchProviderId, LLMProviderId } from "../../../shared/types";

export type { SearchProviderId, LLMProviderId };

export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  publishedAt?: string;
}

export interface SearchOptions {
  maxResults?: number;
  allowedDomains?: string[];
  searchContextSize?: "low" | "medium" | "high";
}

export interface SearchOutput {
  results: SearchResult[];
  allSources: { url: string; title?: string }[];
}

export interface SearchProvider {
  id: SearchProviderId;
  search(query: string, opts?: SearchOptions): Promise<SearchOutput>;
}

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMCompleteOptions {
  maxTokens?: number;
  temperature?: number;
  webSearch?: {
    allowedDomains: string[];
    searchContextSize?: "low" | "medium" | "high";
  };
}

export interface LLMCompleteResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  citations?: { url: string; title: string; snippet: string }[];
  allSources?: { url: string; title?: string }[];
}

export interface LLMProvider {
  id: LLMProviderId;
  complete(messages: LLMMessage[], opts?: LLMCompleteOptions): Promise<LLMCompleteResult>;
}

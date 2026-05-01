import type { LLMProvider, LLMProviderId } from "../types";
import { OpenAILLM } from "./openai";

export function getLLMProvider(id: LLMProviderId, env: Env): LLMProvider {
  switch (id) {
    case "gpt-4o":      return new OpenAILLM(env.OPENAI_API_KEY, "gpt-4o");
    case "gpt-4o-mini": return new OpenAILLM(env.OPENAI_API_KEY, "gpt-4o-mini");
    case "gpt-5.4-mini-2026-03-17": return new OpenAILLM(env.OPENAI_API_KEY, "gpt-5.4-mini-2026-03-17");
    default: throw new Error(`Unknown LLM provider: ${id}`);
  }
}

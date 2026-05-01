<script setup lang="ts">
import type { SearchProviderId, LLMProviderId } from "~/shared/types";

const props = defineProps<{
  searchProvider: SearchProviderId;
  llmProvider: LLMProviderId;
}>();
const emit = defineEmits<{
  "update:searchProvider": [v: SearchProviderId];
  "update:llmProvider": [v: LLMProviderId];
}>();

const searchOptions: { id: SearchProviderId; label: string; desc: string }[] = [
  { id: "tavily", label: "Tavily", desc: "External search → LLM reads results" },
  { id: "openai", label: "OpenAI", desc: "LLM searches the site itself (agentic)" },
];
const llmOptions: { id: LLMProviderId; label: string; desc: string }[] = [
  { id: "gpt-4o", label: "GPT-4o", desc: "Fast, capable response model" },
  { id: "gpt-5.4-mini-2026-03-17", label: "GPT-5.4 Mini", desc: "Reasoning, low effort" },
];

const flowHint = computed(() =>
  props.searchProvider === "openai"
    ? "Single call: the LLM searches the company site and answers in one step."
    : "Two steps: Tavily searches the company site, then the LLM reads results and answers."
);
</script>

<template>
  <div class="space-y-5">
    <!-- Step 1: Search -->
    <div>
      <p class="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
        1. Search
      </p>
      <div class="grid grid-cols-2 gap-2">
        <button
          v-for="opt in searchOptions"
          :key="opt.id"
          @click="emit('update:searchProvider', opt.id)"
          :class="[
            'flex items-start gap-3 rounded-xl border px-4 py-3 text-left transition-all',
            searchProvider === opt.id
              ? 'border-indigo-500 bg-indigo-500/10 text-white'
              : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500',
          ]"
        >
          <span class="mt-0.5 size-2 rounded-full flex-shrink-0"
            :class="searchProvider === opt.id ? 'bg-indigo-400' : 'bg-slate-600'"
          />
          <div>
            <p class="text-sm font-medium leading-none">{{ opt.label }}</p>
            <p class="mt-1 text-xs text-slate-500">{{ opt.desc }}</p>
          </div>
        </button>
      </div>
    </div>

    <!-- Step 2: LLM (response model) -->
    <div>
      <p class="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
        2. {{ searchProvider === "openai" ? "LLM (with built-in web search)" : "Response Model" }}
      </p>
      <div class="grid grid-cols-2 gap-2">
        <button
          v-for="opt in llmOptions"
          :key="opt.id"
          @click="emit('update:llmProvider', opt.id)"
          :class="[
            'flex items-start gap-3 rounded-xl border px-4 py-3 text-left transition-all',
            llmProvider === opt.id
              ? 'border-violet-500 bg-violet-500/10 text-white'
              : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500',
          ]"
        >
          <span class="mt-0.5 size-2 rounded-full flex-shrink-0"
            :class="llmProvider === opt.id ? 'bg-violet-400' : 'bg-slate-600'"
          />
          <div>
            <p class="text-sm font-medium leading-none">{{ opt.label }}</p>
            <p class="mt-1 text-xs text-slate-500">{{ opt.desc }}</p>
          </div>
        </button>
      </div>
    </div>

    <!-- Flow hint -->
    <p class="text-xs text-slate-500 italic">→ {{ flowHint }}</p>
  </div>
</template>

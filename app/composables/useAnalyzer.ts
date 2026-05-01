import type { SearchProviderId, LLMProviderId, AnalyzeOutput } from "~/shared/types";

export const useAnalyzer = () => {
  const mode = useState<"individual" | "batch">("mode", () => "individual");
  const prompt = useState<string>("prompt", () => "");
  const searchProvider = useState<SearchProviderId>("searchProvider", () => "tavily");
  const llmProvider = useState<LLMProviderId>("llmProvider", () => "gpt-4o");
  const email = useState<string>("email", () => "");
  const file = useState<File | null>("file", () => null);
  const companyName = useState<string>("companyName", () => "");
  const companyDomain = useState<string>("companyDomain", () => "");
  const result = useState<AnalyzeOutput | null>("result", () => null);
  const loading = useState<boolean>("loading", () => false);
  const error = useState<string | null>("error", () => null);

  async function runIndividual() {
    if (!companyName.value || !prompt.value) return;
    loading.value = true;
    error.value = null;
    result.value = null;
    try {
      result.value = await $fetch<AnalyzeOutput>("/api/analyze", {
        method: "POST",
        body: {
          companyName: companyName.value,
          companyDomain: companyDomain.value || undefined,
          prompt: prompt.value,
          searchProviderId: searchProvider.value,
          llmProviderId: llmProvider.value,
        },
      });
    } catch (e: any) {
      error.value = e?.data?.message ?? e?.message ?? "Something went wrong";
    } finally {
      loading.value = false;
    }
  }

  async function startBatch(): Promise<string | null> {
    if (!file.value || !prompt.value) return null;
    loading.value = true;
    error.value = null;
    try {
      const form = new FormData();
      form.append("file", file.value);
      form.append("prompt", prompt.value);
      form.append("searchProviderId", searchProvider.value);
      form.append("llmProviderId", llmProvider.value);
      if (email.value) form.append("email", email.value);

      const res = await $fetch<{ batchId: string; totalRows: number }>("/api/batch/start", {
        method: "POST",
        body: form,
      });
      return res.batchId;
    } catch (e: any) {
      error.value = e?.data?.message ?? e?.message ?? "Something went wrong";
      return null;
    } finally {
      loading.value = false;
    }
  }

  return {
    mode, prompt, searchProvider, llmProvider, email, file,
    companyName, companyDomain, result, loading, error,
    runIndividual, startBatch,
  };
};

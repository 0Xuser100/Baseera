import type { BatchStatusResponse } from "~/shared/types";

export const useBatchPolling = (batchId: string) => {
  const status = ref<BatchStatusResponse | null>(null);
  const error = ref<string | null>(null);
  let timer: ReturnType<typeof setInterval> | null = null;

  async function tick() {
    try {
      const data = await $fetch<BatchStatusResponse>(`/api/batch/${batchId}/status`);
      status.value = data;
      if (["completed", "failed", "cancelled"].includes(data.status)) stop();
    } catch (e: any) {
      error.value = e?.message ?? "Polling error";
    }
  }

  function start() {
    tick();
    timer = setInterval(tick, 2000);
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  onMounted(start);
  onUnmounted(stop);

  return { status, error, stop };
};

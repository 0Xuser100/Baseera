import { processQueueBatch } from "../utils/queue-processor";
import type { QueueMessage } from "../utils/queue-processor";

export default defineNitroPlugin((nitroApp) => {
  // @ts-ignore — hook is typed as string literal union
  nitroApp.hooks.hook("cloudflare:queue", async ({ batch, env }: { batch: MessageBatch<QueueMessage>; env: any }) => {
    await processQueueBatch(batch, env);
  });
});

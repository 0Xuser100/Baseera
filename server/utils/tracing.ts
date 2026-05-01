import { Langfuse } from "langfuse";

export function getLangfuse(env: any): Langfuse {
  return new Langfuse({
    secretKey: env.LANGFUSE_SECRET_KEY,
    publicKey: env.LANGFUSE_PUBLIC_KEY,
    baseUrl: env.LANGFUSE_BASE_URL ?? "https://us.cloud.langfuse.com",
    flushAt: 1,
    flushInterval: 0,
  });
}

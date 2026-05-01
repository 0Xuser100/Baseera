declare global {
  interface Env {
    DB: D1Database;
    FILES: R2Bucket;
    ANALYSIS_QUEUE: Queue;
    TAVILY_API_KEY: string;
    OPENAI_API_KEY: string;
    RESEND_API_KEY: string;
    LANGFUSE_SECRET_KEY: string;
    LANGFUSE_PUBLIC_KEY: string;
    LANGFUSE_BASE_URL: string;
    APP_BASE_URL: string;
    EMAIL_FROM: string;
    APP_PASSWORD: string;
  }
}

export {};

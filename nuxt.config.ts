import tailwindcss from "@tailwindcss/vite";

export default defineNuxtConfig({
  compatibilityDate: "2026-04-01",
  devtools: { enabled: true },

  nitro: {
    preset: "cloudflare-module",
    cloudflare: {
      deployConfig: true,
    },
    typescript: {
      tsConfig: {
        compilerOptions: {
          types: ["@cloudflare/workers-types"],
        },
      },
    },
    externals: {
      inline: ["langfuse", "openai"],
    },
  },

  vite: {
    plugins: [tailwindcss()],
  },

  css: ["~/assets/css/main.css"],
});

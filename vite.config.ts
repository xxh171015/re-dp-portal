import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { deepseekChatProxy } from "./server/chatProxy";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [
      react(),
      deepseekChatProxy({
        DEEPSEEK_API_KEY: env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY || "",
        DEEPSEEK_MODEL: env.DEEPSEEK_MODEL || process.env.DEEPSEEK_MODEL || "",
        DEEPSEEK_BASE_URL: env.DEEPSEEK_BASE_URL || process.env.DEEPSEEK_BASE_URL || "",
      }),
    ],
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
    },
    test: {
      environment: "node",
    },
  };
});

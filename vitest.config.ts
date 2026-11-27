import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // 部分用例需要真实建库并跑完整迁移（单个 0.5–2s）。全量并行时机器负载高，
    // 默认 5s 上限会出现与本机性能相关的偶发超时，这里统一放宽到 20s。
    testTimeout: 20_000,
    hookTimeout: 20_000,
    exclude: [
      "**/.codex-preview-*/**",
      "**/.next/**",
      "**/.node_modules-pnpm-broken/**",
      "**/node_modules/**",
      "**/dist/**",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/lib/**/*.ts"],
      exclude: ["src/lib/db/schema.ts"],
    },
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
});

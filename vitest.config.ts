import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    environment: "node",
    globals: false,
    testTimeout: 10_000,
    // better-sqlite3 is a native module; forked processes are safer than worker threads.
    pool: "forks",
    poolOptions: {
      forks: { singleFork: false },
    },
  },
});

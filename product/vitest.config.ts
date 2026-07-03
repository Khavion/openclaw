import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // DB-backed tests share one Postgres schema; keep runs deterministic.
    fileParallelism: false,
    // Never load product/.env here: tests must not see real ping URLs or keys.
    env: {
      KHAVION_MASTER_KEY: 'a'.repeat(64),
      DATABASE_URL: 'postgres://localhost:5432/khavion_test'
    },
    testTimeout: 20000
  }
});

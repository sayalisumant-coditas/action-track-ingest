import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The default worker pools fail here with "failed to find the runner"; vmThreads works.
  test: { include: ['test/**/*.test.ts'], pool: 'vmThreads' },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  cacheDir: 'native/Artifacts/vitest-cache',
  test: {
    include: ['tests/**/*.test.ts'],
  },
});

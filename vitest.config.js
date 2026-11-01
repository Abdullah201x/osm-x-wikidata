import { defineConfig } from 'vitest/config';

// Only unit suites under tests/js. Playwright specs (e2e/*.e2e.js) never match.
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/js/**/*.test.js'],
    restoreMocks: true,
  },
});

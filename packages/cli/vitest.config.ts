import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import pkg from './package.json';

// Tests run against the workspace sources, so they pass before anything is built (as in CI).
const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  define: { __CLI_VERSION__: JSON.stringify(pkg.version) },
  resolve: {
    alias: {
      '@discordforgejs/sdk': fromRoot('../sdk/src/index.ts'),
      '@discordforgejs/types': fromRoot('../types/src/index.ts'),
    },
  },
  test: { globals: true, environment: 'node', include: ['tests/**/*.test.ts'] }
});

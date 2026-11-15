import { defineConfig } from 'vitest/config';
import pkg from './package.json';

export default defineConfig({
  define: { __CLI_VERSION__: JSON.stringify(pkg.version) },
  test: { globals: true, environment: 'node', include: ['tests/**/*.test.ts'] }
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    server: {
      deps: {
        external: [/^bun:/, /^@mariozechner\/pi/],
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData.ts',
        'tests/utils/**'
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80
      }
    },
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: [
      'node_modules',
      'dist',
      // bun:sqlite tests — run via `bun test` not vitest (bun: protocol unsupported in Node)
      'tests/unit/specialist/observability-sqlite.test.ts',
      'tests/unit/specialist/observability-db.test.ts',
      'tests/unit/cli/db.test.ts',
      // FIFO hang in worktree context — run in isolation
      'tests/unit/specialist/supervisor.test.ts',
    ],
    testTimeout: 30000
  }
});

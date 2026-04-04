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
      // Quarantined: FIFO keep-alive test hangs vitest workers due to fd cleanup race.
      // Run in isolation: npx vitest run tests/unit/specialist/supervisor.test.ts
      // Tracked: unitAI-9n93 (P0), overthinker recommended split + transport abstraction.
      'tests/unit/specialist/supervisor.test.ts',
    ],
    testTimeout: 30000
  }
});

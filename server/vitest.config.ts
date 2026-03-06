import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        fileParallelism: false,
        include: ['src/**/__tests__/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'lcov'],
            include: ['src/**/*.ts'],
            exclude: ['src/**/__tests__/**', 'src/index.ts', 'src/worker.ts'],
            thresholds: {
                statements: 50,
                branches: 44,
                functions: 55,
                lines: 50,
            }
        },
    },
});

/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    'recharts-vendor': ['recharts'],
                },
            },
        },
    },
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://localhost:3000',
                changeOrigin: true,
            },
        },
    },
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: './setupTests.ts',
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'lcov'],
            include: ['src/**/*.tsx', 'src/**/*.ts'],
            exclude: ['src/main.tsx', 'src/vite-env.d.ts', 'src/**/__tests__/**'],
            thresholds: {
                statements: 9,
                branches: 60,
                functions: 15,
                lines: 9,
            }
        },
    },
});

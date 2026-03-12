import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['src/**/*.test.ts'],
    },
    resolve: {
        alias: {
            // Match tsconfig baseUrl so imports like 'constants' resolve from src/
            '@': path.resolve(__dirname, './src'),
        },
    },
});

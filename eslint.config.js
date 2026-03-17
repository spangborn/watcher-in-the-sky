const js = require('@eslint/js');
const globals = require('globals');
const tseslint = require('typescript-eslint');
const eslintPluginPrettier = require('eslint-plugin-prettier');
const eslintConfigPrettier = require('eslint-config-prettier');

module.exports = [
    js.configs.recommended,
    ...tseslint.configs.recommended,
    eslintConfigPrettier,
    {
        files: ['src/**/*.ts', 'scripts/**/*.ts'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: {
                ...globals.node,
            },
            parserOptions: {
                project: './tsconfig.eslint.json',
                tsconfigRootDir: __dirname,
            },
        },
        plugins: {
            prettier: eslintPluginPrettier,
        },
        rules: {
            'prettier/prettier': 'error',
            // This repo uses `any` in a few integration spots; keep lint signal focused.
            '@typescript-eslint/no-explicit-any': 'off',
            // Some algorithm code intentionally reassigns; avoid churn.
            'no-useless-assignment': 'off',
            // Prefer letting TypeScript/Prettier handle this style-wise.
            'prefer-const': 'off',
            '@typescript-eslint/no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
            ],
        },
    },
    {
        files: ['src/**/*.test.ts'],
        languageOptions: {
            globals: {
                ...globals.node,
            },
        },
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
            'no-empty': 'off',
        },
    },
    {
        ignores: ['build/**', 'coverage/**', 'node_modules/**', 'src/test.ts', 'eslint.config.js'],
    },
];

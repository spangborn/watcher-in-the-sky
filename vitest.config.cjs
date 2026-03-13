const path = require('path');

module.exports = {
    test: {
        globals: true,
        environment: 'node',
        include: ['src/**/*.test.ts'],
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
};

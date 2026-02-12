
require('dotenv').config();

const { defineConfig } = require('drizzle-kit');

module.exports = defineConfig({
    schema: './src/db/schema/*.ts',
    out: './src/db/migrations',
    dialect: 'postgresql',
    dbCredentials: {
        url: process.env.DATABASE_URL,
    },
    verbose: true,
    strict: true,
});

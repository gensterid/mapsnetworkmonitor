import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

const schemaPath = process.env.DRIZZLE_BOOTSTRAP === 'dist' 
    ? './dist/db/schema/index.js' 
    : './src/db/schema/index.ts';

export default defineConfig({
    schema: schemaPath,
    out: './src/db/migrations',
    dialect: 'postgresql',
    dbCredentials: {
        url: process.env.DATABASE_URL!,
    },
    verbose: true,
    strict: true,
});

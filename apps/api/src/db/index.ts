import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

// Create postgres connection
const connectionString = process.env.DATABASE_URL!;

// For query purposes with connection pooling
const queryClient = postgres(connectionString, {
    max: 20,
    idle_timeout: 30, // seconds
    connect_timeout: 10, // seconds
});

// Create drizzle instance
export const db = drizzle(queryClient, { schema });

// Export schema for convenience
export { schema };

// Export types
export type Database = typeof db;

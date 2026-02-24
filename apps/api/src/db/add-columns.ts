import { sql } from "drizzle-orm";
import { db } from "./index.js";
import postgres from "postgres"; // Need to access the underlying client to close it if using postgres.js

async function main() {
    try {
        console.log("Adding columns...");
        await db.execute(sql`ALTER TABLE routers ADD COLUMN IF NOT EXISTS use_webhook BOOLEAN DEFAULT false NOT NULL`);
        await db.execute(sql`ALTER TABLE routers ADD COLUMN IF NOT EXISTS webhook_secret TEXT`);
        await db.execute(sql`ALTER TABLE routers ADD COLUMN IF NOT EXISTS polling_interval_metrics INTEGER DEFAULT 300 NOT NULL`);
        console.log("Done.");
    } catch (err) {
        console.error("Error:", err);
    } finally {
        // Exit process immediately
        process.exit(0);
    }
}
main();

import 'dotenv/config';
import { db } from '../src/db';
import { sql } from 'drizzle-orm';

async function main() {
    console.log('Fixing database...');

    try {
        await db.execute(sql`
            CREATE TABLE IF NOT EXISTS "user_routers" (
                "user_id" uuid NOT NULL,
                "router_id" uuid NOT NULL,
                "created_at" timestamp DEFAULT now() NOT NULL,
                CONSTRAINT "user_routers_user_id_router_id_pk" PRIMARY KEY("user_id","router_id")
            );
        `);
        console.log('Created table user_routers');

        await db.execute(sql`
            ALTER TABLE "user_routers" ADD CONSTRAINT "user_routers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
        `);
        console.log('Added foreign key user_routers -> users');

        await db.execute(sql`
            ALTER TABLE "user_routers" ADD CONSTRAINT "user_routers_router_id_routers_id_fk" FOREIGN KEY ("router_id") REFERENCES "public"."routers"("id") ON DELETE cascade ON UPDATE no action;
        `);
        console.log('Added foreign key user_routers -> routers');

        console.log('Database fix complete.');
    } catch (error) {
        console.error('Error fixing database:', error);
    } // Allow script to exit
    process.exit(0);
}

main();

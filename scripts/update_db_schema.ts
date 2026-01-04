import postgres from 'postgres';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from apps/api
dotenv.config({ path: path.join(process.cwd(), 'apps', 'api', '.env') });

const sql = postgres(process.env.DATABASE_URL!);

async function main() {
    console.log('Checking database schema...');

    try {
        // Check if column exists
        const result = await sql`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'notification_groups' AND column_name = 'message_template'
        `;

        if (result.length > 0) {
            console.log('Column message_template already exists.');
        } else {
            console.log('Adding column message_template...');
            await sql`ALTER TABLE notification_groups ADD COLUMN message_template text`;
            console.log('Column added successfully.');
        }
    } catch (error) {
        console.error('Error updating schema:', error);
    } finally {
        await sql.end();
    }
}

main();

import 'dotenv/config';
import postgres from 'postgres';

async function updateToAdmin() {
    const sql = postgres(process.env.DATABASE_URL!);

    try {
        // Update user to admin role
        const result = await sql`
            UPDATE users 
            SET role = 'admin' 
            WHERE email = 'admin@mikrotik.local'
            RETURNING email, name, role
        `;

        if (result.length > 0) {
            console.log('✅ User updated to admin!');
            console.log(`   Email: ${result[0].email}`);
            console.log(`   Name: ${result[0].name}`);
            console.log(`   Role: ${result[0].role}`);
        } else {
            // If no user found with that email, check what users exist
            const allUsers = await sql`SELECT email, name, role FROM users`;
            console.log('No user found with admin@mikrotik.local');
            console.log('Existing users:', allUsers);

            if (allUsers.length > 0) {
                // Update the first user to admin
                const updated = await sql`
                    UPDATE users 
                    SET role = 'admin' 
                    WHERE email = ${allUsers[0].email}
                    RETURNING email, name, role
                `;
                console.log('Updated first user to admin:', updated[0]);
            }
        }
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await sql.end();
    }

    process.exit(0);
}

updateToAdmin();

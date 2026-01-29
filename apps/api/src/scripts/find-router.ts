import { db } from '../db';

async function findRouter() {
    const router = await db.query.routers.findFirst({
        where: (routers, { like }) => like(routers.name, '%genster%')
    });
    console.log(router ? `Found router: ${router.name} (${router.id})` : 'Router not found');
    process.exit(0);
}

findRouter();

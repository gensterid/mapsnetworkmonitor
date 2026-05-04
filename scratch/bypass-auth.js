const fs = require('fs');
const p = 'apps/api/src/middleware/auth.middleware.ts';
let code = fs.readFileSync(p, 'utf8');

if (!code.includes('MOCK_AUTH_BYPASS')) {
    code = code.replace(
        'export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {',
        `export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
// MOCK_AUTH_BYPASS
req.user = { id: '00000000-0000-0000-0000-000000000000', email: 'test@admin.com', name: 'Test Admin', role: 'superadmin', tenantId: undefined, primaryTenantId: undefined, aiEnabled: true } as any;
return next();
`
    );
    fs.writeFileSync(p, code);
    console.log('Bypassed auth!');
} else {
    console.log('Already bypassed!');
}

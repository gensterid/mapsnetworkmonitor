/**
 * MikHMON voucher logo storage — filesystem, per-router.
 *
 * Each router gets its own directory under MIKHMON_LOGO_DIR. Files are
 * stored with the original sanitized filename so operators see "logo-
 * TOLONDADU.png" both in the upload form and in /system file print on
 * the router (MikHMON external convention).
 *
 * Why filesystem instead of DB blob: logos are 1-3 small PNGs per router,
 * served on every voucher print render. Filesystem read is faster than
 * a DB roundtrip, and operators can copy logos to/from servers with
 * standard tools.
 */
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../lib/logger.js';

const LOGO_DIR = process.env.MIKHMON_LOGO_DIR
    || path.join(process.cwd(), 'data', 'mikhmon-logos');

const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp']);
const MAX_BYTES = 500 * 1024; // 500 KB

export interface LogoEntry {
    filename: string;
    size: number;
    uploadedAt: string;
}

function routerDir(routerId: string): string {
    // Defense in depth — block path-traversal attempts even though
    // routerId comes from authenticated request params.
    if (!/^[a-zA-Z0-9-]+$/.test(routerId)) throw new Error('invalid routerId');
    return path.join(LOGO_DIR, routerId);
}

function sanitizeFilename(name: string): string {
    // Keep alphanumerics, dash, underscore, dot. Anything else collapses.
    return path.basename(name).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
}

async function ensureDir(dir: string): Promise<void> {
    await fs.mkdir(dir, { recursive: true });
}

export async function listLogos(routerId: string): Promise<LogoEntry[]> {
    const dir = routerDir(routerId);
    try {
        const files = await fs.readdir(dir);
        const out: LogoEntry[] = [];
        for (const f of files) {
            const ext = path.extname(f).toLowerCase();
            if (!ALLOWED_EXT.has(ext)) continue;
            const stat = await fs.stat(path.join(dir, f));
            out.push({
                filename: f,
                size: stat.size,
                uploadedAt: stat.mtime.toISOString(),
            });
        }
        return out.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
    } catch (e: any) {
        if (e.code === 'ENOENT') return [];
        throw e;
    }
}

export async function saveLogo(
    routerId: string,
    originalName: string,
    buffer: Buffer,
): Promise<LogoEntry> {
    const ext = path.extname(originalName).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
        throw new Error(`Format file tidak didukung. Pakai: ${Array.from(ALLOWED_EXT).join(', ')}`);
    }
    if (buffer.length > MAX_BYTES) {
        throw new Error(`File terlalu besar (${Math.round(buffer.length / 1024)} KB). Maks 500 KB.`);
    }

    const dir = routerDir(routerId);
    await ensureDir(dir);

    const filename = sanitizeFilename(originalName);
    const fullPath = path.join(dir, filename);
    await fs.writeFile(fullPath, buffer);

    logger.info({ routerId, filename, size: buffer.length }, '[MikHMON Logo] saved');
    const stat = await fs.stat(fullPath);
    return {
        filename,
        size: stat.size,
        uploadedAt: stat.mtime.toISOString(),
    };
}

export async function deleteLogo(routerId: string, filename: string): Promise<void> {
    const safe = sanitizeFilename(filename);
    const fullPath = path.join(routerDir(routerId), safe);
    try {
        await fs.unlink(fullPath);
        logger.info({ routerId, filename: safe }, '[MikHMON Logo] deleted');
    } catch (e: any) {
        if (e.code === 'ENOENT') return; // already gone — idempotent
        throw e;
    }
}

export async function readLogo(routerId: string, filename: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const safe = sanitizeFilename(filename);
    const fullPath = path.join(routerDir(routerId), safe);
    const buffer = await fs.readFile(fullPath);
    const ext = path.extname(safe).toLowerCase();
    const mimeMap: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.webp': 'image/webp',
    };
    return { buffer, mimeType: mimeMap[ext] || 'application/octet-stream' };
}

/**
 * Read a logo and return it as a data: URL (base64). Used by the print
 * pipeline to inline logos into the print HTML so the new window doesn't
 * need to make a separate fetch.
 */
export async function readLogoAsDataUrl(routerId: string, filename: string): Promise<string> {
    try {
        const { buffer, mimeType } = await readLogo(routerId, filename);
        return `data:${mimeType};base64,${buffer.toString('base64')}`;
    } catch (e: any) {
        if (e.code === 'ENOENT') return '';
        throw e;
    }
}

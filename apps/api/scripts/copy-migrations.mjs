import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcDir = path.resolve(__dirname, '..', 'src', 'db', 'migrations');
const destDir = path.resolve(__dirname, '..', 'dist', 'db', 'migrations');

function copyDir(src, dest) {
    if (!fs.existsSync(src)) {
        console.warn(`⚠️ Source directory not found: ${src}`);
        return;
    }
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

console.log(`📦 Copying migrations from ${srcDir} to ${destDir}...`);
copyDir(srcDir, destDir);
console.log('✅ Migrations copied successfully!');

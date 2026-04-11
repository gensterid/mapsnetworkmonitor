import fs from 'fs';
import zlib from 'zlib';
import path from 'path';

const gzipFile = 'D:/Antigrafity/new-monitoring-mikrotik/apps/api/backups/auto-bkp-2026-04-09T19-22-43-413Z.sql.gz';
const outFile = 'D:/Antigrafity/new-monitoring-mikrotik/apps/api/backups/restore_temp.sql';

console.log(`📂 Extracting ${path.basename(gzipFile)}...`);

const readStream = fs.createReadStream(gzipFile);
const writeStream = fs.createWriteStream(outFile);
const gunzip = zlib.createGunzip();

readStream.pipe(gunzip).pipe(writeStream);

writeStream.on('finish', () => {
    console.log('✅ Extraction complete!');
    process.exit(0);
});

writeStream.on('error', (err) => {
    console.error('❌ Extraction failed:', err);
    process.exit(1);
});

import fs from 'fs';
import path from 'path';

const filePath = process.argv[2];
if (!filePath) {
    console.error('Please specify a file path');
    process.exit(1);
}

try {
    const buffer = fs.readFileSync(filePath);
    // Try to decode as UTF-16LE
    const content = buffer.toString('utf16le');
    fs.writeFileSync(filePath + '.utf8.txt', content, 'utf8');
    console.log(`Converted ${filePath} to ${filePath}.utf8.txt`);
} catch (e) {
    console.error(`Failed to convert: ${e.message}`);
}

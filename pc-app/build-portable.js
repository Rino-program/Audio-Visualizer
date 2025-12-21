#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

// Create simple portable zip without electron-builder
const distDir = path.join(__dirname, 'dist');
const outputZip = path.join(distDir, 'Audio-Visualizer-Portable.zip');

if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
}

// Copy node_modules/@electron-utils if needed, or just use the asar if it exists
const output = fs.createWriteStream(outputZip);
const archive = archiver('zip', { zlib: { level: 6 } });

output.on('close', function() {
    console.log(`✓ Portable zip created: ${outputZip}`);
    console.log(`  Size: ${(archive.pointer() / 1024 / 1024).toFixed(2)} MB`);
});

archive.on('error', function(err) {
    throw err;
});

archive.pipe(output);

// Add files to zip
archive.directory('node_modules/electron/dist/', 'electron/');
archive.directory('public/', 'public/');
archive.file('main.js', { name: 'main.js' });
archive.file('preload.js', { name: 'preload.js' });

archive.finalize();

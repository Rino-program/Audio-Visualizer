#!/usr/bin/env node

/**
 * Simple Electron app packager (代替: electron-builderの代わり)
 * Windows向けポータブルZipを生成
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const appDir = __dirname;
const releaseDir = path.join(appDir, 'release');
const outputZip = path.join(releaseDir, 'Audio-Visualizer-Portable.zip');

// Ensure release dir
if (!fs.existsSync(releaseDir)) {
    fs.mkdirSync(releaseDir, { recursive: true });
}

console.log('📦 Creating portable package...');

try {
    // PowerShell コマンドでZipを生成
    const electronPath = path.join(appDir, 'node_modules', 'electron', 'dist');
    
    if (!fs.existsSync(electronPath)) {
        console.error('❌ Electron not found. Run: npm install');
        process.exit(1);
    }

    // Compress-Archive コマンドで Zip を作成
    const psCmd = `
        $src = @('${electronPath}', '${path.join(appDir, 'main.js')}', '${path.join(appDir, 'preload.js')}', '${path.join(appDir, 'public')}')
        $dst = '${outputZip}'
        
        if (Test-Path $dst) { Remove-Item $dst -Force }
        
        Compress-Archive -Path $src -DestinationPath $dst -CompressionLevel Optimal
        
        $size = (Get-Item $dst).Length / 1MB
        Write-Host "✓ Portable package created: $dst"
        Write-Host "  Size: $([Math]::Round($size, 2)) MB"
    `;

    execSync(`powershell -Command "${psCmd}"`, { stdio: 'inherit' });
    console.log('✅ Build complete!');

} catch (err) {
    console.error('❌ Build failed:', err.message);
    process.exit(1);
}

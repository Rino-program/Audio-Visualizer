#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const appDir = path.join(__dirname, "..");
const releaseDir = path.join(appDir, "release");
const outDir = path.join(releaseDir, "Audio-Visualizer-Portable");
const outputZip = path.join(releaseDir, "Audio-Visualizer-Portable.zip");

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function rmForce(targetPath) {
  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

function renameIfExists(fromPath, toPath) {
  if (!fs.existsSync(fromPath)) return true;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      fs.renameSync(fromPath, toPath);
      return true;
    } catch (error) {
      if (attempt === 5) {
        return false;
      }
      sleep(400);
    }
  }
  return false;
}

function ensureDir(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function run(command) {
  execSync(command, { stdio: "inherit", cwd: appDir });
}

if (process.platform !== "win32") {
  console.error("This build script is intended for Windows.");
  process.exit(1);
}

ensureDir(releaseDir);
rmForce(outputZip);

// WindowsではAV/Indexer等により既存出力の削除/上書きが失敗しやすい。
// 可能ならリネームで退避し、ダメなら今回ビルドは別フォルダに出力してZIPだけ作る。
let buildOutDir = outDir;
if (fs.existsSync(outDir)) {
  const rotated = `${outDir}.__old_${Date.now()}`;
  const rotatedOk = renameIfExists(outDir, rotated);
  if (rotatedOk) {
    // 退避できたら後で掃除（失敗しても無視）
    rmForce(rotated);
  } else {
    buildOutDir = `${outDir}-${Date.now()}`;
    console.warn("⚠️  Existing output is locked; building to:", buildOutDir);
  }
}

console.log("📦 Packaging app (electron-packager)...");

// electron-packager outputs: <out>/<name>-win32-x64/
const packName = "audio-visualizer-desktop";
// Use unique temp directory to avoid touching any previously generated (possibly locked) output.
const tempOutDir = path.join(releaseDir, ".tmp", `pack-${Date.now()}`);
ensureDir(tempOutDir);
const packOutBase = path.join(tempOutDir, `${packName}-win32-x64`);

// Using npx ensures the local devDependency is used.
// --asar makes distribution simpler (fewer files).
run(
  [
    "npx electron-packager .",
    packName,
    "--platform=win32",
    "--arch=x64",
    `--out=\"${tempOutDir}\"`,
    "--asar",
    "--prune=true",
    // Prevent packaging build outputs (which can recursively include Electron runtimes and even the ZIP itself)
    // Patterns are treated as regular expressions by electron-packager.
    // NOTE: Avoid using '|' in regex here because Windows cmd may treat it as a pipe.
    "--ignore=^/release",
    "--ignore=^/release-build",
    "--ignore=^/dist",
    "--ignore=^/scripts",
  ].join(" ")
);

// Rename to stable folder name for end-users
if (!fs.existsSync(packOutBase)) {
  console.error(`Expected output folder not found: ${packOutBase}`);
  process.exit(1);
}
ensureDir(buildOutDir);

// Windows環境ではAV/Indexer等でrenameがEPERMになりやすいので、copy→removeで安定化
for (let attempt = 1; attempt <= 5; attempt += 1) {
  try {
    ensureDir(buildOutDir);
    fs.cpSync(packOutBase, buildOutDir, { recursive: true, force: true });
    break;
  } catch (error) {
    if (attempt === 5) {
      console.error(`Failed to copy to ${buildOutDir}`);
      console.error(error && error.message ? error.message : error);
      process.exit(1);
    }
    sleep(400);
  }
}

rmForce(tempOutDir);

console.log("🗜️  Creating zip...");
// Avoid embedding double-quotes inside the -Command string.
const psCmd = [
  `$src = '${buildOutDir}\\*'`,
  `$dst = '${outputZip}'`,
  `if (Test-Path $dst) { Remove-Item $dst -Force }`,
  `Compress-Archive -Path $src -DestinationPath $dst -CompressionLevel Optimal`,
  `$size = (Get-Item $dst).Length / 1MB`,
  `Write-Host ('✓ Portable package created: ' + $dst)`,
  `Write-Host ('  Size: ' + [Math]::Round($size, 2) + ' MB')`,
].join("; ");

execSync(
  `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "${psCmd}"`,
  { stdio: "inherit" }
);

console.log("✅ Build complete!");

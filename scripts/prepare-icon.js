// Copies the correct client's app icon into build/icon.png before electron-builder
// runs, based on NEXT_PUBLIC_CLIENT_NAME — the same env var that drives in-app
// branding (see renderer/lib/config.ts). electron-builder auto-generates the
// platform-specific .ico/.icns from this single PNG at build time.
const fs = require('fs');
const path = require('path');

const clientName = process.env.NEXT_PUBLIC_CLIENT_NAME || 'nethu';

const ICONS_BY_CLIENT = {
  nethu: path.join(__dirname, '..', 'build-assets', 'icons', 'nethu.png'),
  impress: path.join(__dirname, '..', 'build-assets', 'icons', 'impress.png'),
};

const source = ICONS_BY_CLIENT[clientName];
const destDir = path.join(__dirname, '..', 'build');
const dest = path.join(destDir, 'icon.png');

if (!source) {
  console.log(`prepare-icon: no icon configured for client "${clientName}" — electron-builder will use its default icon.`);
  process.exit(0);
}

if (!fs.existsSync(source)) {
  console.warn(`prepare-icon: expected icon not found at ${source} — skipping.`);
  process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(source, dest);
console.log(`prepare-icon: using "${clientName}" icon -> ${dest}`);

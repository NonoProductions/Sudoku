// Simple icon generator for PWA
// This script creates PNG icons for the PWA

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a simple SVG icon for Sodoku
const createSVGIcon = (size) => {
  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="#3f3f3f" rx="${size * 0.1}"/>
  <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="${size * 0.35}" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">9×9</text>
</svg>`;
};

const publicDir = path.join(__dirname, '..', 'public');

// Ensure public directory exists
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Generate PNG icons from SVG
const generatePNGIcon = async (size, filename) => {
  const svg = createSVGIcon(size);
  const buffer = Buffer.from(svg);
  await sharp(buffer)
    .resize(size, size)
    .png()
    .toFile(path.join(publicDir, filename));
  console.log(`Created ${filename} (${size}x${size})`);
};

// Generate all required icons
const generateIcons = async () => {
  try {
    // PWA icons
    await generatePNGIcon(192, 'pwa-192x192.png');
    await generatePNGIcon(512, 'pwa-512x512.png');
    
    // Apple touch icon
    await generatePNGIcon(180, 'apple-touch-icon.png');
    
    // Favicon
    await generatePNGIcon(32, 'favicon.ico');
    
    // Also create SVG favicon
    const faviconSVG = createSVGIcon(32);
    fs.writeFileSync(path.join(publicDir, 'favicon.svg'), faviconSVG);
    console.log('Created favicon.svg');
    
    console.log('\n✅ All PWA icons generated successfully!');
  } catch (error) {
    console.error('Error generating icons:', error);
    process.exit(1);
  }
};

generateIcons();


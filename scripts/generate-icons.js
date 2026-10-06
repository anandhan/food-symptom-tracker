// Generate PWA icons using sharp

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const outputDir = path.join(__dirname, '../public');

// Create a simple icon with a colored background and emoji
async function generateIcon(size, filename) {
  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" fill="#2563eb" rx="${size * 0.15}"/>
      <text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle" 
            font-size="${size * 0.5}" font-family="Arial, sans-serif">
        🍽️
      </text>
    </svg>
  `;

  await sharp(Buffer.from(svg))
    .png()
    .toFile(path.join(outputDir, filename));
  
  console.log(`✓ Generated ${filename}`);
}

async function main() {
  console.log('Generating PWA icons...');
  
  await generateIcon(192, 'icon-192.png');
  await generateIcon(512, 'icon-512.png');
  await generateIcon(512, 'icon-512-maskable.png');
  await generateIcon(180, 'apple-touch-icon.png');
  await generateIcon(32, 'favicon-32x32.png');
  await generateIcon(16, 'favicon-16x16.png');
  
  console.log('✅ All PWA icons generated!');
}

main().catch(console.error);

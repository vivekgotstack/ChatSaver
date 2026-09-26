const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('../../frontend/node_modules/sharp');

async function main() {
  const source = path.resolve(__dirname, '../../frontend/public/cs-transparent.png');
  const background = '#050505';
  const mark = await sharp(source).trim({ threshold: 1 }).png().toBuffer();
  const formats = [
    { name: 'ChatSaver-box-art-2160x2160.png', width: 2160, height: 2160, maxWidth: 1728, maxHeight: 1728 },
    { name: 'ChatSaver-poster-art-1440x2160.png', width: 1440, height: 2160, maxWidth: 1152, maxHeight: 1512 },
  ];
  for (const format of formats) {
    const logo = await sharp(mark).resize({ width: format.maxWidth, height: format.maxHeight, fit: 'inside', kernel: 'lanczos3' }).toBuffer();
    const output = path.join(__dirname, format.name);
    await sharp({ create: { width: format.width, height: format.height, channels: 3, background } })
      .composite([{ input: logo, gravity: 'centre' }])
      .removeAlpha()
      .withMetadata({ density: 300 })
      .png({ compressionLevel: 9 })
      .toFile(output);
    const metadata = await sharp(output).metadata();
    const stat = await fs.stat(output);
    console.log(JSON.stringify({ path: output, width: metadata.width, height: metadata.height, format: metadata.format, bytes: stat.size }));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

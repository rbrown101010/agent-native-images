const sharp = require('sharp');
const path = require('node:path');
const assets = path.join(__dirname, '..', 'assets');
(async () => {
  for (const scale of [1, 2]) {
    await sharp(path.join(assets, 'agent-native-circle.svg'))
      .resize(18 * scale, 18 * scale)
      .png()
      .toFile(path.join(assets, `tray${scale === 2 ? '@2x' : ''}.png`));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

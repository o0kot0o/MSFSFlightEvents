// Generates a simple 32x32 solid-circle .ico for the tray icon. No image
// tools (ImageMagick, Inkscape, etc.) are available in this environment, so
// this hand-builds the ICO/BMP byte layout directly - a well-defined, small
// format that doesn't need external dependencies. Run: node scripts/make-icon.js
const fs = require("fs");
const path = require("path");

const SIZE = 32;
// Matches the EFB app's primary blue accent (see FlightEventsPage.scss /
// TTButton "primary" styling) so the tray icon reads as the same app.
const R = 0x2f;
const G = 0x7d;
const B = 0xd6;

const pixels = Buffer.alloc(SIZE * SIZE * 4);
const center = (SIZE - 1) / 2;
const radius = SIZE / 2 - 2;

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const dx = x - center;
    const dy = y - center;
    const inside = Math.sqrt(dx * dx + dy * dy) <= radius;
    // BMP rows are bottom-up in ICO/DIB data.
    const row = SIZE - 1 - y;
    const offset = (row * SIZE + x) * 4;
    if (inside) {
      pixels[offset + 0] = B; // BGRA order
      pixels[offset + 1] = G;
      pixels[offset + 2] = R;
      pixels[offset + 3] = 0xff;
    } else {
      pixels[offset + 0] = 0;
      pixels[offset + 1] = 0;
      pixels[offset + 2] = 0;
      pixels[offset + 3] = 0;
    }
  }
}

// AND mask: all zero bits is the modern convention meaning "use the alpha
// channel instead" (safe on Vista+, i.e. anything MSFS 2024 runs on).
const maskRowBytes = Math.ceil(SIZE / 8 / 4) * 4;
const andMask = Buffer.alloc(maskRowBytes * SIZE, 0);

const bitmapInfoHeader = Buffer.alloc(40);
bitmapInfoHeader.writeUInt32LE(40, 0); // header size
bitmapInfoHeader.writeInt32LE(SIZE, 4); // width
bitmapInfoHeader.writeInt32LE(SIZE * 2, 8); // height (XOR + AND combined, per ICO convention)
bitmapInfoHeader.writeUInt16LE(1, 12); // planes
bitmapInfoHeader.writeUInt16LE(32, 14); // bit count
bitmapInfoHeader.writeUInt32LE(0, 16); // compression (BI_RGB)
bitmapInfoHeader.writeUInt32LE(pixels.length + andMask.length, 20); // image size

const imageData = Buffer.concat([bitmapInfoHeader, pixels, andMask]);

const iconDir = Buffer.alloc(6);
iconDir.writeUInt16LE(0, 0); // reserved
iconDir.writeUInt16LE(1, 2); // type: icon
iconDir.writeUInt16LE(1, 4); // image count

const iconDirEntry = Buffer.alloc(16);
iconDirEntry.writeUInt8(SIZE, 0); // width (32 fits in a byte)
iconDirEntry.writeUInt8(SIZE, 1); // height
iconDirEntry.writeUInt8(0, 2); // color count
iconDirEntry.writeUInt8(0, 3); // reserved
iconDirEntry.writeUInt16LE(1, 4); // planes
iconDirEntry.writeUInt16LE(32, 6); // bit count
iconDirEntry.writeUInt32LE(imageData.length, 8); // bytes in resource
iconDirEntry.writeUInt32LE(iconDir.length + iconDirEntry.length, 12); // offset

const ico = Buffer.concat([iconDir, iconDirEntry, imageData]);

const outPath = path.join(__dirname, "..", "assets", "tray-icon.ico");
fs.writeFileSync(outPath, ico);
console.log(`Wrote ${outPath} (${ico.length} bytes)`);

const fs = require('fs');
const path = require('path');

const tabbarDir = path.join(__dirname, '../static/tabbar');

if (!fs.existsSync(tabbarDir)) {
  fs.mkdirSync(tabbarDir, { recursive: true });
}

const createPNG = (width, height, r, g, b, a) => {
  const png = [];
  png.push(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A);
  
  const ihdr = [
    (width >> 24) & 0xFF, (width >> 16) & 0xFF, (width >> 8) & 0xFF, width & 0xFF,
    (height >> 24) & 0xFF, (height >> 16) & 0xFF, (height >> 8) & 0xFF, height & 0xFF,
    8, 6, 0, 0, 0
  ];
  const ihdrChunk = createChunk('IHDR', ihdr);
  png.push(...ihdrChunk);
  
  const rawData = [];
  for (let y = 0; y < height; y++) {
    rawData.push(0);
    for (let x = 0; x < width; x++) {
      rawData.push(r, g, b, a);
    }
  }
  
  const zlib = require('zlib');
  const compressed = zlib.deflateSync(Buffer.from(rawData));
  const idatChunk = createChunk('IDAT', [...compressed]);
  png.push(...idatChunk);
  
  const iendChunk = createChunk('IEND', []);
  png.push(...iendChunk);
  
  return Buffer.from(png);
};

const createChunk = (type, data) => {
  const length = [
    (data.length >> 24) & 0xFF, (data.length >> 16) & 0xFF,
    (data.length >> 8) & 0xFF, data.length & 0xFF
  ];
  const typeBytes = type.split('').map(c => c.charCodeAt(0));
  const crcData = [...typeBytes, ...data];
  const crc = crc32(crcData);
  
  return [
    ...length,
    ...typeBytes,
    ...data,
    (crc >> 24) & 0xFF, (crc >> 16) & 0xFF, (crc >> 8) & 0xFF, crc & 0xFF
  ];
};

const crc32 = (data) => {
  let crc = 0xFFFFFFFF;
  const table = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  for (const byte of data) {
    crc = table[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
};

const icons = [
  { name: 'home.png', color: [160, 160, 176, 255] },
  { name: 'home-active.png', color: [102, 126, 234, 255] },
  { name: 'bookmark.png', color: [160, 160, 176, 255] },
  { name: 'bookmark-active.png', color: [102, 126, 234, 255] },
  { name: 'profile.png', color: [160, 160, 176, 255] },
  { name: 'profile-active.png', color: [102, 126, 234, 255] }
];

icons.forEach(icon => {
  const png = createPNG(48, 48, ...icon.color);
  fs.writeFileSync(path.join(tabbarDir, icon.name), png);
  console.log(`Created ${icon.name}`);
});

console.log('All tabbar icons created successfully!');
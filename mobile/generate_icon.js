const sharp = require('C:/Users/jirmy/AppData/Roaming/npm/node_modules/cline/node_modules/sharp');
const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, 'assets', 'icons');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

// Exact match of the Alyah Smart Attendance app icon:
// - White background
// - Blue (#2356d4) stylized A-mark with location pin inside rounded-rect frame
// - "Alyah" bold text below
// - "Smart Attendance" lighter text at bottom
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">

  <!-- White background -->
  <rect width="1024" height="1024" fill="white"/>

  <!-- ═══════════════════════════════════════════════ -->
  <!-- LOGO MARK — centered, top half                  -->
  <!-- ═══════════════════════════════════════════════ -->

  <!-- Outer rounded-rect frame (open at bottom, with right-side arrow) -->
  <!-- Left vertical bar -->
  <rect x="248" y="108" width="68" height="380" rx="34" ry="34" fill="#2356d4"/>
  <!-- Top horizontal bar -->
  <rect x="248" y="108" width="420" height="68" rx="34" ry="34" fill="#2356d4"/>
  <!-- Right vertical bar (shorter — ends before bottom) -->
  <rect x="600" y="108" width="68" height="310" rx="34" ry="34" fill="#2356d4"/>

  <!-- Arrow pointing right off the right bar -->
  <!-- Horizontal part of arrow -->
  <rect x="648" y="228" width="130" height="58" rx="29" ry="29" fill="#2356d4"/>
  <!-- Arrow head (triangle pointing right) -->
  <polygon points="760,196 820,257 760,318" fill="#2356d4"/>

  <!-- Inner A letter -->
  <!-- Left leg of A -->
  <path d="M370 490 L490 170 L510 170 L630 490 L578 490 L500 268 L422 490 Z" fill="#2356d4"/>
  <!-- Crossbar of A (slightly below center) -->
  <rect x="410" y="378" width="204" height="52" rx="10" fill="#2356d4"/>

  <!-- ═══════════════════════════════════════════════ -->
  <!-- TEXT — bottom half                              -->
  <!-- ═══════════════════════════════════════════════ -->

  <!-- "Alyah" — bold, large -->
  <text
    x="512" y="680"
    font-family="'Arial Rounded MT Bold', 'Arial', sans-serif"
    font-size="168"
    font-weight="800"
    fill="#2356d4"
    text-anchor="middle"
  >Alyah</text>

  <!-- "Smart Attendance" — medium weight, smaller -->
  <text
    x="512" y="800"
    font-family="'Arial', sans-serif"
    font-size="80"
    font-weight="600"
    fill="#2356d4"
    text-anchor="middle"
  >Smart Attendance</text>

</svg>`;

fs.writeFileSync(path.join(outDir, 'icon.svg'), svg);

sharp(Buffer.from(svg))
  .resize(1024, 1024)
  .png()
  .toFile(path.join(outDir, 'icon.png'), (err, info) => {
    if (err) { console.error('ERROR:', err.message); process.exit(1); }
    console.log('Generated assets/icons/icon.png —', info.width + 'x' + info.height, info.size + ' bytes');
  });

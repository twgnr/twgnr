#!/usr/bin/env node
/**
 * Draws a stand-in tile for a project that has no screenshot yet, at the same
 * 320x200 as the real thumbnails so the grid stays even.
 *
 *   node scripts/placeholder-tile.mjs "Stream Deck Tool UI" assets/projects/stream-deck-tool.svg
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const [name, out] = process.argv.slice(2);
if (!name || !out) {
  console.error('usage: node scripts/placeholder-tile.mjs "Project Name" <out.svg>');
  process.exit(1);
}

const W = 320;
const H = 200;
const MONO = "ui-monospace, Consolas, 'DejaVu Sans Mono', monospace";
const ENT = { "<": "&lt;", ">": "&gt;", "&": "&amp;" };
const esc = (s) => String(s).replace(/[<>&]/g, (c) => ENT[c]);

// Wrap on spaces so a long name does not run off the tile.
const words = name.toUpperCase().split(/\s+/);
const lines = [];
for (const w of words) {
  const last = lines[lines.length - 1];
  if (last && (last + " " + w).length <= 18) lines[lines.length - 1] = last + " " + w;
  else lines.push(w);
}
const startY = H / 2 + 4 - ((lines.length - 1) * 19) / 2;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" fill="none" role="img" aria-label="${esc(name)} — no screenshot yet">
  <defs>
    <radialGradient id="pg" cx="${W / 2}" cy="${H / 2}" r="${W * 0.7}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#47C2FF" stop-opacity="0.16"/><stop offset="1" stop-color="#47C2FF" stop-opacity="0"/>
    </radialGradient>
    <pattern id="pgrid" width="24" height="24" patternUnits="userSpaceOnUse">
      <path d="M24 0 H0 V24" fill="none" stroke="#94B4DC" stroke-width="1" stroke-opacity="0.12"/>
    </pattern>
  </defs>

  <rect width="${W}" height="${H}" fill="#0A101D"/>
  <rect width="${W}" height="${H}" fill="url(#pgrid)"/>
  <rect width="${W}" height="${H}" fill="url(#pg)"/>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" stroke="#94B4DC" stroke-opacity="0.28"/>
  <rect width="${W}" height="1.5" fill="#FFFFFF" opacity="0.10"/>

  <g text-anchor="middle" font-family="${MONO}">
${lines
  .map(
    (l, i) =>
      `    <text x="${W / 2}" y="${startY + i * 19}" fill="#47C2FF" font-size="13" font-weight="600" letter-spacing="2.2">${esc(l)}</text>`
  )
  .join("\n")}
    <text x="${W / 2}" y="${startY + lines.length * 19 + 8}" fill="#9AA4B2" font-size="8" letter-spacing="1.8" opacity="0.7">NO SCREENSHOT YET</text>
  </g>
</svg>
`;

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, svg);
console.log(`wrote ${out}`);

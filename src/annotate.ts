import sharp from "sharp";
import type { TradeSetup } from "./types.js";

const PANEL_HEIGHT = 120;

export async function annotateChart(
  imageBuffer: Buffer,
  setup: TradeSetup,
): Promise<Buffer> {
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();
  const width = metadata.width || 1400;
  const height = metadata.height || 900;

  const isLong = setup.direction === "LONG";
  const dirColor = isLong ? "#00c853" : "#ff1744";
  const dirBg = isLong ? "rgba(0,200,83,0.15)" : "rgba(255,23,68,0.15)";
  const arrow = isLong ? "▲" : "▼";

  const escXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const svg = `<svg width="${width}" height="${PANEL_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#0d1117"/>
    <rect width="100%" height="3" fill="${dirColor}"/>

    <rect x="15" y="12" width="${setup.direction.length * 16 + 40}" height="32" rx="4" fill="${dirBg}" stroke="${dirColor}" stroke-width="1.5"/>
    <text x="28" y="34" fill="${dirColor}" font-size="20" font-weight="bold" font-family="monospace">${arrow} ${setup.direction}</text>

    <text x="180" y="34" fill="#ffffff" font-size="18" font-weight="bold" font-family="monospace">${escXml(setup.pair)}</text>
    <text x="340" y="34" fill="#8b949e" font-size="14" font-family="monospace">${escXml(setup.setup)}</text>

    <text x="15" y="65" fill="#8b949e" font-size="13" font-family="monospace">Entry</text>
    <text x="15" y="85" fill="#ffffff" font-size="18" font-weight="bold" font-family="monospace">${escXml(setup.entry)}</text>

    <line x1="160" y1="52" x2="160" y2="92" stroke="#30363d" stroke-width="1"/>

    <text x="175" y="65" fill="#8b949e" font-size="13" font-family="monospace">Stop Loss</text>
    <text x="175" y="85" fill="#ff1744" font-size="18" font-weight="bold" font-family="monospace">${escXml(setup.stopLoss)}</text>

    <line x1="345" y1="52" x2="345" y2="92" stroke="#30363d" stroke-width="1"/>

    <text x="360" y="65" fill="#8b949e" font-size="13" font-family="monospace">TP1</text>
    <text x="360" y="85" fill="#00c853" font-size="18" font-weight="bold" font-family="monospace">${escXml(setup.takeProfit1)}</text>

    <line x1="510" y1="52" x2="510" y2="92" stroke="#30363d" stroke-width="1"/>

    <text x="525" y="65" fill="#8b949e" font-size="13" font-family="monospace">TP2</text>
    <text x="525" y="85" fill="#00c853" font-size="18" font-weight="bold" font-family="monospace">${escXml(setup.takeProfit2)}</text>

    <line x1="675" y1="52" x2="675" y2="92" stroke="#30363d" stroke-width="1"/>

    <text x="690" y="65" fill="#8b949e" font-size="13" font-family="monospace">R:R</text>
    <text x="690" y="85" fill="#ffd600" font-size="18" font-weight="bold" font-family="monospace">${escXml(setup.riskReward)}</text>

    <text x="15" y="110" fill="#8b949e" font-size="12" font-family="monospace">${escXml(setup.summary.slice(0, 120))}</text>
  </svg>`;

  const panel = await sharp(Buffer.from(svg)).png().toBuffer();

  const result = await sharp({
    create: {
      width,
      height: height + PANEL_HEIGHT,
      channels: 4,
      background: { r: 13, g: 17, b: 23, alpha: 1 },
    },
  })
    .composite([
      { input: imageBuffer, top: 0, left: 0 },
      { input: panel, top: height, left: 0 },
    ])
    .png()
    .toBuffer();

  return result;
}

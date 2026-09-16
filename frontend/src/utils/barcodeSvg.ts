/** Minimal Code39 barcode → SVG (uppercase A–Z, 0–9, and - . $ / + % space). */

const CODE39: Record<string, string> = {
  "0": "nnnwwnwnn",
  "1": "wnnwnnnnw",
  "2": "nnwwnnnnw",
  "3": "wnwwnnnnn",
  "4": "nnnwwnnnw",
  "5": "wnnwwnnnn",
  "6": "nnwwwnnnn",
  "7": "nnnwnnwnw",
  "8": "wnnwnnwnn",
  "9": "nnwwnnwnn",
  A: "wnnnnwnnw",
  B: "nnwnnwnnw",
  C: "wnwnnwnnn",
  D: "nnnnwwnnw",
  E: "wnnnwwnnn",
  F: "nnwnwwnnn",
  G: "nnnnnwwnw",
  H: "wnnnnwwnn",
  I: "nnwnnwwnn",
  J: "nnnnwwwnn",
  K: "wnnnnnnww",
  L: "nnwnnnnww",
  M: "wnwnnnnwn",
  N: "nnnnwnnww",
  O: "wnnnwnnwn",
  P: "nnwnwnnwn",
  Q: "nnnnnnwww",
  R: "wnnnnnwwn",
  S: "nnwnnnwwn",
  T: "nnnnwnwwn",
  U: "wwnnnnnnw",
  V: "nwwnnnnnw",
  W: "wwwnnnnnn",
  X: "nwnnwnnnw",
  Y: "wwnnwnnnn",
  Z: "nwwnwnnnn",
  "-": "nwnnnnwnw",
  ".": "wwnnnnwnn",
  " ": "nwwnnnwnn",
  $: "nwnwnwnnn",
  "/": "nwnwnnnwn",
  "+": "nwnnnwnwn",
  "%": "nnnwnwnwn",
  "*": "nwnnwnwnn",
};

export function sanitizeBarcodePayload(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9\-. $/+%]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildItemBarcode(
  warehouseCode: string,
  categoryCode: string,
  serialNumber: string,
): string {
  const wh = sanitizeBarcodePayload(warehouseCode || "WH01").replace(/\s/g, "");
  const cat = sanitizeBarcodePayload(categoryCode || "GEN").replace(/\s/g, "");
  const sn = sanitizeBarcodePayload(serialNumber || "SN00000").replace(/\s/g, "");
  return `${wh}-${cat}-${sn}`;
}

/** Returns an SVG string for a Code39 barcode of `payload`. */
export function code39Svg(
  payload: string,
  options: { height?: number; module?: number; showText?: boolean } = {},
): string {
  const height = options.height ?? 48;
  const module = options.module ?? 1.6;
  const showText = options.showText ?? true;
  const text = sanitizeBarcodePayload(payload);
  if (!text) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="${height}"></svg>`;
  }

  const encoded = `*${text}*`;
  const narrow = module;
  const wide = module * 2.5;
  const gap = module;
  let x = module * 4;
  const bars: string[] = [];

  for (const ch of encoded) {
    const pattern = CODE39[ch];
    if (!pattern) continue;
    for (let i = 0; i < 9; i++) {
      const isBar = i % 2 === 0;
      const w = pattern[i] === "w" ? wide : narrow;
      if (isBar) {
        bars.push(
          `<rect x="${x.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="${height}" fill="#111"/>`,
        );
      }
      x += w;
    }
    x += gap;
  }

  const width = Math.ceil(x + module * 4);
  const textY = height + 14;
  const svgH = showText ? height + 20 : height;
  const label = showText
    ? `<text x="${(width / 2).toFixed(2)}" y="${textY}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="11" fill="#222">${escapeXml(text)}</text>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${svgH}" viewBox="0 0 ${width} ${svgH}">${bars.join("")}${label}</svg>`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

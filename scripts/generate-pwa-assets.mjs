#!/usr/bin/env node
/**
 * Gera ícones e splash do PWA a partir de assets/logo.svg.
 *
 * Outputs (em client/public/):
 *  - icon-192.png       (PWA manifest)
 *  - icon-512.png       (PWA manifest, maskable)
 *  - icon-512-maskable.png (variante com 20% padding pra maskable safe-area)
 *  - apple-touch-icon.png (180×180 pra iOS Safari)
 *  - favicon.png         (64×64)
 *  - favicon-32.png      (32×32)
 *
 * Padrão: ícone verde do logo centralizado em fundo dark #0a0e14, com
 * padding leve (8%) pra não ficar colado nas bordas. Maskable usa 20% pra
 * sobreviver ao corte adaptive do Android.
 *
 * Como rodar:
 *   node scripts/generate-pwa-assets.mjs
 *
 * Quando regenerar:
 *   - Trocou o logo: copia novo SVG pra assets/logo.svg, roda esse script
 *   - Mudou cor de fundo: edita BG_COLOR aqui
 */

import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const LOGO = path.join(ROOT, "assets", "logo.svg");
const OUT = path.join(ROOT, "client", "public");

const BG_COLOR = "#0a0e14"; // mesmo background usado no Capacitor splash

async function loadLogoBuffer() {
  const svg = await readFile(LOGO, "utf-8");
  return Buffer.from(svg);
}

/**
 * Gera um ícone quadrado: fundo sólido + logo centralizado com `paddingPct` de margem.
 *
 * @param {object} opts
 * @param {number} opts.size            tamanho final em px
 * @param {number} opts.paddingPct      0-1, padding da borda (0.08 = 8%)
 * @param {string} opts.outFilename     nome do arquivo de saída
 */
async function generateIcon({ size, paddingPct, outFilename }) {
  const logoSize = Math.round(size * (1 - paddingPct * 2));
  const logoBuffer = await loadLogoBuffer();

  // Renderiza o SVG no tamanho do logo (mantém aspect ratio, alpha preservado)
  const logoPng = await sharp(logoBuffer, { density: 384 })
    .resize(logoSize, logoSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  // Cria canvas com fundo sólido e compõe o logo no centro
  const canvas = sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BG_COLOR,
    },
  });

  const offset = Math.round((size - logoSize) / 2);
  await canvas
    .composite([{ input: logoPng, left: offset, top: offset }])
    .png()
    .toFile(path.join(OUT, outFilename));

  console.log(`✓ ${outFilename} (${size}×${size})`);
}

async function main() {
  await mkdir(OUT, { recursive: true });

  // PWA manifest icons (any purpose) — padding leve
  await generateIcon({ size: 192, paddingPct: 0.1, outFilename: "icon-192.png" });
  await generateIcon({ size: 512, paddingPct: 0.1, outFilename: "icon-512.png" });

  // Maskable icon — Android Adaptive Icon corta 20% da borda. Padding maior
  // garante que o logo não seja cortado no formato circle/rounded square.
  await generateIcon({ size: 512, paddingPct: 0.22, outFilename: "icon-512-maskable.png" });

  // iOS Safari "Add to Home Screen"
  await generateIcon({ size: 180, paddingPct: 0.12, outFilename: "apple-touch-icon.png" });

  // Favicon (browser tab)
  await generateIcon({ size: 64, paddingPct: 0.06, outFilename: "favicon.png" });
  await generateIcon({ size: 32, paddingPct: 0.06, outFilename: "favicon-32.png" });

  console.log("\n✅ PWA assets gerados em client/public/");
  console.log("ℹ  Conferir manifest.webmanifest pra apontar pros ícones certos.");
}

main().catch((err) => {
  console.error("✗ Falha ao gerar assets:", err);
  process.exit(1);
});

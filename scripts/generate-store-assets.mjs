#!/usr/bin/env node
/**
 * generate-store-assets.mjs — gera Feature Graphic + Screenshots mock pra Play Store
 *
 * Output em assets/store/:
 *  - feature-graphic.png         (1024×500) — banner promocional Play Store
 *  - screenshot-1-hero.png       (1080×2400) — tela de boas-vindas com hero text
 *  - screenshot-2-tents.png      — mockup de lista de estufas
 *  - screenshot-3-plant.png      — mockup de detalhe de planta
 *  - screenshot-4-calculator.png — mockup de calculadora técnica
 *  - screenshot-5-stats.png      — mockup de gráficos
 *
 * Estilo: "promotional shots" tipo Notion/Linear — não captura do app real,
 * mas comunica as features bem. Pode trocar depois por captura real quando
 * o app tiver assets estáveis.
 *
 * Como rodar:
 *   node scripts/generate-store-assets.mjs
 *
 * Quando regenerar:
 *   - Trocou tagline / posicionamento
 *   - Trocou as cores da marca
 *   - Quer outras telas no destaque
 */

import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.resolve(ROOT, "..", "assets-store");

// Brand colors (alinhadas com tema dark do app)
const BG = "#0a0e14";
const BG_LIGHT = "#10141c";
const ACCENT = "#4ade80";           // verde da folha
const ACCENT_DIM = "#22c55e";
const TEXT_PRIMARY = "#f8fafc";
const TEXT_SECONDARY = "#94a3b8";
const TEXT_TERTIARY = "#64748b";
const CARD_BG = "#151b25";
const CARD_BORDER = "#1e2430";
const PURPLE = "#a78bfa";
const SKY = "#60a5fa";
const AMBER = "#fbbf24";
const ROSE = "#f87171";

// Logo SVG inline (folha do app)
const LOGO_SVG = `<path fill="${ACCENT}" d="M205.77,38.22s-74.64-4.92-88.51,42.37c0,0-5.13,20.13,3.36,37.15-4.74,6.26-8.1,13.53-10.45,21-1.23-2.49-2.51-4.76-3.84-6.81.5-9.99.37-48.61-31.18-55.62-36.31-8.08-50.3-.5-50.3-.5,0,0-1.76,46.65,29.88,64.17,18.47,10.22,32.89,6.58,41.72,1.77,4.12,7.28,7.77,17.92,8.49,33.08-.03,3,.01,5.65.12,7.8-.03,1.28-.07,2.58-.13,3.92-.06,1.31.27,2.54.87,3.62.91,2.74,3.49,4.66,6.43,4.66.23,0,.48,0,.71-.04,3.73-.39,6.46-3.73,6.07-7.47,0-.1-.2-2.09-.32-5.35.03-2.24-.01-4.37-.1-6.47.1-12.81,1.92-33.25,11.32-47.36,8.72,2.15,40.69,7.64,61.76-20.55,24.59-32.91,14.12-69.35,14.12-69.35h-.01Z"/>`;

// ──────────────────────────────────────────────────────────────────────────
// Feature Graphic (1024×500) — banner Play Store
// ──────────────────────────────────────────────────────────────────────────

function featureGraphicSVG() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">
  <defs>
    <linearGradient id="bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${BG_LIGHT}"/>
      <stop offset="100%" stop-color="${BG}"/>
    </linearGradient>
    <radialGradient id="glow-grad" cx="80%" cy="40%" r="50%">
      <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
    <filter id="logo-glow">
      <feGaussianBlur stdDeviation="6" />
    </filter>
  </defs>

  <!-- Background -->
  <rect width="1024" height="500" fill="url(#bg-grad)"/>
  <rect width="1024" height="500" fill="url(#glow-grad)"/>

  <!-- Diagonal accent line (sutil) -->
  <line x1="0" y1="500" x2="600" y2="0" stroke="${CARD_BORDER}" stroke-width="1" opacity="0.4"/>

  <!-- Logo + nome (lado esquerdo) -->
  <g transform="translate(80, 130)">
    <!-- Logo background glow -->
    <g transform="translate(0, 0)">
      <g transform="scale(0.32)" filter="url(#logo-glow)" opacity="0.6">${LOGO_SVG}</g>
    </g>
    <!-- Logo principal -->
    <g transform="scale(0.32)">${LOGO_SVG}</g>
  </g>

  <!-- Texto principal -->
  <g transform="translate(180, 145)">
    <text x="0" y="0" fill="${TEXT_PRIMARY}" font-family="-apple-system, sans-serif" font-size="68" font-weight="800" letter-spacing="-2">Cultivo</text>
    <text x="0" y="58" fill="${ACCENT}" font-family="-apple-system, sans-serif" font-size="22" font-weight="600" letter-spacing="2" text-transform="uppercase">PAINEL TÉCNICO</text>
  </g>

  <!-- Tagline e features -->
  <g transform="translate(180, 270)">
    <text x="0" y="0" fill="${TEXT_PRIMARY}" font-family="-apple-system, sans-serif" font-size="34" font-weight="700">Jardim indoor, no controle.</text>
    <text x="0" y="48" fill="${TEXT_SECONDARY}" font-family="-apple-system, sans-serif" font-size="20" font-weight="400">Estufas, ciclos, calculadoras e sensores —</text>
    <text x="0" y="76" fill="${TEXT_SECONDARY}" font-family="-apple-system, sans-serif" font-size="20" font-weight="400">tudo num só painel.</text>
  </g>

  <!-- Badges de features (lado direito) -->
  <g transform="translate(700, 100)">
    <!-- pH meter -->
    <g transform="translate(0, 0)">
      <rect width="180" height="60" rx="14" fill="${CARD_BG}" stroke="${CARD_BORDER}" stroke-width="1"/>
      <circle cx="32" cy="30" r="14" fill="${SKY}" opacity="0.2"/>
      <text x="32" y="36" text-anchor="middle" fill="${SKY}" font-size="18" font-weight="700">pH</text>
      <text x="58" y="26" fill="${TEXT_PRIMARY}" font-size="14" font-weight="600">pH meter</text>
      <text x="58" y="42" fill="${TEXT_TERTIARY}" font-size="11">VPD, EC, runoff</text>
    </g>

    <!-- PPFD -->
    <g transform="translate(0, 80)">
      <rect width="180" height="60" rx="14" fill="${CARD_BG}" stroke="${CARD_BORDER}" stroke-width="1"/>
      <circle cx="32" cy="30" r="14" fill="${AMBER}" opacity="0.2"/>
      <text x="32" y="35" text-anchor="middle" fill="${AMBER}" font-size="12" font-weight="700">PPFD</text>
      <text x="58" y="26" fill="${TEXT_PRIMARY}" font-size="14" font-weight="600">Luz técnica</text>
      <text x="58" y="42" fill="${TEXT_TERTIARY}" font-size="11">LUX → PPFD</text>
    </g>

    <!-- Sensores -->
    <g transform="translate(0, 160)">
      <rect width="180" height="60" rx="14" fill="${CARD_BG}" stroke="${CARD_BORDER}" stroke-width="1"/>
      <circle cx="32" cy="30" r="14" fill="${PURPLE}" opacity="0.2"/>
      <text x="32" y="35" text-anchor="middle" fill="${PURPLE}" font-size="14" font-weight="700">📡</text>
      <text x="58" y="26" fill="${TEXT_PRIMARY}" font-size="14" font-weight="600">SmartLife</text>
      <text x="58" y="42" fill="${TEXT_TERTIARY}" font-size="11">Tuya + ESP32</text>
    </g>

    <!-- Ciclos -->
    <g transform="translate(0, 240)">
      <rect width="180" height="60" rx="14" fill="${CARD_BG}" stroke="${CARD_BORDER}" stroke-width="1"/>
      <circle cx="32" cy="30" r="14" fill="${ACCENT}" opacity="0.2"/>
      <text x="32" y="36" text-anchor="middle" fill="${ACCENT}" font-size="18" font-weight="700">🌱</text>
      <text x="58" y="26" fill="${TEXT_PRIMARY}" font-size="14" font-weight="600">Ciclos</text>
      <text x="58" y="42" fill="${TEXT_TERTIARY}" font-size="11">Veg → Flora</text>
    </g>
  </g>
</svg>`;
}

// ──────────────────────────────────────────────────────────────────────────
// Screenshot 1: Hero (boas-vindas + 4 features destacadas)
// ──────────────────────────────────────────────────────────────────────────

function screenshot1HeroSVG() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="2400" viewBox="0 0 1080 2400">
  <defs>
    <linearGradient id="hero-bg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${BG_LIGHT}"/>
      <stop offset="100%" stop-color="${BG}"/>
    </linearGradient>
    <radialGradient id="hero-glow" cx="50%" cy="20%" r="50%">
      <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="1080" height="2400" fill="url(#hero-bg)"/>
  <rect width="1080" height="1600" fill="url(#hero-glow)"/>

  <!-- Logo -->
  <g transform="translate(440, 320)">
    <g transform="scale(0.86)">${LOGO_SVG}</g>
  </g>

  <!-- Title -->
  <text x="540" y="780" text-anchor="middle" fill="${TEXT_PRIMARY}" font-family="-apple-system, sans-serif" font-size="120" font-weight="800" letter-spacing="-3">Cultivo</text>

  <!-- Tagline -->
  <text x="540" y="900" text-anchor="middle" fill="${ACCENT}" font-family="-apple-system, sans-serif" font-size="36" font-weight="600" letter-spacing="6" text-transform="uppercase">PAINEL TÉCNICO</text>

  <!-- Description -->
  <text x="540" y="1020" text-anchor="middle" fill="${TEXT_SECONDARY}" font-family="-apple-system, sans-serif" font-size="42" font-weight="400">Jardim indoor, no controle.</text>
  <text x="540" y="1080" text-anchor="middle" fill="${TEXT_SECONDARY}" font-family="-apple-system, sans-serif" font-size="42" font-weight="400">Sem chute, sem perda.</text>

  <!-- 4 feature cards -->
  <g transform="translate(60, 1280)">
    <!-- Card 1: Estufas -->
    <g transform="translate(0, 0)">
      <rect width="465" height="180" rx="24" fill="${CARD_BG}" stroke="${CARD_BORDER}" stroke-width="2"/>
      <rect x="30" y="30" width="60" height="60" rx="14" fill="${ACCENT}" opacity="0.15"/>
      <text x="60" y="74" text-anchor="middle" font-size="32" fill="${ACCENT}">🏡</text>
      <text x="120" y="64" fill="${TEXT_PRIMARY}" font-size="32" font-weight="700">Estufas</text>
      <text x="120" y="104" fill="${TEXT_SECONDARY}" font-size="22">Ciclos completos</text>
      <text x="120" y="134" fill="${TEXT_SECONDARY}" font-size="22">Veg • Flora • Drying</text>
    </g>
    <!-- Card 2: Plantas -->
    <g transform="translate(495, 0)">
      <rect width="465" height="180" rx="24" fill="${CARD_BG}" stroke="${CARD_BORDER}" stroke-width="2"/>
      <rect x="30" y="30" width="60" height="60" rx="14" fill="${PURPLE}" opacity="0.15"/>
      <text x="60" y="74" text-anchor="middle" font-size="32" fill="${PURPLE}">🌱</text>
      <text x="120" y="64" fill="${TEXT_PRIMARY}" font-size="32" font-weight="700">Plantas</text>
      <text x="120" y="104" fill="${TEXT_SECONDARY}" font-size="22">Fotos + saúde</text>
      <text x="120" y="134" fill="${TEXT_SECONDARY}" font-size="22">Histórico semanal</text>
    </g>
    <!-- Card 3: Calculadoras -->
    <g transform="translate(0, 220)">
      <rect width="465" height="180" rx="24" fill="${CARD_BG}" stroke="${CARD_BORDER}" stroke-width="2"/>
      <rect x="30" y="30" width="60" height="60" rx="14" fill="${SKY}" opacity="0.15"/>
      <text x="60" y="74" text-anchor="middle" font-size="32" fill="${SKY}">🧪</text>
      <text x="120" y="64" fill="${TEXT_PRIMARY}" font-size="32" font-weight="700">Calculadoras</text>
      <text x="120" y="104" fill="${TEXT_SECONDARY}" font-size="22">EC • pH • PPFD</text>
      <text x="120" y="134" fill="${TEXT_SECONDARY}" font-size="22">VPD • NPK • Rega</text>
    </g>
    <!-- Card 4: Sensores -->
    <g transform="translate(495, 220)">
      <rect width="465" height="180" rx="24" fill="${CARD_BG}" stroke="${CARD_BORDER}" stroke-width="2"/>
      <rect x="30" y="30" width="60" height="60" rx="14" fill="${AMBER}" opacity="0.15"/>
      <text x="60" y="74" text-anchor="middle" font-size="32" fill="${AMBER}">📡</text>
      <text x="120" y="64" fill="${TEXT_PRIMARY}" font-size="32" font-weight="700">Sensores</text>
      <text x="120" y="104" fill="${TEXT_SECONDARY}" font-size="22">SmartLife / Tuya</text>
      <text x="120" y="134" fill="${TEXT_SECONDARY}" font-size="22">Leitura automática</text>
    </g>
  </g>

  <!-- CTA dummy -->
  <g transform="translate(60, 1800)">
    <rect width="960" height="120" rx="60" fill="${ACCENT}"/>
    <text x="480" y="80" text-anchor="middle" fill="#000" font-family="-apple-system, sans-serif" font-size="42" font-weight="700">Começar grátis</text>
  </g>

  <!-- Footer -->
  <text x="540" y="2280" text-anchor="middle" fill="${TEXT_TERTIARY}" font-size="26">1 estufa grátis • Sem cartão de crédito</text>
</svg>`;
}

// ──────────────────────────────────────────────────────────────────────────
// Screenshot 2: Lista de Estufas
// ──────────────────────────────────────────────────────────────────────────

function screenshot2TentsSVG() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="2400" viewBox="0 0 1080 2400">
  <rect width="1080" height="2400" fill="${BG}"/>

  <!-- Header -->
  <g transform="translate(60, 120)">
    <text x="0" y="60" fill="${ACCENT}" font-family="-apple-system, sans-serif" font-size="28" font-weight="700" letter-spacing="4" text-transform="uppercase">PAINEL</text>
    <text x="0" y="160" fill="${TEXT_PRIMARY}" font-family="-apple-system, sans-serif" font-size="76" font-weight="800">Suas estufas</text>
    <text x="0" y="230" fill="${TEXT_SECONDARY}" font-family="-apple-system, sans-serif" font-size="32">Acompanhe cada ciclo em tempo real</text>
  </g>

  <!-- Tent card 1 (active) -->
  <g transform="translate(60, 480)">
    <rect width="960" height="320" rx="32" fill="${CARD_BG}" stroke="${ACCENT}" stroke-width="3"/>
    <!-- Status dot -->
    <circle cx="80" cy="80" r="14" fill="${ACCENT}"/>
    <text x="120" y="92" fill="${TEXT_PRIMARY}" font-size="42" font-weight="700">Estufa principal</text>
    <text x="120" y="138" fill="${ACCENT}" font-size="26" font-weight="600">Floração · Semana 4</text>

    <!-- Stats row -->
    <g transform="translate(80, 200)">
      <text x="0" y="0" fill="${TEXT_TERTIARY}" font-size="22">TEMP</text>
      <text x="0" y="48" fill="${TEXT_PRIMARY}" font-size="42" font-weight="700">26°C</text>

      <text x="220" y="0" fill="${TEXT_TERTIARY}" font-size="22">UR</text>
      <text x="220" y="48" fill="${TEXT_PRIMARY}" font-size="42" font-weight="700">58%</text>

      <text x="380" y="0" fill="${TEXT_TERTIARY}" font-size="22">EC</text>
      <text x="380" y="48" fill="${TEXT_PRIMARY}" font-size="42" font-weight="700">1.8</text>

      <text x="540" y="0" fill="${TEXT_TERTIARY}" font-size="22">pH</text>
      <text x="540" y="48" fill="${TEXT_PRIMARY}" font-size="42" font-weight="700">5.9</text>

      <text x="700" y="0" fill="${TEXT_TERTIARY}" font-size="22">PPFD</text>
      <text x="700" y="48" fill="${TEXT_PRIMARY}" font-size="42" font-weight="700">820</text>
    </g>
  </g>

  <!-- Tent card 2 -->
  <g transform="translate(60, 840)">
    <rect width="960" height="220" rx="32" fill="${CARD_BG}" stroke="${CARD_BORDER}" stroke-width="2"/>
    <circle cx="80" cy="80" r="14" fill="${PURPLE}"/>
    <text x="120" y="92" fill="${TEXT_PRIMARY}" font-size="42" font-weight="700">Mãe e clones</text>
    <text x="120" y="138" fill="${PURPLE}" font-size="26" font-weight="600">Clonagem · Semana 2</text>
    <text x="120" y="182" fill="${TEXT_SECONDARY}" font-size="24">12 clones · 3 mães ativas</text>
  </g>

  <!-- Tent card 3 -->
  <g transform="translate(60, 1100)">
    <rect width="960" height="220" rx="32" fill="${CARD_BG}" stroke="${CARD_BORDER}" stroke-width="2"/>
    <circle cx="80" cy="80" r="14" fill="${AMBER}"/>
    <text x="120" y="92" fill="${TEXT_PRIMARY}" font-size="42" font-weight="700">Estufa secagem</text>
    <text x="120" y="138" fill="${AMBER}" font-size="26" font-weight="600">Secagem · Dia 7 de 14</text>
    <text x="120" y="182" fill="${TEXT_SECONDARY}" font-size="24">UR 60% · 18°C constante</text>
  </g>

  <!-- Alerts section -->
  <g transform="translate(60, 1420)">
    <text x="0" y="60" fill="${TEXT_PRIMARY}" font-size="46" font-weight="700">Alertas ativos</text>
  </g>

  <g transform="translate(60, 1520)">
    <rect width="960" height="140" rx="24" fill="${ROSE}" opacity="0.1" stroke="${ROSE}" stroke-width="2"/>
    <text x="40" y="60" fill="${ROSE}" font-size="32">⚠</text>
    <text x="100" y="62" fill="${TEXT_PRIMARY}" font-size="32" font-weight="600">pH abaixo do alvo</text>
    <text x="100" y="106" fill="${TEXT_SECONDARY}" font-size="24">Estufa principal · pH 5.3 (alvo 5.8-6.2)</text>
  </g>

  <g transform="translate(60, 1690)">
    <rect width="960" height="140" rx="24" fill="${AMBER}" opacity="0.1" stroke="${AMBER}" stroke-width="2"/>
    <text x="40" y="60" fill="${AMBER}" font-size="32">!</text>
    <text x="100" y="62" fill="${TEXT_PRIMARY}" font-size="32" font-weight="600">Temperatura no limite</text>
    <text x="100" y="106" fill="${TEXT_SECONDARY}" font-size="24">Estufa principal · 28°C (máx 27°C)</text>
  </g>

  <!-- Title pra screenshot -->
  <text x="540" y="2310" text-anchor="middle" fill="${ACCENT}" font-family="-apple-system, sans-serif" font-size="42" font-weight="700">Múltiplas estufas no mesmo painel</text>
</svg>`;
}

// ──────────────────────────────────────────────────────────────────────────
// Screenshot 3: Detalhe de planta (timeline + saúde)
// ──────────────────────────────────────────────────────────────────────────

function screenshot3PlantSVG() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="2400" viewBox="0 0 1080 2400">
  <rect width="1080" height="2400" fill="${BG}"/>

  <!-- Header -->
  <g transform="translate(60, 120)">
    <text x="0" y="60" fill="${PURPLE}" font-family="-apple-system, sans-serif" font-size="28" font-weight="700" letter-spacing="4" text-transform="uppercase">PLANTA #3</text>
    <text x="0" y="160" fill="${TEXT_PRIMARY}" font-family="-apple-system, sans-serif" font-size="76" font-weight="800">Manjericão Verde</text>
    <text x="0" y="220" fill="${TEXT_SECONDARY}" font-family="-apple-system, sans-serif" font-size="32">Estufa principal · Vegetativa · Sem 3</text>
  </g>

  <!-- Stats grid -->
  <g transform="translate(60, 460)">
    <rect width="465" height="220" rx="24" fill="${CARD_BG}" stroke="${CARD_BORDER}" stroke-width="2"/>
    <text x="40" y="60" fill="${TEXT_TERTIARY}" font-size="24">ALTURA</text>
    <text x="40" y="130" fill="${TEXT_PRIMARY}" font-size="68" font-weight="700">42</text>
    <text x="180" y="130" fill="${TEXT_SECONDARY}" font-size="36">cm</text>
    <text x="40" y="178" fill="${ACCENT}" font-size="22">+5cm vs semana</text>
  </g>

  <g transform="translate(555, 460)">
    <rect width="465" height="220" rx="24" fill="${CARD_BG}" stroke="${CARD_BORDER}" stroke-width="2"/>
    <text x="40" y="60" fill="${TEXT_TERTIARY}" font-size="24">SAÚDE</text>
    <circle cx="80" cy="130" r="32" fill="${ACCENT}" opacity="0.2"/>
    <text x="80" y="142" text-anchor="middle" font-size="36">✓</text>
    <text x="140" y="130" fill="${TEXT_PRIMARY}" font-size="40" font-weight="700">Saudável</text>
    <text x="140" y="180" fill="${TEXT_SECONDARY}" font-size="22">Sem sintomas</text>
  </g>

  <!-- Timeline title -->
  <g transform="translate(60, 750)">
    <text x="0" y="60" fill="${TEXT_PRIMARY}" font-size="46" font-weight="700">Histórico</text>
  </g>

  <!-- Timeline items -->
  <g transform="translate(60, 880)">
    <!-- Item 1: hoje -->
    <circle cx="30" cy="30" r="14" fill="${ACCENT}"/>
    <line x1="30" y1="44" x2="30" y2="200" stroke="${CARD_BORDER}" stroke-width="2"/>
    <text x="80" y="20" fill="${TEXT_PRIMARY}" font-size="30" font-weight="600">Foto adicionada</text>
    <text x="80" y="60" fill="${TEXT_SECONDARY}" font-size="24">Hoje · 14:32</text>
    <rect x="80" y="80" width="200" height="120" rx="16" fill="${ACCENT}" opacity="0.15"/>
    <text x="180" y="150" text-anchor="middle" font-size="48">📸</text>
  </g>

  <g transform="translate(60, 1130)">
    <circle cx="30" cy="30" r="14" fill="${PURPLE}"/>
    <line x1="30" y1="44" x2="30" y2="180" stroke="${CARD_BORDER}" stroke-width="2"/>
    <text x="80" y="20" fill="${TEXT_PRIMARY}" font-size="30" font-weight="600">Treinamento LST</text>
    <text x="80" y="60" fill="${TEXT_SECONDARY}" font-size="24">Ontem · Top-arrear ramo principal</text>
    <text x="80" y="100" fill="${PURPLE}" font-size="22" font-weight="500">+3 nós laterais</text>
  </g>

  <g transform="translate(60, 1330)">
    <circle cx="30" cy="30" r="14" fill="${SKY}"/>
    <line x1="30" y1="44" x2="30" y2="180" stroke="${CARD_BORDER}" stroke-width="2"/>
    <text x="80" y="20" fill="${TEXT_PRIMARY}" font-size="30" font-weight="600">Rega + EC 1.4</text>
    <text x="80" y="60" fill="${TEXT_SECONDARY}" font-size="24">3 dias atrás · 800ml</text>
    <text x="80" y="100" fill="${SKY}" font-size="22" font-weight="500">Runoff 18% · pH 5.9</text>
  </g>

  <g transform="translate(60, 1530)">
    <circle cx="30" cy="30" r="14" fill="${AMBER}"/>
    <text x="80" y="20" fill="${TEXT_PRIMARY}" font-size="30" font-weight="600">Transplante pra vaso 5L</text>
    <text x="80" y="60" fill="${TEXT_SECONDARY}" font-size="24">Semana 1 · Início vegetativo</text>
  </g>

  <!-- Bottom CTA -->
  <g transform="translate(60, 1820)">
    <rect width="960" height="140" rx="24" fill="${CARD_BG}" stroke="${ACCENT}" stroke-width="2"/>
    <text x="40" y="62" fill="${ACCENT}" font-size="28" font-weight="600">CHAT COM IA</text>
    <text x="40" y="106" fill="${TEXT_PRIMARY}" font-size="32" font-weight="500">Pergunte sobre essa planta →</text>
  </g>

  <text x="540" y="2280" text-anchor="middle" fill="${PURPLE}" font-family="-apple-system, sans-serif" font-size="42" font-weight="700">Cada planta com histórico completo</text>
</svg>`;
}

// ──────────────────────────────────────────────────────────────────────────
// Screenshot 4: Calculadora técnica (LUX → PPFD)
// ──────────────────────────────────────────────────────────────────────────

function screenshot4CalculatorSVG() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="2400" viewBox="0 0 1080 2400">
  <rect width="1080" height="2400" fill="${BG}"/>

  <!-- Header -->
  <g transform="translate(60, 120)">
    <text x="0" y="60" fill="${SKY}" font-family="-apple-system, sans-serif" font-size="28" font-weight="700" letter-spacing="4" text-transform="uppercase">CALCULADORA</text>
    <text x="0" y="160" fill="${TEXT_PRIMARY}" font-family="-apple-system, sans-serif" font-size="76" font-weight="800">LUX → PPFD</text>
    <text x="0" y="220" fill="${TEXT_SECONDARY}" font-family="-apple-system, sans-serif" font-size="30">Converta qualquer lux meter</text>
  </g>

  <!-- Input field -->
  <g transform="translate(60, 460)">
    <text x="0" y="40" fill="${TEXT_TERTIARY}" font-size="26" letter-spacing="2" text-transform="uppercase">LEITURA EM LUX</text>
    <rect y="80" width="960" height="180" rx="28" fill="${CARD_BG}" stroke="${SKY}" stroke-width="3"/>
    <text x="480" y="200" text-anchor="middle" fill="${TEXT_PRIMARY}" font-family="-apple-system, sans-serif" font-size="100" font-weight="800">42.500</text>
  </g>

  <!-- Spectrum picker -->
  <g transform="translate(60, 780)">
    <text x="0" y="40" fill="${TEXT_TERTIARY}" font-size="26" letter-spacing="2" text-transform="uppercase">TIPO DE LUZ</text>
    <g transform="translate(0, 80)">
      <!-- Active button -->
      <rect width="300" height="100" rx="22" fill="${SKY}" opacity="0.2" stroke="${SKY}" stroke-width="3"/>
      <text x="150" y="62" text-anchor="middle" fill="${TEXT_PRIMARY}" font-size="30" font-weight="600">Full Spectrum</text>
      <text x="150" y="88" text-anchor="middle" fill="${SKY}" font-size="20">LED branco</text>
    </g>
    <g transform="translate(330, 80)">
      <rect width="300" height="100" rx="22" fill="${CARD_BG}" stroke="${CARD_BORDER}" stroke-width="2"/>
      <text x="150" y="62" text-anchor="middle" fill="${TEXT_SECONDARY}" font-size="30">HPS</text>
    </g>
    <g transform="translate(660, 80)">
      <rect width="300" height="100" rx="22" fill="${CARD_BG}" stroke="${CARD_BORDER}" stroke-width="2"/>
      <text x="150" y="62" text-anchor="middle" fill="${TEXT_SECONDARY}" font-size="30">CMH</text>
    </g>
  </g>

  <!-- Result card -->
  <g transform="translate(60, 1100)">
    <rect width="960" height="380" rx="32" fill="${SKY}" opacity="0.08"/>
    <rect width="960" height="380" rx="32" fill="none" stroke="${SKY}" stroke-width="3"/>
    <text x="40" y="80" fill="${SKY}" font-size="24" letter-spacing="3" text-transform="uppercase">PPFD ESTIMADO</text>
    <text x="40" y="220" fill="${TEXT_PRIMARY}" font-family="-apple-system, sans-serif" font-size="160" font-weight="900">680</text>
    <text x="540" y="220" fill="${SKY}" font-size="50" font-weight="600">µmol/m²/s</text>

    <!-- Recommendation -->
    <rect x="40" y="260" width="880" height="80" rx="16" fill="${ACCENT}" opacity="0.15"/>
    <text x="60" y="312" fill="${ACCENT}" font-size="26" font-weight="600">✓ Ideal pra Vegetativa (500-800)</text>
  </g>

  <!-- Other calcs preview -->
  <g transform="translate(60, 1580)">
    <text x="0" y="50" fill="${TEXT_PRIMARY}" font-size="42" font-weight="700">Outras calculadoras</text>
  </g>

  <g transform="translate(60, 1680)">
    <!-- EC -->
    <g transform="translate(0, 0)">
      <rect width="465" height="160" rx="24" fill="${CARD_BG}" stroke="${CARD_BORDER}" stroke-width="2"/>
      <text x="40" y="60" fill="${SKY}" font-size="42" font-weight="700">EC ↔ PPM</text>
      <text x="40" y="110" fill="${TEXT_SECONDARY}" font-size="24">USA / EU scales</text>
    </g>
    <!-- VPD -->
    <g transform="translate(495, 0)">
      <rect width="465" height="160" rx="24" fill="${CARD_BG}" stroke="${CARD_BORDER}" stroke-width="2"/>
      <text x="40" y="60" fill="${PURPLE}" font-size="42" font-weight="700">VPD</text>
      <text x="40" y="110" fill="${TEXT_SECONDARY}" font-size="24">Por fase + temp</text>
    </g>
    <!-- NPK -->
    <g transform="translate(0, 180)">
      <rect width="465" height="160" rx="24" fill="${CARD_BG}" stroke="${CARD_BORDER}" stroke-width="2"/>
      <text x="40" y="60" fill="${ACCENT}" font-size="42" font-weight="700">Fertilização NPK</text>
      <text x="40" y="110" fill="${TEXT_SECONDARY}" font-size="24">Por receita</text>
    </g>
    <!-- Runoff -->
    <g transform="translate(495, 180)">
      <rect width="465" height="160" rx="24" fill="${CARD_BG}" stroke="${CARD_BORDER}" stroke-width="2"/>
      <text x="40" y="60" fill="${AMBER}" font-size="42" font-weight="700">Runoff</text>
      <text x="40" y="110" fill="${TEXT_SECONDARY}" font-size="24">Volume e %</text>
    </g>
  </g>

  <text x="540" y="2280" text-anchor="middle" fill="${SKY}" font-family="-apple-system, sans-serif" font-size="42" font-weight="700">Calculadoras técnicas precisas</text>
</svg>`;
}

// ──────────────────────────────────────────────────────────────────────────
// Screenshot 5: Gráficos / histórico
// ──────────────────────────────────────────────────────────────────────────

function screenshot5StatsSVG() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="2400" viewBox="0 0 1080 2400">
  <rect width="1080" height="2400" fill="${BG}"/>

  <!-- Header -->
  <g transform="translate(60, 120)">
    <text x="0" y="60" fill="${AMBER}" font-family="-apple-system, sans-serif" font-size="28" font-weight="700" letter-spacing="4" text-transform="uppercase">HISTÓRICO</text>
    <text x="0" y="160" fill="${TEXT_PRIMARY}" font-family="-apple-system, sans-serif" font-size="76" font-weight="800">Gráficos do ciclo</text>
    <text x="0" y="220" fill="${TEXT_SECONDARY}" font-family="-apple-system, sans-serif" font-size="30">Evolução semana a semana</text>
  </g>

  <!-- Temp/RH chart -->
  <g transform="translate(60, 460)">
    <rect width="960" height="500" rx="28" fill="${CARD_BG}" stroke="${CARD_BORDER}" stroke-width="2"/>

    <text x="40" y="64" fill="${TEXT_PRIMARY}" font-size="34" font-weight="700">Temperatura · 7 dias</text>
    <text x="40" y="104" fill="${TEXT_SECONDARY}" font-size="22">AM · Média 24.8°C</text>

    <!-- Y-axis labels -->
    <text x="40" y="200" fill="${TEXT_TERTIARY}" font-size="20">30</text>
    <text x="40" y="280" fill="${TEXT_TERTIARY}" font-size="20">25</text>
    <text x="40" y="360" fill="${TEXT_TERTIARY}" font-size="20">20</text>

    <!-- Grid -->
    <line x1="100" y1="190" x2="920" y2="190" stroke="${CARD_BORDER}" stroke-width="1" opacity="0.5"/>
    <line x1="100" y1="280" x2="920" y2="280" stroke="${CARD_BORDER}" stroke-width="1" opacity="0.5"/>
    <line x1="100" y1="360" x2="920" y2="360" stroke="${CARD_BORDER}" stroke-width="1" opacity="0.5"/>

    <!-- Line chart -->
    <polyline points="100,260 217,250 334,280 451,240 568,220 685,270 802,250 920,240"
      fill="none" stroke="${ROSE}" stroke-width="5"/>

    <!-- Area fill under chart -->
    <polygon points="100,260 217,250 334,280 451,240 568,220 685,270 802,250 920,240 920,440 100,440"
      fill="${ROSE}" opacity="0.15"/>

    <!-- Dots -->
    <circle cx="100" cy="260" r="9" fill="${ROSE}"/>
    <circle cx="217" cy="250" r="9" fill="${ROSE}"/>
    <circle cx="334" cy="280" r="9" fill="${ROSE}"/>
    <circle cx="451" cy="240" r="9" fill="${ROSE}"/>
    <circle cx="568" cy="220" r="9" fill="${ROSE}"/>
    <circle cx="685" cy="270" r="9" fill="${ROSE}"/>
    <circle cx="802" cy="250" r="9" fill="${ROSE}"/>
    <circle cx="920" cy="240" r="9" fill="${ROSE}"/>

    <!-- X-axis -->
    <text x="100" y="475" fill="${TEXT_TERTIARY}" font-size="20" text-anchor="middle">Seg</text>
    <text x="217" y="475" fill="${TEXT_TERTIARY}" font-size="20" text-anchor="middle">Ter</text>
    <text x="334" y="475" fill="${TEXT_TERTIARY}" font-size="20" text-anchor="middle">Qua</text>
    <text x="451" y="475" fill="${TEXT_TERTIARY}" font-size="20" text-anchor="middle">Qui</text>
    <text x="568" y="475" fill="${TEXT_TERTIARY}" font-size="20" text-anchor="middle">Sex</text>
    <text x="685" y="475" fill="${TEXT_TERTIARY}" font-size="20" text-anchor="middle">Sáb</text>
    <text x="802" y="475" fill="${TEXT_TERTIARY}" font-size="20" text-anchor="middle">Dom</text>
    <text x="920" y="475" fill="${TEXT_TERTIARY}" font-size="20" text-anchor="middle">Hoje</text>
  </g>

  <!-- pH chart -->
  <g transform="translate(60, 1000)">
    <rect width="960" height="500" rx="28" fill="${CARD_BG}" stroke="${CARD_BORDER}" stroke-width="2"/>
    <text x="40" y="64" fill="${TEXT_PRIMARY}" font-size="34" font-weight="700">pH · 7 dias</text>
    <text x="40" y="104" fill="${SKY}" font-size="22">Estável · Média 5.9</text>

    <!-- Y labels -->
    <text x="40" y="200" fill="${TEXT_TERTIARY}" font-size="20">6.5</text>
    <text x="40" y="280" fill="${TEXT_TERTIARY}" font-size="20">5.8</text>
    <text x="40" y="360" fill="${TEXT_TERTIARY}" font-size="20">5.0</text>

    <line x1="100" y1="190" x2="920" y2="190" stroke="${CARD_BORDER}" stroke-width="1" opacity="0.5"/>
    <line x1="100" y1="280" x2="920" y2="280" stroke="${CARD_BORDER}" stroke-width="1" opacity="0.5"/>
    <line x1="100" y1="360" x2="920" y2="360" stroke="${CARD_BORDER}" stroke-width="1" opacity="0.5"/>

    <!-- Bars -->
    <rect x="120" y="270" width="100" height="170" rx="6" fill="${SKY}" opacity="0.6"/>
    <rect x="237" y="260" width="100" height="180" rx="6" fill="${SKY}" opacity="0.7"/>
    <rect x="354" y="265" width="100" height="175" rx="6" fill="${SKY}" opacity="0.6"/>
    <rect x="471" y="275" width="100" height="165" rx="6" fill="${SKY}" opacity="0.6"/>
    <rect x="588" y="290" width="100" height="150" rx="6" fill="${SKY}" opacity="0.65"/>
    <rect x="705" y="270" width="100" height="170" rx="6" fill="${SKY}" opacity="0.6"/>
    <rect x="822" y="280" width="100" height="160" rx="6" fill="${SKY}" opacity="0.7"/>
  </g>

  <!-- Summary cards -->
  <g transform="translate(60, 1540)">
    <text x="0" y="50" fill="${TEXT_PRIMARY}" font-size="42" font-weight="700">Resumo da semana</text>
  </g>

  <g transform="translate(60, 1640)">
    <rect width="465" height="180" rx="24" fill="${CARD_BG}" stroke="${CARD_BORDER}" stroke-width="2"/>
    <text x="40" y="60" fill="${TEXT_TERTIARY}" font-size="22" letter-spacing="2" text-transform="uppercase">CRESCIMENTO</text>
    <text x="40" y="124" fill="${ACCENT}" font-size="68" font-weight="700">+12cm</text>
    <text x="40" y="158" fill="${TEXT_SECONDARY}" font-size="22">vs semana anterior</text>
  </g>

  <g transform="translate(555, 1640)">
    <rect width="465" height="180" rx="24" fill="${CARD_BG}" stroke="${CARD_BORDER}" stroke-width="2"/>
    <text x="40" y="60" fill="${TEXT_TERTIARY}" font-size="22" letter-spacing="2" text-transform="uppercase">LOGS</text>
    <text x="40" y="124" fill="${SKY}" font-size="68" font-weight="700">14</text>
    <text x="40" y="158" fill="${TEXT_SECONDARY}" font-size="22">registros · 100%</text>
  </g>

  <!-- Export note -->
  <g transform="translate(60, 1860)">
    <rect width="960" height="120" rx="20" fill="${ACCENT}" opacity="0.1"/>
    <text x="40" y="64" fill="${ACCENT}" font-size="28" font-weight="600">📊 Exportar CSV</text>
    <text x="40" y="100" fill="${TEXT_SECONDARY}" font-size="22">Disponível no Cultivo Pro</text>
  </g>

  <text x="540" y="2280" text-anchor="middle" fill="${AMBER}" font-family="-apple-system, sans-serif" font-size="42" font-weight="700">Dados que importam, visualizados</text>
</svg>`;
}

// ──────────────────────────────────────────────────────────────────────────
// Pipeline
// ──────────────────────────────────────────────────────────────────────────

async function renderSVG(svgString, outFile, width, height) {
  const buffer = Buffer.from(svgString);
  await sharp(buffer, { density: 96 })
    .resize(width, height, { fit: "contain", background: BG })
    .png({ quality: 90, compressionLevel: 9 })
    .toFile(outFile);

  const stat = await sharp(outFile).metadata();
  console.log(`✓ ${path.basename(outFile)} (${stat.width}×${stat.height})`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  // Feature graphic
  await renderSVG(featureGraphicSVG(), path.join(OUT_DIR, "feature-graphic.png"), 1024, 500);

  // Screenshots
  await renderSVG(screenshot1HeroSVG(), path.join(OUT_DIR, "screenshot-1-hero.png"), 1080, 2400);
  await renderSVG(screenshot2TentsSVG(), path.join(OUT_DIR, "screenshot-2-tents.png"), 1080, 2400);
  await renderSVG(screenshot3PlantSVG(), path.join(OUT_DIR, "screenshot-3-plant.png"), 1080, 2400);
  await renderSVG(screenshot4CalculatorSVG(), path.join(OUT_DIR, "screenshot-4-calculator.png"), 1080, 2400);
  await renderSVG(screenshot5StatsSVG(), path.join(OUT_DIR, "screenshot-5-stats.png"), 1080, 2400);

  console.log(`\n✅ Store assets gerados em ${OUT_DIR}`);
  console.log("ℹ  Próximo passo: upload no Play Console > Store presence > Main store listing");
}

main().catch((err) => {
  console.error("✗ Falha ao gerar store assets:", err);
  process.exit(1);
});

# ─── Build stage ───────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

RUN npm install -g pnpm

# Copia manifests e instala — sharp 0.34.5 traz prebuilds para Alpine musl
# via optional deps (@img/sharp-linuxmusl-x64 + @img/sharp-libvips-linuxmusl-x64),
# então pnpm não precisa compilar nada do zero.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# Build da aplicação (db-migrate roda no startup do servidor, sem postbuild)
RUN pnpm exec vite build && \
    pnpm exec esbuild server/_core/index.ts \
      --platform=node \
      --packages=external \
      --bundle \
      --format=esm \
      --outdir=dist


# ─── Runtime stage ─────────────────────────────────────────────────────────
FROM node:22-alpine

WORKDIR /app

# vips: necessário pra sharp processar HEIF/AVIF/SVG (codecs não embutidos no prebuild).
# curl: usado pelo HEALTHCHECK abaixo.
RUN apk add --no-cache curl vips

# Copia node_modules JÁ instalado no builder (com prebuilds musl corretos).
# Evita reinstalar em runtime — antes o "pnpm install --prod" no runtime
# era o que perdia os optional deps de sharp e causava 503.
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/package.json ./

# Roda como usuário não-privilegiado — container compromise ≠ host compromise.
USER node

EXPOSE 3000

# Healthcheck via /health (faz ping no DB internamente)
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]

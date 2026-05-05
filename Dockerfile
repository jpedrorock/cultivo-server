# ─── Build stage ───────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Build deps + libvips para o sharp compilar nativamente em musl (Alpine).
# python3/make/g++ são pré-requisitos do node-gyp quando sharp recompila.
RUN apk add --no-cache \
      vips-dev \
      python3 \
      make \
      g++

RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml ./

# Força sharp a usar a libvips do sistema (musl), não os prebuilds glibc.
ENV SHARP_IGNORE_GLOBAL_LIBVIPS=0
ENV npm_config_build_from_source=true

RUN pnpm install --frozen-lockfile

COPY . .

# Build da aplicação (sem postbuild — db-migrate roda no startup do servidor)
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

# Apenas a runtime libvips (sem -dev / sem build tools) — imagem menor.
# curl: usado pelo HEALTHCHECK abaixo.
# vips: necessário em runtime para sharp processar imagens.
RUN apk add --no-cache curl vips && npm install -g pnpm

# Copia node_modules JÁ COMPILADO do builder — não reinstala em musl runtime,
# evita "Processamento de imagens indisponível" causado por sharp sem nativos.
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/package.json ./
COPY --from=builder --chown=node:node /app/pnpm-lock.yaml ./

# Roda como usuário não-privilegiado — container compromise ≠ host compromise.
USER node

EXPOSE 3000

# Healthcheck via /health (faz ping no DB internamente)
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]

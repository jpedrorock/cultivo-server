# ─── Build stage ───────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# vips no builder também — pra rebuild caso prebuild não bata exatamente
RUN apk add --no-cache vips

RUN npm install -g pnpm

# Copia manifests e instala — sharp 0.34.5 traz prebuilds para Alpine musl
# via optional deps (@img/sharp-linuxmusl-x64 + @img/sharp-libvips-linuxmusl-x64).
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Smoke test 1: sharp tem que carregar AGORA, no builder, com a mesma
# arquitetura que o runtime. Se quebrar aqui, falha o build LOUD em vez de
# silenciosamente rodar com sharpLib=null em produção.
RUN node -e "const s = require('sharp'); console.log('[sharp OK]', s.versions);" \
  || (echo "❌ sharp não carrega. node_modules/@img:" && ls -la node_modules/@img 2>/dev/null && exit 1)

COPY . .

# Build da aplicação (db-migrate roda no startup do servidor, sem postbuild)
RUN pnpm exec vite build && \
    pnpm exec esbuild server/_core/index.ts \
      --platform=node \
      --packages=external \
      --bundle \
      --format=esm \
      --outdir=dist

# Smoke test 2: o vite build TEM que produzir dist/public/index.html.
# Se sumir, healthcheck na produção falha 404 em loop.
RUN test -f dist/public/index.html || (echo "❌ dist/public/index.html não foi gerado pelo vite build" && ls -la dist/ && exit 1)
RUN test -f dist/index.js          || (echo "❌ dist/index.js não foi gerado pelo esbuild" && exit 1)


# ─── Runtime stage ─────────────────────────────────────────────────────────
FROM node:22-alpine

WORKDIR /app

# vips: necessário pra sharp processar HEIF/AVIF/SVG (codecs não embutidos no prebuild).
# curl: usado pelo HEALTHCHECK abaixo + healthcheck do docker-compose.
RUN apk add --no-cache curl vips

# Copia node_modules JÁ instalado no builder (com prebuilds musl corretos).
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/package.json ./

# Smoke test 3: depois do COPY, sharp tem que continuar carregando no runtime.
# Se a copia perdeu a árvore @img/, descobrimos no build, não em produção.
RUN node -e "require('sharp')" \
  || (echo "❌ sharp não carrega no runtime. Verifique COPY de node_modules." && exit 1)

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]

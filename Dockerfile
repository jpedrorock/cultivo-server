# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Pin pnpm 9.x (lockfile e' v9). pnpm 10 introduziu ERR_PNPM_IGNORED_BUILDS
# que bloqueia install em CI sem `pnpm approve-builds` interativo.
RUN npm install -g pnpm@9.15.4

# Copiar arquivos de dependências (cache-buster v2 — força rebuild apos pin)
COPY package.json pnpm-lock.yaml ./

# Instalar dependências
RUN pnpm install --frozen-lockfile

# Copiar código fonte
COPY . .

# Build da aplicação (sem postbuild — db-migrate roda no startup do servidor)
RUN pnpm exec vite build && \
    pnpm exec esbuild server/_core/index.ts \
      --platform=node \
      --packages=external \
      --bundle \
      --format=esm \
      --outdir=dist

# Runtime stage
FROM node:22-alpine

WORKDIR /app

# Instalar pnpm e curl
RUN npm install -g pnpm && apk add --no-cache curl mysql-client

# Copiar apenas arquivos necessários do builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./

# Instalar apenas dependências de produção
RUN pnpm install --frozen-lockfile --prod

# Expor porta
EXPOSE 3000

# Comando para iniciar a aplicação
CMD ["node", "dist/index.js"]

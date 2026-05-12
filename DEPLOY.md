# Deploy — App Cultivo

Cobre o deploy via Docker Compose (recomendado, agnóstico) e dicas específicas para Coolify.

---

## Pré-requisitos

- Docker 24+ e Docker Compose v2
- Domínio com DNS apontando para o servidor
- Reverse proxy com SSL (Caddy, Traefik, ou via Coolify)

---

## Deploy com Docker Compose

### 1. Clonar e configurar

```bash
git clone https://github.com/jpedrorock/cultivo-server.git
cd cultivo-server
cp .env.example .env
```

Edita o `.env`:

```bash
# Database (MySQL embutido sobe junto via docker-compose)
MYSQL_ROOT_PASSWORD=$(openssl rand -hex 16)
MYSQL_PASSWORD=$(openssl rand -hex 16)

# JWT (obrigatório, ≥256 bits)
JWT_SECRET=$(openssl rand -base64 32)

# Domínio público
DOMAIN=app.cultivo.pro

# OAuth (opcional)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Criptografia de API keys (opcional, recomendado)
ENCRYPTION_KEY=$(openssl rand -base64 32)
```

### 2. Subir os containers

```bash
docker compose -f docker-compose.prod.yml up -d
```

Containers:
- `db` — MySQL 8.0 com volume `mysql_data` persistente
- `app` — servidor Node + frontend, volume `uploads_data` para fotos

### 3. Verificar

```bash
docker compose -f docker-compose.prod.yml ps
curl http://localhost:3000/health
# {"status":"ok","uptime":12,"ts":...}
```

### 4. Reverse proxy (HTTPS)

Configura Traefik / Caddy / nginx para apontar `app.cultivo.pro` → `localhost:3000`. Importante:

- O app confia em `X-Forwarded-*` em produção (`trust proxy: 1`).
- O proxy deve forwardar `X-Forwarded-For`, `X-Forwarded-Proto` e `X-Forwarded-Host`.

---

## Deploy com Coolify

1. Em Coolify, **New Resource → Docker Compose**.
2. Cola o repositório Git e escolhe `docker-compose.prod.yml` como arquivo.
3. Em **Environment Variables**, define todas as do `.env` acima.
4. Configura **Domains** (Coolify cuida do SSL via Let's Encrypt).
5. Clica **Deploy**.

Coolify vai detectar pushes no branch `main` e fazer redeploy automático.

---

## Migração de servidor antigo

Para migrar dados de uma instância existente:

### 1. Importar o dump SQL

```bash
# No servidor antigo:
mysqldump -u user -p database > cultivo.sql

# Sobe o cultivo.sql num servidor HTTP qualquer e visita:
https://novo-dominio/admin/import?secret=$JWT_SECRET
# → cola URL do dump → "Importar"
```

### 2. Importar as fotos

As paths no DB ficam tipo `/uploads/plant-photos/<id>-<hash>-image.jpg`.

```bash
# Faz zip da pasta uploads/ no servidor antigo:
zip -r fotos.zip uploads/

# Sobe num servidor HTTP qualquer e visita:
https://novo-dominio/admin/import-photos?secret=$JWT_SECRET
# → cola URL do zip → "Listar conteúdo" para preview → "Baixar e extrair"
```

A rota detecta automaticamente se o zip tem `uploads/` no início e extrai para `/app/uploads/` preservando estrutura.

---

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | ✅ | Connection string MySQL (em docker-compose já é montada) |
| `JWT_SECRET` | ✅ | Secret JWT, mínimo 32 bytes |
| `DOMAIN` | ✅ | Domínio público (sem `https://`) |
| `MYSQL_ROOT_PASSWORD` | ✅ (compose) | Senha root do MySQL |
| `MYSQL_PASSWORD` | ✅ (compose) | Senha do user `cultivo` |
| `NODE_ENV` | ✅ | `production` |
| `PORT` | | Default 3000 |
| `LOG_LEVEL` | | `debug`/`info`/`warn`/`error` (default: info em prod, debug em dev) |
| `ALLOWED_ORIGINS` | | CORS extra, separados por vírgula |
| `GOOGLE_CLIENT_ID` | | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | | Google OAuth |
| `ENCRYPTION_KEY` | | Criptografia AES-256 de API keys de usuário |

---

## Healthcheck

`GET /health` retorna JSON com status, uptime em segundos e timestamp.

Configurado no `docker-compose.prod.yml` para o serviço `app` (`/`) — pode trocar para `/health` se preferir mais explícito.

---

## Backup

### Database

```bash
docker compose -f docker-compose.prod.yml exec db \
  mysqldump -u root -p$MYSQL_ROOT_PASSWORD cultivo > backup-$(date +%Y%m%d).sql
```

### Fotos

```bash
docker run --rm -v cultivo-server_uploads_data:/data -v $(pwd):/backup \
  alpine tar czf /backup/uploads-$(date +%Y%m%d).tar.gz -C /data .
```

---

## Logs

Em produção: JSON estruturado (pino) para `stdout`. Cada request tem `X-Request-Id` no response — facilita debug.

```bash
docker compose -f docker-compose.prod.yml logs -f app | jq .
```

---

## Troubleshooting

**`getaddrinfo ENOTFOUND db`** — o app não consegue resolver o hostname do MySQL. Verifica que o serviço `db` está saudável:
```bash
docker compose -f docker-compose.prod.yml ps
```

**Fotos não aparecem após redeploy** — confirma que o volume `uploads_data` está montado em `/app/uploads`. Sem volume, cada redeploy apaga as fotos.

**Login dá 429** — rate limit (10 tentativas / 15 min por IP). Espera ou ajusta o `loginLimiter` em `server/_core/authRoutes.ts`.

**`Invalid hook call`** após mudar deps — limpa cache do Vite:
```bash
rm -rf node_modules/.vite
```

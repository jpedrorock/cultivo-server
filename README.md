# App Cultivo — Gerenciamento de Estufas

PWA para gerenciar estufas de cultivo indoor: ciclos por estufa, parâmetros ambientais, plantas individuais, calculadoras (VPD, NPK, PPFD, pH) e alertas automáticos quando algo sai do target.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 19, Tailwind CSS 4, shadcn/ui, Vite 7 |
| Backend | Express 4 + tRPC 11 (type-safe end-to-end) |
| Database | MySQL 8.0 via Drizzle ORM |
| Auth | JWT (httpOnly cookie) + argon2id, Google OAuth opcional |
| Storage | Disco local (`/app/uploads`, volume Docker persistente) |
| 3D Editor | Three.js (vanilla, sem react-three-fiber) |
| Logger | pino (JSON em prod, pretty em dev) |
| Deploy | Docker Compose, agnóstico (Coolify, k3s, etc.) |

---

## Começar a desenvolver

```bash
pnpm install
pnpm dev          # servidor em http://localhost:3000
pnpm check        # type-check
pnpm lint         # eslint
pnpm build        # bundle de produção
pnpm test         # vitest
```

Variáveis de ambiente mínimas (`.env`):

```
DATABASE_URL=mysql://user:senha@localhost:3306/cultivo
JWT_SECRET=<openssl rand -base64 32>
DOMAIN=localhost:3000
NODE_ENV=development
```

Opcionais:
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google OAuth
- `ENCRYPTION_KEY` — criptografia de API keys de usuário (AES-256-GCM)
- `LOG_LEVEL` — `debug` | `info` | `warn` | `error`
- `ALLOWED_ORIGINS` — origens CORS extra (separadas por vírgula)

---

## Deploy em produção

Ver [DEPLOY.md](./DEPLOY.md). Resumo:

```bash
docker compose -f docker-compose.prod.yml up -d
```

`docker-compose.prod.yml` inclui MySQL 8.0 com volume persistente, app com volume para uploads, e healthcheck. Rota `/health` exposta para HEALTHCHECK do Docker / readiness do k8s.

---

## Estrutura

```
client/src/         frontend React
  pages/            rotas (PlantDetail, TentDetails, QuickLog, …)
  components/       UI (PlantNodeMap, Plant3DView, BottomNav, …)
  features/         lógica de domínio
  lib/              tRPC client, utils
server/
  _core/            express, auth, vite middleware, logger
  routers.ts        todas as procedures tRPC
  db.ts             conexão drizzle
drizzle/            schema + migrations geradas
docker-compose.prod.yml
Dockerfile
```

---

## Editor visual de plantas

Cada planta tem um editor de estrutura (LST/treinamento) com duas vistas:

- **2D top-down** — SVG, drag de nós, técnicas (topping, FIM, LST, super-crop) via menu
- **3D real** — Three.js, rotação livre, drag de nós no plano da câmera, drag de galhos para curvar, vaso configurável em litros (1L–20L+)

Ambas as vistas compartilham os mesmos dados — edita numa, aparece atualizada na outra.

Atalhos de entrada:
- `BottomNav` → "Treinar planta" → picker com 2D/3D
- Aba "Treino" dentro da planta → botões "Editar 2D" / "Editar 3D"

---

## Rotas de administração

Endpoints protegidos por `?secret=$JWT_SECRET`:

| Rota | Função |
|---|---|
| `GET /admin/import` | UI de importação de dump SQL (`.sql`) |
| `GET /admin/import-photos` | UI de importação de zip de fotos (download remoto) |
| `GET /health` | Healthcheck JSON |

Úteis para migrar de servidor antigo: importa o dump, depois faz upload do zip de fotos via URL pública (não passa pelo browser).

---

## Documentação adicional

- [DEPLOY.md](./DEPLOY.md) — instruções completas de deploy
- [GUIA-USUARIO.md](./GUIA-USUARIO.md) — guia para usuários finais
- [CHANGES.md](./CHANGES.md) — changelog

---

## Licença

MIT

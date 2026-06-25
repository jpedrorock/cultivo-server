# API — Endpoint /api/waitlist

Endpoint de captura de email da lista de espera do Cultivo App.
Implementado em `server/_core/waitlistRoutes.ts`.

## Endpoint

```
POST /api/waitlist
```

## CORS

Aceita requisições das seguintes origens:

| Origem | Tipo |
|--------|------|
| `https://cultivo.pro` | Produção |
| `https://www.cultivo.pro` | Produção (www) |
| `http://localhost:4321` | Dev (Astro default) |
| `http://localhost:3000` | Dev (backup) |

Requisições sem header `Origin` (ex: curl) são aceitas.

## Rate Limit

**5 submits por IP por hora.** Exceder retorna `429` com body:

```json
{ "error": "Too many submissions. Try again in 1 hour." }
```

## Payload

```json
{
  "email": "seu@email.com",
  "locale": "pt",
  "utmSource": "homepage",
  "utmMedium": "organic",
  "utmCampaign": "beta-launch",
  "source": "site"
}
```

| Campo | Tipo | Obrigatório | Notas |
|-------|------|-------------|-------|
| `email` | string | ✅ | Max 200 chars. Validação básica de formato. |
| `locale` | string | Não | `'pt'` ou `'en'`. Default: `'en'`. |
| `utmSource` | string | Não | Max 64 chars. |
| `utmMedium` | string | Não | Max 64 chars. |
| `utmCampaign` | string | Não | Max 64 chars. |
| `source` | string | Não | Origem da inscrição. Default: `'site'`. |

## Resposta de Sucesso

**HTTP 200** — mesmo se email já cadastrado (anti-enumeração):

```json
{
  "success": true,
  "message": "Got it. We'll be in touch when slots open up."
}
```

## Respostas de Erro

| Código | Body | Causa |
|--------|------|-------|
| 400 | `{ "error": "Email required" }` | Campo `email` ausente ou não-string |
| 400 | `{ "error": "Invalid email format" }` | Email com formato inválido |
| 403 | `{ "error": "Origin not allowed" }` | Origin não autorizado |
| 429 | `{ "error": "Too many submissions..." }` | Rate limit excedido |
| 500 | `{ "error": "Internal error..." }` | Erro no DB |

## Efeitos Colaterais

Após INSERT bem-sucedido:
1. **Welcome email (D+0)**: enviado via Resend se `RESEND_API_KEY` configurado.
2. **Nurture D+3 e D+14**: agendados via cron (`server/cron/waitlistNurture.ts`), enviados automaticamente nos dias seguintes.

> O endpoint **sempre retorna 200** mesmo que o email já esteja cadastrado (`INSERT IGNORE`). Isso é intencional para evitar enumeração.

## Ativar o Cron de Nurture

O cron `startWaitlistNurtureCron()` precisa ser chamado no startup do servidor:

```typescript
import { startWaitlistNurtureCron } from './cron/waitlistNurture';

// no startup do servidor (ex: expressApp.ts)
await startWaitlistNurtureCron();
```

## Exemplos

### curl — inscrição PT

```bash
curl -X POST https://app.cultivo.pro/api/waitlist \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://cultivo.pro' \
  -d '{"email":"joao@exemplo.com","locale":"pt","source":"landing"}'
```

### curl — inscrição EN com UTM

```bash
curl -X POST https://app.cultivo.pro/api/waitlist \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "john@example.com",
    "locale": "en",
    "utmSource": "twitter",
    "utmMedium": "social",
    "utmCampaign": "beta-2026"
  }'
```

### JavaScript (fetch)

```javascript
const res = await fetch('https://app.cultivo.pro/api/waitlist', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'user@example.com', locale: 'en' }),
});
const data = await res.json();
// { success: true, message: "Got it. We'll be in touch when slots open up." }
```

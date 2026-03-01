# Guia de Deploy — App Cultivo

Este documento cobre as opções de deploy do App Cultivo, com foco na hospedagem integrada do Manus e instruções para ambientes externos.

---

## Deploy no Manus (Recomendado)

O Manus oferece hospedagem integrada com banco de dados gerenciado, SSL automático, domínio customizado e deploy em um clique. Nenhuma variável de ambiente precisa ser configurada manualmente — todas são injetadas automaticamente pela plataforma.

**Passos para publicar:**

1. No painel do Manus, salve um **Checkpoint** com a versão que deseja publicar.
2. Clique em **Publish** no header do painel de gerenciamento.
3. O app estará disponível em `https://seu-projeto.manus.space` em menos de 2 minutos.

**Domínio customizado:**

Acesse **Settings → Domains** no painel do Manus para:

- Alterar o prefixo do subdomínio automático (`xxx.manus.space`)
- Comprar um novo domínio diretamente na plataforma
- Vincular um domínio existente com instruções de DNS

**Rollback:**

Para reverter para uma versão anterior, acesse a aba de Checkpoints no Management UI, selecione o checkpoint desejado e clique em **Rollback**.

---

## Desenvolvimento Local

### Pré-requisitos

- Node.js 22 ou superior
- pnpm (gerenciador de pacotes)
- Banco de dados MySQL 8+ ou TiDB

### Instalação

```bash
git clone <seu-repositorio>
cd cultivo-architecture-docs
pnpm install
pnpm db:push
pnpm dev
```

O app estará disponível em `http://localhost:3000`.

### Variáveis de Ambiente para Desenvolvimento Local

Crie um arquivo `.env` na raiz do projeto com as seguintes variáveis:

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | String de conexão MySQL: `mysql://user:pass@host:3306/dbname` |
| `JWT_SECRET` | Segredo para cookies de sessão (mínimo 32 caracteres) |
| `VITE_APP_ID` | ID da aplicação Manus OAuth (obtido no painel Manus) |
| `OAUTH_SERVER_URL` | URL do backend Manus OAuth |
| `VITE_OAUTH_PORTAL_URL` | URL do portal de login Manus |
| `BUILT_IN_FORGE_API_KEY` | Token para APIs internas Manus (server-side) |
| `BUILT_IN_FORGE_API_URL` | URL das APIs internas Manus |

Para gerar um `JWT_SECRET` seguro:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Deploy Externo (Railway / Render)

Para deploy em plataformas externas, configure todas as variáveis de ambiente listadas acima no painel da plataforma escolhida. Os comandos de build e start são:

```bash
# Build
pnpm build

# Start (produção)
node dist/index.js
```

**Atenção:** O Manus oferece hospedagem nativa com todas as integrações já configuradas. O deploy externo pode apresentar incompatibilidades com o sistema de autenticação OAuth e as APIs internas da plataforma.

---

## Banco de Dados

O schema é gerenciado via Drizzle ORM. Para aplicar alterações no schema:

```bash
pnpm db:push
```

Este comando executa `drizzle-kit generate` seguido de `drizzle-kit migrate`, aplicando as alterações no banco configurado em `DATABASE_URL`.

---

## Build de Produção

```bash
pnpm build
```

O build gera:

- `dist/` — bundle do servidor Express (ESM)
- `dist/client/` — assets do frontend React (via Vite)

---

## Testes

```bash
pnpm test
```

Os testes cobrem calculadoras de fertilização, rega, runoff e autenticação. Todos os testes devem passar antes de criar um checkpoint para publicação.

---

## Solução de Problemas

**Erro de conexão com banco de dados:** Verifique se `DATABASE_URL` está correto e se o banco permite conexões externas.

**Erro de OAuth redirect:** Verifique se `VITE_OAUTH_PORTAL_URL` está correto e se o domínio de produção está registrado nas configurações OAuth.

**Build falhou:** Teste o build localmente com `pnpm build` e verifique os logs de erro.

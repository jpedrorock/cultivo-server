# STATUS — App Cultivo Routine

## Última execução: 2026-05-29 (routine-cultivo-20260529-1612)

**Modo:** Background / Headless (Routine agendada)
**Branch gerado:** `routine-cultivo-20260529-1612`
**Itens processados:** 0
**Bloqueios encontrados:** 1 (crítico — fila não pôde ser carregada)

---

## Bloqueio crítico: arquivos de orchestração ausentes

Os seguintes arquivos são necessários para o loop de trabalho e não foram encontrados em nenhum local:

| Arquivo | Local esperado | Status |
|---|---|---|
| `CLAUDE.md` | raiz do repo | ❌ Não existe |
| `BACKLOG.md` | raiz do repo | ❌ Não existe |
| `PLAYBOOK.md` | raiz do repo | ❌ Não existe |
| `UI-SHARED-NOTES.md` | raiz do repo | ❌ Não existe |

**Buscas realizadas:**
- Git repo `jpedrorock/cultivo-server` — raiz e `.claude/` — não encontrados
- Google Drive — busca por título e fullText — não encontrados

**Consequência:** Sem BACKLOG.md, a fila de itens está vazia. Nenhum trabalho foi executado. Sem PLAYBOOK.md, regras de prioridade e critérios de pulo não podem ser verificados.

---

## O que João precisa fazer

1. Criar `BACKLOG.md` na raiz com seções `## Próximos`, `## Em progresso`, `## Concluídos recentemente` e `## Bloqueados`.
2. Criar `PLAYBOOK.md` na raiz com as regras de prioridade, critérios de pulo e definição de critério de pronto.
3. Criar `CLAUDE.md` na raiz com o contexto do projeto (stack, convenções, scripts).
4. Criar `UI-SHARED-NOTES.md` na raiz com notas de UI compartilhadas (últimas entradas que a rotina lê).
5. Commitar e fazer push desses arquivos para `main`.
6. Reativar a Routine agendada — na próxima execução ela encontrará os arquivos e processará os itens.

---

## Contexto técnico coletado nesta execução

Para referência ao criar o CLAUDE.md / BACKLOG.md:

- **Stack:** React 19 + Vite 7, Express 4 + tRPC 11, MySQL 8 via Drizzle ORM, JWT auth, Docker Compose
- **Scripts úteis:** `pnpm dev`, `pnpm check`, `pnpm lint`, `pnpm test`, `pnpm build`
- **Branches Claude existentes (não mergeadas):** 30+ branches `claude/*` com features prontas ou em revisão
- **Último commit em main:** `91822cc chore: limpar TODO stale + restaurar compras (backlog: todo-stale)`
- **Padrão de commit:** `<tipo>: <descrição> (backlog: <título>) [routine]`
- **Arquivos protegidos (não tocar):** `.env*`, `drizzle/schema.ts`, `auth*`, `revenuecat.ts`, `capacitor.config.ts`

---

## Próxima execução esperada

Sem ação de João: execução seguinte terá mesmo resultado (bloqueio imediato, 0 itens).
Com arquivos criados: execução seguinte processará itens da seção `## Próximos` do BACKLOG.md.

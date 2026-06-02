# STATUS — App Cultivo (Rotina Automatizada)

> Atualizado por: claude-orchestrator  
> Data: 2026-06-02  
> Branch: routine-cultivo-20260602-0000  
> Modo: headless / background

---

## 🔴 BLOQUEIO CRÍTICO — Scaffolding de rotina ausente

### O que aconteceu

A rotina agendada foi disparada mas os arquivos operacionais obrigatórios **não existem** em nenhum dos repositórios (`cultivo-server` ou `cultivo-site`).

### Arquivos ausentes

| Arquivo | Propósito | Status |
|---------|-----------|--------|
| `CLAUDE.md` | Configuração e contexto do projeto para IAs | ❌ Não existe |
| `STATUS.md` | Este documento — rastreamento de status | ✅ Criado agora |
| `BACKLOG.md` | Fila de trabalho — itens "Próximos" | ❌ Não existe |
| `PLAYBOOK.md` | Regras e protocolo headless | ❌ Não existe |
| `UI-SHARED-NOTES.md` | Notas de coordenação de UI entre sessões | ❌ Não existe |

### Impacto

Sem `BACKLOG.md` → **nenhum item pode ser processado**.  
Sem `PLAYBOOK.md` → o protocolo headless não pode ser verificado.  
Sem `CLAUDE.md` → contexto do projeto não pode ser validado.

### O que a rotina encontrou

- `cultivo-server`: sem CLAUDE.md, STATUS.md, BACKLOG.md, PLAYBOOK.md, UI-SHARED-NOTES.md
- `cultivo-site`: tem `HANDOFF.md` com contexto completo do site, mas não o scaffolding de rotina
- Branches existentes: ~40 branches `claude/*` indicam trabalho ativo em várias frentes

### Ação imediata necessária (para João)

Para que a rotina automatizada funcione, criar estes arquivos em `cultivo-server`:

1. **`CLAUDE.md`** — contexto do projeto, stack, convenções
2. **`BACKLOG.md`** — lista de itens no formato `Próximos / Em progresso / Concluídos recentemente` com critérios de pronto
3. **`PLAYBOOK.md`** — regras de segurança, protocolo headless, critérios de skip
4. **`UI-SHARED-NOTES.md`** — notas de UI compartilhadas entre sessões

### Itens processados esta execução

**0 itens** — bloqueio imediato por ausência de BACKLOG.md.

### Próxima execução

A rotina vai ser bloqueada novamente até que os arquivos acima existam.

---

## 📋 Contexto disponível

O `cultivo-site/HANDOFF.md` existe e contém contexto rico. Resumo:

- **Stack**: Astro, pnpm@9.15.4 (pinado, não mudar)
- **EN é default** (`/`), PT em `/pt/`
- **Deploy**: Coolify, pnpm 9.15.4
- **Pendente principal**: páginas individuais de calculadoras (SEO), blog setup, welcome email via Resend

Para o `cultivo-server`: ver commits recentes no `main`:
- `427d1c1` feat(ux): módulo hero no detalhe da estufa + mono no mobile card do histórico  
- `13fafd6` feat(ux): DNA visual do site nas telas de histórico/gráfico  
- `854c89b` test(aiChat): 9 testes unitários para router aiChat.ts

---

_Este arquivo foi criado automaticamente pela rotina. Após criar BACKLOG.md e PLAYBOOK.md, a próxima execução processará os itens da fila._

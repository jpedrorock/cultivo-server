# STATUS — Cultivo Orchestration

> Gerado por: claude-orchestrator  
> Data: 2026-06-07  
> Modo: background / headless  

---

## ⛔ BLOQUEIO CRÍTICO — Infraestrutura de orquestração ausente

**Execução routine 2026-06-07**: interrompida na etapa 1 (leitura de contexto).

### Arquivos obrigatórios não encontrados no repositório

| Arquivo | Status | Motivo do bloqueio |
|---|---|---|
| `CLAUDE.md` | ❌ Não existe | Sem contexto do projeto para execução segura |
| `BACKLOG.md` | ❌ Não existe | Sem fila de trabalho — nenhum item pôde ser executado |
| `PLAYBOOK.md` | ❌ Não existe | Sem regras operacionais e critérios de pronto |
| `STATUS.md` | ❌ Não existia | Criado agora por esta routine |
| `UI-SHARED-NOTES.md` | ❌ Não existe | Sem notas de UI compartilhada |

### Ações tomadas nesta execução

- [x] Leitura da estrutura do repositório `cultivo-server` (main, SHA `c632e696`)
- [x] Leitura da estrutura do repositório `cultivo-site`
- [x] Verificação do diretório `.claude/`
- [x] Leitura de `esp32-display/STATUS.md` (único STATUS encontrado — subprojeto ESP32)
- [x] Listagem de branches existentes (29 branches `claude/*` encontrados)
- [x] Criação desta branch `routine-cultivo-20260607-init`
- [x] Criação deste `STATUS.md` como registro do bloqueio
- [ ] Itens de BACKLOG executados: **0** (BACKLOG.md ausente)

### Ação necessária de João

Para que as próximas rotinas consigam operar, criar os seguintes arquivos na raiz do repositório:

1. **`CLAUDE.md`** — contexto do projeto: stack, convenções, quais arquivos tocar/evitar, como rodar testes
2. **`BACKLOG.md`** — lista de itens com seções `## Próximos`, `## Em progresso`, `## Concluídos recentemente`, cada item com prioridade (P0/P1/P2), critério de pronto, e flags especiais (`Confirmar antes`, etc.)
3. **`PLAYBOOK.md`** — regras operacionais: critérios de pulo, definição de critério de pronto, protocolo de bloqueio, quem é dono de quais arquivos
4. **`UI-SHARED-NOTES.md`** — notas compartilhadas de UI para coordenação entre agentes

---

## Estado atual do repositório (mapeamento rápido)

### cultivo-server (repositório principal)
- Stack: Node.js / TypeScript / Vite / Drizzle ORM / SQLite
- Capacitor (iOS/Android em `/ios`, `/android`)
- Subprojeto ESP32 em `/esp32-display` — display JC4832W535, firmware PlatformIO
- Branches abertas: 29 branches `claude/*` (várias features em progresso ou aguardando merge)
- Último commit main: `c632e696`

### cultivo-site (repositório secundário)
- Astro.js — site marketing/landing
- Arquivo `HANDOFF.md` presente (contexto de handoff)

### esp32-display — situação (de `esp32-display/STATUS.md`)
- Display JC4832W535 com problema de renderização (faixa de ~32px no topo, resto azul)
- Branch ativa: `claude/esp32-greenhouse-monitor-yoIDp`
- Fase 1 de UI compartilhada concluída; Fase 2 aguarda display funcionar
- Aguarda teste presencial de João com hardware

---

## Próximas execuções

> Quando BACKLOG.md existir com itens em `## Próximos`, a routine retomará normalmente.

---

_Gerado automaticamente — não editar manualmente._

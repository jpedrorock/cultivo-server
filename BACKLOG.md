# BACKLOG.md — App Cultivo

> Gerenciado por João + claude-orchestrator.  
> **P0** = crítico (nunca automático), **P1** = alta prioridade, **P2** = melhoria.
> 
> ⚠️ Itens marcados `[Confirmar antes]` requerem aprovação explícita.  
> ⚠️ Itens sem critério claro são pulados automaticamente.

---

## 🔴 P0 — Críticos / Não automatizar

_Nenhum item P0 no momento._

---

## 🟠 P1 — Alta prioridade

_Aguardando João adicionar itens aqui._

Template de item P1:
```
### [P1] Título do item
- **Critério de pronto**: o que define que está feito
- **Arquivos afetados**: lista de arquivos a tocar
- **Notas**: contexto adicional
```

---

## 🟡 P2 — Melhorias / Itens automáticos

### [P2] Revisar warnings de TypeScript no build
- **Critério de pronto**: `pnpm check` passa sem warnings, sem erros novos
- **Arquivos afetados**: qualquer (exceto proibidos)
- **Notas**: corrigir apenas warnings de tipo — não refatorar lógica

### [P2] Atualizar dependências do Dependabot (patch/minor)
- **Critério de pronto**: dependências atualizadas, `pnpm test` passa
- **Arquivos afetados**: `package.json`, `pnpm-lock.yaml`
- **Notas**: apenas patch/minor — nunca major sem aprovação
- **Tag**: `[Confirmar antes]`

---

## ✅ Concluídos recentemente

_Itens movidos aqui após merge no main._

---

## 🚫 Bloqueios

_Itens que a rotina tentou e não conseguiu executar._

---

## 📝 Como usar este arquivo

1. **João adiciona** itens em P0/P1/P2 com critério de pronto claro
2. **claude-orchestrator** pega de cima pra baixo nos "Próximos" (P2 automáticos)
3. Após conclusão, move pra "Concluídos recentemente"
4. João faz merge da PR routinizada
5. Histórico longo vai pra `docs/internal/todo.md`

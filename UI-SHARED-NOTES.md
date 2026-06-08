# UI-SHARED-NOTES.md — Arquivos de UI em Trabalho Ativo

> Usado pelo claude-orchestrator para evitar conflitos de edição.
> Quando você (João ou outro agente) está trabalhando ativamente em um arquivo UI,
> adicione uma entrada aqui. O orchestrator pula arquivos listados sem autorização.
>
> **Formato:** `YYYY-MM-DD | arquivo | quem está trabalhando | status`

---

## Arquivos Ativamente Modificados

_Nenhum arquivo em trabalho ativo no momento._

<!-- Exemplo de entrada:
2026-06-10 | client/src/components/PlantDetail.tsx | João (sessão manual) | adicionando aba de nutrientes
-->

---

## Regras

1. Adicione entrada antes de iniciar trabalho em arquivo UI compartilhado
2. Remova a entrada quando terminar (ou o PR for mergeado)
3. Entradas com mais de 7 dias sem atualização são consideradas "expiradas" e podem ser ignoradas pelo orchestrator
4. Arquivos **não listados** aqui podem ser editados pelo orchestrator sem pedir autorização

---

## Últimas 5 Entradas (manter histórico aqui)

_Nenhuma entrada ainda._

<!-- Mover entradas concluídas para cá (máximo 5): -->

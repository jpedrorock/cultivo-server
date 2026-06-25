# UI-SHARED-NOTES — Coordenação entre sessões Claude

Este arquivo registra componentes e arquivos de UI que estão sendo modificados por sessões Claude em paralelo ou que requerem coordenação especial.

**Formato de entrada:**
```
[YYYY-MM-DD HH:MM] [sessão/branch] — <arquivo(s)> — <o que está mudando> — <status: em-progresso|concluído|bloqueado>
```

---

## Últimas 5 entradas

_(vazio — primeira execução do orchestrator)_

---

## Arquivos de UI que requerem atenção especial

- `client/src/components/BottomNav.tsx` — navegação mobile principal; mudanças afetam todos
- `client/src/components/Sidebar.tsx` — navegação desktop; mudanças afetam todos
- `client/src/pages/Home.tsx` — página inicial; mudanças visíveis imediatamente
- `client/src/App.tsx` — roteamento global; mudanças afetam toda a navegação

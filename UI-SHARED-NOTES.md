# UI Shared Notes — Coordenação entre sessões Claude

> Notas sobre componentes compartilhados. Atualizar ao modificar componentes usados por múltiplas páginas.

## Última atualização: 2026-06-13

## Componentes compartilhados relevantes

### PageHeader
- `client/src/components/PageHeader.tsx`
- Props: backHref, title, subtitle, rightActions, spacerHeight
- Usado em: Alerts, QuickLog, Tarefas, PlantDetail, etc.

### PageTransition / StaggerList / ListItemAnimation
- `client/src/components/PageTransition.tsx`
- Animações de entrada de página via framer-motion

### EmptyState / ErrorState
- `client/src/components/EmptyState.tsx`, `ErrorState.tsx`
- Estado padrão para listas vazias e erros

### PhotoUploadProgress
- `client/src/components/PhotoUploadProgress.tsx`
- Mostra progresso de upload de foto
- Usa `uploadProgress.isUploading` (não `uploadPhotoMutation.isPending`)

## Notas de sessões anteriores

### 2026-06-13
- QuickLog.tsx: botão salvar corrigido para usar `uploadProgress.isUploading`
- waitlistRoutes.test.ts: adicionado à raiz do server/_core/

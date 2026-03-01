# App Cultivo — Gerenciamento de Estufas

Aplicação web progressiva (PWA) para gerenciamento completo de estufas de cultivo indoor. Controle ciclos, monitore parâmetros ambientais, gerencie plantas individualmente, calcule fertilização e receba alertas automáticos — tudo em uma interface otimizada para iPhone e desktop.

---

## Visão Geral

O App Cultivo foi projetado para quem mantém múltiplas estufas em estágios simultâneos. O fluxo típico envolve uma estufa de manutenção (plantas-mãe e clones), uma estufa vegetativa e uma de floração, com o objetivo de manter produção contínua. Cada estufa possui seu próprio ciclo, semana atual, targets semanais por strain e histórico de parâmetros.

---

## Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| Frontend | React 19 + TypeScript + Tailwind CSS 4 |
| UI Components | shadcn/ui |
| Backend | Express 4 + tRPC 11 |
| Banco de Dados | MySQL / TiDB via Drizzle ORM |
| Autenticação | Manus OAuth (JWT + cookie) |
| Armazenamento de Arquivos | S3 (fotos de plantas) |
| Hospedagem | Manus (recomendado) |

---

## Funcionalidades Principais

**Gerenciamento de Estufas** — Cada estufa tem nome, dimensões, fase atual (Manutenção, Vegetativa, Floração, Secagem) e ciclo ativo. O painel principal exibe parâmetros ambientais da semana (Temperatura, Umidade, PPFD, Fotoperíodo), tarefas pendentes e status do ciclo em tempo real.

**Ciclos de Cultivo** — Ciclos são iniciados por estufa e avançam semana a semana. Cada semana possui targets definidos pela strain selecionada. O sistema registra automaticamente a semana atual e permite transições de fase (Vegetativa → Floração → Colheita → Secagem).

**Gerenciamento de Plantas** — Cada planta tem perfil completo: strain, data de nascimento, estufa atual, fase, fotos (upload via câmera ou galeria, armazenadas em S3 com compressão automática para aspect ratio 3:4), registros de saúde com análise de tricomas e técnicas de LST. O arquivo preserva o histórico de plantas colhidas.

**Registros de Parâmetros** — Registros semanais por estufa incluem Temperatura, Umidade Relativa, PPFD e Fotoperíodo. O histórico é exibido em tabela com filtros. Desvios dos targets da strain geram alertas automáticos.

**Calculadoras** — Rega e Runoff; Fertilização NPK com micronutrientes (Ca, Mg, Fe) e conversão PPM↔EC; Conversor Lux → PPFD; Calculadora de VPD; Calculadora de pH.

**Sistema de Alertas** — Alertas automáticos quando parâmetros registrados desviam dos targets da strain. Histórico de alertas com filtros por tipo e severidade. Configuração de notificações push por navegador.

**Strains e Targets Semanais** — Cadastro de strains com targets semanais de Temperatura, Umidade, PPFD e Fotoperíodo para cada fase do ciclo.

**Tarefas** — Sistema de tarefas semanais por estufa com checklist. Tarefas pendentes são exibidas no painel principal de cada estufa.

**Registro Rápido** — Atalho para registrar parâmetros de múltiplas estufas em uma única tela.

---

## Estrutura de Páginas

| Rota | Página | Descrição |
|---|---|---|
| `/` | Home | Painel principal com todas as estufas |
| `/tent/:id` | TentDetails | Detalhes e histórico de uma estufa |
| `/tent/:id/log` | TentLog | Registrar parâmetros semanais |
| `/plants` | PlantsList | Lista de todas as plantas ativas |
| `/plants/new` | NewPlant | Cadastrar nova planta |
| `/plants/:id` | PlantDetail | Perfil completo de uma planta |
| `/plants/archive` | PlantArchivePage | Arquivo de plantas colhidas |
| `/tarefas` | Tarefas | Gerenciar tarefas semanais |
| `/calculators` | CalculatorMenu | Menu de calculadoras |
| `/nutrients` | Nutrients | Calculadora de fertilização |
| `/history` | HistoryTable | Histórico de registros |
| `/alerts` | Alerts | Central de alertas ativos |
| `/alerts/history` | AlertHistory | Histórico de alertas |
| `/manage-strains` | ManageStrains | Gerenciar strains cadastradas |
| `/strains/:id/targets` | StrainTargets | Targets semanais de uma strain |
| `/quick-log` | QuickLog | Registro rápido multi-estufa |
| `/settings` | Settings | Configurações gerais |
| `/settings/backup` | Backup | Backup e restauração de dados |
| `/settings/notifications` | NotificationSettings | Configurar notificações push |
| `/settings/alerts` | AlertSettings | Configurar alertas automáticos |
| `/help` | Help | Guia do usuário integrado |

---

## Banco de Dados

Schema gerenciado via Drizzle ORM em `drizzle/schema.ts`. Principais tabelas:

| Tabela | Descrição |
|---|---|
| `users` | Usuários com role (admin/user) |
| `tents` | Estufas com dimensões e fase |
| `strains` | Variedades com targets semanais |
| `cycles` | Ciclos de cultivo por estufa |
| `dailyLogs` | Registros de parâmetros (Temp/RH/PPFD) |
| `weeklyTargets` | Targets ideais por strain/fase/semana |
| `plants` | Plantas individuais com perfil completo |
| `plantHealthLogs` | Registros de saúde |
| `plantTrichomeLogs` | Análise de tricomas |
| `plantLSTLogs` | Técnicas de treinamento |
| `plantPhotos` | Fotos armazenadas em S3 |
| `alerts` | Alertas ativos |
| `alertHistory` | Histórico de alertas |
| `nutrientApplications` | Histórico de fertilização |
| `wateringApplications` | Histórico de rega |
| `taskTemplates` | Templates de tarefas |
| `taskInstances` | Instâncias de tarefas semanais |

---

## Início Rápido

```bash
git clone <seu-repositorio>
cd cultivo-architecture-docs
pnpm install
pnpm db:push
pnpm dev
```

O app estará disponível em `http://localhost:3000`.

---

## Deploy no Manus (Recomendado)

1. Salve um checkpoint no painel do Manus
2. Clique em **Publish** no header
3. Configure seu domínio em **Settings → Domains** (opcional)

O app estará disponível em `https://seu-projeto.manus.space` em menos de 2 minutos. Para deploy externo (Railway, Render), consulte o [DEPLOY.md](./DEPLOY.md).

---

## Variáveis de Ambiente

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | String de conexão MySQL/TiDB |
| `JWT_SECRET` | Segredo para assinatura de cookies de sessão |
| `VITE_APP_ID` | ID da aplicação Manus OAuth |
| `OAUTH_SERVER_URL` | URL do backend Manus OAuth |
| `VITE_OAUTH_PORTAL_URL` | URL do portal de login Manus |
| `BUILT_IN_FORGE_API_KEY` | Token para APIs internas Manus (server-side) |
| `BUILT_IN_FORGE_API_URL` | URL das APIs internas Manus |

No Manus, todas as variáveis acima são injetadas automaticamente.

---

## Scripts

```bash
pnpm dev          # Servidor de desenvolvimento
pnpm build        # Build de produção
pnpm test         # Rodar testes Vitest
pnpm db:push      # Gerar e aplicar migrações do banco
pnpm format       # Formatar código com Prettier
```

---

## Documentação

- [DEPLOY.md](./DEPLOY.md) — Guia de deploy e configuração de ambiente
- [GUIA-USUARIO.md](./GUIA-USUARIO.md) — Manual de uso do aplicativo
- [todo.md](./todo.md) — Histórico de funcionalidades implementadas

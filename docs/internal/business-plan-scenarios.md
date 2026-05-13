# Cultivo — Plano de Negócio & Cenários de Crescimento

> Documento estratégico preservando a conversa de planejamento em torno de:
> Tuya pricing, modelos de monetização, trajetória de crescimento, e quando
> cada decisão de infra começa a fazer sentido.
>
> **Última revisão:** 2026-05-13

---

## Contexto

Cultivo é uma plataforma de gestão de cultivo indoor (web + mobile + ESP32 display) que integra com:
- **Tuya/SmartLife** (sensores e atuadores)
- **Câmera Tuya** (HLS streaming na web)
- **ESP32 custom display** (dashboard físico em cada estufa)
- **AI chat** (consultoria de cultivo via GPT/Claude)

Backend roda em VPS via Coolify. Atualmente em uso pessoal, evoluindo pra produto.

---

## A questão Tuya — preço e estratégia

### Os tiers disponíveis

| Tier | Devices controláveis | Custo | Pra quem |
|---|---|---|---|
| **Trial** | 10 | Grátis (6 meses, renovável criando conta nova) | Hobbyista / dev individual |
| **Flagship** | 30.000 | $25.000/ano (~R$125k/ano) | Empresa B2B |
| **Corporate** | 75.000 | provavelmente $50k+/ano | Empresa grande |

**Conclusão**: Tuya não tem plano "small SaaS". Salto direto de grátis pra enterprise.

### Por que NÃO comprar Flagship cedo

Quebra-de-equilíbrio (cobrir só Tuya):

| Preço/user/mês | Users pagantes pra cobrir Tuya | Pra ser sustentável |
|---|---|---|
| R$30 | 350 | 600+ |
| R$50 | 210 | 350+ |
| R$80 | 130 | 220+ |
| R$150 | 70 | 120+ |

**Regra de ouro**: só compra Tuya Flagship com **200+ users pagantes confirmados** + crescimento previsível pra 500+.

### Estratégias alternativas (em ordem de preferência)

#### 1. BYO Credentials (Bring Your Own) — modelo atual

Cada user cadastra suas credenciais Tuya (`accessId/accessSecret/datacenter`) na própria Settings. Cada um usa **seu próprio trial** Tuya (10 devices grátis).

- **Custo Tuya pra Cultivo**: R$0
- **Friction pro user**: 5-10min de setup uma vez (criar conta Tuya → projeto Cloud → linkar SmartLife → copiar credenciais)
- **Mitigação**: vídeo de 2min no onboarding + UI de feedback de erro

**Esse é o modelo recomendado até 1000+ users**.

#### 2. Cultivo Box (hardware companion premium)

Vender **Raspberry Pi Zero 2 W** pré-configurado com Home Assistant + LocalTuya + agente Cultivo. User liga em casa → app reconhece via Tailscale.

- **Custo de produção**: ~R$370 (Pi + cartão SD + fonte + case)
- **Preço sugerido**: R$700-900
- **Margem**: R$330-530 por unidade
- **Bonus mensal**: R$30-50 de assinatura premium ("Cultivo Pro com box local")
- **Vantagens**:
  - 100% local, zero dependência de Tuya cloud
  - Funciona offline
  - Mais lucrativo que SaaS puro
  - User não precisa cadastrar credenciais Tuya
  - Modelo Hubitat / Home Assistant Yellow

**Lança quando**: 50-100 users pagantes confirmados na fase 1.

#### 3. Tuya OAuth (Login with SmartLife)

User loga direto na conta SmartLife sem copiar credenciais. **Mas:**
- Precisa registrar como Service Provider na Tuya (formulário, leva 1-3 semanas)
- API calls de TODOS os users vão pro **teu** projeto único → precisa de plano pago
- Esbarra no Flagship $25k/ano

**Não recomendo** pra MVP. Faz sentido só com 500+ users pagantes provados.

#### 4. Multi-platform (suporta vários ecossistemas)

Expandir além do Tuya:
- **Shelly** (API local nativa)
- **Sonoff/eWeLink** (API local)
- **Govee** (sensores baratos)
- **MQTT genérico** (ESP32 caseiro)

**Vantagem**: posiciona Cultivo como agnóstico.
**Desvantagem**: mais integradores pra manter.

**Considerar**: fase 3, quando produto estiver maduro.

---

## Modelo de monetização

### Pricing target

**$10 USD/mês (~R$50)** — sweet spot pra app de cultivo hobbyista. Posicionamento:

| Concorrente | Preço/mês | Foco |
|---|---|---|
| Trym / Aroya | $200+ | Operação comercial grande |
| Pulse Pro | $15-30 | Hobbyista pro |
| GrowFlux | $20-50 | Médio porte |
| Strainprint | $5-15 | Hobbyista casual |
| **Cultivo** | **$10** | Hobbyista sério → semi-pro |

**$10 é competitivo**, não desvaloriza, não afasta hobbyista.

### Tiers sugeridos

| Tier | Preço | Inclui |
|---|---|---|
| **Free** | R$0 | Limitado: 1 estufa, 1 ciclo, sem AI, sem ESP32 |
| **Basic** | R$30/mês | 3 estufas, AI chat, sem hardware |
| **Pro** | R$50/mês | Estufas ilimitadas + ESP32 display + suporte |
| **Pro + Box** | R$50/mês + R$700 hardware | Pro + Cultivo Box (local, sem Tuya cloud) |

**Cobra desde dia 1** — sem "free pra sempre". Aprende a vender desde o início.

### Matemática a 1000 users × $10/mês

**Receita**:
- $10.000/mês = $120.000/ano (~R$600k/ano)

**Custos estimados** (assumindo BYO continua):

| Item | $/mês |
|---|---|
| VPS escalado | 50-100 |
| Storage S3 (fotos plantas, ~5GB/user) | 300-500 |
| Bandwidth | 200-300 |
| Email (Mailgun/Resend) | 50-100 |
| Payment processor (~4%) | 400 |
| AI API (chat IA) | 200-500 |
| **Total fixo** | **~$1.500-2.000/mês** |

**Margem operacional**: ~$8k/mês (~R$40k/mês líquido)

Salário decente + reserva pra reinvestir.

> Se for via OAuth (Caminho B), adicionar Tuya Flagship: $2.083/mês.
> Margem cai pra ~$6k/mês. Continua bom mas BYO ainda vence em margem.

---

## Trajetória sugerida

```
┌─────────────┬──────────────┬─────────────────────┬──────────────┐
│ Fase        │ Users        │ Foco                │ Tuya         │
├─────────────┼──────────────┼─────────────────────┼──────────────┤
│ Mês 0-6     │ 5-10 betas   │ Polir produto       │ BYO          │
│ Mês 6-12    │ 30-100 pago  │ Conteúdo+comunidade │ BYO          │
│ Ano 1-2     │ 100-500      │ Mkt pago+parcerias  │ BYO          │
│ Ano 2-3     │ 500-1000     │ Otimização+features │ BYO ou OAuth │
│ Ano 3+      │ 1000+        │ Escala              │ Decide A vs B│
└─────────────┴──────────────┴─────────────────────┴──────────────┘
```

### Marcos críticos

- **10 users beta**: validar core features
- **30 users pagantes**: validar disposição a pagar (~R$1.500/mês)
- **100 users pagantes**: validar funil de vendas (~R$5k/mês)
- **500 users pagantes**: produto-market fit (~R$25k/mês)
- **1000+ users pagantes**: escala, considerar contratar suporte (~R$50k/mês)

---

## Recomendações estratégicas

### 1. Marketing começa AGORA, não quando produto estiver "pronto"

Conteúdo é a maior alavanca. Investe em:
- **Instagram**: posts diários de cultivo (próprio + features do app)
- **YouTube**: vídeos técnicos (setup, troubleshooting, growing tips)
- **Comunidade**: grupo Discord/Telegram pra users
- **SEO**: artigos sobre cultivo + integração Tuya

Funil real: 30k visitantes/mês → ~500-1000 pagantes. Leva 2-5 anos de consistência.

### 2. Cobra desde dia 1

Sem "free pra sempre". Desconto founding member pros primeiros 20 users (R$15/mês locked-in pra sempre) cria word-of-mouth.

### 3. Foca em retention obsessivamente

1000 users que cancelam em 2 meses = 0. Métricas críticas:
- **Churn mensal**: < 5% é bom, < 3% é excelente
- **MRR (receita recorrente)**: cresce mês a mês?
- **Time to value**: quanto tempo até o user achar útil? Idealmente < 1 dia

### 4. Cultivo Box como diferencial competitivo

Modelo híbrido (SaaS + hardware) tem **margem superior** ao SaaS puro pra app de cultivo. Vale lançar quando 50+ users provarem que pagam.

### 5. Documenta tudo em vídeo

Onboarding, growing tips, troubleshoot. Vira:
- Marketing (atrai users)
- Suporte automatizado (reduz tickets)
- Conteúdo SEO

### 6. NÃO compra Tuya até 200+ users pagantes

Repetir até decorar.

---

## Riscos & mitigação

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Tuya muda pricing/regras | Média | Alto | Cultivo Box + multi-platform |
| Demanda menor que esperado | Média | Alto | Validar cedo, ajustar pricing |
| Custo VPS escala muito | Baixa | Médio | Otimizar queries, cache agressivo |
| Burnout de fundador solo | Alta | Crítico | Deadline realista, pausa real |
| Concorrente grande copia | Baixa | Médio | Velocidade + comunidade |
| Regulação muda (cannabis BR) | Alta | Variável | Posicionar como "indoor plants" genérico |

---

## Próximos passos imediatos

Independente da fase, próximas 4-8 semanas:

- [ ] **Onboarding Tuya bem polido**: vídeo 2min + UI de feedback de erro
- [ ] **Landing page** com pricing claro
- [ ] **Lançar beta** com 5-10 amigos cultivadores
- [ ] **Setup Stripe** ou Pagar.me pra cobrança
- [ ] **Começar conteúdo Instagram** (1 post/dia, mesmo que simples)
- [ ] **Documentar features principais** em vídeo

---

## Apêndice — Decisões a revisitar

Marcadores pra reabrir essa discussão:

- **2026-08-13**: Trial Tuya atual expira. Decidir: criar conta nova OU iniciar Cultivo Box.
- **Quando atingir 50 users pagantes**: avaliar lançar Cultivo Box.
- **Quando atingir 200 users pagantes**: revisitar Tuya Flagship vs híbrido.
- **Quando ver churn > 5%/mês**: parar tudo, investigar e corrigir antes de escalar.

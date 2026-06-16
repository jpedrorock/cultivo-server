# Pesquisa: Cultivo Orgânico vs Mineral

> **Decisão de produto (João, 2026-06-01)**: o app suporta apenas cultivo **mineral** hoje.
> O wizard de onboarding pergunta o tipo mas ignora a resposta (UX research only).
> Quando o épico orgânico for implementado, este documento serve de base.

---

## Diferenças fundamentais

| Aspecto | Mineral | Orgânico |
|---|---|---|
| Fertilizantes | Sais solúveis (nitrato de K, nitrato de Ca, MKP, etc.) | Compostos orgânicos (húmus, esterco, farinha de peixe) |
| Mensuração | EC/PPM direto — o que você coloca é o que a planta vê | EC não é confiável — nutrientes são liberados por microrganismos |
| pH | Controle crítico: 5.8–6.2 (coco), 5.5–6.5 (hydro) | Mais tolerante: 6.0–7.0 (solo vivo tem buffer natural) |
| Schedule | Semana a semana por EC target | Menos intervenção — o solo faz o trabalho |
| Flush | Necessário antes da colheita (remove resíduos de sais) | Discutível — muitos cultivadores orgânicos não fazem flush |
| Curva de aprendizado | Mais técnico, mais controle, erros visíveis rápido | Mais tolerante a erros, mais difícil de corrigir desvios rápido |

---

## O que muda no app para suportar orgânico

### Schema (drizzle/schema.ts)

Adicionar campo `cultivationType: enum("MINERAL", "ORGANIC")` nas tabelas:
- `tents` — tipo de cultivo por estufa
- `cycles` — pode mudar por ciclo
- `users` — preferência padrão

### Calculadoras

| Calculadora atual | Impacto orgânico |
|---|---|
| Fertilização (EC/NPK) | Irrelevante para orgânico — substituir por "Alimentação de Solo" |
| Runoff | Relevante — mas critérios diferentes (org: 5-10% runoff é suficiente) |
| VPD | Idêntico — temperatura/umidade são independentes do tipo |
| pH | Faixa diferente: 6.0–7.0 ao invés de 5.8–6.2 |
| PPFD | Idêntico |

### Alertas inteligentes

Targets semanais (`weeklyTargets`) assumem mineral. Para orgânico:
- pH target: 6.5 (não 5.9)
- EC: não monitorar (N/A)
- Margens de pH maiores (±0.5 ao invés de ±0.2)

### Receitas de nutrientes

O sistema de receitas (`recipeTemplates`) é todo baseado em sais minerais (Nitrato de Cálcio, MKP, etc.). Para orgânico, o sistema seria completamente diferente:
- "Super soil" recipe com componentes sólidos (em % volume, não g/L)
- "Top dressing" schedule (aplicação mensal de materiais orgânicos)
- Sem EC target, sem pH down/up

---

## Strains famosas para cultivo orgânico

Qualquer strain funciona em orgânico. Algumas são mais valorizadas por "flavor" no mercado orgânico:
- Sour Diesel, OG Kush, Zkittlez (terpenos complexos que "brilham" em org)
- Haze e Amnesia (longa floração — o solo vivo tem tempo de amadurecer)

---

## Referências

- [Cannatopia — Organic vs Mineral](https://cannatopia.com/organic-vs-mineral/)
- [Jorge Cervantes, Marijuana Horticulture, Cap. 18 — Organic Gardens]
- [BuildASoil YouTube — Super Soil recipes]
- [Miglio, "Nutrição Mineral de Plantas", 2007]

---

## Épico futuro: O que implementar

Quando João decidir avançar com orgânico:

1. **E1**: Adicionar campo `cultivationType` no schema (migração necessária)
2. **E2**: Wizard detecta o tipo e salva — impacta criação de estufa
3. **E3**: Calculadora de Fertilização mostra modo "Orgânico" (alimentação de solo)
4. **E4**: Targets semanais têm versão orgânica (pH range diferente)
5. **E5**: Receitas orgânicas (top dressing schedule, lista de componentes sólidos)
6. **E6**: Alertas inteligentes com EC "N/A" em modo orgânico

/**
 * Help / Guia do Cultivo
 *
 * Refatorado: antes era acordeon FAQ de 28 seções (824 linhas), agora é um
 * hub visual com 8 categorias que abrem em páginas focadas com passos
 * numerados + screenshots + dicas + links relacionados.
 *
 * Arquitetura:
 *   - /help          → hub (hero + grid de categorias + vídeos)
 *   - /help/:section → detalhe de uma categoria (passo a passo visual)
 *
 * As 8 categorias são definidas em CATEGORIES no topo do arquivo. Pra
 * adicionar nova: append no array + adicionar entry em CATEGORY_CONTENT.
 *
 * Screenshots são placeholders <ImagePlaceholder/> com tamanho e descrição.
 * Quando o user mandar as imagens, substitui por <img src=...>.
 */
import { useRoute, Link, useLocation } from "wouter";
import { useEffect, useRef } from "react";
import { PageTransition } from "@/components/PageTransition";
import { PageHeader } from "@/components/PageHeader";
import {
  Sprout, Heart, Scissors, Wifi, BarChart3, CheckSquare,
  Wrench, Rocket, ChevronRight, ArrowLeft, Image as ImageIcon,
  Zap, AlertTriangle, Info, Play, Clock,
} from "lucide-react";

// ─── Configuração das 8 categorias ────────────────────────────────────────────

type CategoryColor = {
  /** Gradiente do ícone (Tailwind classes) */
  iconBg: string;
  /** Glow do fundo do card no hub (RGBA) */
  glow: string;
  /** Border do card */
  border: string;
  /** Cor de accent pro acento de "passo numerado" e detalhes */
  accent: string;
};

interface Category {
  id: string;
  icon: React.ElementType;
  title: string;
  subtitle: string;
  estimatedMin: number;
  color: CategoryColor;
}

const CATEGORIES: Category[] = [
  {
    id: "setup",
    icon: Rocket,
    title: "Primeiros passos",
    subtitle: "Configure a primeira estufa e ciclo em 5 minutos",
    estimatedMin: 5,
    color: {
      iconBg: "bg-gradient-to-br from-emerald-400 to-emerald-600",
      glow: "rgba(16,185,129,0.12)",
      border: "border-emerald-500/30",
      accent: "emerald",
    },
  },
  {
    id: "plantas",
    icon: Sprout,
    title: "Plantas & ciclos",
    subtitle: "Cadastre plantas, inicie ciclos e avance fases",
    estimatedMin: 4,
    color: {
      iconBg: "bg-gradient-to-br from-green-400 to-green-600",
      glow: "rgba(34,197,94,0.10)",
      border: "border-green-500/25",
      accent: "green",
    },
  },
  {
    id: "saude",
    icon: Heart,
    title: "Saúde & fotos",
    subtitle: "Registros de saúde, galeria e análise de tricomas",
    estimatedMin: 3,
    color: {
      iconBg: "bg-gradient-to-br from-rose-400 to-rose-600",
      glow: "rgba(244,63,94,0.10)",
      border: "border-rose-500/25",
      accent: "rose",
    },
  },
  {
    id: "lst",
    icon: Scissors,
    title: "Treinamento (LST)",
    subtitle: "Técnicas de manipulação: topping, fim, supercropping",
    estimatedMin: 5,
    color: {
      iconBg: "bg-gradient-to-br from-amber-400 to-amber-600",
      glow: "rgba(245,158,11,0.10)",
      border: "border-amber-500/25",
      accent: "amber",
    },
  },
  {
    id: "smartlife",
    icon: Wifi,
    title: "SmartLife & sensores",
    subtitle: "Tuya, sensores ambientais e display ESP32",
    estimatedMin: 8,
    color: {
      iconBg: "bg-gradient-to-br from-sky-400 to-sky-600",
      glow: "rgba(14,165,233,0.10)",
      border: "border-sky-500/25",
      accent: "sky",
    },
  },
  {
    id: "historico",
    icon: BarChart3,
    title: "Histórico & alertas",
    subtitle: "Gráficos, alertas inteligentes, targets semanais, arquivo",
    estimatedMin: 4,
    color: {
      iconBg: "bg-gradient-to-br from-indigo-400 to-indigo-600",
      glow: "rgba(99,102,241,0.10)",
      border: "border-indigo-500/25",
      accent: "indigo",
    },
  },
  {
    id: "tarefas",
    icon: CheckSquare,
    title: "Tarefas semanais",
    subtitle: "Gere checklist automático por fase do ciclo",
    estimatedMin: 2,
    color: {
      iconBg: "bg-gradient-to-br from-violet-400 to-violet-600",
      glow: "rgba(139,92,246,0.10)",
      border: "border-violet-500/25",
      accent: "violet",
    },
  },
  {
    id: "ferramentas",
    icon: Wrench,
    title: "Ferramentas",
    subtitle: "Calculadoras, backup, configurações, dicas mobile",
    estimatedMin: 3,
    color: {
      iconBg: "bg-gradient-to-br from-slate-400 to-slate-600",
      glow: "rgba(100,116,139,0.10)",
      border: "border-slate-500/25",
      accent: "slate",
    },
  },
];

// ─── Vídeos rápidos (placeholders por enquanto) ───────────────────────────────

interface VideoCard {
  title: string;
  durationLabel: string;
  description: string;
}

const VIDEOS: VideoCard[] = [
  { title: "Setup inicial", durationLabel: "1min", description: "Primeira estufa do zero" },
  { title: "Conectar SmartLife", durationLabel: "2min", description: "Tuya + sensores em casa" },
  { title: "Registro de saúde", durationLabel: "30s", description: "Foto + status + sintomas" },
];

// ─── UI primitives ────────────────────────────────────────────────────────────

/**
 * Placeholder de imagem. Mostra um retângulo com borda tracejada e o tamanho
 * sugerido. Quando user fornecer screenshot, basta passar `imageSrc` no <Step/>
 * que ele renderiza <img> automaticamente em vez do placeholder.
 */
function ImagePlaceholder({
  width,
  height,
  caption,
}: {
  width: number;
  height: number;
  caption: string;
}) {
  return (
    <div
      className="w-full rounded-xl border-2 border-dashed border-border/40 bg-muted/20 flex flex-col items-center justify-center text-center px-4 py-6 gap-2"
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      <ImageIcon className="w-6 h-6 text-muted-foreground/40" />
      <div className="text-xs uppercase tracking-wider text-muted-foreground/50 font-mono">
        {width} × {height}
      </div>
      <div className="text-xs text-muted-foreground/70 max-w-[80%]">{caption}</div>
    </div>
  );
}

function Step({
  n,
  title,
  description,
  imageWidth = 1200,
  imageHeight = 700,
  imageCaption,
  imageSrc,
  imageAlt,
  accent,
}: {
  n: number;
  title: string;
  description: React.ReactNode;
  imageWidth?: number;
  imageHeight?: number;
  /** Texto descritivo da imagem (renderiza placeholder se imageSrc não vier) */
  imageCaption?: string;
  /** URL da screenshot real. Quando passada, renderiza <img> em vez do placeholder. */
  imageSrc?: string;
  /** Alt text da <img>. Se omitido, usa imageCaption. */
  imageAlt?: string;
  accent: string;
}) {
  return (
    <div className="relative pl-12 pb-8 last:pb-0">
      {/* Linha vertical conectando os passos */}
      <div className="absolute left-[15px] top-9 bottom-0 w-px bg-border/30" aria-hidden />
      {/* Número do passo */}
      <div
        className={`absolute left-0 top-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white bg-${accent}-500 shadow-md`}
      >
        {n}
      </div>
      <h3 className="text-base font-semibold text-foreground mb-1.5 leading-snug">{title}</h3>
      <div className="text-sm text-muted-foreground leading-relaxed space-y-2 mb-3">{description}</div>
      {imageSrc ? (
        <img
          src={imageSrc}
          alt={imageAlt ?? imageCaption ?? ""}
          loading="lazy"
          className="w-full rounded-xl border border-border/30"
          style={{ aspectRatio: `${imageWidth} / ${imageHeight}` }}
        />
      ) : imageCaption ? (
        <ImagePlaceholder width={imageWidth} height={imageHeight} caption={imageCaption} />
      ) : null}
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-primary/8 border border-primary/20 px-3.5 py-3">
      <Zap className="w-4 h-4 text-primary shrink-0 mt-0.5" />
      <div className="text-sm text-foreground/90 leading-relaxed">{children}</div>
    </div>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 px-3.5 py-3">
      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
      <div className="text-sm text-amber-100/90 leading-relaxed">{children}</div>
    </div>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-sky-500/8 border border-sky-500/25 px-3.5 py-3">
      <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
      <div className="text-sm text-foreground/90 leading-relaxed">{children}</div>
    </div>
  );
}

// ─── Hub view ─────────────────────────────────────────────────────────────────

function HubView() {
  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="relative rounded-2xl overflow-hidden border border-primary/20 bg-gradient-to-br from-primary/10 via-emerald-500/5 to-transparent p-6 sm:p-8">
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-primary/10 blur-3xl rounded-full pointer-events-none" />
        <div className="relative">
          <p className="text-xs uppercase tracking-[0.2em] text-primary/70 font-semibold mb-2">
            Guia do Cultivo
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2 leading-tight">
            Tudo que você precisa pra<br className="hidden sm:inline" /> dominar o app
          </h1>
          <p className="text-sm text-muted-foreground mb-5 max-w-xl">
            Setup rápido, registros, sensores e análise. Passo a passo com imagens — sem enrolação.
          </p>

          {/* CTA principal */}
          <Link
            href="/help/setup"
            className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-5 py-3 text-sm font-semibold shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-[0.99] transition-all"
          >
            <Rocket className="w-4 h-4" />
            Começar do zero em 5 minutos
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Grid de categorias */}
      <section>
        <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground/60 font-semibold mb-3 px-1">
          Explorar por tópico
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            return (
              <Link
                key={cat.id}
                href={`/help/${cat.id}`}
                className={`group rounded-2xl border ${cat.color.border} p-4 active:scale-[0.98] hover:scale-[1.02] transition-all duration-200`}
                style={{
                  background: `linear-gradient(160deg, ${cat.color.glow} 0%, var(--card) 70%)`,
                }}
              >
                <div className="flex flex-col gap-3 h-full">
                  <div
                    className={`w-10 h-10 rounded-xl ${cat.color.iconBg} flex items-center justify-center shadow-sm`}
                  >
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-h-0">
                    <h3 className="text-sm font-semibold text-foreground leading-snug mb-1">
                      {cat.title}
                    </h3>
                    <p className="text-xs text-muted-foreground/80 leading-relaxed line-clamp-2">
                      {cat.subtitle}
                    </p>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground/60">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {cat.estimatedMin} min
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Vídeos */}
      <section>
        <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground/60 font-semibold mb-3 px-1">
          Vídeos rápidos
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {VIDEOS.map((v) => (
            <div
              key={v.title}
              className="rounded-2xl border border-border/30 bg-card p-4 flex flex-col gap-2 hover:border-border/50 transition-colors cursor-not-allowed opacity-70"
              title="Vídeos em breve"
            >
              <div className="aspect-video rounded-xl bg-muted/30 border border-dashed border-border/40 flex flex-col items-center justify-center text-muted-foreground/50 gap-1">
                <Play className="w-6 h-6" />
                <span className="text-xs font-mono">Em breve</span>
              </div>
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  {v.title}
                  <span className="text-xs text-muted-foreground/60 bg-muted/30 px-1.5 py-0.5 rounded">
                    {v.durationLabel}
                  </span>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">{v.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer link sutil */}
      <div className="text-center text-xs text-muted-foreground/50 pt-4">
        Algo faltando ou confuso? Manda feedback pelo chat com a IA da planta.
      </div>
    </div>
  );
}

// ─── Detail views (uma por categoria) ─────────────────────────────────────────

function SetupView() {
  return (
    <DetailLayout category={CATEGORIES[0]}>
      <p className="text-base text-foreground/90 leading-relaxed">
        Vamos configurar tudo do zero — em 5 minutos você já tá registrando log diário da
        primeira estufa. Esse é o caminho recomendado pra novos usuários.
      </p>

      <Step
        n={1}
        accent="emerald"
        title="Crie sua primeira estufa"
        description={
          <>
            Vai em <strong>Início</strong> → botão <strong>+ Nova estufa</strong>. Preenche:
            <ul className="list-disc list-inside mt-2 ml-2 space-y-1">
              <li><strong>Nome</strong> (ex: "Estufa A")</li>
              <li><strong>Categoria</strong>: Vegetativa, Floração, Manutenção ou Secagem</li>
              <li><strong>Dimensões</strong> (cm) — usado pra cálculo de PPFD ideal</li>
            </ul>
          </>
        }
        imageCaption="Tela 'Nova estufa' com formulário preenchido — dimensões + categoria"
      />

      <Step
        n={2}
        accent="emerald"
        title="Adicione plantas à estufa"
        description={
          <>
            Entra na estufa → aba <strong>Plantas</strong> → <strong>+ Adicionar planta</strong>.
            Cada planta tem nome (ex: "NL-1"), código opcional e <strong>strain</strong> (variedade
            genética). Strains pré-cadastradas existem, ou você cria nova.
          </>
        }
        imageCaption="Modal de criar planta + dropdown de strains"
      />

      <Step
        n={3}
        accent="emerald"
        title="Inicie um ciclo"
        description={
          <>
            Estufa → <strong>+ Iniciar ciclo</strong> → escolhe a <strong>fase atual</strong>
            (Vegetativa ou Floração). O ciclo controla:
            <ul className="list-disc list-inside mt-2 ml-2 space-y-1">
              <li>Semana atual (auto-incrementa a cada 7 dias)</li>
              <li>Tarefas semanais (geradas automaticamente)</li>
              <li>Targets de ambiente (sugeridos pela strain)</li>
            </ul>
          </>
        }
        imageCaption="Modal 'Iniciar ciclo' com seleção de fase + data de início"
      />

      <Step
        n={4}
        accent="emerald"
        title="Use o Registro Rápido todo dia"
        description={
          <>
            Toca no botão <strong>+</strong> na navegação inferior → escolhe um dos 3 modos:
            <ul className="list-disc list-inside mt-2 ml-2 space-y-1">
              <li><strong>Status da estufa</strong> — temp, RH, PPFD, pH, EC, rega</li>
              <li><strong>Saúde de planta</strong> — foto + sintomas + status</li>
              <li><strong>Tricomas</strong> — só na floração</li>
            </ul>
            Esses logs alimentam gráficos, alertas e tarefas. Hábito diário = app útil.
          </>
        }
        imageCaption="Botão + expandido mostrando os 3 modos do Registro Rápido"
      />

      <Step
        n={5}
        accent="emerald"
        title="(Opcional) Conecte SmartLife pra dados automáticos"
        description={
          <>
            Se você tem sensores Tuya/SmartLife, vai em <strong>Configurações → SmartLife</strong>{" "}
            e cadastra suas credenciais. O app puxa temp/RH automaticamente a cada 5min sem você
            precisar registrar manualmente. Veja a <Link href="/help/smartlife" className="text-primary underline">seção SmartLife</Link> pro passo a passo completo.
          </>
        }
      />

      <Tip>
        Quanto mais consistente o log diário, mais úteis ficam os <strong>alertas</strong>{" "}
        (avisa se algo sai do padrão) e <strong>gráficos</strong> (trends de semanas).
      </Tip>

      <RelatedLinks current="setup" />
    </DetailLayout>
  );
}

function PlantasView() {
  return (
    <DetailLayout category={CATEGORIES[1]}>
      <p className="text-base text-foreground/90 leading-relaxed">
        Plantas, ciclos e estufas são os pilares do app. Aqui você entende como navegar entre
        eles e como cada um é organizado.
      </p>

      <Step
        n={1}
        accent="green"
        title="Estufas — onde tudo acontece"
        description={
          <>
            Cada estufa tem 4 abas: <strong>Visão geral</strong>, <strong>Plantas</strong>,{" "}
            <strong>SmartLife</strong> e <strong>Histórico</strong>. A categoria define:
            <ul className="list-disc list-inside mt-2 ml-2 space-y-1">
              <li><strong>Vegetativa</strong> — fase de crescimento, fotoperíodo 18/6h</li>
              <li><strong>Floração</strong> — fase de produção, fotoperíodo 12/12h</li>
              <li><strong>Manutenção</strong> — mães + clones</li>
              <li><strong>Secagem</strong> — pós-colheita, sem ciclo ativo</li>
            </ul>
          </>
        }
        imageCaption="Tela de estufa com 4 tabs visíveis no topo"
      />

      <Step
        n={2}
        accent="green"
        title="Ciclos — controle de semanas e fases"
        description={
          <>
            Um ciclo é o "período produtivo" da estufa. Ele tem data de início, fase atual
            (Veg/Flora) e contagem semanal automática. Pra avançar de Veg pra Flora, toca em{" "}
            <strong>Avançar para Floração</strong> no card do ciclo.
          </>
        }
        imageCaption="Card do ciclo com botão 'Avançar para Floração' destacado"
      />

      <Step
        n={3}
        accent="green"
        title="Plantas individuais"
        description={
          <>
            Cada planta tem perfil próprio com 7 abas: Visão geral, Saúde, Tricomas, LST, Galeria,
            Ambiente, Runoff. Você cadastra plantas direto na estufa (não tem cadastro "solto").
          </>
        }
        imageCaption="Tela de detalhe de planta mostrando as 7 abas"
      />

      <Step
        n={4}
        accent="green"
        title="Strains & targets"
        description={
          <>
            Strains (variedades) têm <strong>targets semanais</strong> de temp, RH, PPFD, pH, EC
            sugeridos por fase. Acesse em <strong>Configurações → Strains</strong>. Targets viram
            referência nos gráficos e alertas — fora do range = alerta dispara.
          </>
        }
      />

      <Tip>
        Plantas que terminam ciclo viram <strong>Arquivo</strong> automaticamente quando você
        clica em "Colher" no menu de 3 pontos. Histórico completo fica preservado.
      </Tip>

      <RelatedLinks current="plantas" />
    </DetailLayout>
  );
}

function SaudeView() {
  return (
    <DetailLayout category={CATEGORIES[2]}>
      <p className="text-base text-foreground/90 leading-relaxed">
        Registros de saúde semanais são o que permite acompanhar evolução visual da planta e
        detectar problemas antes deles virarem desastres. Fotos viram histórico permanente.
      </p>

      <Step
        n={1}
        accent="rose"
        title="Registrar saúde (rápido)"
        description={
          <>
            Botão <strong>+</strong> → <strong>Saúde de planta</strong>. Pra cada planta da estufa
            ativa:
            <ul className="list-disc list-inside mt-2 ml-2 space-y-1">
              <li><strong>Status</strong>: Saudável, Estressada, Doente, Recuperando</li>
              <li><strong>Sintomas</strong>: deficiência N, queima, pragas, etc.</li>
              <li><strong>Tratamento aplicado</strong>: opcional</li>
              <li><strong>Foto</strong>: obrigatório pelo menos uma foto OU sintoma OU anotação</li>
            </ul>
          </>
        }
        imageCaption="Modal de registro de saúde com slots de foto + dropdowns"
      />

      <Step
        n={2}
        accent="rose"
        title="Galeria por planta"
        description={
          <>
            Aba <strong>Galeria</strong> dentro da planta mostra todas as fotos cronologicamente.
            Cada foto vem com data, semana do ciclo e status registrado. Filtra por mês ou semana
            no topo.
          </>
        }
        imageCaption="Grid de fotos da galeria com filtros de data"
      />

      <Step
        n={3}
        accent="rose"
        title="Análise de tricomas (floração)"
        description={
          <>
            Disponível só pra estufas em floração. Botão <strong>+</strong> →{" "}
            <strong>Tricomas</strong>. Registra percentuais de:
            <ul className="list-disc list-inside mt-2 ml-2 space-y-1">
              <li><strong>Translúcidos</strong> (planta ainda imatura)</li>
              <li><strong>Opacos/Leitosos</strong> (pico de THC)</li>
              <li><strong>Âmbar</strong> (degradação pra CBN, efeito mais relaxante)</li>
            </ul>
            Gráfico de evolução semanal aparece na aba Tricomas da planta.
          </>
        }
        imageCaption="Tela de análise de tricomas com sliders de percentual"
      />

      <Step
        n={4}
        accent="rose"
        title="Comparação antes/depois"
        description={
          <>
            Na galeria, toca em uma foto e depois em outra → modo comparação lado-a-lado.
            Útil pra ver evolução semana após semana.
          </>
        }
      />

      <Tip>
        Fotos do registro de saúde aparecem no <strong>display ESP32</strong> da estufa — última
        foto de cada planta + status. Útil pra dar uma olhada sem abrir o celular.
      </Tip>

      <RelatedLinks current="saude" />
    </DetailLayout>
  );
}

function LSTView() {
  return (
    <DetailLayout category={CATEGORIES[3]}>
      <p className="text-base text-foreground/90 leading-relaxed">
        LST (Low Stress Training) e técnicas de poda permitem moldar a planta pra maximizar
        produção. O Cultivo tem registro próprio dessas intervenções.
      </p>

      <Step
        n={1}
        accent="amber"
        title="Acesso ao registro"
        description={
          <>
            Planta → aba <strong>LST</strong>. Lista cronológica das técnicas aplicadas. Adicione
            nova com botão <strong>+ Registrar técnica</strong>.
          </>
        }
        imageCaption="Aba LST da planta com timeline de técnicas"
      />

      <Step
        n={2}
        accent="amber"
        title="Técnicas disponíveis"
        description={
          <>
            <ul className="list-disc list-inside mt-1 ml-2 space-y-1">
              <li><strong>Topping</strong> — corta meristema apical, força ramificação</li>
              <li><strong>Fimming</strong> — corte parcial, ramificação mais agressiva</li>
              <li><strong>LST clássico</strong> — amarrar galhos baixos pra abrir canopy</li>
              <li><strong>Supercropping</strong> — quebrar caule sem cortar (HST)</li>
              <li><strong>Defoliation</strong> — remover folhas pra luz/ar</li>
              <li><strong>Mainlining</strong> — manifold de 4-8-16 colas</li>
              <li><strong>SCROG</strong> — tela horizontal pra canopy uniforme</li>
              <li><strong>SOG</strong> — Sea of Green, várias plantas pequenas</li>
            </ul>
          </>
        }
        imageCaption="Lista de técnicas no dropdown do registro LST"
      />

      <Step
        n={3}
        accent="amber"
        title="Registro detalhado"
        description={
          <>
            Cada técnica registra: data, nome, observações, foto opcional, fase do ciclo. Tudo
            vira histórico pra você revisar o que funcionou em ciclos passados.
          </>
        }
        imageCaption="Modal de registrar técnica LST com campos preenchidos"
      />

      <Warning>
        Cuidado com técnicas de HST (stress alto) <strong>menos de 2 semanas antes da
        floração</strong>. Pode atrasar a planta ou herdar deformações.
      </Warning>

      <RelatedLinks current="lst" />
    </DetailLayout>
  );
}

function SmartLifeView() {
  return (
    <DetailLayout category={CATEGORIES[4]}>
      <p className="text-base text-foreground/90 leading-relaxed">
        Integração com Tuya/SmartLife permite leitura automática de sensores (temp, RH, pH, EC)
        e controle remoto de dispositivos (luzes, ventiladores, regadores). Esta seção também
        cobre o display ESP32 físico.
      </p>

      <Step
        n={1}
        accent="sky"
        title="Cadastrar credenciais Tuya"
        description={
          <>
            <strong>Configurações → SmartLife</strong>. Você precisa criar projeto no portal
            iot.tuya.com (grátis 6 meses de trial). Cole <strong>accessId</strong>,{" "}
            <strong>accessSecret</strong> e seleciona o <strong>datacenter</strong> (Brasil é
            geralmente US ou EU). Testa conexão.
          </>
        }
        imageCaption="Tela de Configurações > SmartLife com formulário de credenciais"
      />

      <Step
        n={2}
        accent="sky"
        title="Vincular sensores a uma estufa"
        description={
          <>
            Dentro da estufa → aba <strong>SmartLife</strong> → seção <strong>Sensores</strong>.
            Lista mostra todos os devices da sua conta Tuya. Marca os que estão fisicamente nessa
            estufa. Leituras passam a aparecer no <strong>Painel Principal</strong> e no{" "}
            <strong>Histórico</strong>.
          </>
        }
        imageCaption="Aba SmartLife da estufa com lista de sensores e checkboxes"
      />

      <Step
        n={3}
        accent="sky"
        title="Cenas e dispositivos (controles)"
        description={
          <>
            Mesma aba SmartLife → vincula <strong>cenas</strong> (Tap-to-Run) e{" "}
            <strong>dispositivos</strong> (switches simples) pra controlar do app. Cada estufa
            comporta até 6 itens. Você pode trocar ícone, ordem e duração da execução.
          </>
        }
        imageCaption="Grid 2x3 de cenas/dispositivos vinculados a uma estufa"
      />

      <Step
        n={4}
        accent="sky"
        title="Conectar display ESP32"
        description={
          <>
            Liga o ESP32 → conecta no WiFi → ele mostra um <strong>código de 6 caracteres</strong>{" "}
            na tela. No app, entra na estufa → SmartLife → <strong>Conectar Display</strong> →
            cola o código. Pronto — display passa a mostrar dados dessa estufa em tempo real.
          </>
        }
        imageCaption="Modal 'Conectar Display' com input do código"
      />


      <Tip>
        ESP32 é amarrado a UMA estufa só. Se trocar de estufa fisicamente, refaz o pareamento —
        o token antigo é invalidado automaticamente quando você parea um novo na mesma estufa.
      </Tip>

      <Warning>
        Trial Tuya dá 10 dispositivos e 6 meses. Quando vencer, ou cria nova conta com email novo
        (renova trial) ou paga plano. Anote a data de expiração no calendário.
      </Warning>

      <RelatedLinks current="smartlife" />
    </DetailLayout>
  );
}

function HistoricoView() {
  return (
    <DetailLayout category={CATEGORIES[5]}>
      <p className="text-base text-foreground/90 leading-relaxed">
        Gráficos, alertas e arquivo são as ferramentas de análise — entender o que aconteceu,
        receber avisos quando algo sai do trilho, e preservar histórico de ciclos passados.
      </p>

      <Step
        n={1}
        accent="indigo"
        title="Gráficos de evolução"
        description={
          <>
            Dentro da estufa → aba <strong>Histórico</strong>. 4 gráficos principais:
            <ul className="list-disc list-inside mt-2 ml-2 space-y-1">
              <li><strong>Temperatura + RH</strong> (com VPD calculado)</li>
              <li><strong>PPFD + DLI</strong> (intensidade e dose diária de luz)</li>
              <li><strong>pH</strong> da rega</li>
              <li><strong>EC</strong> da solução nutritiva</li>
            </ul>
            Filtra por período (7d, 30d, 90d) e compara com targets da strain.
          </>
        }
        imageCaption="Aba Histórico com 4 gráficos empilhados"
      />

      <Step
        n={2}
        accent="indigo"
        title="Alertas inteligentes"
        description={
          <>
            <strong>Configurações → Alertas</strong> → define limites por estufa (temp acima de
            30°C, RH abaixo de 40%, etc). Quando sensor passa do limite, dispara notificação
            push (e fica em <strong>Alertas → Histórico</strong>).
          </>
        }
        imageCaption="Tela de configuração de alertas com sliders de limite"
      />

      <Step
        n={3}
        accent="indigo"
        title="Targets semanais por strain"
        description={
          <>
            Cada strain tem range ideal de temp/RH/PPFD/pH/EC por <strong>semana do ciclo</strong>.
            Configurações → Strains → escolhe strain → <strong>Targets</strong>. Gráficos mostram
            essa faixa como overlay sombreado.
          </>
        }
        imageCaption="Tabela de targets por semana com colunas temp/RH/PPFD/pH/EC"
      />

      <Step
        n={4}
        accent="indigo"
        title="Arquivo de plantas finalizadas"
        description={
          <>
            <strong>Plantas → Arquivo</strong>. Lista todas as plantas colhidas/finalizadas com
            histórico completo: fotos, logs, técnicas, registros de saúde. Útil pra comparar
            ciclos passados e melhorar próximos.
          </>
        }
      />

      <Tip>
        Exporta gráficos como imagem (long-press no gráfico) pra compartilhar com fórum ou
        consultor.
      </Tip>

      <RelatedLinks current="historico" />
    </DetailLayout>
  );
}

function TarefasView() {
  return (
    <DetailLayout category={CATEGORIES[6]}>
      <p className="text-base text-foreground/90 leading-relaxed">
        Sistema de tarefas semanais automatiza checklist por fase do ciclo. Não precisa lembrar
        de "checar pH segunda" ou "trocar nutriente quarta" — app gera.
      </p>

      <Step
        n={1}
        accent="violet"
        title="Acessar tarefas"
        description={
          <>
            Aba <strong>Tarefas</strong> na navegação inferior. Mostra tarefas da semana atual
            agrupadas por estufa. Marca <strong>concluída</strong> tocando no checkbox.
          </>
        }
        imageCaption="Tela de tarefas com checkboxes por estufa"
      />

      <Step
        n={2}
        accent="violet"
        title="Templates por fase"
        description={
          <>
            <strong>Configurações → Tarefas → Templates</strong>. Define tarefas que se repetem
            por semana de cada fase (Veg ou Flora). Exemplo:
            <ul className="list-disc list-inside mt-2 ml-2 space-y-1">
              <li>"Checar pH" — semana 1-12, fase Veg, segunda</li>
              <li>"Troca de nutriente" — semana 2, fase Flora, quarta</li>
              <li>"Verificar runoff" — toda semana, ambas fases</li>
            </ul>
            App auto-gera as instâncias quando ciclo avança.
          </>
        }
        imageCaption="Tela de templates de tarefas"
      />

      <Step
        n={3}
        accent="violet"
        title="Tarefas únicas (standalone)"
        description={
          <>
            Tarefas pontuais que não são recorrentes — botão <strong>+ Nova tarefa</strong> direto
            na aba Tarefas. Pode amarrar a uma estufa específica ou ficar geral (sem estufa).
          </>
        }
      />

      <Tip>
        Display ESP32 mostra tarefas pendentes da estufa atual. Você pode marcar concluída direto
        no display tocando na tarefa.
      </Tip>

      <RelatedLinks current="tarefas" />
    </DetailLayout>
  );
}

function FerramentasView() {
  return (
    <DetailLayout category={CATEGORIES[7]}>
      <p className="text-base text-foreground/90 leading-relaxed">
        Calculadoras, backup, configurações de conta e dicas pra usar bem no mobile.
      </p>

      <Step
        n={1}
        accent="slate"
        title="Calculadoras"
        description={
          <>
            Botão <strong>🧮</strong> na navegação. Lista de cálculos prontos:
            <ul className="list-disc list-inside mt-2 ml-2 space-y-1">
              <li><strong>VPD</strong> — déficit de pressão de vapor (clima ideal)</li>
              <li><strong>DLI</strong> — Daily Light Integral pra cada fase</li>
              <li><strong>EC ↔ PPM</strong> — conversão entre escalas (US/EU)</li>
              <li><strong>Nutrientes</strong> — quantidade por litro</li>
              <li><strong>CO₂</strong> — quantidade pra elevar ppm</li>
            </ul>
          </>
        }
        imageCaption="Menu de calculadoras com cards"
      />

      <Step
        n={2}
        accent="slate"
        title="Backup & restore"
        description={
          <>
            <strong>Configurações → Backup</strong>. Exporta JSON com todos os teus dados
            (estufas, plantas, logs, fotos, etc). Restaura subindo o JSON. Boa prática:{" "}
            <strong>backup semanal</strong> pra não perder histórico.
          </>
        }
        imageCaption="Tela de Backup com botões Export/Import"
      />

      <Step
        n={3}
        accent="slate"
        title="Notificações"
        description={
          <>
            <strong>Configurações → Notificações</strong>. Liga push notifications no celular
            pra receber alertas e lembretes de tarefas. Funciona via web push (sem app na store).
          </>
        }
      />

      <Step
        n={4}
        accent="slate"
        title="Instalar como PWA no celular"
        description={
          <>
            Abre o app no Safari (iPhone) ou Chrome (Android) → menu de compartilhar →{" "}
            <strong>Adicionar à tela inicial</strong>. App vira ícone na home, abre fullscreen,
            funciona offline pra leitura.
          </>
        }
        imageCaption="Tela do iOS adicionando o Cultivo à home"
      />

      <InfoBox>
        Cultivo é <strong>Progressive Web App</strong> (PWA) — não precisa baixar da App
        Store. Atualiza automaticamente. Funciona em qualquer celular moderno.
      </InfoBox>

      <RelatedLinks current="ferramentas" />
    </DetailLayout>
  );
}

// ─── Detail layout (compartilhado entre detail views) ─────────────────────────

function DetailLayout({
  category,
  children,
}: {
  category: Category;
  children: React.ReactNode;
}) {
  const Icon = category.icon;

  return (
    <div className="space-y-6">
      {/* Hero da categoria */}
      <div
        className={`relative rounded-2xl overflow-hidden border ${category.color.border} p-6`}
        style={{
          background: `linear-gradient(150deg, ${category.color.glow} 0%, var(--card) 65%)`,
        }}
      >
        <div className="flex items-start gap-4">
          <div
            className={`w-14 h-14 rounded-2xl ${category.color.iconBg} flex items-center justify-center shadow-md shrink-0`}
          >
            <Icon className="w-7 h-7 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-foreground mb-1 leading-tight">
              {category.title}
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">{category.subtitle}</p>
            <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground/70">
              <Clock className="w-3 h-3" />
              <span>{category.estimatedMin} min de leitura</span>
            </div>
          </div>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="space-y-5">{children}</div>
    </div>
  );
}

function RelatedLinks({ current }: { current: string }) {
  // Mostra os 3 próximos cards (cíclico)
  const idx = CATEGORIES.findIndex((c) => c.id === current);
  const related = [
    CATEGORIES[(idx + 1) % CATEGORIES.length],
    CATEGORIES[(idx + 2) % CATEGORIES.length],
  ];
  return (
    <div className="pt-4 mt-4 border-t border-border/30">
      <h3 className="text-xs uppercase tracking-[0.2em] text-muted-foreground/60 font-semibold mb-3">
        Continue por aqui
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {related.map((cat) => {
          const Icon = cat.icon;
          return (
            <Link
              key={cat.id}
              href={`/help/${cat.id}`}
              className="flex items-center gap-3 rounded-xl border border-border/30 bg-card/50 px-3 py-2.5 hover:bg-card hover:border-border/50 transition-colors group"
            >
              <div
                className={`w-8 h-8 rounded-lg ${cat.color.iconBg} flex items-center justify-center shrink-0`}
              >
                <Icon className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{cat.title}</p>
                <p className="text-xs text-muted-foreground truncate">{cat.subtitle}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:translate-x-0.5 transition-transform shrink-0" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────

const DETAIL_VIEWS: Record<string, React.ComponentType> = {
  setup: SetupView,
  plantas: PlantasView,
  saude: SaudeView,
  lst: LSTView,
  smartlife: SmartLifeView,
  historico: HistoricoView,
  tarefas: TarefasView,
  ferramentas: FerramentasView,
};

// ─── Main component ──────────────────────────────────────────────────────────

export default function Help() {
  const [matched, params] = useRoute<{ section: string }>("/help/:section");
  const section = matched ? params?.section : null;
  const [, setLocation] = useLocation();
  const mainRef = useRef<HTMLDivElement>(null);

  // Scroll pro topo ao trocar de view
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: "instant" });
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [section]);

  const DetailView = section ? DETAIL_VIEWS[section] : null;
  const currentCategory = section ? CATEGORIES.find((c) => c.id === section) : null;

  // Se URL tem section mas é inválida, redireciona pra hub
  useEffect(() => {
    if (section && !DetailView) {
      setLocation("/help", { replace: true });
    }
  }, [section, DetailView, setLocation]);

  return (
    <PageTransition>
      <div className="min-h-screen bg-background" ref={mainRef}>
        <PageHeader
          backHref={section ? "/help" : "/settings"}
          title={currentCategory ? currentCategory.title : "Guia"}
        />

        <main className="container mx-auto px-4 py-6 pb-28 sm:pb-8 max-w-3xl">
          {DetailView ? <DetailView /> : <HubView />}
        </main>
      </div>
    </PageTransition>
  );
}

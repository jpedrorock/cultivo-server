import { useState } from "react";
import { Link } from "wouter";
import { PageTransition } from "@/components/PageTransition";
import {
  ArrowLeft,
  Home,
  Sprout,
  Calculator,
  Bell,
  CheckSquare,
  Leaf,
  BarChart3,
  Settings,
  ChevronDown,
  ChevronRight,
  Droplets,
  Thermometer,
  FlaskConical,
  Camera,
  Activity,
  Scissors,
  Archive,
  AlertTriangle,
  BookOpen,
  Zap,
  ClipboardList,
  Smartphone,
  Image,
  Sparkles,
  Search,
  Timer,
  Heart,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Section {
  id: string;
  icon: React.ElementType;
  title: string;
  gradient: string;
  glow: string;
  border: string;
  badge?: string;
  content: React.ReactNode;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Step({ number, text }: { number: number; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center mt-0.5">
        {number}
      </span>
      <span className="text-sm leading-relaxed">{text}</span>
    </div>
  );
}

function Tip({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl bg-primary/8 border border-primary/20 px-3 py-2.5">
      <Zap className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
      <span className="text-xs text-foreground/80 leading-relaxed">{text}</span>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-border/20 last:border-0">
      <span className="text-[11px] text-muted-foreground/60 uppercase tracking-wider font-medium shrink-0">{label}</span>
      <span className="text-xs text-right text-foreground/80">{value}</span>
    </div>
  );
}

function SectionBody({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 pb-4 pt-3 border-t border-border/20 space-y-4 text-sm text-foreground/90 leading-relaxed">
      {children}
    </div>
  );
}

function AccordionSection({ section }: { section: Section }) {
  const [open, setOpen] = useState(false);
  const Icon = section.icon;

  return (
    <div
      id={`section-${section.id}`}
      className={`rounded-2xl border ${section.border} overflow-hidden`}
      style={{ background: `linear-gradient(145deg, ${section.glow} 0%, hsl(var(--card)) 60%)` }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
      >
        <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${section.gradient} flex items-center justify-center shadow-sm shrink-0`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-foreground leading-tight">{section.title}</span>
          {section.badge && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20 leading-none shrink-0">
              {section.badge}
            </span>
          )}
        </div>
        {open
          ? <ChevronDown className="w-4 h-4 text-muted-foreground/40 shrink-0" />
          : <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0" />
        }
      </button>
      {open && <SectionBody>{section.content}</SectionBody>}
    </div>
  );
}

// ─── Section data ─────────────────────────────────────────────────────────────

const sections: Section[] = [
  {
    id: "fluxo",
    icon: ClipboardList,
    title: "Fluxo de Cultivo Recomendado",
    gradient: "from-primary to-emerald-600",
    glow: "rgba(77,184,77,0.10)",
    border: "border-primary/25",
    badge: "Começar aqui",
    content: (
      <div className="space-y-4">
        <p>Se você está começando do zero, siga este fluxo para configurar o sistema e tirar o máximo proveito de todas as funcionalidades.</p>
        <div className="space-y-3">
          <Step number={1} text="Configure as strains em uso (ou use as pré-cadastradas) e defina os targets semanais por fase." />
          <Step number={2} text="Crie as estufas com nome, dimensões e categoria (Vegetativa, Floração, Manutenção, Secagem)." />
          <Step number={3} text="Inicie um ciclo em cada estufa ativa, selecionando a fase e a(s) strain(s)." />
          <Step number={4} text="Cadastre as plantas de cada estufa com nome, código e strain." />
          <Step number={5} text="Configure os limites de alertas para cada estufa em Configurações → Alertas." />
          <Step number={6} text="Use o Registro Rápido diariamente para registrar os dados ambientais de cada estufa." />
          <Step number={7} text="Acompanhe as tarefas semanais geradas automaticamente e marque as concluídas." />
          <Step number={8} text="Registre a saúde das plantas semanalmente pelo Registro Rápido → Saúde ou pela aba Saúde de cada planta." />
          <Step number={9} text="Na fase de floração, use o Registro Rápido → Tricomas para acompanhar a maturação por planta." />
          <Step number={10} text="Na semana de colheita, finalize a planta via ⋮ → Colher — ela vai para o Arquivo com todo o histórico." />
        </div>
        <Tip text="Mantenha o hábito de registrar logs diários — são eles que alimentam os gráficos, os alertas e os targets semanais de cada estufa." />
      </div>
    ),
  },
  {
    id: "quicklog",
    icon: Zap,
    title: "Registro Rápido",
    gradient: "from-yellow-500 to-orange-500",
    glow: "rgba(234,179,8,0.09)",
    border: "border-yellow-500/25",
    badge: "Principal",
    content: (
      <div className="space-y-4">
        <p>O <strong>Registro Rápido</strong> é o coração do app — acessível pelo botão <strong>+</strong> na navegação. Ao abrir, escolha o tipo de registro:</p>
        <div className="space-y-2">
          <div className="rounded-xl border border-border/20 bg-card/50 px-3 py-2.5 space-y-1">
            <p className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5"><Home className="w-3.5 h-3.5" /> Registro da Estufa</p>
            <p className="text-xs text-muted-foreground/70">Temperatura, umidade, PPFD, pH, EC, volume de rega e runoff. Ao finalizar, opcionalmente registra saúde das plantas e tricomas.</p>
          </div>
          <div className="rounded-xl border border-border/20 bg-card/50 px-3 py-2.5 space-y-1">
            <p className="text-xs font-semibold text-rose-400 flex items-center gap-1.5"><Heart className="w-3.5 h-3.5" /> Saúde de Planta</p>
            <p className="text-xs text-muted-foreground/70">Registra status (Saudável, Estressada, Doente, Recuperando), sintomas, tratamento e foto para cada planta da estufa selecionada.</p>
          </div>
          <div className="rounded-xl border border-border/20 bg-card/50 px-3 py-2.5 space-y-1">
            <p className="text-xs font-semibold text-violet-400 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> Tricomas</p>
            <p className="text-xs text-muted-foreground/70">Exclusivo para estufas de floração. Registra estado (Translúcidos, Opacos, Âmbar, Misturado) e percentuais por planta. Se só houver uma estufa em floração, vai direto para as plantas.</p>
          </div>
        </div>
        <Tip text="O modo Tricomas detecta automaticamente estufas de floração. Com uma só estufa FLORA, pula a seleção e vai direto ao formulário por planta." />
      </div>
    ),
  },
  {
    id: "inicio",
    icon: Home,
    title: "Painel Principal",
    gradient: "from-emerald-500 to-teal-600",
    glow: "rgba(16,185,129,0.09)",
    border: "border-emerald-500/25",
    content: (
      <div className="space-y-4">
        <p>O painel exibe um <strong>card para cada estufa ativa</strong> com as informações mais recentes do último registro diário.</p>
        <div className="space-y-1">
          <InfoRow label="Nome e fase" value="Ex: Estufa B — Floração Sem. 6" />
          <InfoRow label="Temperatura / RH" value="Último valor registrado com indicador de data" />
          <InfoRow label="PPFD" value="Intensidade de luz (µmol/m²/s)" />
          <InfoRow label="Plantas ativas" value="Quantidade de plantas na estufa" />
          <InfoRow label="Strain(s)" value="Variedades em cultivo no ciclo atual" />
          <InfoRow label="Progresso tarefas" value="X/Y tarefas concluídas na semana" />
        </div>
        <Tip text="O badge de 'última atualização' muda de cor: verde = hoje, âmbar = ontem, vermelho = mais de 2 dias sem registro." />
      </div>
    ),
  },
  {
    id: "estufas",
    icon: Home,
    title: "Estufas e Ciclos",
    gradient: "from-teal-500 to-cyan-600",
    glow: "rgba(20,184,166,0.09)",
    border: "border-teal-500/25",
    content: (
      <div className="space-y-4">
        <p>Cada estufa pode ter um <strong>ciclo ativo</strong> com fase, strain(s) e semana atual. A página da estufa exibe os dados ambientais mais recentes e o histórico de logs.</p>
        <div className="space-y-2">
          <p className="font-medium text-xs uppercase tracking-wider text-muted-foreground/60">Transições de fase disponíveis</p>
          <div className="space-y-1">
            <InfoRow label="Manutenção → Vegetativa" value="Início do ciclo produtivo" />
            <InfoRow label="Vegetativa → Floração" value="Mudança para 12/12" />
            <InfoRow label="Floração → Colheita" value="Plantas vão para Aguardando Secagem" />
            <InfoRow label="Secagem → Concluído" value="Encerramento do ciclo" />
          </div>
        </div>
        <div className="space-y-2">
          <p className="font-medium text-xs uppercase tracking-wider text-muted-foreground/60">Logs diários na estufa</p>
          <p className="text-xs text-muted-foreground/70">Cada log mostra temperatura · umidade · PPFD na primeira linha e pH · EC · Runoff na segunda, em grade visual compacta. Edite ou exclua qualquer log pelo ícone ✎ ou 🗑 do registro.</p>
        </div>
        <Tip text="Use o botão 'Exportar' na página da estufa para baixar todo o histórico de logs em TXT — útil para análise fora do app." />
      </div>
    ),
  },
  {
    id: "plantas",
    icon: Sprout,
    title: "Sistema de Plantas",
    gradient: "from-green-500 to-emerald-600",
    glow: "rgba(34,197,94,0.09)",
    border: "border-green-500/25",
    badge: "Central do cultivo",
    content: (
      <div className="space-y-4">
        <p>Cada planta tem um <strong>perfil completo</strong> com hero card (foto mais recente + dias de cultivo + fase), e 4 abas de conteúdo.</p>
        <div className="space-y-1">
          <InfoRow label="Saúde" value="Histórico de registros: status, sintomas, tratamento, foto" />
          <InfoRow label="Ambiente" value="Dados ambientais da estufa por período de estadia" />
          <InfoRow label="Cultivo" value="Observações livres, registros de LST e Tricomas" />
          <InfoRow label="Arquivo" value="Galeria de fotos completa e histórico de transferências entre estufas" />
        </div>
        <div className="space-y-2">
          <p className="font-medium text-xs uppercase tracking-wider text-muted-foreground/60">Ações disponíveis (menu ⋮)</p>
          <div className="space-y-1">
            <InfoRow label="Mover" value="Transferir para outra estufa" />
            <InfoRow label="Clonar" value="Criar clone com nome pré-preenchido" />
            <InfoRow label="Colher" value="Planta vai para Aguardando Secagem" />
            <InfoRow label="Descartar" value="Registrar descarte com motivo" />
            <InfoRow label="Arquivar" value="Mover para o arquivo sem dados de colheita" />
          </div>
        </div>
        <Tip text="A foto mais recente do histórico de saúde aparece automaticamente no hero card da planta, facilitando o acompanhamento visual rápido." />
      </div>
    ),
  },
  {
    id: "saude",
    icon: Activity,
    title: "Registros de Saúde",
    gradient: "from-rose-500 to-pink-600",
    glow: "rgba(244,63,94,0.09)",
    border: "border-rose-500/25",
    content: (
      <div className="space-y-4">
        <p>O registro de saúde documenta o estado de cada planta ao longo do ciclo, com data, status, sintomas, tratamento e foto opcional.</p>
        <div className="space-y-1">
          <InfoRow label="🟢 Saudável" value="Planta sem problemas aparentes" />
          <InfoRow label="🟡 Estressada" value="Sinais de estresse — monitorar de perto" />
          <InfoRow label="🔴 Doente" value="Intervenção necessária" />
          <InfoRow label="🔵 Recuperando" value="Em tratamento — acompanhar evolução" />
        </div>
        <div className="space-y-2">
          <p className="font-medium text-xs uppercase tracking-wider text-muted-foreground/60">Como registrar</p>
          <div className="space-y-2">
            <Step number={1} text="Via Registro Rápido → Saúde de Planta (recomendado para múltiplas plantas)." />
            <Step number={2} text="Ou acesse o perfil da planta → aba Saúde → botão Novo Registro." />
            <Step number={3} text="Selecione o status, preencha sintomas e adicione uma foto se desejar." />
          </div>
        </div>
        <Tip text="Fotos HEIC (iPhone) são convertidas automaticamente para JPEG e comprimidas para aspect ratio 3:4 antes do upload." />
      </div>
    ),
  },
  {
    id: "tricomas",
    icon: Sparkles,
    title: "Análise de Tricomas",
    gradient: "from-violet-500 to-purple-600",
    glow: "rgba(139,92,246,0.09)",
    border: "border-violet-500/25",
    content: (
      <div className="space-y-4">
        <p>O registro de tricomas determina o <strong>ponto ideal de colheita</strong>. Disponível apenas em estufas de floração — acesse via Registro Rápido → Tricomas ou pela aba Cultivo de cada planta.</p>
        <div className="space-y-1">
          <InfoRow label="Translúcidos (Clear)" value="Imaturos — aguardar mais tempo" />
          <InfoRow label="Opacos (Cloudy)" value="Maduros — efeito mais cerebral/energético" />
          <InfoRow label="Âmbar (Amber)" value="THC degradando — efeito mais corporal/relaxante" />
          <InfoRow label="Misturado (Mixed)" value="Combinação — ponto de equilíbrio" />
        </div>
        <p className="text-xs text-muted-foreground/70">Além do estado visual, você pode registrar os percentuais exatos de cada tipo (Clear % / Cloudy % / Amber %) para acompanhar a progressão ao longo das semanas.</p>
        <Tip text="A maioria dos cultivadores colhe quando 70–90% cloudy e 10–30% amber. Registre semanalmente para ver a progressão no histórico da planta." />
      </div>
    ),
  },
  {
    id: "lst",
    icon: Scissors,
    title: "Técnicas de LST",
    gradient: "from-orange-500 to-amber-600",
    glow: "rgba(249,115,22,0.09)",
    border: "border-orange-500/25",
    content: (
      <div className="space-y-4">
        <p>A aba <strong>Cultivo → LST</strong> registra quais técnicas de treinamento foram aplicadas em cada planta, com campo para descrever a resposta da planta.</p>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            ["LST", "Dobramento com amarrilhos"],
            ["Topping", "Corte do ápice principal"],
            ["FIM", "Corte parcial do ápice"],
            ["Super Cropping", "Dobramento brusco do caule"],
            ["Lollipopping", "Remoção dos galhos inferiores"],
            ["Defoliação", "Remoção estratégica de folhas"],
            ["Mainlining", "Criação de manifold simétrico"],
            ["ScrOG", "Tela de crescimento horizontal"],
          ].map(([name, desc]) => (
            <div key={name} className="rounded-xl border border-border/20 bg-card/50 px-2.5 py-2">
              <p className="font-semibold text-xs text-foreground/80">{name}</p>
              <p className="text-[11px] text-muted-foreground/60 mt-0.5">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: "ambiente",
    icon: Thermometer,
    title: "Ambiente por Planta",
    gradient: "from-sky-500 to-blue-600",
    glow: "rgba(14,165,233,0.09)",
    border: "border-sky-500/25",
    badge: "Novo",
    content: (
      <div className="space-y-4">
        <p>A aba <strong>Ambiente</strong> no perfil de cada planta mostra o histórico ambiental completo da estufa durante o período em que a planta esteve lá — mesmo que ela tenha sido transferida entre estufas.</p>
        <div className="space-y-1">
          <InfoRow label="Período por estufa" value="Cada card agrupa os registros da planta naquela estufa" />
          <InfoRow label="Temp · Umidade · Saúde" value="Linha 1 de cada registro diário" />
          <InfoRow label="PPFD · pH · EC" value="Linha 2 de cada registro diário" />
          <InfoRow label="Status de saúde" value="Cruzado automaticamente por data" />
        </div>
        <Tip text="Use o botão Exportar para baixar o histórico ambiental completo da planta em TXT, incluindo o status de saúde de cada dia." />
      </div>
    ),
  },
  {
    id: "fotos",
    icon: Image,
    title: "Galeria de Fotos",
    gradient: "from-pink-500 to-rose-600",
    glow: "rgba(236,72,153,0.09)",
    border: "border-pink-500/25",
    content: (
      <div className="space-y-4">
        <p>A galeria completa de cada planta fica na aba <strong>Arquivo → Fotos</strong>. A foto mais recente é exibida no hero card do perfil da planta.</p>
        <div className="space-y-1">
          <InfoRow label="Lightbox" value="Toque na foto para abrir em tela cheia com zoom" />
          <InfoRow label="Navegação" value="Deslize para navegar entre fotos" />
          <InfoRow label="Download" value="Baixe qualquer foto diretamente do lightbox" />
          <InfoRow label="Contador" value="Posição atual exibida (ex: 3/8)" />
        </div>
        <Tip text="Fotos HEIC/HEIF do iPhone são convertidas automaticamente para JPEG — sem necessidade de conversão manual." />
      </div>
    ),
  },
  {
    id: "tarefas",
    icon: CheckSquare,
    title: "Tarefas Semanais",
    gradient: "from-blue-500 to-indigo-600",
    glow: "rgba(59,130,246,0.09)",
    border: "border-blue-500/25",
    badge: "Automático",
    content: (
      <div className="space-y-4">
        <p>As tarefas são geradas <strong>automaticamente</strong> com base na fase e semana do ciclo ativo de cada estufa.</p>
        <div className="space-y-1">
          <InfoRow label="Vegetativa" value="Semanas 1–4 (rega, pH, EC, LST, nutrição)" />
          <InfoRow label="Floração" value="Semanas 1–8 (flush, defoliação, tricomas)" />
          <InfoRow label="Manutenção" value="Tarefas recorrentes (limpeza, verificação)" />
          <InfoRow label="Secagem" value="Semanas 1–2 (temp/umidade, verificação de mofo)" />
        </div>
        <div className="space-y-2">
          <Step number={1} text='Acesse "Tarefas" na navegação inferior.' />
          <Step number={2} text="Filtre por estufa usando os botões no topo." />
          <Step number={3} text="Marque as tarefas concluídas — o progresso é salvo automaticamente." />
        </div>
        <Tip text="O badge de progresso (ex: 7/12) é atualizado em tempo real ao marcar cada item. Ações em lote permitem marcar/desmarcar tudo de uma vez." />
      </div>
    ),
  },
  {
    id: "calculadoras",
    icon: Calculator,
    title: "Calculadoras",
    gradient: "from-indigo-500 to-violet-600",
    glow: "rgba(99,102,241,0.09)",
    border: "border-indigo-500/25",
    content: (
      <div className="space-y-3">
        <p>Ferramentas de cálculo acessíveis pelo ícone de calculadora na navegação.</p>
        {[
          { icon: Timer, color: "text-blue-400", name: "Rega Automática", desc: "Gera cronograma de ciclos por bomba (fluxo, saídas, tempo máx.) + vaso + janela de luz. Calcula horários, duração por ciclo e ml/planta." },
          { icon: Droplets, color: "text-cyan-400", name: "Rega e Runoff", desc: "Volume ideal de rega por planta e percentual de runoff. Histórico salvo por estufa." },
          { icon: FlaskConical, color: "text-green-400", name: "Fertilização", desc: "Receita de sais minerais com EC estimado e NPK resultante. Salve e carregue predefinições." },
          { icon: Thermometer, color: "text-orange-400", name: "Lux → PPFD", desc: "Converte luxímetro para PPFD (µmol/m²/s) com slider visual." },
          { icon: Zap, color: "text-yellow-400", name: "PPM ↔ EC", desc: "Conversão bidirecional entre PPM e mS/cm." },
          { icon: Droplets, color: "text-teal-400", name: "VPD e pH", desc: "Vapor Pressure Deficit e ajuste de pH Up/Down." },
        ].map(({ icon: Icon, color, name, desc }) => (
          <div key={name} className="flex gap-3 rounded-xl border border-border/20 bg-card/50 px-3 py-2.5">
            <Icon className={`w-4 h-4 ${color} shrink-0 mt-0.5`} />
            <div>
              <p className="text-xs font-semibold text-foreground/80">{name}</p>
              <p className="text-[11px] text-muted-foreground/60 mt-0.5 leading-relaxed">{desc}</p>
            </div>
          </div>
        ))}
        <Tip text="Salve predefinições de rega e fertilização para não recalcular toda semana — carregue com um clique." />
      </div>
    ),
  },
  {
    id: "alertas",
    icon: Bell,
    title: "Sistema de Alertas",
    gradient: "from-amber-500 to-orange-600",
    glow: "rgba(245,158,11,0.09)",
    border: "border-amber-500/25",
    content: (
      <div className="space-y-4">
        <p>O sistema monitora os parâmetros de cada estufa e gera notificações quando os valores saem dos limites configurados. O badge vermelho na navegação indica alertas não lidos.</p>
        <div className="space-y-1">
          <InfoRow label="Temperatura" value="Min/Max em °C por fase" />
          <InfoRow label="Umidade (RH)" value="Min/Max em % por fase" />
          <InfoRow label="PPFD" value="Min/Max em µmol/m²/s por fase" />
        </div>
        <div className="space-y-2">
          <Step number={1} text='Acesse "Configurações → Alertas".' />
          <Step number={2} text="Selecione a estufa e expanda a fase desejada." />
          <Step number={3} text="Ajuste os limites mínimos e máximos para cada parâmetro." />
        </div>
        <Tip text="Desvios acima de 10% geram alertas de atenção e acima de 20% geram alertas críticos. Veja o histórico completo em Alertas → Histórico." />
      </div>
    ),
  },
  {
    id: "strains",
    icon: Leaf,
    title: "Strains e Targets Semanais",
    gradient: "from-lime-500 to-green-600",
    glow: "rgba(132,204,22,0.09)",
    border: "border-lime-500/25",
    content: (
      <div className="space-y-4">
        <p>As strains definem os <strong>targets semanais</strong> de temperatura, umidade, PPFD, pH e EC para cada fase do ciclo. O sistema compara os logs diários com esses targets e gera alertas automáticos.</p>
        <div className="space-y-2">
          <Step number={1} text='Acesse o menu lateral → "Strains".' />
          <Step number={2} text='Clique em "Nova Strain" para cadastrar uma variedade.' />
          <Step number={3} text='Para definir os targets, clique em "Targets" no card da strain.' />
          <Step number={4} text="Configure os valores ideais por semana para Clonagem, Vegetativa e Floração." />
        </div>
        <Tip text="Strains pré-cadastradas: Orange Punch, 24K Gold, Gorilla Glue #4, White Widow, Northern Lights e Amnesia Haze — com targets já configurados para as fases principais." />
      </div>
    ),
  },
  {
    id: "historico",
    icon: BarChart3,
    title: "Histórico e Gráficos",
    gradient: "from-cyan-500 to-sky-600",
    glow: "rgba(6,182,212,0.09)",
    border: "border-cyan-500/25",
    content: (
      <div className="space-y-4">
        <p>A página de Histórico exibe todos os logs diários em tabela e gráficos de linha interativos por estufa.</p>
        <div className="space-y-1">
          <InfoRow label="Por estufa" value="Dados de uma estufa específica" />
          <InfoRow label="Por período" value="Selecione o intervalo de datas" />
          <InfoRow label="Por parâmetro" value="Temperatura, RH ou PPFD" />
        </div>
        <p className="text-xs text-muted-foreground/70">Os gráficos na página de cada estufa mostram os últimos 7 dias com linhas de target (valores ideais da strain) para comparação visual imediata.</p>
        <Tip text="Clique em qualquer ponto do gráfico para ver o valor exato daquele dia." />
      </div>
    ),
  },
  {
    id: "arquivo",
    icon: Archive,
    title: "Arquivo de Plantas",
    gradient: "from-stone-500 to-zinc-600",
    glow: "rgba(120,113,108,0.09)",
    border: "border-stone-500/25",
    content: (
      <div className="space-y-4">
        <p>Quando uma planta é colhida ou arquivada, todo o seu histórico é preservado no <strong>Arquivo de Plantas</strong> — saúde, tricomas, LST, fotos e dados de colheita.</p>
        <div className="space-y-2">
          <Step number={1} text='Acesse "Plantas" na navegação inferior.' />
          <Step number={2} text='Filtre por status "Arquivado" ou "Colhido" no topo da listagem.' />
        </div>
        <div className="space-y-1">
          <InfoRow label="Estufa de origem" value="Onde a planta foi cultivada" />
          <InfoRow label="Peso colhido" value="Em gramas (se registrado no momento da colheita)" />
          <InfoRow label="Histórico ambiental" value="Dados da estufa durante toda a estadia" />
          <InfoRow label="Data de finalização" value="Quando a planta foi colhida ou arquivada" />
        </div>
      </div>
    ),
  },
  {
    id: "configuracoes",
    icon: Settings,
    title: "Configurações",
    gradient: "from-slate-500 to-gray-600",
    glow: "rgba(100,116,139,0.09)",
    border: "border-slate-500/25",
    content: (
      <div className="space-y-4">
        <p>A página de Configurações centraliza preferências do sistema, notificações e manutenção do app.</p>
        <div className="space-y-1">
          <InfoRow label="Tema" value="Claro, Escuro, Floresta, HPS Agrícola, Alto Contraste" />
          <InfoRow label="Notificações" value="Ativar alertas push no navegador" />
          <InfoRow label="Alertas" value="Configurar limites por estufa e fase" />
          <InfoRow label="Backup" value="Exportar e importar todos os dados em JSON" />
          <InfoRow label="Conta" value="Gerenciar perfil e membros do grupo" />
        </div>
        <Tip text="Ative as notificações push em Configurações → Notificações para receber alertas mesmo quando o app estiver em segundo plano." />
      </div>
    ),
  },
  {
    id: "iphone",
    icon: Smartphone,
    title: "Dicas para iPhone / Mobile",
    gradient: "from-sky-400 to-blue-500",
    glow: "rgba(56,189,248,0.09)",
    border: "border-sky-400/25",
    badge: "Mobile",
    content: (
      <div className="space-y-3">
        {[
          ["📲 Instale como PWA", "Toque em Compartilhar → Adicionar à Tela de Início para acesso rápido e experiência de app nativo, sem abrir o navegador."],
          ["📷 Fotos direto da câmera", "Use a câmera no app para registrar plantas. Fotos HEIC são convertidas automaticamente para JPEG e comprimidas para 3:4."],
          ["📳 Feedback tátil", "Botões de ação têm vibração ao toque. Ações destrutivas (excluir, descartar) têm vibração mais forte como aviso."],
          ["📴 Modo offline", "Registros feitos sem internet são salvos localmente e sincronizados automaticamente ao reconectar. Um banner âmbar indica sincronização pendente."],
          ["🔢 Teclado numérico", "Campos de temperatura, umidade e PPFD abrem o teclado numérico automaticamente para agilizar o registro."],
          ["↔️ Abas deslizáveis", "No perfil da planta, deslize horizontalmente para navegar entre as abas Saúde, Ambiente, Cultivo e Arquivo."],
        ].map(([title, desc]) => (
          <div key={title as string} className="rounded-xl border border-border/20 bg-card/50 px-3 py-2.5">
            <p className="font-semibold text-xs text-foreground/80 mb-1">{title}</p>
            <p className="text-[11px] text-muted-foreground/60 leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>
    ),
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Help() {
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = searchQuery.trim()
    ? sections.filter(
        (s) =>
          s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.id.includes(searchQuery.toLowerCase())
      )
    : sections;

  return (
    <PageTransition>
      <div className="min-h-screen bg-background pb-28 sm:pb-8">

        {/* Header */}
        <header className="bg-card/80 backdrop-blur-md border-b border-border/60 sticky top-0 z-20 pt-safe">
          <div className="px-4 py-3 flex items-center gap-3">
            <Link href="/settings">
              <button className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-accent transition-colors shrink-0">
                <ArrowLeft className="w-5 h-5 text-foreground/70" />
              </button>
            </Link>
            <div className="flex-1 min-w-0">
              <h1 className="text-base font-bold text-foreground flex items-center gap-2 leading-tight">
                <BookOpen className="w-4 h-4 text-primary shrink-0" />
                Guia do Usuário
              </h1>
              <p className="text-[11px] text-muted-foreground/60 leading-tight">
                {sections.length} tópicos · App Cultivo
              </p>
            </div>
          </div>
        </header>

        <div className="px-4 py-4 max-w-2xl mx-auto space-y-4">

          {/* Intro banner */}
          <div className="rounded-2xl border border-primary/25 px-4 py-3.5 flex items-center gap-3"
            style={{ background: "linear-gradient(135deg, rgba(77,184,77,0.10) 0%, hsl(var(--card)) 60%)" }}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-emerald-600 flex items-center justify-center shadow-md shrink-0">
              <ClipboardList className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Bem-vindo ao App Cultivo</p>
              <p className="text-[11px] text-muted-foreground/60 mt-0.5 leading-relaxed">
                Toque em qualquer tópico para expandir as instruções detalhadas.
              </p>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40 pointer-events-none" />
            <input
              type="search"
              placeholder="Buscar tópico..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-10 pl-9 pr-4 rounded-xl border border-border/40 bg-card/80 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40"
            />
          </div>

          {/* Quick nav chips */}
          {!searchQuery && (
            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {[
                { label: "Início Rápido", id: "fluxo" },
                { label: "Registro", id: "quicklog" },
                { label: "Plantas", id: "plantas" },
                { label: "Tricomas", id: "tricomas" },
                { label: "Calculadoras", id: "calculadoras" },
                { label: "Alertas", id: "alertas" },
                { label: "iPhone", id: "iphone" },
              ].map((chip) => (
                <button
                  key={chip.id}
                  onClick={() => {
                    const el = document.getElementById(`section-${chip.id}`);
                    el?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className="shrink-0 px-3 py-1.5 rounded-full border border-border/40 bg-card text-xs font-medium text-muted-foreground hover:bg-primary/10 hover:border-primary/30 hover:text-primary transition-colors"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          )}

          {/* Sections */}
          <div className="space-y-2">
            {filtered.length === 0 ? (
              <div className="rounded-2xl border border-border/40 bg-card py-12 flex flex-col items-center gap-3 text-center">
                <AlertTriangle className="w-8 h-8 text-muted-foreground/30" />
                <div>
                  <p className="text-sm font-medium text-foreground">Nenhum tópico encontrado</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Tente outro termo de busca</p>
                </div>
              </div>
            ) : (
              filtered.map((section) => (
                <AccordionSection key={section.id} section={section} />
              ))
            )}
          </div>
        </div>
      </div>
    </PageTransition>
  );
}

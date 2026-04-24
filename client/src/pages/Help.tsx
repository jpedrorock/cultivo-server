import { useState, useEffect } from "react";
import { PageTransition } from "@/components/PageTransition";
import { PageHeader } from "@/components/PageHeader";
import {
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
  BookOpen,
  Zap,
  ClipboardList,
  Smartphone,
  Image,
  Sparkles,
  Search,
  Timer,
  Heart,
  Wifi,
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
  searchText: string; // plain-text for full-content search
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

function AccordionSection({
  section,
  open,
  onToggle,
}: {
  section: Section;
  open: boolean;
  onToggle: () => void;
}) {
  const Icon = section.icon;

  return (
    <div
      id={`section-${section.id}`}
      className={`rounded-2xl border ${section.border} overflow-hidden`}
      style={{ background: `linear-gradient(145deg, ${section.glow} 0%, var(--card) 60%)` }}
    >
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:scale-[0.99] transition-transform duration-100"
      >
        <div className={`w-8 h-8 rounded-xl ${section.gradient} flex items-center justify-center shadow-sm shrink-0`}>
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
        <div className={`transition-transform duration-200 ${open ? "rotate-90" : "rotate-0"}`}>
          <ChevronRight className="w-4 h-4 text-muted-foreground/50 shrink-0" />
        </div>
      </button>

      {/* Animated collapse via grid-template-rows */}
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <SectionBody>{section.content}</SectionBody>
        </div>
      </div>
    </div>
  );
}

// ─── Section data ─────────────────────────────────────────────────────────────

const sections: Section[] = [
  {
    id: "fluxo",
    icon: ClipboardList,
    title: "Fluxo de Cultivo Recomendado",
    gradient: "bg-primary",
    glow: "rgba(77,184,77,0.10)",
    border: "border-primary/25",
    badge: "Começar aqui",
    searchText:
      "fluxo início começar zero configurar strains estufas ciclo fase vegetativa floração secagem tarefas registro rápido saúde tricomas colheita arquivo manutenção log diário gráficos alertas targets semanais",
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
    gradient: "bg-yellow-500",
    glow: "rgba(234,179,8,0.09)",
    border: "border-yellow-500/25",
    badge: "Principal",
    searchText:
      "registro rápido quicklog botão mais menu temperatura umidade PPFD pH EC rega runoff status estufa saúde de planta sintomas anotação foto tricomas floração mini menu",
    content: (
      <div className="space-y-4">
        <p>O <strong>Registro Rápido</strong> é o coração do app — acessível pelo botão <strong>+</strong> na navegação. Toque uma vez para abrir o mini menu com as 3 opções:</p>
        <div className="space-y-2">
          <div className="rounded-xl border border-border/20 bg-card/50 px-3 py-2.5 space-y-1">
            <p className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5"><Home className="w-3.5 h-3.5" /> Status da Estufa</p>
            <p className="text-xs text-muted-foreground/70">Temperatura, umidade, PPFD, pH, EC, volume de rega e runoff. Ao finalizar, opcionalmente registra saúde das plantas e tricomas.</p>
          </div>
          <div className="rounded-xl border border-border/20 bg-card/50 px-3 py-2.5 space-y-1">
            <p className="text-xs font-semibold text-rose-400 flex items-center gap-1.5"><Heart className="w-3.5 h-3.5" /> Saúde de Planta</p>
            <p className="text-xs text-muted-foreground/70">Registra status, sintomas, anotações e foto para cada planta. É necessário adicionar pelo menos uma foto, sintoma ou anotação para avançar — só o status de saúde não é suficiente.</p>
          </div>
          <div className="rounded-xl border border-border/20 bg-card/50 px-3 py-2.5 space-y-1">
            <p className="text-xs font-semibold text-violet-400 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> Tricomas</p>
            <p className="text-xs text-muted-foreground/70">Exclusivo para estufas de floração. Registra estado (Translúcidos, Opacos, Âmbar, Misturado) e percentuais por planta. Se só houver uma estufa em floração, vai direto para as plantas.</p>
          </div>
        </div>
        <Tip text="Toque fora do menu ou pressione o botão + novamente para fechar. O botão gira 45° quando o menu está aberto." />
      </div>
    ),
  },
  {
    id: "inicio",
    icon: Home,
    title: "Painel Principal",
    gradient: "bg-emerald-500",
    glow: "rgba(16,185,129,0.09)",
    border: "border-emerald-500/25",
    searchText:
      "painel home card estufa temperatura umidade PPFD plantas ativas strain progresso tarefas última atualização verde âmbar vermelho badge",
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
    gradient: "bg-teal-500",
    glow: "rgba(20,184,166,0.09)",
    border: "border-teal-500/25",
    searchText:
      "estufa ciclo fase transição manutenção vegetativa floração colheita secagem logs diários histórico exportar dimensões categoria editar excluir log grade",
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
    gradient: "bg-green-500",
    glow: "rgba(34,197,94,0.09)",
    border: "border-green-500/25",
    badge: "Central do cultivo",
    searchText:
      "planta perfil hero card foto saúde ambiente cultivo arquivo aba mover clonar colher descartar arquivar LST tricomas observações histórico transferência dias cultivo",
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
    gradient: "bg-rose-500",
    glow: "rgba(244,63,94,0.09)",
    border: "border-rose-500/25",
    searchText:
      "saúde planta saudável estressada doente recuperando sintomas tratamento foto registro status status verde amarelo vermelho azul intervenção monitorar",
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
    gradient: "bg-violet-500",
    glow: "rgba(139,92,246,0.09)",
    border: "border-violet-500/25",
    searchText:
      "tricomas translúcidos opacos âmbar misturado colheita floração maturação clear cloudy amber percentual ponto de colheita THC efeito cerebral corporal",
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
    gradient: "bg-orange-500",
    glow: "rgba(249,115,22,0.09)",
    border: "border-orange-500/25",
    searchText:
      "LST treinamento topping FIM super cropping lollipopping defoliação mainlining ScrOG dobramento amarrilho tela ápice galho folha planta resposta técnica",
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
    gradient: "bg-sky-500",
    glow: "rgba(14,165,233,0.09)",
    border: "border-sky-500/25",
    badge: "Novo",
    searchText:
      "ambiente planta histórico ambiental transferência estufa período temperatura umidade PPFD pH EC saúde exportar dados ambientais registro diário",
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
    gradient: "bg-pink-500",
    glow: "rgba(236,72,153,0.09)",
    border: "border-pink-500/25",
    searchText:
      "fotos galeria lightbox zoom navegação download HEIC JPEG iPhone câmera registro saúde hero card planta arquivo histórico contador",
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
    gradient: "bg-blue-500",
    glow: "rgba(59,130,246,0.09)",
    border: "border-blue-500/25",
    badge: "Automático",
    searchText:
      "tarefas semanais automático fase vegetativa floração manutenção secagem progresso marcar concluído badge ações em lote filtrar estufa",
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
    gradient: "bg-indigo-500",
    glow: "rgba(99,102,241,0.09)",
    border: "border-indigo-500/25",
    searchText:
      "calculadora rega automática runoff fertilização nutrição EC PPM lux PPFD VPD pH conversor bomba cronograma vaso predefinições sais minerais NPK",
    content: (
      <div className="space-y-3">
        <p>Ferramentas de cálculo acessíveis pelo ícone de calculadora na navegação.</p>
        {[
          { icon: Timer, color: "text-blue-400", name: "Rega Automática", desc: "Gera cronograma de ciclos por bomba (fluxo, saídas, tempo máx. e descanso) + tamanho do vaso + janela de luz. Calcula horários, duração por ciclo em segundos e ml/planta. Salve predefinições de bomba para reutilizar." },
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
    gradient: "bg-amber-500",
    glow: "rgba(245,158,11,0.09)",
    border: "border-amber-500/25",
    searchText:
      "alertas notificação temperatura umidade PPFD limite mínimo máximo badge vermelho atenção crítico configurar fase estufa marcar visto 10 dias desvio",
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
        <Tip text="Desvios acima de 10% geram alertas de atenção e acima de 20% geram alertas críticos. Alertas marcados como vistos saem do badge — apenas alertas novos são contados. Alertas somem automaticamente após 10 dias." />
      </div>
    ),
  },
  {
    id: "strains",
    icon: Leaf,
    title: "Strains e Targets Semanais",
    gradient: "bg-lime-500",
    glow: "rgba(132,204,22,0.09)",
    border: "border-lime-500/25",
    searchText:
      "strain variedade target semanal temperatura umidade PPFD pH EC clonagem vegetativa floração alertas automáticos pré-cadastradas Orange Punch Gorilla Glue White Widow Northern Lights",
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
    gradient: "bg-cyan-500",
    glow: "rgba(6,182,212,0.09)",
    border: "border-cyan-500/25",
    searchText:
      "histórico gráfico linha tabela logs estufa período data temperatura RH umidade PPFD target comparação 7 dias ponto valor exato",
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
    gradient: "bg-stone-500",
    glow: "rgba(120,113,108,0.09)",
    border: "border-stone-500/25",
    searchText:
      "arquivo planta colhida arquivada histórico peso gramas data finalização estufa origem saúde tricomas LST fotos status filtrar",
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
    gradient: "bg-slate-500",
    glow: "rgba(100,116,139,0.09)",
    border: "border-slate-500/25",
    searchText:
      "configurações tema claro escuro floresta HPS alto contraste notificações push alertas backup exportar importar JSON conta perfil membros grupo manutenção",
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
    id: "sensores",
    icon: Wifi,
    title: "Sensores SmartLife / Tuya",
    gradient: "bg-cyan-500",
    glow: "rgba(6,182,212,0.09)",
    border: "border-cyan-500/25",
    badge: "Novo",
    searchText:
      "sensor SmartLife Tuya temperatura umidade automático Device ID Access ID Secret região QR code leitura cron intervalo ao vivo badge verde registro rápido offline",
    content: (
      <div className="space-y-4">
        <p>Conecte sensores físicos de temperatura e umidade do SmartLife/Tuya para que o app preencha esses campos automaticamente no Registro Rápido.</p>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">Como configurar</p>
          <div className="space-y-2">
            <Step number={1} text='Acesse iot.tuya.com e crie uma conta de desenvolvedor.' />
            <Step number={2} text='Crie um Cloud Project (tipo Smart Home) com Data Center correspondente à sua região (ex: Western America para EUA).' />
            <Step number={3} text='Em Devices → Link App Account, escaneie o QR code com o app SmartLife no celular.' />
            <Step number={4} text='Copie o Access ID e o Access Secret da página inicial do projeto.' />
            <Step number={5} text='No app: Configurações → Integrações → SmartLife → aba API. Cole as credenciais, selecione a região e salve.' />
            <Step number={6} text='Vá para a aba Sensores. Se os dispositivos não carregarem automaticamente, clique no ícone de lápis ✏️ de cada estufa e cole o Device ID manualmente (visível na aba Devices do portal Tuya).' />
            <Step number={7} text='Configure a frequência de leitura (recomendado: 1 hora).' />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">Como funciona no app</p>
          <div className="space-y-1.5">
            {[
              ["Registro Rápido", "Temperatura e umidade são preenchidos automaticamente com a leitura mais recente do sensor (até 2h de validade). Um badge verde indica a origem do dado. Os outros campos (pH, EC, rega, PPFD) continuam manuais."],
              ["Card na estufa", "Cada estufa mostra um card SmartLife com a última leitura, horário, badge AO VIVO e botão de atualizar. O toggle liga/desliga a leitura automática por estufa."],
              ["Leitura forçada", "Use o botão de atualizar no card da estufa para buscar uma leitura imediata sem esperar o intervalo configurado."],
              ["Cron automático", "O servidor verifica a cada 15 min se algum sensor precisa ser lido com base no intervalo configurado. As leituras ficam salvas no banco."],
              ["Dados manuais preservados", "Se o sensor estiver desativado ou offline, o Registro Rápido usa o último valor registrado manualmente — nenhum dado é perdido."],
            ].map(([title, desc]) => (
              <div key={title as string} className="rounded-xl border border-border/20 bg-card/50 px-3 py-2.5">
                <p className="font-semibold text-xs text-foreground/80 mb-1">{title}</p>
                <p className="text-[11px] text-muted-foreground/60 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        <Tip text="O Device ID fica visível no portal iot.tuya.com → seu projeto → aba Devices, na coluna 'Device ID'. Ele tem o formato: eb8168f5771604de9ccjsi" />
        <Tip text="Cada sensor SmartLife de temperatura/umidade pode ser vinculado a apenas uma estufa. Para múltiplas estufas, você precisa de um sensor físico em cada." />
      </div>
    ),
  },
  {
    id: "iphone",
    icon: Smartphone,
    title: "Dicas para iPhone / Mobile",
    gradient: "bg-sky-400",
    glow: "rgba(56,189,248,0.09)",
    border: "border-sky-400/25",
    badge: "Mobile",
    searchText:
      "iPhone mobile PWA instalar tela de início câmera fotos HEIC vibração haptic feedback offline sincronizar teclado numérico abas deslizáveis gráfico ações em lote",
    content: (
      <div className="space-y-3">
        {[
          ["Instale como PWA", "Toque em Compartilhar → Adicionar à Tela de Início para acesso rápido e experiência de app nativo, sem abrir o navegador."],
          ["Fotos direto da câmera", "Use a câmera no app para registrar plantas. Fotos HEIC são convertidas automaticamente para JPEG e comprimidas para 3:4."],
          ["Feedback tátil", "Botões de ação têm vibração ao toque. Ações destrutivas (excluir, descartar) têm vibração mais forte como aviso."],
          ["Modo offline", "Registros feitos sem internet são salvos localmente e sincronizados automaticamente ao reconectar. Um banner âmbar na tela inicial indica registros pendentes com a contagem exata."],
          ["Teclado numérico", "Campos de temperatura, umidade e PPFD abrem o teclado numérico automaticamente para agilizar o registro."],
          ["Abas deslizáveis", "No perfil da planta, deslize horizontalmente para navegar entre as abas Saúde, Ambiente, Cultivo e Arquivo."],
          ["Gráficos cronológicos", "Os gráficos da estufa exibem dados da data mais antiga (esquerda) para a mais recente (direita), com linhas de target sobrepostas para comparação visual."],
          ["Ações em lote", "No menu Plantas, selecione múltiplas plantas e use a barra flutuante para mover, colher, descartar ou excluir em lote de uma só vez."],
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
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());

  const isSearching = searchQuery.trim().length > 0;

  const filtered = isSearching
    ? sections.filter(
        (s) =>
          s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.id.includes(searchQuery.toLowerCase()) ||
          s.searchText.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : sections;

  // Auto-expand matching sections while searching
  useEffect(() => {
    if (isSearching) {
      setOpenSections(new Set(filtered.map((s) => s.id)));
    }
  }, [searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSection = (id: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleChipClick = (id: string) => {
    // Ensure the section is open
    setOpenSections((prev) => { const next = new Set(prev); next.add(id); return next; });
    // Scroll after a tick so the DOM has the section rendered
    setTimeout(() => {
      document.getElementById(`section-${id}`)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 80);
  };

  const subtitle = isSearching
    ? `${filtered.length} de ${sections.length} tópico${filtered.length !== 1 ? "s" : ""} encontrado${filtered.length !== 1 ? "s" : ""}`
    : `${sections.length} tópicos · App Cultivo`;

  return (
    <PageTransition>
      <div className="min-h-screen bg-background pb-28 sm:pb-8">

        <PageHeader
          backHref="/settings"
          title={
            <>
              <BookOpen className="w-4 h-4 text-primary shrink-0" />
              <span className="truncate">Guia do Usuário</span>
            </>
          }
          subtitle={subtitle}
        />

        <div className="px-4 py-4 max-w-2xl md:max-w-4xl mx-auto space-y-4">

          {/* Intro banner — hidden while searching */}
          {!isSearching && (
            <div
              className="rounded-2xl border border-primary/25 px-4 py-3.5 flex items-center gap-3"
              style={{ background: "linear-gradient(135deg, rgba(77,184,77,0.10) 0%, var(--card) 60%)" }}
            >
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-md shrink-0">
                <ClipboardList className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Bem-vindo ao App Cultivo</p>
                <p className="text-[11px] text-muted-foreground/60 mt-0.5 leading-relaxed">
                  Toque em qualquer tópico para expandir as instruções detalhadas.
                </p>
              </div>
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40 pointer-events-none" />
            <input
              type="search"
              aria-label="Buscar tópico"
              placeholder="Buscar tópico…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-10 pl-9 pr-4 rounded-xl border border-border/40 bg-card/80 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40"
            />
          </div>

          {/* Quick nav chips — hidden while searching */}
          {!isSearching && (
            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {[
                { label: "Início Rápido", id: "fluxo" },
                { label: "Registro", id: "quicklog" },
                { label: "Plantas", id: "plantas" },
                { label: "Tricomas", id: "tricomas" },
                { label: "Calculadoras", id: "calculadoras" },
                { label: "Alertas", id: "alertas" },
                { label: "Sensores", id: "sensores" },
                { label: "iPhone", id: "iphone" },
              ].map((chip) => (
                <button
                  key={chip.id}
                  onClick={() => handleChipClick(chip.id)}
                  className="shrink-0 px-3 py-1.5 rounded-full border border-border/40 bg-card text-xs font-medium text-muted-foreground hover:bg-primary/10 hover:border-primary/30 hover:text-primary active:scale-95 transition-[color,background-color,border-color,transform] duration-150"
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
                <Search className="w-8 h-8 text-muted-foreground/30" />
                <div>
                  <p className="text-sm font-medium text-foreground">Nenhum tópico encontrado</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    Tente outro termo — ex: "tricomas", "sensor" ou "backup"
                  </p>
                </div>
              </div>
            ) : (
              filtered.map((section) => (
                <AccordionSection
                  key={section.id}
                  section={section}
                  open={openSections.has(section.id)}
                  onToggle={() => toggleSection(section.id)}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </PageTransition>
  );
}

import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  Play,
  ClipboardList,
  Smartphone,
  Image,
  Zap as ZapIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Section {
  id: string;
  icon: React.ElementType;
  title: string;
  color: string;
  badge?: string;
  content: React.ReactNode;
}

function AccordionSection({ section }: { section: Section }) {
  const [open, setOpen] = useState(false);
  const Icon = section.icon;

  return (
    <Card className="overflow-hidden border border-border/60">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 20px' }}>
          <div className={cn("p-2 rounded-lg shrink-0", section.color)} style={{ flexShrink: 0 }}>
            <Icon className="w-5 h-5 text-white" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span className="text-sm font-semibold text-foreground" style={{ lineHeight: '1.3' }}>{section.title}</span>
              {section.badge && (
                <Badge variant="secondary" className="text-xs" style={{ flexShrink: 0 }}>
                  {section.badge}
                </Badge>
              )}
            </div>
          </div>
          <div style={{ flexShrink: 0 }}>
            {open ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </button>
      {open && (
        <CardContent className="px-5 pb-5 pt-0 border-t border-border/40">
          <div className="pt-4 space-y-4 text-sm text-foreground/90 leading-relaxed">
            {section.content}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function Step({ number, text }: { number: number; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center mt-0.5">
        {number}
      </span>
      <span>{text}</span>
    </div>
  );
}

function Tip({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 bg-primary/5 border border-primary/20 rounded-lg px-3 py-2">
      <Zap className="w-4 h-4 text-primary shrink-0 mt-0.5" />
      <span className="text-xs">{text}</span>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-border/30 last:border-0">
      <span className="text-muted-foreground text-xs font-medium shrink-0">{label}</span>
      <span className="text-xs text-right">{value}</span>
    </div>
  );
}

const sections: Section[] = [
  {
    id: "fluxo",
    icon: Play,
    title: "Fluxo de Cultivo Recomendado",
    color: "bg-primary",
    badge: "Começar aqui",
    content: (
      <div className="space-y-4">
        <p>
          Se você está começando do zero, siga este fluxo para configurar o sistema e tirar o máximo
          proveito de todas as funcionalidades.
        </p>
        <div className="space-y-3">
          <Step number={1} text="Configure as strains em uso (ou use as pré-cadastradas) e defina os targets semanais." />
          <Step number={2} text="Crie as estufas com nome, dimensões e tipo." />
          <Step number={3} text="Inicie um ciclo em cada estufa ativa, selecionando a fase e a(s) strain(s)." />
          <Step number={4} text="Cadastre as plantas de cada estufa com nome, código e data de nascimento." />
          <Step number={5} text="Configure os limites de alertas para cada estufa em Configurações → Alertas." />
          <Step number={6} text="Registre logs diários de temperatura, umidade e PPFD para cada estufa." />
          <Step number={7} text="Acompanhe as tarefas semanais geradas automaticamente e marque as concluídas." />
          <Step number={8} text="Registre a saúde das plantas semanalmente com foto e observações." />
          <Step number={9} text="Na semana de colheita, registre tricomas e finalize a planta para o arquivo." />
        </div>
        <Tip text="Mantenha o hábito de registrar logs diários — são eles que alimentam os gráficos, os alertas e os targets semanais de cada estufa." />
      </div>
    ),
  },
  {
    id: "inicio",
    icon: Home,
    title: "Painel Principal",
    color: "bg-emerald-600",
    content: (
      <div className="space-y-4">
        <p>
          O painel principal exibe um <strong>card para cada estufa</strong> com as informações mais
          recentes. O fotoperíodo é exibido automaticamente: <strong>18/6</strong> para Manutenção,
          Vegetativa e Clonagem; <strong>12/12</strong> para Floração.
        </p>
        <div className="space-y-2">
          <p className="font-medium">O que você vê em cada card:</p>
          <div className="space-y-1">
            <InfoRow label="Nome e fase" value="Ex: Estufa B — Vegetativa (Semana 3)" />
            <InfoRow label="Strain(s)" value="Badge(s) com as variedades em cultivo" />
            <InfoRow label="Temperatura" value="Último valor registrado (°C)" />
            <InfoRow label="Umidade (RH)" value="Último valor registrado (%)" />
            <InfoRow label="PPFD" value="Último valor registrado (µmol/m²/s)" />
            <InfoRow label="Fotoperíodo" value="Automático por fase (18/6 ou 12/12)" />
            <InfoRow label="Plantas" value="Quantidade de plantas ativas na estufa" />
            <InfoRow label="Tarefas" value="Progresso das tarefas da semana atual" />
          </div>
        </div>
        <Tip text="Clique em qualquer card de estufa para acessar os detalhes completos, incluindo gráficos históricos e registro de novo log." />
      </div>
    ),
  },
  {
    id: "estufas",
    icon: Home,
    title: "Estufas e Ciclos",
    color: "bg-teal-600",
    content: (
      <div className="space-y-4">
        <p>
          Cada estufa pode ter um <strong>ciclo ativo</strong> com fase, strain(s) associada(s) e
          semana atual. O ciclo define quais tarefas e targets aparecem automaticamente.
        </p>
        <div className="space-y-2">
          <p className="font-medium">Transições de fase disponíveis:</p>
          <div className="space-y-1">
            <InfoRow label="Manutenção → Vegetativa" value="Início do ciclo produtivo" />
            <InfoRow label="Vegetativa → Floração" value="Mudança para 12/12" />
            <InfoRow label="Floração → Secagem" value="Colheita e início da secagem" />
            <InfoRow label="Secagem → Concluído" value="Encerramento do ciclo" />
          </div>
        </div>
        <div className="space-y-2">
          <p className="font-medium">Como registrar parâmetros:</p>
          <div className="space-y-2">
            <Step number={1} text="Clique em Registrar no card da estufa no painel principal." />
            <Step number={2} text="Preencha Temperatura (°C), Umidade Relativa (%) e PPFD (µmol/m²/s)." />
            <Step number={3} text="O sistema compara automaticamente com os targets da strain e gera alertas se houver desvios." />
          </div>
        </div>
        <Tip text="Use o Registro Rápido no menu lateral para registrar parâmetros de múltiplas estufas em uma única tela, sem navegar entre páginas." />
      </div>
    ),
  },
  {
    id: "plantas",
    icon: Sprout,
    title: "Sistema de Plantas",
    color: "bg-green-600",
    badge: "Central do cultivo",
    content: (
      <div className="space-y-4">
        <p>
          Cada planta tem um <strong>perfil completo</strong> com histórico de saúde, registros de
          tricomas, técnicas de LST aplicadas, observações e galeria de fotos. As plantas são
          agrupadas por estufa na listagem.
        </p>
        <div className="space-y-2">
          <p className="font-medium">Abas disponíveis no perfil:</p>
          <div className="space-y-1">
            <InfoRow label="Saúde" value="Status, sintomas, tratamento e foto" />
            <InfoRow label="Tricomas" value="Maturação com percentuais Clear/Cloudy/Amber/Mixed" />
            <InfoRow label="LST" value="Técnicas aplicadas (LST, Topping, FIM, ScrOG, etc.)" />
            <InfoRow label="Observações" value="Notas livres com data" />
            <InfoRow label="Fotos" value="Galeria completa com lightbox e zoom" />
          </div>
        </div>
        <div className="space-y-2">
          <p className="font-medium">Ações disponíveis no header da planta:</p>
          <div className="space-y-1">
            <InfoRow label="Mover" value="Transferir para outra estufa" />
            <InfoRow label="Transplantar" value="Promover para fase de Floração" />
            <InfoRow label="Clonar" value="Iniciar processo de clonagem" />
            <InfoRow label="Colher" value="Registrar colheita e arquivar" />
            <InfoRow label="Descartar" value="Registrar descarte da planta" />
          </div>
        </div>
        <Tip text="Ao finalizar uma planta (colheita), ela vai automaticamente para o Arquivo de Plantas, preservando todo o histórico para consulta futura." />
      </div>
    ),
  },
  {
    id: "saude",
    icon: Activity,
    title: "Registros de Saúde",
    color: "bg-rose-600",
    content: (
      <div className="space-y-4">
        <p>
          O registro de saúde documenta o estado de cada planta ao longo do ciclo. Cada entrada
          inclui data, status geral, sintomas observados, tratamento aplicado, notas e uma foto
          opcional.
        </p>
        <div className="space-y-2">
          <p className="font-medium">Status disponíveis:</p>
          <div className="space-y-1">
            <InfoRow label="Saudável" value="Planta sem problemas aparentes" />
            <InfoRow label="Atenção" value="Sinais leves — monitorar de perto" />
            <InfoRow label="Problema" value="Intervenção necessária" />
            <InfoRow label="Crítico" value="Situação grave — agir imediatamente" />
          </div>
        </div>
        <div className="space-y-2">
          <p className="font-medium">Como registrar:</p>
          <div className="space-y-2">
            <Step number={1} text="Abra o perfil da planta e acesse a aba Saúde." />
            <Step number={2} text='Clique em "Novo Registro" para expandir o formulário.' />
            <Step number={3} text="Selecione o status, preencha os campos e adicione uma foto se desejar." />
            <Step number={4} text='Clique em "Salvar Registro".' />
          </div>
        </div>
        <Tip text="Fotos tiradas pelo celular (inclusive HEIC do iPhone) são convertidas e comprimidas automaticamente para aspect ratio 3:4 antes do upload." />
      </div>
    ),
  },
  {
    id: "tricomas",
    icon: Camera,
    title: "Análise de Tricomas",
    color: "bg-purple-600",
    content: (
      <div className="space-y-4">
        <p>
          O registro de tricomas ajuda a determinar o <strong>ponto ideal de colheita</strong>. Você
          informa os percentuais de cada tipo e a semana do ciclo em que a análise foi feita.
        </p>
        <div className="space-y-2">
          <p className="font-medium">Tipos de tricomas:</p>
          <div className="space-y-1">
            <InfoRow label="Clear (transparente)" value="Imaturos — aguardar mais tempo" />
            <InfoRow label="Cloudy (leitoso)" value="Maduros — efeito mais cerebral/energético" />
            <InfoRow label="Amber (âmbar)" value="THC degradando — efeito mais corporal/relaxante" />
            <InfoRow label="Mixed (misto)" value="Combinação — ponto de equilíbrio" />
          </div>
        </div>
        <Tip text="A maioria dos cultivadores colhe quando 70–90% dos tricomas estão cloudy e 10–30% amber, dependendo do efeito desejado." />
      </div>
    ),
  },
  {
    id: "lst",
    icon: Scissors,
    title: "Técnicas de LST",
    color: "bg-orange-600",
    content: (
      <div className="space-y-4">
        <p>
          A aba LST (Low Stress Training) registra quais técnicas de treinamento foram aplicadas em
          cada planta, com descrição detalhada de cada técnica e campo para anotar a resposta da
          planta.
        </p>
        <div className="space-y-2">
          <p className="font-medium">Técnicas disponíveis:</p>
          <div className="grid grid-cols-2 gap-1">
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
              <div key={name} className="bg-muted/40 rounded-md px-2 py-1.5">
                <p className="font-medium text-xs">{name}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "fotos",
    icon: Image,
    title: "Galeria de Fotos",
    color: "bg-pink-600",
    content: (
      <div className="space-y-4">
        <p>
          Cada planta tem uma <strong>galeria completa de fotos</strong> acessível na aba Fotos do
          perfil. A última foto registrada é exibida no card da planta na listagem para visualização
          rápida.
        </p>
        <div className="space-y-2">
          <p className="font-medium">Funcionalidades da galeria:</p>
          <div className="space-y-1">
            <InfoRow label="Lightbox" value="Toque na foto para abrir em tela cheia com zoom" />
            <InfoRow label="Navegação" value="Deslize horizontalmente para navegar entre fotos" />
            <InfoRow label="Download" value="Baixe qualquer foto diretamente do lightbox" />
            <InfoRow label="Contador" value="Exibe a posição atual (ex: 3/8)" />
          </div>
        </div>
        <div className="space-y-2">
          <p className="font-medium">Upload de fotos:</p>
          <div className="space-y-2">
            <Step number={1} text="Acesse a aba Saúde, Tricomas ou Fotos no perfil da planta." />
            <Step number={2} text="Toque no botão de câmera para tirar uma foto ou escolher da galeria." />
            <Step number={3} text="A foto é comprimida automaticamente (aspect ratio 3:4, máx 1080×1440px) e enviada para o servidor." />
          </div>
        </div>
        <Tip text="Fotos no formato HEIC/HEIF (padrão do iPhone) são convertidas automaticamente para JPEG antes do upload — sem necessidade de conversão manual." />
      </div>
    ),
  },
  {
    id: "tarefas",
    icon: CheckSquare,
    title: "Tarefas Semanais",
    color: "bg-blue-600",
    badge: "Automático",
    content: (
      <div className="space-y-4">
        <p>
          As tarefas são geradas <strong>automaticamente</strong> com base na fase e semana do ciclo
          ativo de cada estufa. Elas cobrem as fases Vegetativa, Floração, Manutenção e Secagem.
        </p>
        <div className="space-y-2">
          <p className="font-medium">Fases com tarefas automáticas:</p>
          <div className="space-y-1">
            <InfoRow label="Vegetativa" value="Semanas 1–4 (rega, pH, EC, LST, nutrição)" />
            <InfoRow label="Floração" value="Semanas 1–8 (flush, defoliação, tricomas)" />
            <InfoRow label="Manutenção" value="Tarefas recorrentes (limpeza, verificação)" />
            <InfoRow label="Secagem" value="Semanas 1–2 (temp/umidade, verificação de mofo)" />
          </div>
        </div>
        <div className="space-y-2">
          <p className="font-medium">Como usar:</p>
          <div className="space-y-2">
            <Step number={1} text='Acesse "Tarefas" na navegação.' />
            <Step number={2} text="Filtre por estufa usando os botões no topo." />
            <Step number={3} text="Marque as tarefas concluídas clicando no checkbox — o progresso é salvo automaticamente." />
          </div>
        </div>
        <Tip text="O badge de progresso no topo mostra quantas tarefas foram concluídas no total (ex: 7/12). Ele é atualizado em tempo real ao marcar cada item." />
      </div>
    ),
  },
  {
    id: "calculadoras",
    icon: Calculator,
    title: "Calculadoras",
    color: "bg-indigo-600",
    content: (
      <div className="space-y-4">
        <p>
          O módulo de calculadoras reúne ferramentas essenciais para o controle nutricional e
          hídrico do cultivo, todas acessíveis pelo menu Calculadoras.
        </p>
        <div className="space-y-3">
          <div>
            <p className="font-medium flex items-center gap-1.5">
              <Droplets className="w-4 h-4 text-blue-500" /> Rega e Runoff
            </p>
            <p className="text-muted-foreground text-xs mt-1">
              Calcula o volume ideal de rega por planta e o percentual de runoff. O histórico de
              aplicações é salvo por estufa.
            </p>
          </div>
          <div>
            <p className="font-medium flex items-center gap-1.5">
              <FlaskConical className="w-4 h-4 text-green-500" /> Fertilização (Nutrientes)
            </p>
            <p className="text-muted-foreground text-xs mt-1">
              Gera a receita de sais minerais (Nitrato de Cálcio, Sulfato de Potássio, MKP,
              Sulfato de Magnésio, micronutrientes) com EC estimado e NPK resultante. Permite salvar
              receitas para reutilização e exportar em TXT.
            </p>
          </div>
          <div>
            <p className="font-medium flex items-center gap-1.5">
              <Thermometer className="w-4 h-4 text-orange-500" /> Conversor Lux → PPFD
            </p>
            <p className="text-muted-foreground text-xs mt-1">
              Converte leituras de luxímetro para PPFD (µmol/m²/s) com slider visual.
            </p>
          </div>
          <div>
            <p className="font-medium flex items-center gap-1.5">
              <ZapIcon className="w-4 h-4 text-yellow-500" /> Conversor PPM ↔ EC
            </p>
            <p className="text-muted-foreground text-xs mt-1">
              Converte valores entre PPM e EC (mS/cm) bidirecionalmente.
            </p>
          </div>
          <div>
            <p className="font-medium flex items-center gap-1.5">
              <Droplets className="w-4 h-4 text-cyan-500" /> VPD e pH
            </p>
            <p className="text-muted-foreground text-xs mt-1">
              Calculadora de Vapor Pressure Deficit (VPD) e calculadora de ajuste de pH Up/Down.
            </p>
          </div>
        </div>
        <Tip text="Salve predefinições de rega e fertilização para não precisar recalcular toda semana. Elas ficam disponíveis para carregar com um clique." />
      </div>
    ),
  },
  {
    id: "historico",
    icon: BarChart3,
    title: "Histórico e Gráficos",
    color: "bg-cyan-600",
    content: (
      <div className="space-y-4">
        <p>
          A página de Histórico exibe todos os logs diários em formato de tabela e gráficos de linha
          interativos, permitindo visualizar a evolução dos parâmetros ao longo do tempo.
        </p>
        <div className="space-y-2">
          <p className="font-medium">Filtros disponíveis:</p>
          <div className="space-y-1">
            <InfoRow label="Por estufa" value="Visualize dados de uma estufa específica" />
            <InfoRow label="Por período" value="Selecione o intervalo de datas" />
            <InfoRow label="Por parâmetro" value="Temperatura, RH ou PPFD" />
          </div>
        </div>
        <p>
          Os gráficos na página de detalhes de cada estufa mostram os últimos 7 dias com linhas de
          target (valores ideais da strain) para comparação visual imediata.
        </p>
        <Tip text="Clique em qualquer ponto do gráfico para ver o valor exato daquele dia." />
      </div>
    ),
  },
  {
    id: "alertas",
    icon: Bell,
    title: "Sistema de Alertas",
    color: "bg-amber-600",
    content: (
      <div className="space-y-4">
        <p>
          O sistema de alertas monitora os parâmetros de cada estufa e gera notificações quando os
          valores saem dos limites configurados. O badge vermelho na navegação indica alertas não
          lidos.
        </p>
        <div className="space-y-2">
          <p className="font-medium">Parâmetros monitorados:</p>
          <div className="space-y-1">
            <InfoRow label="Temperatura" value="Min/Max em °C por fase" />
            <InfoRow label="Umidade (RH)" value="Min/Max em % por fase" />
            <InfoRow label="PPFD" value="Min/Max em µmol/m²/s por fase" />
          </div>
        </div>
        <div className="space-y-2">
          <p className="font-medium">Configurar limites:</p>
          <div className="space-y-2">
            <Step number={1} text='Acesse "Configurações → Alertas" no menu lateral.' />
            <Step number={2} text="Selecione a estufa e expanda a fase desejada." />
            <Step number={3} text="Ajuste os limites mínimos e máximos para cada parâmetro." />
            <Step number={4} text='Clique em "Salvar" para aplicar.' />
          </div>
        </div>
        <Tip text="Por padrão, desvios acima de 10% geram alertas de atenção e acima de 20% geram alertas críticos. Verifique o histórico em Alertas → Histórico para ver todos os eventos passados." />
      </div>
    ),
  },
  {
    id: "strains",
    icon: Leaf,
    title: "Strains e Targets Semanais",
    color: "bg-lime-600",
    content: (
      <div className="space-y-4">
        <p>
          As strains definem os <strong>targets semanais</strong> de temperatura, umidade e PPFD
          para cada fase do ciclo. Quando uma estufa tem múltiplas strains, os targets são
          calculados como média entre elas.
        </p>
        <div className="space-y-2">
          <p className="font-medium">Como gerenciar:</p>
          <div className="space-y-2">
            <Step number={1} text='Acesse "Strains" na navegação lateral.' />
            <Step number={2} text='Clique em "Nova Strain" para cadastrar uma variedade.' />
            <Step number={3} text='Para definir os targets, clique em "Targets" no card da strain.' />
            <Step number={4} text="Configure os valores ideais por semana e fase (Vega/Flora)." />
          </div>
        </div>
        <Tip text="Strains pré-cadastradas: Orange Punch, 24K Gold, Gorilla Glue #4, White Widow, Northern Lights e Amnesia Haze — com targets já configurados." />
      </div>
    ),
  },
  {
    id: "registro-rapido",
    icon: ZapIcon,
    title: "Registro Rápido",
    color: "bg-yellow-600",
    badge: "Atalho",
    content: (
      <div className="space-y-4">
        <p>
          O <strong>Registro Rápido</strong> permite registrar parâmetros de múltiplas estufas em
          uma única tela, sem precisar navegar entre as páginas de cada estufa. Ideal para o
          registro diário rápido.
        </p>
        <div className="space-y-2">
          <p className="font-medium">Como usar:</p>
          <div className="space-y-2">
            <Step number={1} text='Acesse "Registro Rápido" no menu lateral.' />
            <Step number={2} text="Preencha temperatura, umidade e PPFD para cada estufa ativa." />
            <Step number={3} text="Clique em Registrar para salvar todos os logs de uma vez." />
          </div>
        </div>
        <Tip text="Use o Registro Rápido como rotina diária — leva menos de 1 minuto para registrar as 3 estufas de uma vez." />
      </div>
    ),
  },
  {
    id: "arquivo",
    icon: Archive,
    title: "Arquivo de Plantas",
    color: "bg-stone-600",
    content: (
      <div className="space-y-4">
        <p>
          Quando uma planta é finalizada (colhida), ela é movida para o{" "}
          <strong>Arquivo de Plantas</strong>, onde todo o histórico é preservado para consulta
          futura — saúde, tricomas, LST, fotos e dados da colheita.
        </p>
        <div className="space-y-2">
          <p className="font-medium">Como acessar:</p>
          <div className="space-y-2">
            <Step number={1} text='Acesse "Plantas" na navegação.' />
            <Step number={2} text='Clique em "Arquivo" no topo da página de listagem.' />
          </div>
        </div>
        <div className="space-y-2">
          <p className="font-medium">Informações exibidas por planta arquivada:</p>
          <div className="space-y-1">
            <InfoRow label="Estufa de origem" value="Onde a planta foi cultivada" />
            <InfoRow label="Peso colhido" value="Em gramas (se registrado)" />
            <InfoRow label="Notas do ciclo" value="Observações finais do cultivador" />
            <InfoRow label="Data de finalização" value="Quando a planta foi colhida" />
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "configuracoes",
    icon: Settings,
    title: "Configurações",
    color: "bg-slate-600",
    content: (
      <div className="space-y-4">
        <p>
          A página de Configurações centraliza as preferências do sistema, notificações e opções de
          manutenção do app.
        </p>
        <div className="space-y-2">
          <p className="font-medium">Seções disponíveis:</p>
          <div className="space-y-1">
            <InfoRow label="Tema" value="Claro, Escuro ou Alto Contraste" />
            <InfoRow label="Notificações" value="Ativar alertas push no navegador" />
            <InfoRow label="Alertas" value="Configurar limites por estufa e fase" />
            <InfoRow label="Backup" value="Exportar e importar todos os dados em JSON" />
          </div>
        </div>
        <Tip text="Ative as notificações do navegador em Configurações → Notificações para receber alertas mesmo quando o app estiver em segundo plano." />
      </div>
    ),
  },
  {
    id: "iphone",
    icon: Smartphone,
    title: "Dicas para iPhone",
    color: "bg-sky-600",
    badge: "Mobile",
    content: (
      <div className="space-y-4">
        <p>
          O App Cultivo foi otimizado para uso no iPhone. Algumas dicas para aproveitar ao máximo:
        </p>
        <div className="space-y-3">
          <div className="bg-muted/40 rounded-lg p-3">
            <p className="font-medium text-xs mb-1">📲 Instale como PWA</p>
            <p className="text-xs text-muted-foreground">
              Toque em <strong>Compartilhar → Adicionar à Tela de Início</strong> para acesso rápido
              e experiência de app nativo, sem precisar abrir o navegador.
            </p>
          </div>
          <div className="bg-muted/40 rounded-lg p-3">
            <p className="font-medium text-xs mb-1">📷 Fotos direto da câmera</p>
            <p className="text-xs text-muted-foreground">
              Use a câmera diretamente no app para registrar o estado das plantas. Fotos HEIC são
              convertidas automaticamente para JPEG e comprimidas para aspect ratio 3:4.
            </p>
          </div>
          <div className="bg-muted/40 rounded-lg p-3">
            <p className="font-medium text-xs mb-1">📳 Feedback tátil</p>
            <p className="text-xs text-muted-foreground">
              Os botões de ação têm vibração e animação ao toque para confirmar a interação. Ações
              destrutivas (excluir, descartar) têm vibração mais forte como aviso.
            </p>
          </div>
          <div className="bg-muted/40 rounded-lg p-3">
            <p className="font-medium text-xs mb-1">↔️ Scroll nas abas</p>
            <p className="text-xs text-muted-foreground">
              No perfil da planta, deslize horizontalmente para navegar entre as abas Saúde,
              Tricomas, LST, Observações e Fotos.
            </p>
          </div>
          <div className="bg-muted/40 rounded-lg p-3">
            <p className="font-medium text-xs mb-1">🔢 Teclado numérico</p>
            <p className="text-xs text-muted-foreground">
              Campos de temperatura, umidade e PPFD abrem automaticamente o teclado numérico para
              agilizar o registro.
            </p>
          </div>
        </div>
      </div>
    ),
  },
];

export default function Help() {
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = searchQuery.trim()
    ? sections.filter(
        (s) =>
          s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          searchQuery.toLowerCase().includes(s.id)
      )
    : sections;

  return (
    <PageTransition>
      <div className="min-h-screen bg-background pb-28 sm:pb-8">
        {/* Header */}
        <div className="bg-card border-b border-border sticky top-0 z-10">
          <div className="container mx-auto px-4 py-3 flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" aria-label="Voltar">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg sm:text-xl font-bold text-foreground truncate flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-primary shrink-0" />
                Guia do Usuário
              </h1>
              <p className="text-xs text-muted-foreground hidden sm:block">
                Aprenda a usar todas as funcionalidades do App Cultivo
              </p>
            </div>
            <Badge variant="outline" className="shrink-0 text-xs">
              {sections.length} tópicos
            </Badge>
          </div>
        </div>

        <div className="container mx-auto px-4 py-5 max-w-2xl">
          {/* Intro card */}
          <Card className="mb-5 bg-primary/5 border-primary/20">
            <CardContent className="py-4 px-5">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-primary shrink-0">
                  <ClipboardList className="w-5 h-5 text-primary-foreground" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Bem-vindo ao App Cultivo</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Este guia cobre todas as funcionalidades do sistema. Clique em qualquer tópico
                    abaixo para expandir as instruções detalhadas.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Search */}
          <div className="relative mb-4">
            <input
              type="search"
              placeholder="Buscar tópico..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-11 pl-4 pr-4 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          {/* Quick nav chips */}
          {!searchQuery && (
            <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-none">
              {[
                { label: "Início Rápido", id: "fluxo" },
                { label: "Plantas", id: "plantas" },
                { label: "Tarefas", id: "tarefas" },
                { label: "Alertas", id: "alertas" },
                { label: "Calculadoras", id: "calculadoras" },
                { label: "iPhone", id: "iphone" },
              ].map((chip) => (
                <button
                  key={chip.id}
                  onClick={() => {
                    const el = document.getElementById(`section-${chip.id}`);
                    el?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className="shrink-0 px-3 py-1.5 rounded-full border border-border bg-card text-xs font-medium hover:bg-primary/10 hover:border-primary/40 transition-colors"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          )}

          {/* Sections */}
          <div className="space-y-3">
            {filtered.length === 0 ? (
              <Card>
                <CardContent className="py-10 flex flex-col items-center gap-2 text-center">
                  <AlertTriangle className="w-10 h-10 text-muted-foreground/40" />
                  <p className="font-medium">Nenhum tópico encontrado</p>
                  <p className="text-sm text-muted-foreground">Tente outro termo de busca</p>
                </CardContent>
              </Card>
            ) : (
              filtered.map((section) => (
                <div key={section.id} id={`section-${section.id}`}>
                  <AccordionSection section={section} />
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="mt-8 text-center text-xs text-muted-foreground">
            <p>App Cultivo — Gerenciamento de Estufas</p>
            <p className="mt-1">Dúvidas? Registre uma observação em qualquer planta ou estufa.</p>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}

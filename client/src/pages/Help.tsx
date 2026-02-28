import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Sun,
  FlaskConical,
  Camera,
  Activity,
  Scissors,
  Archive,
  AlertTriangle,
  BookOpen,
  Zap,
  RefreshCw,
  Plus,
  Play,
  ClipboardList,
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
        className="w-full text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="flex items-center gap-3 py-4 px-5">
          <div className={cn("p-2 rounded-lg shrink-0", section.color)}>
            <Icon className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground leading-tight">{section.title}</span>
              {section.badge && (
                <Badge variant="secondary" className="text-xs shrink-0">
                  {section.badge}
                </Badge>
              )}
            </div>
          </div>
          {open ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          )}
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
    id: "inicio",
    icon: Home,
    title: "Tela Inicial — Visão Geral",
    color: "bg-emerald-600",
    badge: "Ponto de partida",
    content: (
      <div className="space-y-4">
        <p>
          A tela inicial exibe os <strong>cards de cada estufa</strong> com os parâmetros mais
          recentes: temperatura, umidade relativa (RH) e intensidade de luz (PPFD). Os valores são
          atualizados conforme você registra logs diários.
        </p>
        <div className="space-y-2">
          <p className="font-medium">O que você vê em cada card de estufa:</p>
          <div className="space-y-1">
            <InfoRow label="Nome e fase" value="Ex: Estufa B — Vegetativo (Semana 3)" />
            <InfoRow label="Strain(s)" value="Badge(s) com as strains em cultivo" />
            <InfoRow label="Temperatura" value="Último valor registrado (°C)" />
            <InfoRow label="Umidade" value="Último valor registrado (%)" />
            <InfoRow label="PPFD" value="Último valor registrado (µmol/m²/s)" />
            <InfoRow label="Plantas" value="Quantidade de plantas ativas na estufa" />
          </div>
        </div>
        <Tip text="Clique em qualquer card de estufa para acessar os detalhes completos, incluindo gráficos históricos e registro de novo log." />
      </div>
    ),
  },
  {
    id: "estufas",
    icon: RefreshCw,
    title: "Gerenciar Estufas e Ciclos",
    color: "bg-teal-600",
    content: (
      <div className="space-y-4">
        <p>
          Cada estufa pode ter um <strong>ciclo ativo</strong> com fase (Vegetativo, Floração,
          Manutenção ou Secagem), strain(s) associada(s) e semana atual. O ciclo define quais
          tarefas e targets aparecem automaticamente.
        </p>
        <div className="space-y-2">
          <p className="font-medium">Como iniciar um ciclo:</p>
          <div className="space-y-2">
            <Step number={1} text='Na tela inicial, clique no card da estufa desejada.' />
            <Step number={2} text='Clique em "Iniciar Ciclo" na página de detalhes.' />
            <Step number={3} text="Selecione a fase, a(s) strain(s) e a data de início." />
            <Step number={4} text='Confirme. As tarefas da semana 1 aparecem automaticamente em "Tarefas".' />
          </div>
        </div>
        <div className="space-y-2">
          <p className="font-medium">Como registrar um log diário:</p>
          <div className="space-y-2">
            <Step number={1} text="Acesse a página de detalhes da estufa." />
            <Step number={2} text='Clique em "Registrar Log" no topo da página.' />
            <Step number={3} text="Informe temperatura, umidade e PPFD do dia." />
          </div>
        </div>
        <Tip text="Use o Log Rápido (ícone de raio na barra inferior) para registrar logs de múltiplas estufas de uma vez, sem precisar navegar para cada uma." />
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
          <p className="font-medium">Como criar uma planta:</p>
          <div className="space-y-2">
            <Step number={1} text='Acesse "Plantas" na navegação lateral.' />
            <Step number={2} text='Clique em "Nova Planta" no canto superior direito.' />
            <Step number={3} text="Preencha nome, código, strain, estufa de destino e data de germinação." />
            <Step number={4} text="A planta aparece na listagem com badge de saúde e foto (se cadastrada)." />
          </div>
        </div>
        <div className="space-y-2">
          <p className="font-medium">Abas disponíveis no perfil da planta:</p>
          <div className="space-y-1">
            <InfoRow label="Saúde" value="Registros com status, sintomas, tratamento e foto" />
            <InfoRow label="Tricomas" value="Status (clear/cloudy/amber/mixed) com percentuais" />
            <InfoRow label="LST" value="Técnicas aplicadas (LST, Topping, FIM, ScrOG, etc.)" />
            <InfoRow label="Observações" value="Notas livres com data" />
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
        <Tip text="Fotos tiradas pelo celular (inclusive HEIC do iPhone) são convertidas e comprimidas automaticamente antes do upload." />
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
          informa os percentuais de cada tipo de tricoma e a semana do ciclo em que a análise foi
          feita.
        </p>
        <div className="space-y-2">
          <p className="font-medium">Tipos de tricomas:</p>
          <div className="space-y-1">
            <InfoRow label="Clear (transparente)" value="Planta ainda imatura — aguardar" />
            <InfoRow label="Cloudy (leitoso)" value="THC no pico — efeito mais cerebral" />
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
    id: "tarefas",
    icon: CheckSquare,
    title: "Tarefas Semanais",
    color: "bg-blue-600",
    badge: "Automático",
    content: (
      <div className="space-y-4">
        <p>
          As tarefas são geradas <strong>automaticamente</strong> com base na fase e semana do ciclo
          ativo de cada estufa. Elas cobrem as fases Vegetativo, Floração, Manutenção e Secagem.
        </p>
        <div className="space-y-2">
          <p className="font-medium">Como usar:</p>
          <div className="space-y-2">
            <Step number={1} text='Acesse "Tarefas" na navegação.' />
            <Step number={2} text="Filtre por estufa usando os botões no topo (scroll horizontal no mobile)." />
            <Step number={3} text="Marque as tarefas concluídas clicando no checkbox." />
            <Step number={4} text='Na aba "Gerenciar", crie templates personalizados para qualquer fase e semana.' />
          </div>
        </div>
        <div className="space-y-2">
          <p className="font-medium">Fases com tarefas automáticas:</p>
          <div className="space-y-1">
            <InfoRow label="Vegetativo" value="Semanas 1–4 (rega, pH, EC, LST, nutrição)" />
            <InfoRow label="Floração" value="Semanas 1–8 (flush, defoliação, tricomas)" />
            <InfoRow label="Manutenção" value="Tarefas recorrentes (limpeza, verificação)" />
            <InfoRow label="Secagem" value="Semanas 1–2 (temp/umidade, verificação de mofo)" />
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
          O módulo de calculadoras reúne três ferramentas essenciais para o controle nutricional e
          hídrico do cultivo, todas acessíveis por abas na mesma página.
        </p>
        <div className="space-y-3">
          <div>
            <p className="font-medium flex items-center gap-1.5">
              <Droplets className="w-4 h-4 text-blue-500" /> Calculadora de Rega
            </p>
            <p className="text-muted-foreground text-xs mt-1">
              Calcula o volume ideal de rega por planta e o volume total para a estufa, com ajuste
              automático baseado no runoff real medido.
            </p>
          </div>
          <div>
            <p className="font-medium flex items-center gap-1.5">
              <FlaskConical className="w-4 h-4 text-green-500" /> Calculadora de Fertilização
            </p>
            <p className="text-muted-foreground text-xs mt-1">
              Gera a receita de nutrientes (EC, NPK) baseada na fase e semana do ciclo. Permite
              salvar predefinições para reutilizar e exportar a receita em TXT.
            </p>
          </div>
          <div>
            <p className="font-medium flex items-center gap-1.5">
              <Thermometer className="w-4 h-4 text-orange-500" /> Calculadora de Runoff
            </p>
            <p className="text-muted-foreground text-xs mt-1">
              Calcula o percentual de runoff ideal, volume esperado e fornece dicas de ajuste com
              base nos valores informados.
            </p>
          </div>
        </div>
        <Tip text="Salve predefinições de rega e fertilização para não precisar recalcular toda semana. Elas ficam disponíveis para carregar com um clique." />
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
          <p className="font-medium">Como configurar:</p>
          <div className="space-y-2">
            <Step number={1} text='Acesse "Alertas" e clique em "Configurações" no topo.' />
            <Step number={2} text="Selecione a estufa e expanda o accordion da fase desejada." />
            <Step number={3} text="Ajuste os limites mínimos e máximos de temperatura, umidade e PPFD." />
            <Step number={4} text='Clique em "Salvar" para aplicar as configurações.' />
          </div>
        </div>
        <div className="space-y-2">
          <p className="font-medium">Parâmetros monitorados:</p>
          <div className="space-y-1">
            <InfoRow label="Temperatura" value="Min/Max em °C por fase" />
            <InfoRow label="Umidade (RH)" value="Min/Max em % por fase" />
            <InfoRow label="PPFD" value="Min/Max em µmol/m²/s por fase" />
          </div>
        </div>
        <Tip text="Os alertas são verificados automaticamente toda vez que você registra um log diário. Verifique o histórico em Alertas → Histórico para ver todos os eventos passados." />
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
        <Tip text="Strains pré-cadastradas: 24K Gold, Candy Kush, Northern Lights, White Widow, Gorilla Glue e Amnesia Haze — com targets já configurados." />
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
            <InfoRow label="Tema" value="Claro, Escuro ou Sistema (automático)" />
            <InfoRow label="Notificações" value="Ativar/desativar alertas por tipo" />
            <InfoRow label="Alertas" value="Configurar limites por estufa e fase" />
            <InfoRow label="Backup" value="Exportar e importar dados do sistema" />
          </div>
        </div>
        <Tip text="Ative as notificações do navegador em Configurações → Notificações para receber alertas mesmo quando o app estiver em segundo plano." />
      </div>
    ),
  },
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
        <div className="space-y-2">
          <div className="space-y-3">
            <Step number={1} text="Configure as strains em uso (ou use as pré-cadastradas) e defina os targets semanais." />
            <Step number={2} text="Inicie um ciclo em cada estufa ativa, selecionando a fase e a(s) strain(s)." />
            <Step number={3} text="Cadastre as plantas de cada estufa com nome, código e data de germinação." />
            <Step number={4} text="Configure os limites de alertas para cada estufa em Configurações → Alertas." />
            <Step number={5} text="Registre logs diários de temperatura, umidade e PPFD para cada estufa." />
            <Step number={6} text="Acompanhe as tarefas semanais geradas automaticamente e marque as concluídas." />
            <Step number={7} text="Registre a saúde das plantas semanalmente com foto e observações." />
            <Step number={8} text="Na semana de colheita, registre tricomas e finalize a planta para o arquivo." />
          </div>
        </div>
        <Tip text="Mantenha o hábito de registrar logs diários — são eles que alimentam os gráficos, os alertas e os targets semanais de cada estufa." />
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
        <div className="bg-card/80 backdrop-blur-sm border-b border-border sticky top-0 z-10">
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
                    Este guia cobre as principais funcionalidades do sistema. Clique em qualquer
                    tópico abaixo para expandir as instruções detalhadas.
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

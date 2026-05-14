/**
 * OnboardingWizard — guia de 3 passos pro primeiro user.
 *
 * Trigger: Home detecta `tents.length === 0` + flag wizard_done não está
 * no localStorage. Se positivo, redireciona pra /onboarding.
 *
 * Steps:
 *   1. Criar primeira estufa (com exemplo pré-preenchido)
 *   2. Cadastrar primeira strain (lista de famosas + opção custom)
 *   3. Adicionar primeira planta (auto-vincula estufa + strain criados)
 *
 * Cada step tem botão "Pular tutorial" no canto que sai pra Home e marca
 * flag (não mostra de novo). User também pode pular individual passos
 * 2 e 3 — mas se pular passo 1, fica sem estufa nenhuma e o app fica
 * "vazio". Por isso passo 1 não tem skip, só "Pular tutorial todo".
 *
 * Estado: useState local nos 3 passos. Não precisa de Redux/Context —
 * componente é self-contained e termina rápido.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Sprout, Leaf, Home, ChevronRight, ChevronLeft, X, Check,
  Loader2, AlertCircle, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FAMOUS_STRAINS, type FamousStrain } from "./famousStrains";

const WIZARD_DONE_KEY = "cultivo_onboarding_done";

/** Marca wizard como completo no localStorage. Não mostra de novo. */
export function markWizardDone() {
  try {
    localStorage.setItem(WIZARD_DONE_KEY, "1");
  } catch {
    /* localStorage indisponível (modo privado) — wizard pode aparecer de novo, no problem */
  }
}

/** Checa se wizard já foi completado/pulado. */
export function isWizardDone(): boolean {
  try {
    return localStorage.getItem(WIZARD_DONE_KEY) === "1";
  } catch {
    return false;
  }
}

// ─── Tipos de estado ──────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | "done";

interface TentDraft {
  name: string;
  category: "VEGA" | "FLORA" | "MAINTENANCE" | "DRYING";
  width: number;
  depth: number;
  height: number;
}

interface StrainDraft {
  name: string;
  vegaWeeks: number;
  floraWeeks: number;
  origin: "FEMINIZED" | "AUTOFLOWER" | "CLONE";
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function OnboardingWizard() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<Step>(1);

  // Estado dos 3 forms (cada step preenche o seu)
  const [tentDraft, setTentDraft] = useState<TentDraft>({
    name: "Estufa A",
    category: "VEGA",
    width: 80,
    depth: 80,
    height: 160,
  });

  const [strainDraft, setStrainDraft] = useState<StrainDraft>({
    name: "",
    vegaWeeks: 4,
    floraWeeks: 8,
    origin: "FEMINIZED",
  });

  const [plantDraft, setPlantDraft] = useState<{ name: string; code: string }>({
    name: "Planta 1",
    code: "",
  });

  // IDs criados nos passos anteriores (pra usar no step 3)
  const [createdTentId, setCreatedTentId] = useState<number | null>(null);
  const [createdStrainId, setCreatedStrainId] = useState<number | null>(null);

  // tRPC mutations
  const createTent = trpc.tents.create.useMutation();
  const createStrain = trpc.strains.create.useMutation();
  const createPlant = trpc.plants.create.useMutation();

  // Pra invalidar queries após criação
  const utils = trpc.useUtils();

  /** Pula tutorial todo — vai pra Home e nunca mostra de novo */
  function skipAll() {
    markWizardDone();
    setLocation("/");
  }

  /** Submete passo atual e avança */
  async function handleStep1Submit() {
    if (!tentDraft.name.trim()) {
      toast.error("Dá um nome pra estufa");
      return;
    }
    try {
      const result = await createTent.mutateAsync(tentDraft);
      setCreatedTentId(result.id);
      utils.tents.list.invalidate();
      setStep(2);
    } catch (e: any) {
      toast.error(`Erro ao criar estufa: ${e.message}`);
    }
  }

  async function handleStep2Submit() {
    if (!strainDraft.name.trim()) {
      toast.error("Escolhe uma strain ou digita um nome");
      return;
    }
    try {
      await createStrain.mutateAsync({
        name: strainDraft.name,
        vegaWeeks: strainDraft.vegaWeeks,
        floraWeeks: strainDraft.floraWeeks,
        origin: strainDraft.origin,
      });
      // strains.create não retorna ID — busca pelo nome (recém-criado)
      const allStrains = await utils.strains.list.fetch();
      const created = (allStrains as any[])?.find(s => s.name === strainDraft.name);
      if (created?.id) setCreatedStrainId(created.id);
      utils.strains.list.invalidate();
      setStep(3);
    } catch (e: any) {
      toast.error(`Erro ao criar strain: ${e.message}`);
    }
  }

  async function handleStep3Submit() {
    if (!plantDraft.name.trim()) {
      toast.error("Dá um nome pra planta");
      return;
    }
    if (!createdTentId || !createdStrainId) {
      toast.error("Estado inválido — recomeça o wizard");
      return;
    }
    try {
      await createPlant.mutateAsync({
        name: plantDraft.name,
        code: plantDraft.code || undefined,
        strainId: createdStrainId,
        currentTentId: createdTentId,
      });
      utils.plants.list?.invalidate?.();
      setStep("done");
    } catch (e: any) {
      toast.error(`Erro ao criar planta: ${e.message}`);
    }
  }

  function finish() {
    markWizardDone();
    setLocation("/");
  }

  function skipStep2() {
    // Pular strain: wizard termina (não dá pra criar planta sem strain)
    markWizardDone();
    toast.info("Tudo bem! Você pode criar strains e plantas depois em Estufas → Plantas");
    setLocation("/");
  }

  function skipStep3() {
    // Pular planta: estufa + strain criadas, só faltou planta
    markWizardDone();
    toast.success("Você pode adicionar plantas depois pelo botão + da estufa");
    setLocation("/");
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header com progress + skip */}
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border/30">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between max-w-2xl">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-primary/15 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
                Configuração inicial
              </p>
              <p className="text-sm font-semibold">Bem-vindo ao Cultivo</p>
            </div>
          </div>
          {step !== "done" && (
            <button
              onClick={skipAll}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-muted/50 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Pular tutorial
            </button>
          )}
        </div>

        {/* Progress dots */}
        <div className="container mx-auto px-4 pb-3 max-w-2xl">
          <div className="flex items-center gap-2">
            {[1, 2, 3].map((n) => {
              const current = typeof step === "number" ? step : 4;
              const active = current >= n;
              const completed = current > n || step === "done";
              return (
                <div
                  key={n}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                    completed ? "bg-primary" : active ? "bg-primary/40" : "bg-muted"
                  }`}
                />
              );
            })}
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-8 max-w-2xl">
        {step === 1 && (
          <Step1Tent
            draft={tentDraft}
            onChange={setTentDraft}
            onSubmit={handleStep1Submit}
            submitting={createTent.isPending}
          />
        )}
        {step === 2 && (
          <Step2Strain
            draft={strainDraft}
            onChange={setStrainDraft}
            onSubmit={handleStep2Submit}
            onBack={() => setStep(1)}
            onSkip={skipStep2}
            submitting={createStrain.isPending}
          />
        )}
        {step === 3 && (
          <Step3Plant
            draft={plantDraft}
            tentName={tentDraft.name}
            strainName={strainDraft.name}
            onChange={setPlantDraft}
            onSubmit={handleStep3Submit}
            onBack={() => setStep(2)}
            onSkip={skipStep3}
            submitting={createPlant.isPending}
          />
        )}
        {step === "done" && <DoneView onFinish={finish} />}
      </main>
    </div>
  );
}

// ─── Step 1: Estufa ───────────────────────────────────────────────────────────

function Step1Tent({
  draft,
  onChange,
  onSubmit,
  submitting,
}: {
  draft: TentDraft;
  onChange: (d: TentDraft) => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex w-14 h-14 rounded-2xl bg-emerald-500/15 items-center justify-center mb-2">
          <Home className="w-7 h-7 text-emerald-400" />
        </div>
        <h1 className="text-2xl font-bold">Crie sua primeira estufa</h1>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          A estufa é onde suas plantas vivem. Você pode editar tudo depois — preenchemos com
          um exemplo pra você só clicar e seguir.
        </p>
      </div>

      <div className="bg-card border border-border/30 rounded-2xl p-5 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="tent-name">Nome da estufa</Label>
          <Input
            id="tent-name"
            value={draft.name}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
            placeholder="Ex: Estufa A"
          />
          <p className="text-[11px] text-muted-foreground/70">
            Use algo curto. Ex: "Estufa A", "Veg 1", "Box flora".
          </p>
        </div>

        <div className="space-y-1.5">
          <Label>Categoria</Label>
          <div className="grid grid-cols-2 gap-2">
            {([
              { v: "VEGA", l: "Vegetativa", d: "Crescimento (18/6h)" },
              { v: "FLORA", l: "Floração", d: "Produção (12/12h)" },
              { v: "MAINTENANCE", l: "Manutenção", d: "Mães + clones" },
              { v: "DRYING", l: "Secagem", d: "Pós-colheita" },
            ] as const).map((opt) => (
              <button
                key={opt.v}
                type="button"
                onClick={() => onChange({ ...draft, category: opt.v })}
                className={`text-left px-3 py-2.5 rounded-xl border transition-all ${
                  draft.category === opt.v
                    ? "bg-primary/10 border-primary text-foreground"
                    : "bg-card border-border/30 hover:border-border/60"
                }`}
              >
                <p className="text-sm font-semibold">{opt.l}</p>
                <p className="text-[10px] text-muted-foreground">{opt.d}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Dimensões (cm)</Label>
          <div className="grid grid-cols-3 gap-2">
            {(["width", "depth", "height"] as const).map((k) => (
              <div key={k}>
                <Input
                  type="number"
                  value={draft[k]}
                  onChange={(e) =>
                    onChange({ ...draft, [k]: Math.max(1, parseInt(e.target.value) || 0) })
                  }
                  min={1}
                />
                <p className="text-[10px] text-muted-foreground text-center mt-1">
                  {k === "width" ? "Largura" : k === "depth" ? "Profundidade" : "Altura"}
                </p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground/70">
            Volume calculado automaticamente. Usado pra cálculo de PPFD ideal.
          </p>
        </div>
      </div>

      <Button onClick={onSubmit} disabled={submitting} className="w-full" size="lg">
        {submitting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Criando estufa...
          </>
        ) : (
          <>
            Criar e continuar
            <ChevronRight className="w-4 h-4 ml-1" />
          </>
        )}
      </Button>
    </div>
  );
}

// ─── Step 2: Strain ───────────────────────────────────────────────────────────

function Step2Strain({
  draft,
  onChange,
  onSubmit,
  onBack,
  onSkip,
  submitting,
}: {
  draft: StrainDraft;
  onChange: (d: StrainDraft) => void;
  onSubmit: () => void;
  onBack: () => void;
  onSkip: () => void;
  submitting: boolean;
}) {
  function pickFamous(s: FamousStrain) {
    onChange({
      name: s.name,
      vegaWeeks: s.vegaWeeks,
      floraWeeks: s.floraWeeks,
      origin: "FEMINIZED",
    });
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex w-14 h-14 rounded-2xl bg-green-500/15 items-center justify-center mb-2">
          <Sprout className="w-7 h-7 text-green-400" />
        </div>
        <h1 className="text-2xl font-bold">Cadastre uma strain</h1>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Strain é a variedade genética. Toca em uma das famosas pra preencher tempos
          automáticos, ou digita o nome da sua.
        </p>
      </div>

      {/* Lista de strains famosas */}
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wider text-muted-foreground/60 font-semibold px-1">
          Strains populares
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {FAMOUS_STRAINS.map((s) => {
            const selected = draft.name === s.name;
            return (
              <button
                key={s.name}
                type="button"
                onClick={() => pickFamous(s)}
                className={`text-left px-3.5 py-3 rounded-xl border transition-all ${
                  selected
                    ? "bg-primary/10 border-primary"
                    : "bg-card border-border/30 hover:border-border/60"
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="text-sm font-semibold">{s.name}</p>
                  {selected && <Check className="w-4 h-4 text-primary shrink-0" />}
                </div>
                <p className="text-[10px] text-muted-foreground mb-1.5">
                  {s.type} · Veg {s.vegaWeeks}sem · Flora {s.floraWeeks}sem
                </p>
                <p className="text-[11px] text-muted-foreground/80 line-clamp-2 leading-snug">
                  {s.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* OU customizado */}
      <div className="bg-card border border-border/30 rounded-2xl p-5 space-y-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground/60 font-semibold">
          Ou customize
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="strain-name">Nome</Label>
          <Input
            id="strain-name"
            value={draft.name}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
            placeholder="Ex: minha genética..."
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="strain-veg">Semanas de Vega</Label>
            <Input
              id="strain-veg"
              type="number"
              min={1}
              max={12}
              value={draft.vegaWeeks}
              onChange={(e) =>
                onChange({ ...draft, vegaWeeks: Math.max(1, Math.min(12, parseInt(e.target.value) || 1)) })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="strain-flora">Semanas de Flora</Label>
            <Input
              id="strain-flora"
              type="number"
              min={1}
              max={16}
              value={draft.floraWeeks}
              onChange={(e) =>
                onChange({ ...draft, floraWeeks: Math.max(1, Math.min(16, parseInt(e.target.value) || 1)) })
              }
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Origem</Label>
          <div className="grid grid-cols-3 gap-2">
            {(["FEMINIZED", "AUTOFLOWER", "CLONE"] as const).map((opt) => {
              const labels = { FEMINIZED: "Feminizada", AUTOFLOWER: "Auto", CLONE: "Clone" };
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => onChange({ ...draft, origin: opt })}
                  className={`px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                    draft.origin === opt
                      ? "bg-primary/10 border-primary text-foreground"
                      : "bg-card border-border/30 hover:border-border/60"
                  }`}
                >
                  {labels[opt]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={onBack} disabled={submitting}>
          <ChevronLeft className="w-4 h-4 mr-1" />
          Voltar
        </Button>
        <button
          onClick={onSkip}
          disabled={submitting}
          className="text-xs text-muted-foreground hover:text-foreground px-3 py-2"
        >
          Pular este passo
        </button>
        <Button onClick={onSubmit} disabled={submitting} className="ml-auto" size="lg">
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Criando...
            </>
          ) : (
            <>
              Criar e continuar
              <ChevronRight className="w-4 h-4 ml-1" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// ─── Step 3: Planta ───────────────────────────────────────────────────────────

function Step3Plant({
  draft,
  tentName,
  strainName,
  onChange,
  onSubmit,
  onBack,
  onSkip,
  submitting,
}: {
  draft: { name: string; code: string };
  tentName: string;
  strainName: string;
  onChange: (d: { name: string; code: string }) => void;
  onSubmit: () => void;
  onBack: () => void;
  onSkip: () => void;
  submitting: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex w-14 h-14 rounded-2xl bg-rose-500/15 items-center justify-center mb-2">
          <Leaf className="w-7 h-7 text-rose-400" />
        </div>
        <h1 className="text-2xl font-bold">Adicione sua primeira planta</h1>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Vamos vincular automaticamente à <strong>{tentName}</strong> com strain{" "}
          <strong>{strainName}</strong>. Você pode adicionar mais depois.
        </p>
      </div>

      <div className="bg-card border border-border/30 rounded-2xl p-5 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="plant-name">Nome da planta</Label>
          <Input
            id="plant-name"
            value={draft.name}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
            placeholder="Ex: Planta 1, NL-1, Bonsai..."
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="plant-code">Código (opcional)</Label>
          <Input
            id="plant-code"
            value={draft.code}
            onChange={(e) => onChange({ ...draft, code: e.target.value })}
            placeholder="Ex: NL-001, P1..."
          />
          <p className="text-[11px] text-muted-foreground/70">
            Útil pra cultivos com muitas plantas. Pode deixar vazio.
          </p>
        </div>

        <div className="rounded-xl bg-primary/8 border border-primary/20 p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <p className="text-xs text-foreground/80 leading-relaxed">
            Você pode iniciar um <strong>ciclo</strong> nesta estufa depois pra começar contagem
            de semanas e gerar tarefas automáticas.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={onBack} disabled={submitting}>
          <ChevronLeft className="w-4 h-4 mr-1" />
          Voltar
        </Button>
        <button
          onClick={onSkip}
          disabled={submitting}
          className="text-xs text-muted-foreground hover:text-foreground px-3 py-2"
        >
          Pular este passo
        </button>
        <Button onClick={onSubmit} disabled={submitting} className="ml-auto" size="lg">
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Adicionando...
            </>
          ) : (
            <>
              Adicionar e finalizar
              <ChevronRight className="w-4 h-4 ml-1" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// ─── Done ─────────────────────────────────────────────────────────────────────

function DoneView({ onFinish }: { onFinish: () => void }) {
  return (
    <div className="space-y-6 text-center py-8">
      <div className="inline-flex w-20 h-20 rounded-full bg-primary/15 items-center justify-center mb-2">
        <Check className="w-10 h-10 text-primary" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Tudo pronto! 🌱</h1>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Sua estufa, strain e primeira planta estão configuradas. Agora é começar a registrar
          dados diários pelo botão <strong>+</strong> da navegação.
        </p>
      </div>
      <div className="bg-card border border-border/30 rounded-2xl p-4 text-left space-y-3 max-w-md mx-auto">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Próximos passos sugeridos
        </p>
        <div className="space-y-2 text-sm">
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center mt-0.5 shrink-0">
              1
            </span>
            <span>Inicia um ciclo na estufa pra começar contagem de semanas</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center mt-0.5 shrink-0">
              2
            </span>
            <span>Faz primeiro registro com botão + → Status da estufa</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center mt-0.5 shrink-0">
              3
            </span>
            <span>(Opcional) Conecta SmartLife pra leituras automáticas de sensores</span>
          </div>
        </div>
      </div>
      <Button onClick={onFinish} size="lg" className="min-w-[200px]">
        Ir pro app
        <ChevronRight className="w-4 h-4 ml-1" />
      </Button>
    </div>
  );
}

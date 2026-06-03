/**
 * OnboardingWizard — fluxo conversacional do primeiro user (first-run).
 *
 * Estilo conversa app↔usuário (não formulário tradicional). 5 perguntas:
 *   1. Tipo de cultivo  → Orgânico / Mineral  (UX-only — NÃO persiste; app só faz
 *      mineral hoje. Decisão João 2026-06-01. Vira campo no schema quando o épico
 *      orgânico for feito — ver ORGANIC-CULTIVATION-RESEARCH.md.)
 *   2. Tamanho da estufa → 7 presets + Personalizar
 *   3. Strain            → busca (famosas + strains do user) ou cria custom
 *   4. Quantas plantas   → stepper 0–99
 *   5. Nomes das plantas → 1 campo por planta (pré-preenchido com strain)
 *
 * Ao finalizar: cria a estufa (nome auto = apelido do preset, categoria VEGA),
 * resolve/cria a strain, e cria N plantas SEMPRE vinculadas à estufa
 * (currentTentId) — planta nunca fica órfã. "Nenhuma por enquanto" pula a
 * criação de plantas (estufa vazia é válida).
 *
 * Botão "Pular tutorial" sempre visível no header → marca wizard_done e vai pra Home.
 *
 * Reusa E1 (tentPresets) + E2 (WizardBubble/Chips/SearchInput).
 */
import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { cultivoToast } from "@/lib/cultivoToast";
import { X, Loader2, Check, Minus, Plus, ChevronRight, Pencil, Sprout } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { markWizardDone } from "@/lib/wizardStorage";
import { haptics } from "@/lib/haptics";
import { WizardBubble, WizardTyping } from "./WizardBubble";
import { WizardChips, type WizardChipOption } from "./WizardChips";
import { WizardSearchInput, type WizardSearchResult } from "./WizardSearchInput";
import {
  TENT_PRESETS,
  presetLabel,
  presetSublabel,
  presetDimensions,
  getPresetById,
  type Locale,
} from "./tentPresets";
import { FAMOUS_STRAINS } from "./famousStrains";

// Re-exporta pra compat com imports externos antigos.
export { markWizardDone, isWizardDone } from "@/lib/wizardStorage";

// ─── Tipos ──────────────────────────────────────────────────────────────────

type Step = "cultivo" | "size" | "strain" | "plantCount" | "plantNames" | "creating" | "done";

type CultivoType = "ORGANIC" | "MINERAL";

/** Seleção de strain — discrimina como resolver o id no fim. */
type StrainPick =
  | { kind: "existing"; id: number; name: string }
  | { kind: "famous"; name: string; vegaWeeks: number; floraWeeks: number }
  | { kind: "custom"; name: string };

const LOCALE: Locale = "pt"; // app é PT-only por ora (ver tentPresets.ts)

const CULTIVO_OPTIONS: WizardChipOption[] = [
  { id: "MINERAL", label: "Mineral", sublabel: "Sais solúveis · EC/pH" },
  { id: "ORGANIC", label: "Orgânico", sublabel: "Super soil · living soil" },
];

// ─── Componente ───────────────────────────────────────────────────────────────

export default function OnboardingWizard() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<Step>("cultivo");

  // Respostas
  const [cultivo, setCultivo] = useState<CultivoType | null>(null);
  const [presetId, setPresetId] = useState<string | null>(null);
  const [customDims, setCustomDims] = useState({ width: 80, depth: 80, height: 160 });
  const [showCustom, setShowCustom] = useState(false);
  const [strainPick, setStrainPick] = useState<StrainPick | null>(null);
  const [strainQuery, setStrainQuery] = useState("");
  const [plantCount, setPlantCount] = useState(1);
  const [plantNames, setPlantNames] = useState<string[]>([]);

  // tRPC
  const utils = trpc.useUtils();
  const createTent = trpc.tents.create.useMutation();
  const createStrain = trpc.strains.create.useMutation();
  const createPlant = trpc.plants.create.useMutation();
  const { data: userStrains = [] } = trpc.strains.list.useQuery(undefined, {
    enabled: step === "strain",
  });

  // Auto-scroll pro fim da conversa quando avança
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [step, showCustom]);

  function skipAll() {
    haptics.light().catch(() => {});
    markWizardDone();
    setLocation("/");
  }

  // ── Derivados ──────────────────────────────────────────────────────────────
  const selectedPreset = presetId && presetId !== "custom" ? getPresetById(presetId) : null;
  const tentDims = selectedPreset
    ? { width: selectedPreset.width, depth: selectedPreset.depth, height: selectedPreset.height }
    : customDims;
  const tentSizeLabel = selectedPreset
    ? `${presetLabel(selectedPreset, LOCALE)} · ${presetDimensions(selectedPreset)}`
    : `Personalizada · ${customDims.width}×${customDims.depth}×${customDims.height} cm`;
  const strainName = strainPick?.name ?? "";

  // ── Resultados de busca de strain (famosas + do user + criar custom) ─────────
  function buildStrainResults(query: string): WizardSearchResult[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const results: WizardSearchResult[] = [];

    // Strains do usuário (banco)
    for (const s of userStrains as Array<{ id: number; name: string; vegaWeeks?: number; floraWeeks?: number }>) {
      if (s.name.toLowerCase().includes(q)) {
        results.push({
          id: `user:${s.id}`,
          label: s.name,
          sublabel: "Sua strain",
        });
      }
    }

    // Strains famosas (constante) — evita duplicar nome já no banco
    const userNames = new Set((userStrains as Array<{ name: string }>).map((s) => s.name.toLowerCase()));
    for (const f of FAMOUS_STRAINS) {
      if (f.name.toLowerCase().includes(q) && !userNames.has(f.name.toLowerCase())) {
        results.push({
          id: `famous:${f.name}`,
          label: f.name,
          sublabel: `${f.type} · Veg ${f.vegaWeeks}sem · Flora ${f.floraWeeks}sem`,
        });
      }
    }

    // Oferecer criar custom se não há match exato
    const hasExact = results.some((r) => r.label.toLowerCase() === q);
    if (!hasExact && query.trim().length >= 2) {
      results.push({
        id: `custom:${query.trim()}`,
        label: `Criar "${query.trim()}"`,
        sublabel: "Nova strain · tempos padrão (Veg 4 · Flora 8)",
      });
    }
    return results;
  }

  function handleStrainSelect(r: WizardSearchResult) {
    const [kind, ...rest] = r.id.split(":");
    const val = rest.join(":");
    if (kind === "user") {
      const s = (userStrains as Array<{ id: number; name: string }>).find((x) => x.id === Number(val));
      if (s) setStrainPick({ kind: "existing", id: s.id, name: s.name });
    } else if (kind === "famous") {
      const f = FAMOUS_STRAINS.find((x) => x.name === val);
      if (f) setStrainPick({ kind: "famous", name: f.name, vegaWeeks: f.vegaWeeks, floraWeeks: f.floraWeeks });
    } else if (kind === "custom") {
      setStrainPick({ kind: "custom", name: val });
    }
    haptics.light().catch(() => {});
    setStep("plantCount");
  }

  // ── Avanços de step ──────────────────────────────────────────────────────────
  function handleCultivo(id: string) {
    setCultivo(id as CultivoType);
    setStep("size");
  }

  function handleSize(id: string) {
    if (id === "custom") {
      setShowCustom(true);
      setPresetId("custom");
      return;
    }
    setPresetId(id);
    setShowCustom(false);
    setStep("strain");
  }

  function confirmCustomSize() {
    if (customDims.width < 1 || customDims.depth < 1 || customDims.height < 1) {
      cultivoToast.error("Dimensões inválidas");
      return;
    }
    setPresetId("custom");
    setStep("strain");
  }

  function handlePlantCount(n: number) {
    const count = Math.max(0, Math.min(99, n));
    setPlantCount(count);
    if (count === 0) {
      finishWizard(0, []);
      return;
    }
    // Pré-preenche nomes "Strain #1, #2..."
    const base = strainName || "Planta";
    setPlantNames(Array.from({ length: count }, (_, i) => `${base} #${i + 1}`));
    setStep("plantNames");
  }

  // ── Criação final ──────────────────────────────────────────────────────────
  async function resolveStrainId(): Promise<number> {
    if (!strainPick) throw new Error("Strain não selecionada");
    if (strainPick.kind === "existing") return strainPick.id;

    // Pode já existir no banco (famosa criada antes) — checa primeiro
    const existing = await utils.strains.list.fetch();
    const found = (existing as Array<{ id: number; name: string }>).find(
      (s) => s.name.toLowerCase() === strainPick.name.toLowerCase(),
    );
    if (found) return found.id;

    // Cria
    const weeks =
      strainPick.kind === "famous"
        ? { vegaWeeks: strainPick.vegaWeeks, floraWeeks: strainPick.floraWeeks }
        : { vegaWeeks: 4, floraWeeks: 8 };
    await createStrain.mutateAsync({
      name: strainPick.name,
      origin: "FEMINIZED",
      ...weeks,
    });
    const after = await utils.strains.list.fetch();
    const created = (after as Array<{ id: number; name: string }>).find(
      (s) => s.name.toLowerCase() === strainPick.name.toLowerCase(),
    );
    if (!created) throw new Error("Falha ao criar strain");
    return created.id;
  }

  async function finishWizard(count: number, names: string[]) {
    setStep("creating");
    try {
      // 1. Estufa — nome auto (apelido do preset ou "Minha Estufa"), categoria VEGA
      const tentName = selectedPreset ? presetLabel(selectedPreset, LOCALE) : "Minha Estufa";
      const tent = await createTent.mutateAsync({
        name: tentName,
        category: "VEGA",
        width: tentDims.width,
        depth: tentDims.depth,
        height: tentDims.height,
      });
      utils.tents.list.invalidate();

      // 2. Plantas (se houver) — sempre vinculadas à estufa criada
      if (count > 0 && strainPick) {
        const strainId = await resolveStrainId();
        utils.strains.list.invalidate();
        for (const name of names) {
          await createPlant.mutateAsync({
            name: name.trim() || "Planta",
            strainId,
            currentTentId: tent.id,
          });
        }
        utils.plants.list?.invalidate?.();
      }

      markWizardDone();
      setStep("done");
      // Navega pro detalhe da estufa criada (E5 refina ainda mais)
      setTimeout(() => setLocation(`/tent/${tent.id}`), 1400);
    } catch (e: any) {
      cultivoToast.error("Erro ao configurar", e?.message ?? String(e));
      setStep("plantCount"); // volta pra tentar de novo
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  const stepIndex = ["cultivo", "size", "strain", "plantCount", "plantNames"].indexOf(step);
  const progress = step === "done" || step === "creating" ? 5 : Math.max(0, stepIndex);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header
        className="sticky top-0 z-10 bg-background/90 backdrop-blur-md border-b border-border/30"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="container mx-auto px-4 py-3 flex items-center justify-between max-w-2xl">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center">
              <Sprout className="w-4 h-4 text-primary" strokeWidth={2.5} />
            </div>
            <p className="text-sm font-semibold">Cultivo</p>
          </div>
          {step !== "done" && step !== "creating" && (
            <button
              onClick={skipAll}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-muted/50 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Pular tutorial
            </button>
          )}
        </div>
        {/* Progress */}
        <div className="container mx-auto px-4 pb-2.5 max-w-2xl">
          <div className="flex items-center gap-1.5">
            {[0, 1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  progress > n ? "bg-primary" : progress === n ? "bg-primary/40" : "bg-muted"
                }`}
              />
            ))}
          </div>
        </div>
      </header>

      {/* Conversa */}
      <main className="flex-1 container mx-auto px-4 py-6 max-w-2xl w-full">
        <div className="space-y-4">
          {/* Saudação */}
          <WizardBubble from="app">
            Bem-vindo ao Cultivo! 🌱 Vou te ajudar a montar sua primeira estufa em alguns toques.
          </WizardBubble>

          {/* ── Q1: tipo de cultivo ── */}
          <WizardBubble from="app" delay={0.15}>
            Pra começar — qual o seu tipo de cultivo?
          </WizardBubble>
          {cultivo && (
            <WizardBubble from="user">
              {cultivo === "MINERAL" ? "Mineral" : "Orgânico"}
            </WizardBubble>
          )}
          {step === "cultivo" && (
            <WizardChips options={CULTIVO_OPTIONS} onSelect={handleCultivo} delay={0.3} layout="grid" />
          )}

          {/* ── Q2: tamanho ── */}
          {stepIndex >= 1 && (
            <>
              <WizardBubble from="app">Qual o tamanho da sua estufa?</WizardBubble>
              {presetId && (step !== "size" || !showCustom) && stepIndex > 1 && (
                <WizardBubble from="user">{tentSizeLabel}</WizardBubble>
              )}
            </>
          )}
          {step === "size" && (
            <>
              <WizardChips
                layout="grid"
                options={[
                  ...TENT_PRESETS.map((p) => ({
                    id: p.id,
                    label: presetLabel(p, LOCALE),
                    sublabel: presetSublabel(p, LOCALE),
                    featured: p.featured,
                  })),
                  { id: "custom", label: "Personalizar", sublabel: "Digitar minhas medidas" },
                ]}
                selectedId={showCustom ? "custom" : null}
                onSelect={handleSize}
              />
              {showCustom && (
                <div className="bg-card border border-border rounded-2xl p-4 space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Dimensões (cm)
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {(["width", "depth", "height"] as const).map((k) => (
                      <div key={k}>
                        <Input
                          type="number"
                          min={1}
                          value={customDims[k]}
                          onChange={(e) =>
                            setCustomDims({ ...customDims, [k]: Math.max(1, parseInt(e.target.value) || 0) })
                          }
                        />
                        <p className="text-[11px] text-muted-foreground text-center mt-1">
                          {k === "width" ? "Largura" : k === "depth" ? "Profund." : "Altura"}
                        </p>
                      </div>
                    ))}
                  </div>
                  <Button onClick={confirmCustomSize} className="w-full" size="sm">
                    Confirmar tamanho
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              )}
            </>
          )}

          {/* ── Q3: strain ── */}
          {stepIndex >= 2 && (
            <>
              <WizardBubble from="app">Qual strain você vai cultivar?</WizardBubble>
              {strainPick && stepIndex > 2 && <WizardBubble from="user">{strainName}</WizardBubble>}
            </>
          )}
          {step === "strain" && (
            <div className="pl-10">
              <WizardSearchInput
                placeholder="Buscar strain (ex: Northern Lights)..."
                results={buildStrainResults(strainQuery)}
                onDebouncedChange={setStrainQuery}
                onSelect={handleStrainSelect}
                minChars={2}
              />
            </div>
          )}

          {/* ── Q4: quantas plantas ── */}
          {stepIndex >= 3 && (
            <>
              <WizardBubble from="app">Quantas plantas você tem agora?</WizardBubble>
              {step !== "plantCount" && stepIndex > 3 && (
                <WizardBubble from="user">
                  {plantCount === 0 ? "Nenhuma por enquanto" : `${plantCount} planta${plantCount > 1 ? "s" : ""}`}
                </WizardBubble>
              )}
            </>
          )}
          {step === "plantCount" && (
            <PlantCountControl
              value={plantCount}
              onChange={setPlantCount}
              onConfirm={() => handlePlantCount(plantCount)}
              onNone={() => handlePlantCount(0)}
            />
          )}

          {/* ── Q5: nomes ── */}
          {step === "plantNames" && (
            <>
              <WizardBubble from="app">Como você chama cada uma? (pode deixar o sugerido)</WizardBubble>
              <PlantNamesControl
                names={plantNames}
                onChange={setPlantNames}
                onConfirm={() => finishWizard(plantCount, plantNames)}
                submitting={createTent.isPending || createPlant.isPending}
              />
            </>
          )}

          {/* ── Criando ── */}
          {step === "creating" && (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">Montando sua estufa...</p>
            </div>
          )}

          {/* ── Done ── */}
          {step === "done" && (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-center animate-in fade-in zoom-in-95 duration-300">
              <div className="w-16 h-16 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center">
                <Check className="w-8 h-8 text-primary" strokeWidth={2.5} />
              </div>
              <p className="text-lg font-bold">Tudo pronto! 🎉</p>
              <p className="text-sm text-muted-foreground max-w-xs">
                Sua estufa está configurada. Levando você pra ela...
              </p>
            </div>
          )}

          {/* Typing indicator enquanto não respondeu o primeiro */}
          {step === "cultivo" && !cultivo && <WizardTyping delay={0.5} />}

          <div ref={bottomRef} />
        </div>
      </main>
    </div>
  );
}

// ─── Controle: contador de plantas ────────────────────────────────────────────

function PlantCountControl({
  value,
  onChange,
  onConfirm,
  onNone,
}: {
  value: number;
  onChange: (n: number) => void;
  onConfirm: () => void;
  onNone: () => void;
}) {
  const dec = () => {
    haptics.light().catch(() => {});
    onChange(Math.max(0, value - 1));
  };
  const inc = () => {
    haptics.light().catch(() => {});
    onChange(Math.min(99, value + 1));
  };
  return (
    <div className="flex flex-col items-end gap-3">
      <div className="flex items-center gap-4 bg-card border border-border rounded-2xl px-5 py-3">
        <button
          onClick={dec}
          aria-label="Menos"
          className="w-9 h-9 rounded-full border border-border flex items-center justify-center text-foreground hover:bg-muted active:scale-95 transition-[transform,background-color] disabled:opacity-40"
          disabled={value <= 0}
        >
          <Minus className="w-4 h-4" />
        </button>
        <span className="text-2xl font-bold tabular-nums w-10 text-center">{value}</span>
        <button
          onClick={inc}
          aria-label="Mais"
          className="w-9 h-9 rounded-full border border-border flex items-center justify-center text-foreground hover:bg-muted active:scale-95 transition-[transform,background-color] disabled:opacity-40"
          disabled={value >= 99}
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onNone}
          className="text-xs text-muted-foreground hover:text-foreground px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors"
        >
          Nenhuma por enquanto
        </button>
        <Button onClick={onConfirm} size="sm" disabled={value < 1}>
          Continuar
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

// ─── Controle: nomes das plantas ──────────────────────────────────────────────

function PlantNamesControl({
  names,
  onChange,
  onConfirm,
  submitting,
}: {
  names: string[];
  onChange: (n: string[]) => void;
  onConfirm: () => void;
  submitting: boolean;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {names.map((name, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center shrink-0">
              {i + 1}
            </span>
            <div className="relative flex-1">
              <Pencil className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50 pointer-events-none" />
              <Input
                value={name}
                onChange={(e) => {
                  const next = [...names];
                  next[i] = e.target.value;
                  onChange(next);
                }}
                className="pl-8"
                placeholder={`Planta ${i + 1}`}
              />
            </div>
          </div>
        ))}
      </div>
      <Button onClick={onConfirm} disabled={submitting} className="w-full" size="lg">
        {submitting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Criando...
          </>
        ) : (
          <>
            Finalizar configuração
            <Check className="w-4 h-4 ml-1.5" />
          </>
        )}
      </Button>
    </div>
  );
}

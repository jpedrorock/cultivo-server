/**
 * OnboardingWizard — first-run imersivo, UMA PERGUNTA POR TELA.
 *
 * Estilo cinematográfico (não chat): tela cheia com gradiente + blobs na cor da
 * marca, título grande, opções como cards de vidro (glass). Transição slide entre
 * perguntas. Alinhado ao "clima de marca" do Login/Paywall.
 *
 * 5 perguntas:
 *   1. Tipo de cultivo  → Mineral / Orgânico (persiste em tents.cultivationMethod;
 *      no ORGANIC o app esconde EC/runoff e pH vira opcional — ORGANIC-IMPLEMENTATION-PLAN.md)
 *   2. Tamanho da estufa → 7 presets + Personalizar
 *   3. Strain            → busca (famosas + strains do user) ou cria custom
 *   4. Quantas plantas   → stepper 0–99
 *   5. Nomes das plantas → 1 campo por planta (pré-preenchido com strain)
 *
 * Ao finalizar: cria estufa (nome auto = apelido do preset, categoria VEGA) + N
 * plantas SEMPRE vinculadas (currentTentId) — planta nunca órfã. "Nenhuma por
 * enquanto" pula criação. Depois encadeia pro tutorial demo (E5).
 *
 * "Pular tutorial" sempre visível. Reusa E1 (tentPresets).
 */
import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { cultivoToast } from "@/lib/cultivoToast";
import {
  X, Loader2, Check, Minus, Plus, ChevronRight, ChevronLeft, Pencil,
  Search, FlaskConical, Sprout, Star, Maximize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { markWizardDone } from "@/lib/wizardStorage";
import { haptics } from "@/lib/haptics";
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

type StrainPick =
  | { kind: "existing"; id: number; name: string }
  | { kind: "famous"; name: string; vegaWeeks: number; floraWeeks: number }
  | { kind: "custom"; name: string };

const LOCALE: Locale = "pt";
const STEP_ORDER: Step[] = ["cultivo", "size", "strain", "plantCount", "plantNames"];

// ─── Fundo atmosférico (clima de marca) ───────────────────────────────────────

function OnboardingBlobs() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden -z-10">
      <div className="absolute -top-[10%] left-1/2 -translate-x-1/2 w-[460px] h-[460px] rounded-full bg-primary/25 blur-[120px]" />
      <div className="absolute top-[35%] -right-[15%] w-[320px] h-[320px] rounded-full bg-indigo-500/12 blur-[110px]" />
      <div className="absolute -bottom-[10%] -left-[15%] w-[340px] h-[340px] rounded-full bg-teal-500/12 blur-[110px]" />
    </div>
  );
}

// ─── Card de opção (glass) ─────────────────────────────────────────────────────

function GlassOption({
  icon: Icon,
  label,
  sublabel,
  featured,
  selected,
  onClick,
}: {
  icon?: React.ElementType;
  label: string;
  sublabel?: string;
  featured?: boolean;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative w-full text-left rounded-2xl border backdrop-blur-xl px-5 py-4 flex items-center gap-3.5 transition-[transform,background-color,border-color] active:scale-[0.98] focus-visible:outline-none ${
        selected
          ? "bg-primary/20 border-primary/60"
          : "bg-white/[0.06] border-white/12 hover:bg-white/[0.1] hover:border-white/20"
      }`}
    >
      {featured && (
        <span className="absolute -top-2 -right-2 inline-flex items-center gap-0.5 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground shadow-lg">
          <Star className="w-2.5 h-2.5 fill-primary-foreground" /> Popular
        </span>
      )}
      {Icon && (
        <span className="w-11 h-11 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-foreground" />
        </span>
      )}
      <span className="flex-1 min-w-0">
        <span className="block font-semibold text-foreground">{label}</span>
        {sublabel && <span className="block text-xs text-muted-foreground mt-0.5">{sublabel}</span>}
      </span>
      <ChevronRight className="w-4 h-4 text-muted-foreground/50 shrink-0" />
    </button>
  );
}

// ─── Shell de um passo (título grande + corpo) ─────────────────────────────────

function StepShell({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <h1 className="text-[1.75rem] leading-tight font-black tracking-tight text-foreground">{title}</h1>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────────

export default function OnboardingWizard() {
  const [, setLocation] = useLocation();
  const reduced = useReducedMotion();
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
  const { data: userStrains = [] } = trpc.strains.list.useQuery(undefined, { enabled: step === "strain" });

  // Debounce da busca de strain
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearchTerm(strainQuery.trim()), 250);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [strainQuery]);

  function skipAll() {
    haptics.light().catch(() => {});
    markWizardDone();
    setLocation("/");
  }

  // Derivados
  const selectedPreset = presetId && presetId !== "custom" ? getPresetById(presetId) : null;
  const tentDims = selectedPreset
    ? { width: selectedPreset.width, depth: selectedPreset.depth, height: selectedPreset.height }
    : customDims;
  const strainName = strainPick?.name ?? "";

  // ── Busca de strain (famosas + do user + criar custom) ───────────────────────
  function buildStrainResults(q: string) {
    const ql = q.toLowerCase();
    if (!ql) return [] as Array<{ id: string; label: string; sublabel?: string }>;
    const results: Array<{ id: string; label: string; sublabel?: string }> = [];
    const userNames = new Set((userStrains as Array<{ name: string }>).map((s) => s.name.toLowerCase()));
    for (const s of userStrains as Array<{ id: number; name: string }>) {
      if (s.name.toLowerCase().includes(ql)) results.push({ id: `user:${s.id}`, label: s.name, sublabel: "Sua strain" });
    }
    for (const f of FAMOUS_STRAINS) {
      if (f.name.toLowerCase().includes(ql) && !userNames.has(f.name.toLowerCase())) {
        results.push({ id: `famous:${f.name}`, label: f.name, sublabel: `${f.type} · Veg ${f.vegaWeeks}sem · Flora ${f.floraWeeks}sem` });
      }
    }
    const hasExact = results.some((r) => r.label.toLowerCase() === ql);
    if (!hasExact && q.length >= 2) {
      results.push({ id: `custom:${q}`, label: `Criar "${q}"`, sublabel: "Nova strain · tempos padrão (Veg 4 · Flora 8)" });
    }
    return results;
  }

  function handleStrainSelect(rid: string) {
    haptics.light().catch(() => {});
    const [kind, ...rest] = rid.split(":");
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
    setStep("plantCount");
  }

  // ── Avanços ──────────────────────────────────────────────────────────────────
  function handleCultivo(id: CultivoType) {
    haptics.light().catch(() => {});
    setCultivo(id);
    setStep("size");
  }
  function handleSize(id: string) {
    haptics.light().catch(() => {});
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
    const base = strainName || "Planta";
    setPlantNames(Array.from({ length: count }, (_, i) => `${base} #${i + 1}`));
    setStep("plantNames");
  }

  // ── Criação final ──────────────────────────────────────────────────────────
  async function resolveStrainId(): Promise<number> {
    if (!strainPick) throw new Error("Strain não selecionada");
    if (strainPick.kind === "existing") return strainPick.id;
    const existing = await utils.strains.list.fetch();
    const found = (existing as Array<{ id: number; name: string }>).find((s) => s.name.toLowerCase() === strainPick.name.toLowerCase());
    if (found) return found.id;
    const weeks = strainPick.kind === "famous"
      ? { vegaWeeks: strainPick.vegaWeeks, floraWeeks: strainPick.floraWeeks }
      : { vegaWeeks: 4, floraWeeks: 8 };
    await createStrain.mutateAsync({ name: strainPick.name, origin: "FEMINIZED", ...weeks });
    const after = await utils.strains.list.fetch();
    const created = (after as Array<{ id: number; name: string }>).find((s) => s.name.toLowerCase() === strainPick.name.toLowerCase());
    if (!created) throw new Error("Falha ao criar strain");
    return created.id;
  }

  async function finishWizard(count: number, names: string[]) {
    setStep("creating");
    try {
      const tentName = selectedPreset ? presetLabel(selectedPreset, LOCALE) : "Minha Estufa";
      const tent = await createTent.mutateAsync({
        name: tentName,
        category: "VEGA",
        cultivationMethod: cultivo ?? "MINERAL",
        width: tentDims.width,
        depth: tentDims.depth,
        height: tentDims.height,
      });
      utils.tents.list.invalidate();

      if (count > 0 && strainPick) {
        const strainId = await resolveStrainId();
        utils.strains.list.invalidate();
        for (const name of names) {
          await createPlant.mutateAsync({ name: name.trim() || "Planta", strainId, currentTentId: tent.id });
        }
        utils.plants.list?.invalidate?.();
      }

      markWizardDone();
      setStep("done");
      // E5: encadeia pro tutorial de registro (QuickLog real em modo demo, não
      // persiste) → detalhe da estufa criada. O demo lê ?then=.
      setTimeout(() => setLocation(`/quick-log?demo=1&then=${encodeURIComponent(`/tent/${tent.id}`)}`), 1300);
    } catch (e: any) {
      cultivoToast.error("Erro ao configurar", e?.message ?? String(e));
      setStep("plantCount");
    }
  }

  // ── Navegação (voltar) ─────────────────────────────────────────────────────
  function goBack() {
    haptics.light().catch(() => {});
    if (step === "size") setStep("cultivo");
    else if (step === "strain") setStep("size");
    else if (step === "plantCount") setStep("strain");
    else if (step === "plantNames") setStep("plantCount");
  }

  const stepIndex = STEP_ORDER.indexOf(step);
  const progress = step === "done" || step === "creating" ? STEP_ORDER.length : Math.max(0, stepIndex);
  const isQuestion = stepIndex >= 0;

  // Transição slide entre passos
  const variants = reduced
    ? { enter: { opacity: 0 }, center: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        enter: { opacity: 0, x: 24 },
        center: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: -24 },
      };

  return (
    <div
      className="fixed inset-0 overflow-hidden bg-background flex flex-col"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <OnboardingBlobs />

      {/* Header: progresso + pular */}
      {isQuestion && (
        <header className="shrink-0 px-5 pt-4 pb-2">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              {STEP_ORDER.map((_, n) => (
                <span
                  key={n}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    progress > n ? "w-6 bg-primary" : progress === n ? "w-6 bg-primary/50" : "w-1.5 bg-white/20"
                  }`}
                />
              ))}
            </div>
            <button
              onClick={skipAll}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg transition-colors"
            >
              Pular <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </header>
      )}

      {/* Corpo — uma pergunta por tela */}
      <main className="flex-1 overflow-y-auto px-6 py-4 flex flex-col">
        <div className="w-full max-w-md mx-auto flex-1 flex flex-col justify-center">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.28, ease: "easeOut" }}
            >
              {/* ── Q1: cultivo ── */}
              {step === "cultivo" && (
                <StepShell title="Qual o seu tipo de cultivo?" hint="Isso define como o app acompanha sua estufa.">
                  <div className="space-y-3">
                    <GlassOption icon={FlaskConical} label="Mineral" sublabel="Sais solúveis · EC e pH" onClick={() => handleCultivo("MINERAL")} />
                    <GlassOption icon={Sprout} label="Orgânico" sublabel="Super soil · living soil" onClick={() => handleCultivo("ORGANIC")} />
                  </div>
                </StepShell>
              )}

              {/* ── Q2: tamanho ── */}
              {step === "size" && (
                <StepShell title="Qual o tamanho da sua estufa?" hint="Escolha um modelo ou personalize.">
                  {!showCustom ? (
                    <div className="space-y-2.5">
                      {TENT_PRESETS.map((p) => (
                        <GlassOption
                          key={p.id}
                          label={`${presetLabel(p, LOCALE)} · ${presetDimensions(p).replace(" cm", "")}`}
                          sublabel={presetSublabel(p, LOCALE)}
                          featured={p.featured}
                          onClick={() => handleSize(p.id)}
                        />
                      ))}
                      <GlassOption icon={Maximize2} label="Personalizar" sublabel="Digitar minhas medidas" onClick={() => handleSize("custom")} />
                    </div>
                  ) : (
                    <div className="rounded-2xl bg-white/[0.06] border border-white/12 backdrop-blur-xl p-5 space-y-4">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dimensões (cm)</p>
                      <div className="grid grid-cols-3 gap-3">
                        {(["width", "depth", "height"] as const).map((k) => (
                          <div key={k}>
                            <Input
                              type="number"
                              min={1}
                              value={customDims[k]}
                              onChange={(e) => setCustomDims({ ...customDims, [k]: Math.max(1, parseInt(e.target.value) || 0) })}
                              className="bg-background/40 text-center"
                            />
                            <p className="text-[11px] text-muted-foreground text-center mt-1">
                              {k === "width" ? "Largura" : k === "depth" ? "Profund." : "Altura"}
                            </p>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={() => setShowCustom(false)} className="flex-1">Voltar</Button>
                        <Button onClick={confirmCustomSize} className="flex-1">Confirmar <ChevronRight className="w-4 h-4 ml-1" /></Button>
                      </div>
                    </div>
                  )}
                </StepShell>
              )}

              {/* ── Q3: strain ── */}
              {step === "strain" && (
                <StepShell title="Qual strain você vai cultivar?" hint="Busque uma conhecida ou digite a sua.">
                  <div className="space-y-3">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60 pointer-events-none" />
                      <input
                        autoFocus
                        type="text"
                        inputMode="search"
                        autoComplete="off"
                        value={strainQuery}
                        onChange={(e) => setStrainQuery(e.target.value)}
                        placeholder="Ex: Northern Lights..."
                        className="w-full bg-white/[0.06] border border-white/12 backdrop-blur-xl rounded-2xl pl-9 pr-4 py-3.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/40"
                      />
                    </div>
                    <div className="space-y-2">
                      {buildStrainResults(searchTerm).map((r) => (
                        <GlassOption key={r.id} label={r.label} sublabel={r.sublabel} onClick={() => handleStrainSelect(r.id)} />
                      ))}
                      {searchTerm.length >= 2 && buildStrainResults(searchTerm).length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-3">Digite ao menos 2 letras.</p>
                      )}
                    </div>
                  </div>
                </StepShell>
              )}

              {/* ── Q4: quantas plantas ── */}
              {step === "plantCount" && (
                <StepShell title="Quantas plantas você tem agora?" hint="Pode começar sem nenhuma — dá pra adicionar depois.">
                  <div className="flex flex-col items-center gap-6">
                    <div className="flex items-center gap-6">
                      <button
                        onClick={() => { haptics.light().catch(() => {}); setPlantCount((v) => Math.max(0, v - 1)); }}
                        disabled={plantCount <= 0}
                        aria-label="Menos"
                        className="w-14 h-14 rounded-full bg-white/[0.06] border border-white/15 backdrop-blur-xl flex items-center justify-center active:scale-95 transition-transform disabled:opacity-30"
                      >
                        <Minus className="w-6 h-6" />
                      </button>
                      <span className="font-mono text-6xl font-black tabular-nums w-24 text-center text-foreground">{plantCount}</span>
                      <button
                        onClick={() => { haptics.light().catch(() => {}); setPlantCount((v) => Math.min(99, v + 1)); }}
                        disabled={plantCount >= 99}
                        aria-label="Mais"
                        className="w-14 h-14 rounded-full bg-white/[0.06] border border-white/15 backdrop-blur-xl flex items-center justify-center active:scale-95 transition-transform disabled:opacity-30"
                      >
                        <Plus className="w-6 h-6" />
                      </button>
                    </div>
                    <div className="w-full space-y-2.5">
                      <Button onClick={() => handlePlantCount(plantCount)} disabled={plantCount < 1} className="w-full" size="lg">
                        Continuar <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                      <button onClick={() => handlePlantCount(0)} className="w-full text-sm text-muted-foreground hover:text-foreground py-2 transition-colors">
                        Nenhuma por enquanto
                      </button>
                    </div>
                  </div>
                </StepShell>
              )}

              {/* ── Q5: nomes ── */}
              {step === "plantNames" && (
                <StepShell title="Como você chama cada uma?" hint="Pode manter o nome sugerido.">
                  <div className="space-y-3">
                    <div className="space-y-2 max-h-[42vh] overflow-y-auto pr-1">
                      {plantNames.map((name, i) => (
                        <div key={i} className="flex items-center gap-2.5">
                          <span className="w-7 h-7 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                          <div className="relative flex-1">
                            <Pencil className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50 pointer-events-none" />
                            <Input
                              value={name}
                              onChange={(e) => { const next = [...plantNames]; next[i] = e.target.value; setPlantNames(next); }}
                              className="pl-8 bg-white/[0.06] border-white/12 backdrop-blur-xl"
                              placeholder={`Planta ${i + 1}`}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    <Button onClick={() => finishWizard(plantCount, plantNames)} disabled={createTent.isPending || createPlant.isPending} className="w-full" size="lg">
                      {createTent.isPending || createPlant.isPending ? (
                        <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Criando...</>
                      ) : (
                        <>Finalizar <Check className="w-4 h-4 ml-1.5" /></>
                      )}
                    </Button>
                  </div>
                </StepShell>
              )}

              {/* ── Criando ── */}
              {step === "creating" && (
                <div className="flex flex-col items-center justify-center gap-3 py-10">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                  <p className="text-sm text-muted-foreground">Montando sua estufa...</p>
                </div>
              )}

              {/* ── Done ── */}
              {step === "done" && (
                <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
                  <div className="w-20 h-20 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center">
                    <Check className="w-10 h-10 text-primary" strokeWidth={2.5} />
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-xl font-black">Estufa criada! 🎉</p>
                    <p className="text-sm text-muted-foreground max-w-xs">Agora um exemplo rápido de como registrar o dia a dia...</p>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Footer: voltar (só nas perguntas 2+) */}
      {isQuestion && stepIndex > 0 && step !== "creating" && step !== "done" && (
        <footer className="shrink-0 px-6 pb-4 pt-1">
          <button onClick={goBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-4 h-4" /> Voltar
          </button>
        </footer>
      )}
    </div>
  );
}

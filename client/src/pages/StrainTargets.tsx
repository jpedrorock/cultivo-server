import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Save,
  Loader2,
  Thermometer,
  Droplets,
  Sun,
  FlaskConical,
  Zap,
  Clock,
  ChevronDown,
  ChevronUp,
  Leaf,
  Flower2,
  Scissors,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { PageTransition } from "@/components/PageTransition";

export default function StrainTargets() {
  const [, params] = useRoute("/strains/:id/targets");
  const [, setLocation] = useLocation();
  const strainId = params?.id ? parseInt(params.id) : null;

  const { data: strain, isLoading: strainLoading } = trpc.strains.getById.useQuery(
    { id: strainId! },
    { enabled: !!strainId }
  );

  const { data: targets = [], refetch } = trpc.weeklyTargets.getByStrain.useQuery(
    { strainId: strainId! },
    { enabled: !!strainId }
  );

  const createTarget = trpc.weeklyTargets.upsert.useMutation();

  const [editingTargets, setEditingTargets] = useState<Record<string, any>>({});
  const [openWeeks, setOpenWeeks] = useState<Record<string, boolean>>({});
  const [activePhase, setActivePhase] = useState<"CLONING" | "VEGA" | "FLORA">("VEGA");

  // Copy from another strain
  const [showComparison, setShowComparison] = useState(false);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [sourceStrainId, setSourceStrainId] = useState<number | null>(null);
  const [isCopying, setIsCopying] = useState(false);
  const { data: allStrains = [] } = trpc.strains.list.useQuery();
  const { data: sourceTargets } = trpc.weeklyTargets.getByStrain.useQuery(
    { strainId: sourceStrainId! },
    { enabled: !!sourceStrainId }
  );

  const handleCopyTargets = async () => {
    if (!strainId || !sourceTargets || sourceTargets.length === 0) return;
    setIsCopying(true);
    try {
      for (const t of sourceTargets) {
        await createTarget.mutateAsync({
          strainId,
          phase: t.phase as any,
          weekNumber: t.weekNumber,
          tempMin: t.tempMin ?? undefined,
          tempMax: t.tempMax ?? undefined,
          rhMin: t.rhMin ?? undefined,
          rhMax: t.rhMax ?? undefined,
          ppfdMin: t.ppfdMin ?? undefined,
          ppfdMax: t.ppfdMax ?? undefined,
          photoperiod: t.photoperiod ?? undefined,
          phMin: t.phMin ?? undefined,
          phMax: t.phMax ?? undefined,
          ecMin: t.ecMin ?? undefined,
          ecMax: t.ecMax ?? undefined,
          notes: t.notes ?? undefined,
        });
      }
      await refetch();
      setCopyDialogOpen(false);
      setSourceStrainId(null);
      toast.success(`${sourceTargets.length} targets copiados com sucesso!`);
    } catch {
      toast.error("Erro ao copiar targets");
    } finally {
      setIsCopying(false);
    }
  };

  useEffect(() => {
    if (targets.length > 0) {
      const targetsMap: Record<string, any> = {};
      targets.forEach((target) => {
        const key = `${target.phase}-${target.weekNumber}`;
        targetsMap[key] = target;
      });
      setEditingTargets(targetsMap);
    }
  }, [targets]);

  const toggleWeek = (key: string) => {
    setOpenWeeks((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const isWeekOpen = (phase: string, week: number) => {
    const key = `${phase}-${week}`;
    return openWeeks[key] ?? week === 1;
  };

  const handleSave = async (phase: string, weekNumber: number) => {
    if (!strainId) return;
    const key = `${phase}-${weekNumber}`;
    const target = editingTargets[key];
    if (!target) return;

    try {
      await createTarget.mutateAsync({
        strainId,
        phase: phase as any,
        weekNumber,
        tempMin: target.tempMin || undefined,
        tempMax: target.tempMax || undefined,
        rhMin: target.rhMin || undefined,
        rhMax: target.rhMax || undefined,
        ppfdMin: target.ppfdMin ? parseInt(target.ppfdMin) : undefined,
        ppfdMax: target.ppfdMax ? parseInt(target.ppfdMax) : undefined,
        photoperiod: target.photoperiod || undefined,
        phMin: target.phMin || undefined,
        phMax: target.phMax || undefined,
        ecMin: target.ecMin || undefined,
        ecMax: target.ecMax || undefined,
        notes: target.notes || undefined,
      });
      toast.success(`Semana ${weekNumber} salva!`);
      refetch();
    } catch {
      toast.error("Erro ao salvar parâmetros");
    }
  };

  const updateTarget = (phase: string, weekNumber: number, field: string, value: any) => {
    const key = `${phase}-${weekNumber}`;
    setEditingTargets((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  };

  const phaseConfig = {
    CLONING: {
      label: "Clonagem",
      icon: Scissors,
      gradient: "from-amber-500 to-orange-600",
      glow: "rgba(245,158,11,0.09)",
      border: "border-amber-500/25",
      dot: "bg-amber-400",
      dotColor: "text-amber-400",
      accent: "bg-amber-500/10 text-amber-400 border-amber-500/20",
      weeks: 2,
    },
    VEGA: {
      label: "Vegetativa",
      icon: Leaf,
      gradient: "from-green-500 to-emerald-600",
      glow: "rgba(34,197,94,0.09)",
      border: "border-green-500/25",
      dot: "bg-green-400",
      dotColor: "text-green-400",
      accent: "bg-green-500/10 text-green-400 border-green-500/20",
      weeks: strain?.vegaWeeks ?? 5,
    },
    FLORA: {
      label: "Floração",
      icon: Flower2,
      gradient: "from-purple-500 to-violet-600",
      glow: "rgba(168,85,247,0.09)",
      border: "border-purple-500/25",
      dot: "bg-purple-400",
      dotColor: "text-purple-400",
      accent: "bg-purple-500/10 text-purple-400 border-purple-500/20",
      weeks: strain?.floraWeeks ?? 11,
    },
  };

  const fieldGroups = [
    {
      icon: Thermometer,
      label: "Temperatura (°C)",
      iconColor: "text-orange-400",
      fields: [
        { key: "tempMin", placeholder: "Mín (ex: 22.5)", mode: "decimal" as const },
        { key: "tempMax", placeholder: "Máx (ex: 28.0)", mode: "decimal" as const },
      ],
      transform: (v: string) => v.replace(",", "."),
    },
    {
      icon: Droplets,
      label: "Umidade (%)",
      iconColor: "text-blue-400",
      fields: [
        { key: "rhMin", placeholder: "Mín (ex: 55)", mode: "decimal" as const },
        { key: "rhMax", placeholder: "Máx (ex: 70)", mode: "decimal" as const },
      ],
      transform: (v: string) => v.replace(",", "."),
    },
    {
      icon: Sun,
      label: "PPFD (µmol/m²/s)",
      iconColor: "text-yellow-400",
      fields: [
        { key: "ppfdMin", placeholder: "Mín (ex: 400)", mode: "numeric" as const },
        { key: "ppfdMax", placeholder: "Máx (ex: 800)", mode: "numeric" as const },
      ],
      transform: (v: string) => v.replace(/\D/g, ""),
    },
    {
      icon: Clock,
      label: "Fotoperíodo",
      iconColor: "text-teal-400",
      fields: [
        { key: "photoperiod", placeholder: "Ex: 18/6", mode: "text" as const },
      ],
      transform: (v: string) => v,
    },
    {
      icon: FlaskConical,
      label: "pH",
      iconColor: "text-teal-400",
      fields: [
        { key: "phMin", placeholder: "Mín (ex: 6.0)", mode: "decimal" as const },
        { key: "phMax", placeholder: "Máx (ex: 7.0)", mode: "decimal" as const },
      ],
      transform: (v: string) => v.replace(",", "."),
    },
    {
      icon: Zap,
      label: "EC (mS/cm)",
      iconColor: "text-violet-400",
      fields: [
        { key: "ecMin", placeholder: "Mín (ex: 1.2)", mode: "decimal" as const },
        { key: "ecMax", placeholder: "Máx (ex: 2.0)", mode: "decimal" as const },
      ],
      transform: (v: string) => v.replace(",", "."),
    },
  ];

  const renderWeekCard = (phase: string, weekNumber: number) => {
    const config = phaseConfig[phase as keyof typeof phaseConfig];
    const key = `${phase}-${weekNumber}`;
    const target = editingTargets[key] || {};
    const open = isWeekOpen(phase, weekNumber);

    const hasData = Object.keys(target).some((k) => target[k] && target[k] !== "");

    return (
      <div
        key={key}
        className={`rounded-2xl border ${config.border} overflow-hidden`}
        style={{ background: `linear-gradient(145deg, ${config.glow} 0%, hsl(var(--card)) 60%)` }}
      >
        {/* Week header */}
        <button
          className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
          onClick={() => toggleWeek(key)}
        >
          <span className={`w-2 h-2 rounded-full shrink-0 ${hasData ? config.dot : "bg-muted-foreground/20"}`} />
          <span className={`text-sm font-semibold flex-1 ${hasData ? config.dotColor : "text-foreground/60"}`}>
            Semana {weekNumber}
          </span>
          {hasData && (
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${config.accent}`}>
              Configurada
            </span>
          )}
          {open
            ? <ChevronUp className="w-4 h-4 text-muted-foreground/40 shrink-0" />
            : <ChevronDown className="w-4 h-4 text-muted-foreground/40 shrink-0" />
          }
        </button>

        {/* Week body */}
        {open && (
          <div className="border-t border-border/20 px-4 pt-4 pb-4 space-y-3">
            {fieldGroups.map((group) => {
              const Icon = group.icon;
              return (
                <div key={group.label}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Icon className={`w-3.5 h-3.5 ${group.iconColor}`} />
                    <span className="text-[11px] text-muted-foreground/60 uppercase tracking-wider font-medium">
                      {group.label}
                    </span>
                  </div>
                  <div className={`flex gap-2 ${group.fields.length === 1 ? "" : ""}`}>
                    {group.fields.map((field) => (
                      <Input
                        key={field.key}
                        type="text"
                        inputMode={field.mode === "text" ? undefined : field.mode}
                        placeholder={field.placeholder}
                        value={target[field.key] || ""}
                        onChange={(e) =>
                          updateTarget(phase, weekNumber, field.key, group.transform(e.target.value))
                        }
                        className={`bg-background/40 border-border/30 rounded-xl text-sm h-10 ${
                          group.fields.length === 1 ? "max-w-[160px]" : "flex-1"
                        }`}
                      />
                    ))}
                  </div>
                </div>
              );
            })}

            <Button
              onClick={() => handleSave(phase, weekNumber)}
              disabled={createTarget.isPending}
              className={`w-full mt-2 rounded-xl h-11 bg-gradient-to-r ${config.gradient} text-white border-0 shadow-md hover:opacity-90`}
            >
              {createTarget.isPending
                ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                : <Save className="w-4 h-4 mr-2" />
              }
              Salvar Semana {weekNumber}
            </Button>
          </div>
        )}
      </div>
    );
  };

  if (strainLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!strain) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-muted-foreground">Strain não encontrada</p>
          <Button onClick={() => setLocation("/manage-strains")} className="mt-4">Voltar</Button>
        </div>
      </div>
    );
  }

  const activeConfig = phaseConfig[activePhase];
  const ActiveIcon = activeConfig.icon;
  const weekCount = activePhase === "CLONING" ? 2 : activeConfig.weeks;

  return (
    <PageTransition>
      <div className="min-h-screen bg-background">

        {/* Header */}
        <header className="bg-card/80 backdrop-blur-md border-b border-border/60 sticky top-0 z-20 pt-safe">
          <div className="px-4 py-3 flex items-center gap-3">
            <button
              onClick={() => setLocation("/manage-strains")}
              className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-accent transition-colors shrink-0"
            >
              <ArrowLeft className="w-5 h-5 text-foreground/70" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="text-base font-bold text-foreground truncate leading-tight">{strain.name}</h1>
              <p className="text-[11px] text-muted-foreground/60 leading-tight">Parâmetros por Semana</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setShowComparison(v => !v)}
                className={`px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 text-xs font-semibold transition-colors border ${
                  showComparison
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : "border-border/40 text-muted-foreground hover:border-border"
                }`}
                title="Comparar Vega vs Flora"
              >
                <Leaf className="w-3.5 h-3.5" />
                vs
                <Flower2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => { setSourceStrainId(null); setCopyDialogOpen(true); }}
                className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-accent transition-colors text-muted-foreground"
                title="Copiar targets de outra cepa"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Phase selector */}
        <div className="sticky top-[56px] z-10 bg-background/90 backdrop-blur-md border-b border-border/30 px-4 py-2">
          <div className="flex gap-2">
            {(["CLONING", "VEGA", "FLORA"] as const).map((phase) => {
              const cfg = phaseConfig[phase];
              const Icon = cfg.icon;
              const isActive = activePhase === phase;
              return (
                <button
                  key={phase}
                  onClick={() => setActivePhase(phase)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all border ${
                    isActive
                      ? `bg-gradient-to-r ${cfg.gradient} text-white border-transparent shadow-md`
                      : "bg-card border-border/40 text-muted-foreground hover:border-border"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {cfg.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <main className="px-4 py-4 pb-safe space-y-3">
          {/* Phase info banner */}
          <div
            className={`rounded-2xl border ${activeConfig.border} px-4 py-3 flex items-center gap-3`}
            style={{ background: `linear-gradient(135deg, ${activeConfig.glow} 0%, hsl(var(--card)) 60%)` }}
          >
            <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${activeConfig.gradient} flex items-center justify-center shadow-md shrink-0`}>
              <ActiveIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{activeConfig.label}</p>
              <p className="text-[11px] text-muted-foreground/60">
                {weekCount} semana{weekCount !== 1 ? "s" : ""} · configure os parâmetros ideais por semana
              </p>
            </div>
          </div>

          {/* Comparison table: Vega vs Flora */}
          {showComparison && (() => {
            const vegaTargets = targets.filter((t: any) => t.phase === "VEGA");
            const floraTargets = targets.filter((t: any) => t.phase === "FLORA");
            const avg = (arr: any[], key: string) => {
              const vals = arr.map((t: any) => parseFloat(t[key])).filter(v => !isNaN(v));
              return vals.length ? (vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1) : "—";
            };
            const range = (arr: any[], minKey: string, maxKey: string) => {
              const min = avg(arr, minKey);
              const max = avg(arr, maxKey);
              if (min === "—" && max === "—") return "—";
              if (min === "—") return max;
              if (max === "—") return min;
              return `${min}–${max}`;
            };
            const rows = [
              { label: "Temp (°C)", icon: Thermometer, iconColor: "text-orange-400", vega: range(vegaTargets, "tempMin", "tempMax"), flora: range(floraTargets, "tempMin", "tempMax") },
              { label: "Umidade (%)", icon: Droplets, iconColor: "text-blue-400", vega: range(vegaTargets, "rhMin", "rhMax"), flora: range(floraTargets, "rhMin", "rhMax") },
              { label: "PPFD (µmol)", icon: Sun, iconColor: "text-yellow-400", vega: range(vegaTargets, "ppfdMin", "ppfdMax"), flora: range(floraTargets, "ppfdMin", "ppfdMax") },
              { label: "pH", icon: FlaskConical, iconColor: "text-teal-400", vega: range(vegaTargets, "phMin", "phMax"), flora: range(floraTargets, "phMin", "phMax") },
              { label: "EC (mS/cm)", icon: Zap, iconColor: "text-violet-400", vega: range(vegaTargets, "ecMin", "ecMax"), flora: range(floraTargets, "ecMin", "ecMax") },
            ];
            return (
              <div className="rounded-2xl border border-border/40 bg-card overflow-hidden">
                {/* Column headers */}
                <div className="grid grid-cols-3 text-xs font-semibold border-b border-border/30 bg-muted/20">
                  <div className="px-3 py-2.5 text-muted-foreground/60 uppercase tracking-wider text-[10px]">Parâmetro</div>
                  <div className="px-3 py-2.5 flex items-center gap-1.5 text-green-400 border-l border-border/20">
                    <Leaf className="w-3.5 h-3.5" /> Vega
                  </div>
                  <div className="px-3 py-2.5 flex items-center gap-1.5 text-purple-400 border-l border-border/20">
                    <Flower2 className="w-3.5 h-3.5" /> Flora
                  </div>
                </div>
                {rows.map((row, i) => {
                  const Icon = row.icon;
                  return (
                    <div key={row.label} className={`grid grid-cols-3 text-sm ${i % 2 === 0 ? "" : "bg-muted/10"}`}>
                      <div className="px-3 py-2.5 flex items-center gap-1.5 text-muted-foreground/70">
                        <Icon className={`w-3.5 h-3.5 ${row.iconColor} shrink-0`} />
                        <span className="text-[11px]">{row.label}</span>
                      </div>
                      <div className={`px-3 py-2.5 font-mono text-xs font-medium border-l border-border/20 ${row.vega === "—" ? "text-muted-foreground/30" : "text-green-400"}`}>
                        {row.vega}
                      </div>
                      <div className={`px-3 py-2.5 font-mono text-xs font-medium border-l border-border/20 ${row.flora === "—" ? "text-muted-foreground/30" : "text-purple-400"}`}>
                        {row.flora}
                      </div>
                    </div>
                  );
                })}
                <div className="px-3 py-2 border-t border-border/20 bg-muted/10">
                  <p className="text-[10px] text-muted-foreground/50">Médias dos alvos configurados por semana</p>
                </div>
              </div>
            );
          })()}

          {/* Week cards */}
          {Array.from({ length: weekCount }, (_, i) => i + 1).map((week) =>
            renderWeekCard(activePhase, week)
          )}
        </main>
      </div>

      {/* Copy dialog */}
      <Dialog open={copyDialogOpen} onOpenChange={setCopyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Copy className="w-4 h-4" /> Copiar targets de outra cepa
            </DialogTitle>
            <DialogDescription>
              Selecione a cepa de origem. Todos os targets existentes de <strong>{strain.name}</strong> serão substituídos.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {allStrains.filter(s => s.id !== strainId).map(s => (
              <button
                key={s.id}
                onClick={() => setSourceStrainId(s.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors text-left ${
                  sourceStrainId === s.id
                    ? "border-primary/50 bg-primary/5 text-foreground"
                    : "border-border/40 hover:border-primary/30 hover:bg-muted/40 text-foreground"
                }`}
              >
                <span className="flex-1 text-sm font-medium">{s.name}</span>
                {sourceStrainId === s.id && <span className="text-xs text-primary font-semibold">✓</span>}
              </button>
            ))}
            {allStrains.filter(s => s.id !== strainId).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhuma outra cepa disponível</p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCopyDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleCopyTargets}
              disabled={!sourceStrainId || isCopying || !sourceTargets?.length}
            >
              {isCopying ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Copy className="w-4 h-4 mr-2" />}
              Copiar {sourceTargets?.length ? `(${sourceTargets.length} semanas)` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageTransition>
  );
}

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Trash2, BookmarkPlus, Share2, Copy, Check, Edit, AlertTriangle, FlaskConical, Leaf, Flower2, Lightbulb, Download, BookOpen, Calendar, Droplets, Zap } from "lucide-react";
import { toast } from "sonner";

export function FertilizationCalculator() {
  const [phase, setPhase] = useState<"vega" | "flora">("vega");
  const [weekNumber, setWeekNumber] = useState(1);
  const [volume, setVolume] = useState(10);
  const [volumeStr, setVolumeStr] = useState("10");
  const [useCustomEC, setUseCustomEC] = useState(false);
  const [customEC, setCustomEC] = useState<number | null>(null);
  const [result, setResult] = useState<any>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareCode, setShareCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importCode, setImportCode] = useState("");
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingPreset, setEditingPreset] = useState<any>(null);
  const [editPresetName, setEditPresetName] = useState("");
  const [deletePresetConfirm, setDeletePresetConfirm] = useState<{ open: boolean; id: number | null; name: string }>({
    open: false, id: null, name: ""
  });

  // Buscar EC recomendado do backend
  const { data: weeklyTarget } = trpc.weeklyTargets.get.useQuery({
    phase,
    weekNumber,
  });

  const targetEC = useCustomEC && customEC !== null ? customEC : (Number(weeklyTarget?.targetEC) || 0);

  // Calcular automaticamente quando valores mudam
  useEffect(() => {
    if (volume > 0 && targetEC > 0) {
      // Cálculo baseado em EC (mS/cm) e volume (L)
      // Fórmulas aproximadas para converter EC em gramas de nutrientes
      const calciumNitrate = (targetEC * volume * 0.45).toFixed(2); // 45% do EC
      const potassiumNitrate = (targetEC * volume * 0.20).toFixed(2); // 20% do EC
      const mkp = (targetEC * volume * 0.10).toFixed(2); // 10% do EC (Fosfato Monopotássico)
      const magnesiumSulfate = (targetEC * volume * 0.20).toFixed(2); // 20% do EC
      const micronutrients = (targetEC * volume * 0.05).toFixed(2); // 5% do EC
      
      // PPM aproximado (1 mS/cm ≈ 500-700 ppm, usamos 640 como média)
      const ppmApprox = Math.round(targetEC * 640);
      
      setResult({
        volume,
        ec: targetEC,
        calciumNitrate: {
          total: calciumNitrate,
          perLiter: (parseFloat(calciumNitrate) / volume).toFixed(2)
        },
        potassiumNitrate: {
          total: potassiumNitrate,
          perLiter: (parseFloat(potassiumNitrate) / volume).toFixed(2)
        },
        mkp: {
          total: mkp,
          perLiter: (parseFloat(mkp) / volume).toFixed(2)
        },
        magnesiumSulfate: {
          total: magnesiumSulfate,
          perLiter: (parseFloat(magnesiumSulfate) / volume).toFixed(2)
        },
        micronutrients: {
          total: micronutrients,
          perLiter: (parseFloat(micronutrients) / volume).toFixed(2)
        },
        ppmApprox,
        phase: phase === "vega" ? "🌱 Vega" : "🌸 Flora",
        weekNumber,
      });
    } else {
      setResult(null);
    }
  }, [volume, targetEC, phase, weekNumber]);

  // Mutations para predefinições
  const createPreset = trpc.fertilizationPresets.create.useMutation({
    onSuccess: () => {
      toast.success("Predefinição salva com sucesso!");
      setShowSaveDialog(false);
      setPresetName("");
      presetsList.refetch();
    },
    onError: (error) => {
      toast.error(`Erro ao salvar: ${error.message}`);
    },
  });

  const deletePreset = trpc.fertilizationPresets.delete.useMutation({
    onSuccess: () => {
      toast.success("Predefinição excluída!");
      presetsList.refetch();
    },
    onError: (error) => toast.error(`Erro ao excluir: ${error.message}`),
  });

  const updatePreset = trpc.fertilizationPresets.update.useMutation({
    onSuccess: () => {
      toast.success("Predefinição atualizada!");
      setShowEditDialog(false);
      setEditingPreset(null);
      presetsList.refetch();
    },
    onError: (error) => {
      toast.error(`Erro ao atualizar: ${error.message}`);
    },
  });

  const presetsList = trpc.fertilizationPresets.list.useQuery();

  const handleSavePreset = () => {
    if (!presetName.trim()) {
      toast.error("Digite um nome para a predefinição");
      return;
    }

    const phaseValue = phase === "vega" ? "VEGA" : "FLORA";
    createPreset.mutate({
      name: presetName,
      waterVolume: volume,
      targetEC: targetEC,
      phase: phaseValue as "VEGA" | "FLORA",
      weekNumber,
      irrigationsPerWeek: undefined,
      calculationMode: "per-irrigation",
    });
  };

  const handleLoadPreset = (preset: any) => {
    setPhase(preset.phase);
    setWeekNumber(preset.weekNumber);
    setVolume(parseFloat(preset.waterVolume));
    setCustomEC(preset.targetEC);
    toast.success(`Predefinição "${preset.name}" carregada!`);
  };

  const handleSharePreset = (preset: any) => {
    const recipeData = {
      name: preset.name,
      phase: preset.phase,
      weekNumber: preset.weekNumber,
      waterVolume: preset.waterVolume,
      targetEC: preset.targetEC,
    };
    const code = btoa(JSON.stringify(recipeData)); // Encode to base64
    setShareCode(code);
    setShowShareDialog(true);
    setCopied(false);
  };

  const handleEditPreset = (preset: any) => {
    setEditingPreset(preset);
    setEditPresetName(preset.name);
    setShowEditDialog(true);
  };

  const handleUpdatePreset = () => {
    if (!editPresetName.trim()) {
      toast.error("Digite um nome para a predefinição");
      return;
    }

    updatePreset.mutate({
      id: editingPreset.id,
      name: editPresetName,
      waterVolume: parseFloat(editingPreset.waterVolume),
      targetEC: parseFloat(editingPreset.targetEC),
      phase: editingPreset.phase,
      weekNumber: editingPreset.weekNumber,
      irrigationsPerWeek: editingPreset.irrigationsPerWeek,
      calculationMode: editingPreset.calculationMode,
    });
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(shareCode);
      setCopied(true);
      toast.success("Código copiado!");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error("Erro ao copiar código");
    }
  };

  const handleImportRecipe = () => {
    try {
      const decoded = atob(importCode.trim());
      const recipeData = JSON.parse(decoded);
      
      setPhase(recipeData.phase);
      setWeekNumber(recipeData.weekNumber);
      setVolume(parseFloat(recipeData.waterVolume));
      setCustomEC(recipeData.targetEC);
      
      toast.success(`Receita "${recipeData.name}" importada com sucesso!`);
      setShowImportDialog(false);
      setImportCode("");
    } catch (error) {
      toast.error("Código inválido! Verifique e tente novamente.");
    }
  };



  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40" style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.12) 0%, rgba(139,92,246,0.05) 100%)' }}>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center shadow-lg shadow-purple-900/30">
            <FlaskConical className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Calculadora de Fertilização</p>
            <p className="text-[11px] text-muted-foreground">Calcule a dosagem de reagentes NPK necessária para atingir o EC desejado</p>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* Seletor de Fase */}
          <div>
            <Label htmlFor="phase">Fase do Cultivo</Label>
            <Select value={phase} onValueChange={(v) => setPhase(v as "vega" | "flora")}>
              <SelectTrigger id="phase">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vega"><span className="flex items-center gap-1"><Leaf className="w-3.5 h-3.5 text-green-400"/>Vegetativa (Vega)</span></SelectItem>
                <SelectItem value="flora"><span className="flex items-center gap-1"><Flower2 className="w-3.5 h-3.5 text-purple-400"/>Floração (Flora)</span></SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Seletor de Semana */}
          <div>
            <Label htmlFor="week">Semana</Label>
            <Select value={weekNumber.toString()} onValueChange={(v) => setWeekNumber(parseInt(v))}>
              <SelectTrigger id="week">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((w) => (
                  <SelectItem key={w} value={w.toString()}>
                    Semana {w}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Volume */}
          <div>
            <Label htmlFor="volume" className="text-base font-semibold">Volume de Preparo (litros)</Label>
            <Input
              id="volume"
              type="text"
              inputMode="decimal"
              value={volumeStr}
              onChange={(e) => {
                const val = e.target.value;
                const sanitized = val.replace(',', '.');
                if (sanitized === '' || /^\d*\.?\d*$/.test(sanitized)) {
                  setVolumeStr(sanitized);
                  const num = parseFloat(sanitized);
                  if (!isNaN(num) && num > 0) setVolume(num);
                }
              }}
              onBlur={() => {
                const num = parseFloat(volumeStr);
                const safe = isNaN(num) || num <= 0 ? 1 : num;
                setVolumeStr(String(safe));
                setVolume(safe);
              }}
              placeholder="Ex: 10"
              className="text-3xl md:text-4xl lg:text-5xl h-16 md:h-20 lg:h-24 px-4 font-bold text-center"
            />
          </div>

          {/* EC */}
          <div className="space-y-3">
            <div>
              <Label>EC Desejado (mS/cm)</Label>
              {weeklyTarget && !useCustomEC && (
                <div className="mt-2 p-3 bg-accent/50 rounded-lg">
                  <p className="text-sm font-medium flex items-center gap-1">
                    <Lightbulb className="w-3.5 h-3.5 text-yellow-400"/>EC Pré-definido: <span className="text-lg font-bold">{weeklyTarget.targetEC} mS/cm</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {phase === "vega" ? "Vega" : "Flora"} Semana {weekNumber}
                  </p>
                </div>
              )}
            </div>
            
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="useCustomEC"
                checked={useCustomEC}
                onChange={(e) => {
                  setUseCustomEC(e.target.checked);
                  if (!e.target.checked) {
                    setCustomEC(null);
                  }
                }}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="useCustomEC" className="cursor-pointer">
                Usar EC personalizado
              </Label>
            </div>

            {useCustomEC && (
              <Input
                id="ec"
                type="text"
                inputMode="decimal"
                value={customEC !== null ? String(customEC) : ""}
                onChange={(e) => {
                  const val = e.target.value.replace(',', '.');
                  if (val === '' || /^\d*\.?\d*$/.test(val)) {
                    const num = parseFloat(val);
                    setCustomEC(val === '' ? null : isNaN(num) ? null : num);
                  }
                }}
                placeholder="Digite o EC desejado"
              />
            )}
          </div>

          {/* Botão Calcular Receita */}
          <Button
            onClick={() => {
              // Força recalcular (useEffect já faz isso automaticamente, mas o botão dá feedback visual)
              if (volume > 0 && targetEC > 0) {
                toast.success("✅ Receita calculada com sucesso!");
                // Scroll suave até o resultado
                setTimeout(() => {
                  const resultElement = document.querySelector('[data-result-card]');
                  if (resultElement) {
                    resultElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  }
                }, 100);
              } else {
                toast.error("⚠️ Preencha volume e EC para calcular");
              }
            }}
            size="lg"
            className="w-full bg-gradient-to-r from-emerald-400 to-green-600 hover:from-emerald-500 hover:to-green-700 text-white font-bold text-lg py-6 border-0"
          >
            <FlaskConical className="w-4 h-4"/> Calcular Receita
          </Button>

          <div className="space-y-2">
            <div className="flex gap-2">
              <Button
                onClick={() => setShowSaveDialog(true)}
                variant="outline"
                size="lg"
                className="flex-1"
              >
                <BookmarkPlus className="mr-2 h-4 w-4" />
                Salvar Predefinição
              </Button>
              <Button
                onClick={() => setShowImportDialog(true)}
                variant="secondary"
                size="lg"
                className="flex-1"
              >
                <Share2 className="mr-2 h-4 w-4" />
                Importar Receita
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Resultado */}
      {result && (
        <div data-result-card className="rounded-2xl border border-green-400/30 bg-card overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.08) 0%, rgba(16,185,129,0.04) 100%)' }}>
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40" style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.12) 0%, rgba(16,185,129,0.05) 100%)' }}>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-green-900/30">
              <FlaskConical className="w-4 h-4 text-white" />
            </div>
            <p className="text-sm font-semibold text-foreground">Receita de Fertilização para {result.volume}L</p>
          </div>

          <div className="p-4 space-y-3">
            {/* Nitrato de Cálcio */}
            <div className="p-3 rounded-xl border border-orange-400/30" style={{ background: 'rgba(251,146,60,0.08)' }}>
              <div className="flex justify-between items-center">
                <span className="font-medium text-foreground">Nitrato de Cálcio:</span>
                <div className="text-right">
                  <div className="text-2xl font-bold text-orange-400" style={{ textShadow: '0 0 12px rgba(251,146,60,0.5)' }}>{result.calciumNitrate.total} g</div>
                  <div className="text-sm text-muted-foreground">({result.calciumNitrate.perLiter} g/L)</div>
                </div>
              </div>
            </div>

            {/* Nitrato de Potássio */}
            <div className="p-3 rounded-xl border border-purple-400/30" style={{ background: 'rgba(168,85,247,0.08)' }}>
              <div className="flex justify-between items-center">
                <span className="font-medium text-foreground">Nitrato de Potássio:</span>
                <div className="text-right">
                  <div className="text-2xl font-bold text-purple-400" style={{ textShadow: '0 0 12px rgba(168,85,247,0.5)' }}>{result.potassiumNitrate.total} g</div>
                  <div className="text-sm text-muted-foreground">({result.potassiumNitrate.perLiter} g/L)</div>
                </div>
              </div>
            </div>

            {/* MKP */}
            <div className="p-3 rounded-xl border border-blue-400/30" style={{ background: 'rgba(59,130,246,0.08)' }}>
              <div className="flex justify-between items-center">
                <span className="font-medium text-foreground">MKP (Fosfato Monopotássico):</span>
                <div className="text-right">
                  <div className="text-2xl font-bold text-blue-400" style={{ textShadow: '0 0 12px rgba(59,130,246,0.5)' }}>{result.mkp.total} g</div>
                  <div className="text-sm text-muted-foreground">({result.mkp.perLiter} g/L)</div>
                </div>
              </div>
            </div>

            {/* Sulfato de Magnésio */}
            <div className="p-3 rounded-xl border border-green-400/30" style={{ background: 'rgba(34,197,94,0.08)' }}>
              <div className="flex justify-between items-center">
                <span className="font-medium text-foreground">Sulfato de Magnésio:</span>
                <div className="text-right">
                  <div className="text-2xl font-bold text-green-400" style={{ textShadow: '0 0 12px rgba(34,197,94,0.5)' }}>{result.magnesiumSulfate.total} g</div>
                  <div className="text-sm text-muted-foreground">({result.magnesiumSulfate.perLiter} g/L)</div>
                </div>
              </div>
            </div>

            {/* Micronutrientes */}
            <div className="p-3 rounded-xl border border-yellow-400/30" style={{ background: 'rgba(234,179,8,0.08)' }}>
              <div className="flex justify-between items-center">
                <span className="font-medium text-foreground">Micronutrientes:</span>
                <div className="text-right">
                  <div className="text-2xl font-bold text-yellow-400" style={{ textShadow: '0 0 12px rgba(234,179,8,0.5)' }}>{result.micronutrients.total} g</div>
                  <div className="text-sm text-muted-foreground">({result.micronutrients.perLiter} g/L)</div>
                </div>
              </div>
            </div>

            {/* EC Resultante */}
            <div className="p-3 rounded-xl border border-cyan-400/30 mt-2" style={{ background: 'rgba(34,211,238,0.08)' }}>
              <div className="flex justify-between items-center">
                <span className="font-medium text-foreground">EC Resultante:</span>
                <div className="text-right">
                  <div className="text-3xl font-bold text-cyan-400" style={{ textShadow: '0 0 16px rgba(34,211,238,0.6)' }}>{result.ec} mS/cm</div>
                  <div className="text-sm text-muted-foreground">PPM Aproximado: {result.ppmApprox} ppm</div>
                </div>
              </div>
            </div>

            {/* Botão Exportar TXT */}
            <Button
              onClick={() => {
                const now = new Date();
                const dateStr = now.toLocaleDateString('pt-BR');
                
                const txtContent = `RECEITA DE FERTILIZAÇÃO - APP CULTIVO
================================================

DATA: ${dateStr}

PARÂMETROS:
- Volume de preparo: ${result.volume}L
- EC desejado: ${result.ec} mS/cm
- PPM aproximado: ${result.ppmApprox} ppm
- Fase: ${result.phase}
- Semana: ${result.weekNumber}

RECEITA (g/L):
- Nitrato de Cálcio: ${result.calciumNitrate.perLiter} g/L
- Nitrato de Potássio: ${result.potassiumNitrate.perLiter} g/L
- MKP (Fosfato Monopotássico): ${result.mkp.perLiter} g/L
- Sulfato de Magnésio: ${result.magnesiumSulfate.perLiter} g/L
- Micronutrientes: ${result.micronutrients.perLiter} g/L

QUANTIDADES TOTAIS:
- Nitrato de Cálcio: ${result.calciumNitrate.total} g
- Nitrato de Potássio: ${result.potassiumNitrate.total} g
- MKP: ${result.mkp.total} g
- Sulfato de Magnésio: ${result.magnesiumSulfate.total} g
- Micronutrientes: ${result.micronutrients.total} g

DICA:
Dissolva cada reagente separadamente e misture na ordem:
Cálcio → Potássio → MKP → Magnésio → Micronutrientes

NUNCA misture Cálcio diretamente com Sulfato ou Fosfato!
Aguarde cada reagente dissolver completamente antes de adicionar o próximo.

---
Gerado por App Cultivo em ${now.toLocaleString('pt-BR')}
`;
                
                // Criar blob e download
                const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `receita-fertilizacao-${result.volume}L-${result.ec}mS.txt`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
                
                toast.success('✅ Receita exportada para TXT!');
              }}
              className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white"
              size="lg"
            >
              <Download className="w-4 h-4"/> Exportar Receita (TXT)
            </Button>
          </div>
        </div>
      )}

      {/* Modal de Salvar Predefinição */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Salvar Predefinição</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="preset-name">Nome da Predefinição</Label>
              <Input
                id="preset-name"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="Ex: Vega Semana 3 - 10L"
              />
            </div>
            <div className="text-sm text-muted-foreground">
              <p><strong>Fase:</strong> {phase === "vega" ? "Vegetativa" : "Floração"}</p>
              <p><strong>Semana:</strong> {weekNumber}</p>
              <p><strong>Volume:</strong> {volume}L</p>
              <p><strong>EC:</strong> {targetEC} mS/cm</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSavePreset} disabled={createPreset.isPending}>
              {createPreset.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lista de Predefinições Salvas */}
      {presetsList.data && presetsList.data.length > 0 && (
        <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40" style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.10) 0%, rgba(37,99,235,0.04) 100%)' }}>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-900/30">
              <BookOpen className="w-4 h-4 text-white" />
            </div>
            <p className="text-sm font-semibold text-foreground">Minhas Predefinições</p>
          </div>
          <div className="p-4 space-y-3">
            {presetsList.data.map((preset: any) => (
              <div
                key={preset.id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
              >
                <div className="flex-1">
                  <p className="font-medium">{preset.name}</p>
                  <p className="text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1">{preset.phase === "vega" ? <><Leaf className="w-3 h-3 text-green-400"/>Vega</> : <><Flower2 className="w-3 h-3 text-purple-400"/>Flora</>}</span> Semana {preset.weekNumber} • {preset.waterVolume}L • {preset.targetEC} mS/cm
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleLoadPreset(preset)}
                    title="Carregar predefinição"
                  >
                    Carregar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEditPreset(preset)}
                    title="Editar predefinição"
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleSharePreset(preset)}
                    title="Compartilhar predefinição"
                  >
                    <Share2 className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeletePresetConfirm({ open: true, id: preset.id, name: preset.name })}
                    title="Excluir predefinição"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal de Compartilhar Receita */}
      <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Share2 className="w-4 h-4"/>Compartilhar Receita</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Copie o código abaixo e envie para outras pessoas. Elas poderão importar esta receita na calculadora delas!
            </p>
            <div className="relative">
              <Input
                value={shareCode}
                readOnly
                className="pr-10 font-mono text-xs"
              />
              <Button
                size="sm"
                variant="ghost"
                className="absolute right-1 top-1/2 -translate-y-1/2"
                onClick={handleCopyCode}
              >
                {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowShareDialog(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Importar Receita */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Download className="w-4 h-4"/>Importar Receita Compartilhada</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="import-code">Código da Receita</Label>
              <Input
                id="import-code"
                value={importCode}
                onChange={(e) => setImportCode(e.target.value)}
                placeholder="Cole o código aqui"
                className="font-mono text-xs"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Cole o código que você recebeu e clique em Importar para carregar a receita na calculadora.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImportDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleImportRecipe} disabled={!importCode.trim()}>
              Importar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Editar Predefinição */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Predefinição</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="edit-preset-name">Nome da Predefinição</Label>
              <Input
                id="edit-preset-name"
                value={editPresetName}
                onChange={(e) => setEditPresetName(e.target.value)}
                placeholder="Ex: Vega Semana 3 - 10L"
              />
            </div>
            {editingPreset && (
              <div className="text-sm text-muted-foreground space-y-1">
                <p className="flex items-center gap-1"><Leaf className="w-3 h-3 text-green-400"/>Fase: {editingPreset.phase === "vega" ? "Vegetativa" : "Floração"}</p>
                <p className="flex items-center gap-1"><Calendar className="w-3 h-3 text-muted-foreground"/>Semana: {editingPreset.weekNumber}</p>
                <p className="flex items-center gap-1"><Droplets className="w-3 h-3 text-blue-400"/>Volume: {editingPreset.waterVolume}L</p>
                <p className="flex items-center gap-1"><Zap className="w-3 h-3 text-yellow-400"/>EC: {editingPreset.targetEC} mS/cm</p>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Nota: Apenas o nome pode ser editado. Para alterar os valores, crie uma nova predefinição.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdatePreset} disabled={updatePreset.isPending}>
              {updatePreset.isPending ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Preset Confirm Dialog */}
      <Dialog open={deletePresetConfirm.open} onOpenChange={(open) => !open && setDeletePresetConfirm({ open: false, id: null, name: "" })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Excluir Predefinição
            </DialogTitle>
            <DialogDescription>
              Excluir a predefinição{" "}
              <span className="font-semibold text-foreground">"{deletePresetConfirm.name}"</span>?
              Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeletePresetConfirm({ open: false, id: null, name: "" })}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deletePresetConfirm.id) {
                  deletePreset.mutate({ id: deletePresetConfirm.id });
                  setDeletePresetConfirm({ open: false, id: null, name: "" });
                }
              }}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

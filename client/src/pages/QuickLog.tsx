import { useState, useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { AnimatedButton } from "@/components/AnimatedButton";
import { LazyImage } from "@/components/LazyImage";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BigStepper } from "@/components/BigStepper";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Loader2, Home, ThermometerSun, Droplets, Sprout, GlassWater, Droplet, TestTube, Zap, Sun, Check, ArrowLeft, ArrowRight, Heart, SkipForward, Activity, Camera, Upload, X, CheckCircle2, AlertTriangle, XCircle, Target, Smartphone, Sparkles, Wifi } from "lucide-react";
import { RangeSlider } from "@/components/ui/range-slider";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { uploadImage } from "@/lib/uploadImage";
import { PhotoUploadProgress, type UploadStage } from "@/components/PhotoUploadProgress";
import { PageTransition } from "@/components/PageTransition";
import { savePendingLog, isOnline } from "@/lib/offlineStorage";

// LST Techniques and Trichome types removed - available in individual plant pages

function getValidationColor(value: string, min?: number | null, max?: number | null): string {
  if (!value || !min || !max) return "";
  const v = parseFloat(value);
  if (isNaN(v)) return "";
  if (v >= min && v <= max) return "text-green-500 dark:text-green-400";
  const tolerance = (max - min) * 0.15;
  if (v >= min - tolerance && v <= max + tolerance) return "text-amber-500 dark:text-amber-400";
  return "text-red-500 dark:text-red-400";
}

export default function QuickLog() {
  const [, setLocation] = useLocation();

  // Read ?mode= URL param to pre-select mode (from FAB mini menu)
  const urlMode = (() => {
    const m = new URLSearchParams(window.location.search).get('mode');
    if (m === 'status' || m === 'plant' || m === 'trichome') return m;
    return null;
  })();

  const [currentStep, setCurrentStep] = useState(0);
  const [logMode, setLogMode] = useState<'status' | 'plant' | 'trichome' | null>(urlMode);
  const stepScrollRef = useRef<HTMLDivElement>(null);

  // Body scroll lock not needed — outer container uses position:fixed inset-0

  // Reset scroll to top whenever the step changes
  useEffect(() => {
    if (stepScrollRef.current) {
      stepScrollRef.current.scrollTop = 0;
    }
  }, [currentStep, logMode]);

  // Photo upload progress state
  const [uploadProgress, setUploadProgress] = useState<{
    isUploading: boolean;
    stage: UploadStage;
    progress: number;
    originalSize?: string;
    compressedSize?: string;
    reduction?: number;
  }>({ isUploading: false, stage: "converting", progress: 0 });
  
  // Haptic feedback helper
  const triggerHaptic = (type: 'light' | 'medium' | 'heavy' = 'light') => {
    if ('vibrate' in navigator) {
      const duration = type === 'light' ? 10 : type === 'medium' ? 20 : 50;
      navigator.vibrate(duration);
    }
  };
  
  const goNext = () => {
    triggerHaptic('medium');
    // Só pula temp/rh se a query já retornou (sensorReading !== undefined) e está fresca
    if (currentStep === 0 && sensorReading !== undefined && sensorReading?.isFresh && logMode === 'status') {
      return setCurrentStep(3);
    }
    setCurrentStep(prev => prev + 1);
  };

  const goBack = () => {
    triggerHaptic('light');
    if (currentStep === 3 && sensorReading !== undefined && sensorReading?.isFresh && logMode === 'status') {
      return setCurrentStep(0);
    }
    setCurrentStep(prev => prev - 1);
  };

  // Auto-detect shift based on current time (AM before 6 PM, PM after 6 PM)
  const getDefaultShift = (): "AM" | "PM" => {
    const currentHour = new Date().getHours();
    return currentHour < 18 ? "AM" : "PM";
  };
  
  const [turn, setTurn] = useState<"AM" | "PM">(getDefaultShift());
  
  // Form state - Daily Log
  const [tentId, setTentId] = useState<number | null>(null);
  
  // Detect tentId from URL parameter and pre-select tent
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tentIdParam = params.get('tentId');
    if (tentIdParam) {
      const parsedTentId = parseInt(tentIdParam, 10);
      if (!isNaN(parsedTentId)) {
        setTentId(parsedTentId);
      }
    }
  }, []);
  const [tempC, setTempC] = useState("");
  const [rhPct, setRhPct] = useState("");
  const [wateringVolume, setWateringVolume] = useState("");
  const [runoffCollected, setRunoffCollected] = useState("");
  const [runoffPh, setRunoffPh] = useState("");
  const [runoffEc, setRunoffEc] = useState("");
  const [ph, setPh] = useState("");
  const [ec, setEc] = useState("");
  const [ppfd, setPpfd] = useState(400); // Valor inicial realista: 400 μmol/m²/s
  const [lightUnit, setLightUnit] = useState<"ppfd" | "lux">("ppfd"); // Toggle between Lux and PPFD
  const [luxValue, setLuxValue] = useState(20000); // Valor inicial realista: 20.000 lux

  // Plant health state - expanded
  const [recordPlantHealth, setRecordPlantHealth] = useState<boolean | null>(urlMode === 'plant' ? true : null);
  const [currentPlantIndex, setCurrentPlantIndex] = useState(0);
  const [plantHealthRecords, setPlantHealthRecords] = useState<Map<number, {
    status: string;
    symptoms: string;
    notes: string;
    photoUrl?: string;
    photoPreview?: string;
  }>>(new Map());

  // Trichome state
  const [recordTrichomes, setRecordTrichomes] = useState<boolean | null>(urlMode === 'trichome' ? true : null);
  const [currentTrichomeIndex, setCurrentTrichomeIndex] = useState(0);
  const [trichomeRecords, setTrichomeRecords] = useState<Map<number, {
    status: "CLEAR" | "CLOUDY" | "AMBER" | "MIXED";
    clearPct: string;
    cloudyPct: string;
    amberPct: string;
    notes: string;
  }>>(new Map());

  // Fetch tents for selection
  const { data: tents = [], isLoading: tentsLoading } = trpc.tents.list.useQuery();
  const selectedTent = tents.find((t: any) => t.id === tentId);
  const isFloraPhase = selectedTent?.category === "FLORA";
  const floraTents = tents.filter((t: any) => t.category === "FLORA");

  // Auto-select single FLORA tent in trichome mode
  useEffect(() => {
    if (logMode === 'trichome' && floraTents.length === 1 && !tentId) {
      setTentId(floraTents[0].id);
      setCurrentStep(9);
    }
  }, [logMode, floraTents.length, tentId]);

  // Fetch plants for selected tent (load when reaching step 9)
  const { data: plants = [], isLoading: plantsLoading } = trpc.plants.list.useQuery(
    { status: "ACTIVE" },
    {
      enabled: !!tentId && currentStep >= 9,
      select: (data) => data.filter(p => p.currentTentId === tentId)
    }
  );

  // Pré-preencher com o último registro ao selecionar estufa
  const { data: lastLogs } = trpc.dailyLogs.list.useQuery(
    { tentId: tentId ?? 0, limit: 1 },
    { enabled: !!tentId }
  );
  useEffect(() => {
    const last = lastLogs?.[0];
    if (!last) return;
    if (last.ph)              setPh(String(parseFloat(String(last.ph))));
    if (last.ec)              setEc(String(parseFloat(String(last.ec))));
    if (last.wateringVolume)  setWateringVolume(String(last.wateringVolume));
    if (last.runoffCollected) setRunoffCollected(String(last.runoffCollected));
    if (last.ppfd)            setPpfd(last.ppfd);
    // Temp e umidade só são preenchidos do lastLog se não houver sensor ativo (tratado abaixo)
  }, [lastLogs]);

  // Leitura do sensor Tuya para esta estufa
  const { data: sensorReading, refetch: refetchSensor } = trpc.tuya.getLatestReadingForTent.useQuery(
    { tentId: tentId ?? 0 },
    { enabled: !!tentId, staleTime: 60_000 }
  );
  const readNow = trpc.tuya.readNow.useMutation({
    onSuccess: () => { refetchSensor(); toast.success('Leitura atualizada!'); },
    onError: (e) => toast.error(`Erro no sensor: ${e.message}`),
  });

  // Aplica leitura do sensor quando disponível (sobrescreve lastLog para temp/rh)
  useEffect(() => {
    if (sensorReading?.isFresh) {
      // Sensor ativo com leitura fresca — preenche diretamente
      if (sensorReading.tempC != null) setTempC(String(sensorReading.tempC));
      if (sensorReading.rhPct  != null) setRhPct(String(sensorReading.rhPct));
    } else {
      // Sem sensor, sensor sem leitura ainda, ou query ainda carregando
      // → usa lastLog para temp/rh (limpa campos se não houver dado anterior)
      const last = lastLogs?.[0];
      if (!last) { setTempC(""); setRhPct(""); return; }
      if (last.tempC != null) setTempC(String(parseFloat(String(last.tempC))));
      else setTempC("");
      if (last.rhPct != null) setRhPct(String(parseFloat(String(last.rhPct))));
      else setRhPct("");
    }
  }, [sensorReading, lastLogs]);

  // Fetch weekly targets for color validation
  const { data: targets } = trpc.weeklyTargets.getTargetsByTent.useQuery(
    { tentId: tentId ?? 0, phase: "VEGA", weekNumber: 1 },
    { enabled: !!tentId }
  );

  // Calculate runoff percentage
  const runoffPercentage = useMemo(() => {
    const watering = parseFloat(wateringVolume);
    const runoff = parseFloat(runoffCollected);
    if (isNaN(watering) || isNaN(runoff) || watering === 0) return null;
    return ((runoff / watering) * 100).toFixed(1);
  }, [wateringVolume, runoffCollected]);

  const utils = trpc.useUtils();

  // Save daily log mutation
  const saveDailyLogMutation = trpc.dailyLogs.create.useMutation({
    onSuccess: () => {
      // Invalida cache para que Home e TentDetails mostrem o novo log imediatamente
      utils.dailyLogs.list.invalidate();
      utils.dailyLogs.getLatestByTent.invalidate();
      // Log saved — advance to plant health question (step 9)
      setCurrentStep(9);
    },
    onError: (error) => {
      toast.error(`Erro ao salvar: ${error.message}`);
    },
  });

  // Save plant health mutation
  const savePlantHealthMutation = trpc.plantHealth.create.useMutation({
    onSuccess: () => {
      if (currentPlantIndex < plants.length - 1) {
        setCurrentPlantIndex(currentPlantIndex + 1);
      } else if (isFloraPhase && logMode === 'plant') {
        // Propõe registro de tricomas após saúde (só no modo planta)
        setCurrentTrichomeIndex(0);
        setRecordTrichomes(null);
      } else {
        toast.success("Registros salvos com sucesso!");
        resetForm();
        setTimeout(() => setLocation("/"), 1500);
      }
    },
    onError: (error: any) => {
      toast.error(`Erro ao salvar: ${error.message}`);
    },
  });

  // Save trichome mutation
  const saveTrichomeMutation = trpc.plantTrichomes.create.useMutation({
    onSuccess: () => {
      if (currentTrichomeIndex < plants.length - 1) {
        setCurrentTrichomeIndex(currentTrichomeIndex + 1);
      } else {
        toast.success("Todos os registros salvos!");
        resetForm();
        setTimeout(() => setLocation("/"), 1500);
      }
    },
    onError: (error: any) => {
      toast.error(`Erro ao salvar tricomas: ${error.message}`);
    },
  });

  // Upload photo mutation
  const uploadPhotoMutation = trpc.plantPhotos.upload.useMutation({
    onSuccess: () => {
      toast.success("Foto salva!");
    },
    onError: (error) => {
      toast.error(`Erro ao salvar foto: ${error.message}`);
    },
  });

  // Trichomes and LST mutations removed - available in individual plant pages

  const resetForm = () => {
    setCurrentStep(0);
    setTentId(null);
    setTempC("");
    setRhPct("");
    setWateringVolume("");
    setRunoffCollected("");
    setRunoffPh("");
    setRunoffEc("");
    setPh("");
    setEc("");
    setPpfd(400); // Volta ao valor inicial realista
    setLuxValue(20000);
    setRecordPlantHealth(null);
    setCurrentPlantIndex(0);
    setPlantHealthRecords(new Map());
    setRecordTrichomes(null);
    setCurrentTrichomeIndex(0);
    setTrichomeRecords(new Map());
  };


  const updateTrichomeRecord = (plantId: number, field: string, value: any) => {
    setTrichomeRecords((prev) => {
      const newMap = new Map(prev);
      const existing = newMap.get(plantId) || { status: "CLOUDY" as const, clearPct: "", cloudyPct: "", amberPct: "", notes: "" };
      newMap.set(plantId, { ...existing, [field]: value });
      return newMap;
    });
  };

  const handleSaveTrichome = () => {
    const plant = plants[currentTrichomeIndex];
    const rec = trichomeRecords.get(plant.id);
    saveTrichomeMutation.mutate({
      plantId: plant.id,
      weekNumber: (plant as any).cycleWeek || 1,
      trichomeStatus: rec?.status || "CLOUDY",
      clearPercent: rec?.clearPct ? parseInt(rec.clearPct) : undefined,
      cloudyPercent: rec?.cloudyPct ? parseInt(rec.cloudyPct) : undefined,
      amberPercent: rec?.amberPct ? parseInt(rec.amberPct) : undefined,
      notes: rec?.notes || undefined,
    });
  };

  const handleSkipTrichome = () => {
    if (currentTrichomeIndex < plants.length - 1) {
      setCurrentTrichomeIndex(currentTrichomeIndex + 1);
    } else {
      toast.success("Registros salvos com sucesso!");
      resetForm();
      setTimeout(() => setLocation("/"), 1500);
    }
  };

  const updatePlantHealthRecord = (plantId: number, field: string, value: any) => {
    setPlantHealthRecords((prev) => {
      const newMap = new Map(prev);
      const existing = newMap.get(plantId) || {
        status: "healthy",
        symptoms: "",
        notes: "",
      };
      newMap.set(plantId, { ...existing, [field]: value });
      return newMap;
    });
  };

  // toggleLSTTechnique removed - LST available in individual plant pages

  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Aceitar qualquer imagem (incluindo HEIC sem mime type no iOS)
    const isImage = file.type.startsWith("image/") || file.type === "" || file.name.match(/\.(jpg|jpeg|png|gif|webp|heic|heif|bmp|tiff)$/i);
    if (!isImage) {
      toast.error("Por favor, selecione apenas imagens");
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx 20MB)");
      return;
    }

    // Preview local imediato (antes do upload)
    const previewUrl = URL.createObjectURL(file);
    updatePlantHealthRecord(plants[currentPlantIndex].id, "photoPreview", previewUrl);

    try {
      setUploadProgress({ isUploading: true, stage: "uploading", progress: 10 });

      // Upload direto para o servidor (sharp converte HEIC + comprime no servidor)
      const url = await uploadImage(file, (pct) => {
        setUploadProgress(prev => ({ ...prev, progress: 10 + Math.round(pct * 0.85) }));
      });

      updatePlantHealthRecord(plants[currentPlantIndex].id, "photoUrl", url);

      setUploadProgress(prev => ({ ...prev, stage: "complete", progress: 100 }));
      setTimeout(() => {
        setUploadProgress({ isUploading: false, stage: "converting", progress: 0 });
        toast.success("Foto enviada com sucesso!");
      }, 1000);
    } catch (error: any) {
      console.error("[QuickLog] Erro ao enviar imagem:", error);
      // Limpar preview se o upload falhou
      updatePlantHealthRecord(plants[currentPlantIndex].id, "photoPreview", undefined);
      setUploadProgress({ isUploading: false, stage: "converting", progress: 0 });
      toast.error(error?.message || "Erro ao enviar imagem. Tente novamente.");
    }
  };

  const handleSavePlantHealth = async () => {
    const plant = plants[currentPlantIndex];
    const record = plantHealthRecords.get(plant.id);

    // Se o usuário não interagiu com o formulário, usa o padrão "HEALTHY" (Saudável)
    const healthStatusMap: Record<string, "HEALTHY" | "STRESSED" | "SICK"> = {
      healthy: "HEALTHY",
      attention: "STRESSED",
      sick: "SICK",
    };

    const status = record?.status || "healthy";

    try {
      await savePlantHealthMutation.mutateAsync({
        plantId: plant.id,
        healthStatus: healthStatusMap[status] || "HEALTHY",
        symptoms: record?.symptoms || undefined,
        treatment: undefined,
        notes: record?.notes || undefined,
        photoUrl: record?.photoUrl || undefined,
      });

      // Trichomes and LST save logic removed - available in individual plant pages

      // Success handled by mutation onSuccess
    } catch (error: any) {
      toast.error(`Erro: ${error.message}`);
    }
  };

  const handleSkipPlantHealth = () => {
    if (currentPlantIndex < plants.length - 1) {
      setCurrentPlantIndex(currentPlantIndex + 1);
    } else if (isFloraPhase && logMode === 'plant') {
      setCurrentTrichomeIndex(0);
      setRecordTrichomes(null);
    } else {
      toast.success("Registro salvo com sucesso!");
      resetForm();
      setTimeout(() => setLocation("/"), 1500);
    }
  };

  const handleSaveDailyLog = async () => {
    if (!tentId) {
      toast.error("Selecione uma estufa");
      return;
    }

    const payload = {
      tentId,
      logDate: new Date(),
      turn,
      tempC: tempC || undefined,
      rhPct: rhPct || undefined,
      wateringVolume: wateringVolume ? parseFloat(wateringVolume) : undefined,
      runoffCollected: runoffCollected ? parseFloat(runoffCollected) : undefined,
      ph: ph || undefined,
      ec: ec || undefined,
      ppfd: ppfd || undefined,
    };

    // Validação de faixa — evita dados absurdos que disparam alertas falsos
    if (tempC) {
      const v = parseFloat(tempC);
      if (isNaN(v) || v < 0 || v > 60) {
        toast.error("Temperatura inválida — use entre 0 e 60 °C");
        return;
      }
    }
    if (rhPct) {
      const v = parseFloat(rhPct);
      if (isNaN(v) || v < 0 || v > 100) {
        toast.error("Umidade inválida — use entre 0 e 100 %");
        return;
      }
    }
    if (ph) {
      const v = parseFloat(ph);
      if (isNaN(v) || v < 0 || v > 14) {
        toast.error("pH inválido — use entre 0 e 14");
        return;
      }
    }
    if (ec) {
      const v = parseFloat(ec);
      if (isNaN(v) || v < 0 || v > 15) {
        toast.error("EC inválido — use entre 0 e 15 mS/cm");
        return;
      }
    }
    if (ppfd && (ppfd < 0 || ppfd > 3000)) {
      toast.error("PPFD inválido — use entre 0 e 3000 µmol/m²/s");
      return;
    }

    // Sem conexão → salvar na fila offline e avançar normalmente
    if (!isOnline()) {
      try {
        await savePendingLog(payload);
        // Pedir ao SW para sincronizar quando voltar a internet
        if ('serviceWorker' in navigator && 'SyncManager' in window) {
          const reg = await navigator.serviceWorker.ready;
          await (reg as any).sync.register('sync-daily-logs');
        }
        toast("📱 Salvo offline — vai sincronizar quando conectar", {
          description: "Registro na fila de envio",
          duration: 4000,
        });
        setCurrentStep(9); // avança para tela de confirmação
      } catch {
        toast.error("Erro ao salvar offline");
      }
      return;
    }

    saveDailyLogMutation.mutate(payload);
  };

  const canGoNext = () => {
    switch (currentStep) {
      case 0:
        return tentId !== null;
      default:
        return true;
    }
  };

  const steps = [
    { id: 0, title: "Estufa", icon: Home, gradient: "from-blue-500 to-cyan-600" },
    { id: 1, title: "Temperatura", icon: ThermometerSun, gradient: "from-orange-500 to-red-600" },
    { id: 2, title: "Umidade", icon: Droplets, gradient: "from-blue-400 to-blue-600" },
    { id: 3, title: "Volume de Rega", icon: GlassWater, gradient: "from-blue-400 to-blue-600" },
    { id: 4, title: "Runoff Coletado", icon: Droplet, gradient: "from-teal-500 to-cyan-600" },
    { id: 5, title: "pH", icon: TestTube, gradient: "from-purple-500 to-pink-600" },
    { id: 6, title: "EC", icon: Zap, gradient: "from-yellow-500 to-orange-600" },
    { id: 7, title: "PPFD", icon: Sun, gradient: "from-yellow-400 to-amber-600" },
    { id: 8, title: "Resumo", icon: Check, gradient: "from-green-500 to-emerald-600" },
  ];

  const currentStepData = steps[currentStep];

  // ── Interpolação contínua de cor ─────────────────────────────────────────
  function hexToRgb(hex: string): [number, number, number] {
    return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
  }
  function lerpRgb(a: [number,number,number], b: [number,number,number], t: number): string {
    return `rgb(${Math.round(a[0]+(b[0]-a[0])*t)},${Math.round(a[1]+(b[1]-a[1])*t)},${Math.round(a[2]+(b[2]-a[2])*t)})`;
  }
  function colorAtStops(v: number, stops: [number, string][]): string {
    if (v <= stops[0][0]) return lerpRgb(hexToRgb(stops[0][1]), hexToRgb(stops[0][1]), 0);
    if (v >= stops[stops.length-1][0]) return lerpRgb(hexToRgb(stops[stops.length-1][1]), hexToRgb(stops[stops.length-1][1]), 0);
    for (let i = 0; i < stops.length-1; i++) {
      const [v0, c0] = stops[i];
      const [v1, c1] = stops[i+1];
      if (v >= v0 && v <= v1) return lerpRgb(hexToRgb(c0), hexToRgb(c1), (v-v0)/(v1-v0));
    }
    return lerpRgb(hexToRgb(stops[0][1]), hexToRgb(stops[0][1]), 0);
  }
  function darkenRgb(rgb: string, amt = 28): string {
    const m = rgb.match(/\d+/g)!;
    return `rgb(${Math.max(0,+m[0]-amt)},${Math.max(0,+m[1]-amt)},${Math.max(0,+m[2]-amt)})`;
  }

  // ── Gradiente dinâmico do círculo ────────────────────────────────────────
  function getDynamicCircleGradient(): string {
    switch (currentStep) {
      case 1: { // Temperatura — interpolação contínua frio→quente
        const c = colorAtStops(parseFloat(tempC) || 20, [
          [10, "#60a5fa"], [17, "#34d399"], [22, "#4ade80"], [28, "#fbbf24"], [36, "#f87171"],
        ]);
        return `linear-gradient(135deg, ${c}, ${darkenRgb(c)})`;
      }
      case 2: { // Umidade — cinza seco → azul saturado
        const c = colorAtStops(parseFloat(rhPct) || 50, [
          [0, "#94a3b8"], [40, "#93c5fd"], [65, "#60a5fa"], [100, "#3b82f6"],
        ]);
        return `linear-gradient(135deg, ${c}, ${darkenRgb(c)})`;
      }
      case 3: // Water — azul (tratado como fill na JSX)
        return "linear-gradient(135deg, #60a5fa, #2563eb)";
      case 4: // Runoff — teal (tratado como fill na JSX)
        return "linear-gradient(135deg, #2dd4bf, #0d9488)";
      case 5: { // pH — espectro contínuo
        const c = colorAtStops(parseFloat(ph) || 6.5, [
          [0, "#ef4444"], [4, "#f97316"], [6, "#eab308"],
          [6.8, "#22c55e"], [8, "#14b8a6"], [10, "#3b82f6"], [14, "#a855f7"],
        ]);
        return `linear-gradient(135deg, ${c}, ${darkenRgb(c)})`;
      }
      case 6: // EC — âmbar/laranja fixo
        return "linear-gradient(135deg, #fbbf24, #f97316)";
      case 7: { // PPFD — amarelo cada vez mais quente
        const c = colorAtStops(ppfd, [
          [0, "#fde68a"], [400, "#fbbf24"], [800, "#f59e0b"], [1200, "#f97316"],
        ]);
        return `linear-gradient(135deg, ${c}, ${darkenRgb(c, 20)})`;
      }
      case 0:  return "linear-gradient(135deg, #60a5fa, #0891b2)";
      case 8:  return "linear-gradient(135deg, #4ade80, #10b981)";
      default: return "linear-gradient(135deg, #4ade80, #10b981)";
    }
  }

  // ── Estilo completo do círculo (inclui glow para PPFD e fill para água) ──
  function getCircleStyle(): React.CSSProperties {
    const base = getDynamicCircleGradient();
    if (currentStep === 7) {
      const ratio = Math.min(1, ppfd / 1200);
      const blur  = Math.round(ratio * 48);
      const spread = Math.round(ratio * 20);
      const alpha = (ratio * 0.75).toFixed(2);
      return {
        background: base,
        boxShadow: `0 0 ${blur}px ${spread}px rgba(251,191,36,${alpha}), 0 0 ${Math.round(blur*1.8)}px ${Math.round(spread*1.5)}px rgba(249,115,22,${(ratio*0.35).toFixed(2)})`,
      };
    }
    return { background: base };
  }

  // fill % para steps de água
  const waterFillPct = Math.min(100, ((parseFloat(wateringVolume) || 0) / 3000) * 100);
  const runoffFillPct = Math.min(100, ((parseFloat(runoffCollected) || 0) / Math.max(parseFloat(wateringVolume) || 600, 600)) * 100);

  // Swipe handlers removed to prevent interference with PPFD slider

  if (tentsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-green-600" />
      </div>
    );
  }

  return (
    <PageTransition>
        <div
          className="fixed inset-0 overflow-hidden bg-background flex flex-col isolate"
          style={{
            paddingTop: 'env(safe-area-inset-top, 0px)',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
        >
      {/* Radial glow background — sem will-change-transform (causa flash preto no iOS ao usar slider/scroll) */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-primary/5 blur-[120px]" />
      </div>
      {/* Content */}
      <div className="flex-1 flex items-center justify-center overflow-hidden px-4 py-3 relative z-10">
        <div className="w-full max-w-md h-full flex items-center">
          <div className="bg-card border border-border/60 rounded-2xl shadow-2xl h-[95%] overflow-hidden w-full flex flex-col relative">
          {/* Botão fechar — dentro do card, canto superior direito */}
          <button
            onClick={() => {
              triggerHaptic('light');
              setLocation('/');
            }}
            aria-label="Cancelar registro"
            className="absolute top-4 right-4 z-[200] w-10 h-10 flex items-center justify-center rounded-full bg-black/20 backdrop-blur-sm text-white hover:bg-black/35 active:scale-95 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
          {/* Seleção de tipo — aparece antes do step 0 */}
          {logMode === null && (
            <div className="flex-1 flex flex-col items-center justify-center px-5 gap-8 animate-[fade-in_0.4s_ease-out]">
              <div className="text-center space-y-1.5">
                <h2 className="text-2xl font-bold text-foreground">O que deseja registrar?</h2>
                <p className="text-sm text-muted-foreground">Escolha o tipo de registro</p>
              </div>
              <div className="w-full space-y-3">
                {/* Status da Estufa */}
                <button
                  onClick={() => { triggerHaptic('light'); setLogMode('status'); }}
                  className="w-full rounded-2xl border border-teal-500/20 text-left flex items-center gap-4 overflow-hidden transition-all duration-200 hover:border-teal-500/40 active:scale-[0.98]"
                  style={{ background: 'linear-gradient(135deg, rgba(20,184,166,0.08) 0%, hsl(var(--card)) 60%)' }}
                >
                  <div className="p-4 flex items-center gap-4 w-full">
                    <div className="w-12 h-12 rounded-xl bg-teal-600 flex items-center justify-center shadow-lg shrink-0">
                      <ThermometerSun className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-foreground text-base">Status da Estufa</div>
                      <div className="text-sm text-muted-foreground">Temperatura, umidade, pH, EC, luz</div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-teal-400/60 shrink-0" />
                  </div>
                </button>

                {/* Saúde de Planta */}
                <button
                  onClick={() => { triggerHaptic('light'); setLogMode('plant'); setCurrentStep(0); setRecordPlantHealth(true); }}
                  className="w-full rounded-2xl border border-rose-500/20 text-left flex items-center gap-4 overflow-hidden transition-all duration-200 hover:border-rose-500/40 active:scale-[0.98]"
                  style={{ background: 'linear-gradient(135deg, rgba(244,63,94,0.08) 0%, hsl(var(--card)) 60%)' }}
                >
                  <div className="p-4 flex items-center gap-4 w-full">
                    <div className="w-12 h-12 rounded-xl bg-rose-600 flex items-center justify-center shadow-lg shrink-0">
                      <Heart className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-foreground text-base">Saúde de Planta</div>
                      <div className="text-sm text-muted-foreground">Status, sintomas e observações por planta</div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-rose-400/60 shrink-0" />
                  </div>
                </button>

                {/* Tricomas */}
                <button
                  onClick={() => { triggerHaptic('light'); setLogMode('trichome'); setCurrentStep(0); setRecordTrichomes(true); }}
                  className="w-full rounded-2xl border border-violet-500/20 text-left flex items-center gap-4 overflow-hidden transition-all duration-200 hover:border-violet-500/40 active:scale-[0.98]"
                  style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.08) 0%, hsl(var(--card)) 60%)' }}
                >
                  <div className="p-4 flex items-center gap-4 w-full">
                    <div className="w-12 h-12 rounded-xl bg-violet-600 flex items-center justify-center shadow-lg shrink-0">
                      <Sparkles className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-foreground text-base">Tricomas</div>
                      <div className="text-sm text-muted-foreground">Maturação, percentagens por planta · Flora</div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-violet-400/60 shrink-0" />
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Step content */}
          {logMode !== null && <div ref={stepScrollRef} className="flex-1 overflow-y-auto overscroll-none relative z-10 animate-[fade-in_0.5s_ease-out] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="min-h-full flex flex-col justify-center p-6 space-y-6">
            {/* Icon */}
            {currentStep < 9 && currentStepData && (
              <div className="flex flex-col items-center mb-6 gap-2">
                <div className="relative flex items-center justify-center">
                  <div className="absolute w-44 h-44 border-4 border-dashed border-border rounded-full opacity-30 animate-[spin_20s_linear_infinite] pointer-events-none" />
                  <div
                    className={currentStep === 7 ? "cursor-pointer active:scale-95 transition-transform" : ""}
                    onClick={currentStep === 7 ? () => {
                      const next = lightUnit === "ppfd" ? "lux" : "ppfd";
                      if (next === "lux" && ppfd > 0) setLuxValue(Math.round(ppfd / 0.0185));
                      if (next === "ppfd" && luxValue > 0) setPpfd(Math.round(luxValue * 0.0185));
                      setLightUnit(next);
                    } : undefined}
                  >
                  {(currentStep === 3 || currentStep === 4) ? (
                    /* Copo/jarro com preenchimento de água subindo de baixo */
                    <div className="w-32 h-32 rounded-full overflow-hidden relative shadow-xl animate-[slide-in-from-bottom_0.6s_ease-out] bg-blue-950/40">
                      <motion.div
                        className="absolute bottom-0 left-0 right-0 rounded-b-full"
                        style={{ background: currentStep === 3 ? "linear-gradient(180deg,#60a5fa,#2563eb)" : "linear-gradient(180deg,#2dd4bf,#0d9488)" }}
                        animate={{ height: `${currentStep === 3 ? waterFillPct : runoffFillPct}%` }}
                        transition={{ type: "spring", stiffness: 80, damping: 18 }}
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <currentStepData.icon className="w-16 h-16 text-white drop-shadow-lg relative z-10" />
                      </div>
                    </div>
                  ) : (
                    /* Círculo normal com gradiente animado */
                    <motion.div
                      className="w-32 h-32 rounded-full flex items-center justify-center shadow-xl animate-[slide-in-from-bottom_0.6s_ease-out]"
                      animate={getCircleStyle()}
                      transition={{ duration: 0.45, ease: "easeInOut" }}
                    >
                      <currentStepData.icon className="w-16 h-16 text-white" />
                    </motion.div>
                  )}
                  </div>
                </div>
                {/* Unit badge for light step — tap icon to switch */}
                {currentStep === 7 && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-3">
                    <span className={lightUnit === "ppfd" ? "text-amber-400 font-semibold" : ""}>PPFD</span>
                    <span>/</span>
                    <span className={lightUnit === "lux" ? "text-amber-400 font-semibold" : ""}>Lux</span>
                    <span className="ml-1 opacity-60">↑ toque no ícone</span>
                  </div>
                )}
              </div>
            )}

            {currentStep === 9 && recordPlantHealth === null && logMode !== 'trichome' && (
              <div className="flex justify-center mb-6">
                <div className="relative flex items-center justify-center">
                  <div className="absolute w-44 h-44 border-4 border-dashed border-border rounded-full opacity-30 animate-[spin_20s_linear_infinite] pointer-events-none" />
                  <div className="w-32 h-32 rounded-full bg-rose-600 flex items-center justify-center shadow-xl animate-[slide-in-from-bottom_0.6s_ease-out]">
                    <Heart className="w-16 h-16 text-white" />
                  </div>
                </div>
              </div>
            )}


            {currentStep >= 9 && recordPlantHealth === true && plants[currentPlantIndex] && (
              <div className="flex items-center gap-5 animate-[slide-in-from-bottom_0.6s_ease-out]">
                <div className="w-20 h-20 rounded-full bg-teal-600 flex items-center justify-center shadow-lg shrink-0">
                  <Activity className="w-10 h-10 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm text-muted-foreground font-medium">Planta {currentPlantIndex + 1} de {plants.length} · {plants[currentPlantIndex].code}</div>
                  <div className="text-3xl font-black text-foreground truncate">{plants[currentPlantIndex].name}</div>
                  <div className="text-base text-muted-foreground">Como está a saúde?</div>
                </div>
              </div>
            )}

            {/* Title */}
            {currentStep < 9 && currentStepData && (
              <div className="text-center space-y-2 animate-[slide-in-from-bottom_0.7s_ease-out]">
                <h2 className="text-3xl font-bold text-foreground">{currentStepData.title}</h2>
                <p className="text-lg text-muted-foreground">
                  {currentStep === 0 && logMode === 'trichome' && "Selecione a estufa de floração"}
                  {currentStep === 0 && logMode !== 'trichome' && "Selecione a estufa"}
                  {currentStep === 1 && "Qual a temperatura atual?"}
                  {currentStep === 2 && "Qual a umidade relativa?"}
                  {currentStep === 3 && "Quanto de água foi aplicado?"}
                  {currentStep === 4 && "Quanto de runoff foi coletado?"}
                  {currentStep === 5 && "Qual o pH da solução?"}
                  {currentStep === 6 && "Qual a condutividade elétrica?"}
                  {currentStep === 7 && "Qual a intensidade de luz?"}
                  {currentStep === 8 && "Revise os dados registrados"}
                </p>
              </div>
            )}

            {currentStep === 9 && recordPlantHealth === null && logMode !== 'trichome' && (
              <div className="text-center space-y-2 animate-[slide-in-from-bottom_0.7s_ease-out]">
                <h2 className="text-3xl font-bold text-foreground">Saúde das Plantas</h2>
                <p className="text-lg text-muted-foreground">Deseja registrar a saúde das plantas?</p>
                <p className="text-sm text-muted-foreground">Você pode registrar a saúde das plantas desta estufa agora ou pular esta etapa.</p>
              </div>
            )}



            {/* Step 0: Tent selection */}
            {currentStep === 0 && (
              <div className="space-y-3 animate-[slide-in-from-bottom_0.8s_ease-out]">
                {logMode === 'trichome' && floraTents.length === 0 && (
                  <div className="text-center py-8">
                    <p className="text-sm text-muted-foreground">Nenhuma estufa em floração encontrada.</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">Tricomas são registrados apenas em estufas de Floração.</p>
                  </div>
                )}
                {(logMode === 'trichome' ? floraTents : tents).map((tent: any) => {
                  const isSelected = tentId === tent.id;
                  const catLabel = tent.category === "FLORA" ? "Floração" : tent.category === "VEGA" ? "Vegetativa" : tent.category === "CLONING" ? "Clonagem" : tent.category === "MAINTENANCE" ? "Manutenção" : tent.category === "DRYING" ? "Secagem" : (tent.category ?? "");
                  const accentRgba = logMode === 'trichome' ? "139,92,246" : "16,185,129";
                  const accentBorder = logMode === 'trichome' ? "border-violet-500" : "border-primary";
                  return (
                    <button
                      key={tent.id}
                      onClick={() => { setTentId(tent.id); if (logMode === 'plant' || logMode === 'trichome') setCurrentStep(9); }}
                      className={`w-full rounded-2xl border transition-all duration-200 text-left overflow-hidden active:scale-[0.98] ${
                        isSelected
                          ? `${accentBorder} shadow-lg`
                          : logMode === 'trichome'
                            ? "border-violet-500/20 hover:border-violet-500/40"
                            : "border-border/60 hover:border-primary/30"
                      }`}
                      style={{ background: isSelected
                        ? `linear-gradient(135deg, rgba(${accentRgba},0.25) 0%, rgba(${accentRgba},0.12) 100%)`
                        : `linear-gradient(135deg, rgba(${accentRgba},0.05) 0%, hsl(var(--card)) 65%)`
                      }}
                    >
                      <div className="px-5 py-4 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className={`font-bold text-lg truncate ${isSelected ? "text-foreground" : "text-foreground"}`}>{tent.name}</div>
                          <div className="text-sm text-muted-foreground mt-0.5">{catLabel} · {tent.width}×{tent.depth}×{tent.height}cm</div>
                        </div>
                        {isSelected && <Check className={`w-5 h-5 shrink-0 ${logMode === 'trichome' ? 'text-violet-400' : 'text-primary'}`} />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Step 1: Temperature */}
            {currentStep === 1 && (
              <div className="space-y-4 animate-[slide-in-from-bottom_0.8s_ease-out]">
                {sensorReading?.isFresh && (
                  <div className="rounded-xl bg-cyan-500/10 border border-cyan-500/30 px-4 py-3 text-sm text-cyan-600 dark:text-cyan-400 flex items-center gap-2">
                    <Wifi className="w-4 h-4 shrink-0" />
                    Sendo registrado automaticamente pelo sensor SmartLife
                  </div>
                )}
                {sensorReading?.isFresh && (
                  <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-emerald-500/8 border border-emerald-500/20">
                    <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                      <Smartphone className="w-3.5 h-3.5" />
                      <span>Leitura do sensor SmartLife</span>
                    </div>
                    <button
                      onClick={() => readNow.mutate({ tentId: tentId! })}
                      disabled={readNow.isPending}
                      className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 transition-colors font-medium disabled:opacity-40"
                    >
                      {readNow.isPending ? '...' : 'Atualizar'}
                    </button>
                  </div>
                )}
                <BigStepper value={tempC} onChange={setTempC} step={0.1} min={-10} max={50} decimals={1} unit="°C" fieldType="temperature" colorClass={getValidationColor(tempC, targets?.tempMin ? parseFloat(String(targets.tempMin)) : null, targets?.tempMax ? parseFloat(String(targets.tempMax)) : null)} />
                <div className="flex items-center justify-center gap-4 flex-wrap">
                  {targets?.tempMin && targets?.tempMax && (
                    <p className="text-xs text-center text-muted-foreground flex items-center gap-1">
                      <Target className="w-3 h-3 text-primary"/> {parseFloat(String(targets.tempMin))}–{parseFloat(String(targets.tempMax))}°C
                    </p>
                  )}
                  {!sensorReading?.isFresh && lastLogs?.[0]?.tempC != null && (
                    <p className="text-xs text-center text-muted-foreground/70">
                      Último: {parseFloat(String(lastLogs[0].tempC)).toFixed(1)}°C
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Step 2: Humidity */}
            {currentStep === 2 && (
              <div className="space-y-4 animate-[slide-in-from-bottom_0.8s_ease-out]">
                {sensorReading?.isFresh && (
                  <div className="rounded-xl bg-cyan-500/10 border border-cyan-500/30 px-4 py-3 text-sm text-cyan-600 dark:text-cyan-400 flex items-center gap-2">
                    <Wifi className="w-4 h-4 shrink-0" />
                    Sendo registrado automaticamente pelo sensor SmartLife
                  </div>
                )}
                {sensorReading?.isFresh && (
                  <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/8 border border-emerald-500/20 text-xs text-emerald-600 dark:text-emerald-400">
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>Leitura do sensor SmartLife</span>
                  </div>
                )}
                <BigStepper value={rhPct} onChange={setRhPct} step={1} min={0} max={100} decimals={0} unit="%" fieldType="humidity" colorClass={getValidationColor(rhPct, targets?.rhMin ? parseFloat(String(targets.rhMin)) : null, targets?.rhMax ? parseFloat(String(targets.rhMax)) : null)} />
                <div className="flex items-center justify-center gap-4 flex-wrap">
                  {targets?.rhMin && targets?.rhMax && (
                    <p className="text-xs text-center text-muted-foreground flex items-center gap-1">
                      <Target className="w-3 h-3 text-primary"/> {parseFloat(String(targets.rhMin))}–{parseFloat(String(targets.rhMax))}%
                    </p>
                  )}
                  {!sensorReading?.isFresh && lastLogs?.[0]?.rhPct != null && (
                    <p className="text-xs text-center text-muted-foreground/70">
                      Último: {parseFloat(String(lastLogs[0].rhPct)).toFixed(0)}%
                    </p>
                  )}
                </div>
                {/* VPD ao vivo — aparece quando temp também está preenchida (L2) */}
                {tempC && rhPct && (() => {
                  const t = parseFloat(tempC), rh = parseFloat(rhPct);
                  if (isNaN(t) || isNaN(rh)) return null;
                  const v = parseFloat((0.6108 * Math.exp((17.27 * t) / (t + 237.3)) * (1 - rh / 100)).toFixed(2));
                  const [color, label] = v < 0.4 ? ["#60a5fa","Muito baixo"] : v <= 0.8 ? ["#4ade80","Ideal – Vega"] : v <= 1.2 ? ["#a78bfa","Ideal – Flora"] : v <= 1.6 ? ["#fbbf24","Alto"] : ["#f87171","Crítico"];
                  return (
                    <div className="flex items-center justify-between px-4 py-2.5 rounded-xl border" style={{ borderColor: color + "55", background: color + "12" }}>
                      <span className="text-sm font-medium" style={{ color }}>VPD · {label}</span>
                      <span className="font-bold text-lg tabular-nums" style={{ color }}>{v} kPa</span>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Step 3: Watering volume */}
            {currentStep === 3 && (
              <div className="space-y-4 animate-[slide-in-from-bottom_0.8s_ease-out]">
                <BigStepper value={wateringVolume} onChange={setWateringVolume} step={100} min={0} decimals={0} unit="ml" fieldType="water" fillMax={3000} />
              </div>
            )}

            {/* Step 4: Runoff collected */}
            {currentStep === 4 && (
              <div className="space-y-4 animate-[slide-in-from-bottom_0.8s_ease-out]">
                <BigStepper value={runoffCollected} onChange={setRunoffCollected} step={50} min={0} decimals={0} unit="ml" fieldType="runoff" fillMax={600} />
                {runoffPercentage && (
                  <div className="text-center p-4 bg-muted rounded-xl border border-border animate-[slide-in-from-bottom_0.9s_ease-out]">
                    <div className="text-sm text-foreground/80">Porcentagem de Runoff</div>
                    <div className="text-3xl font-bold text-teal-500">{runoffPercentage}%</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {parseFloat(runoffPercentage) >= 15 && parseFloat(runoffPercentage) <= 20
                        ? "✓ Ideal"
                        : parseFloat(runoffPercentage) < 15
                        ? <span className="flex items-center justify-center gap-1"><AlertTriangle className="w-3 h-3 text-amber-400"/>Baixo</span>
                        : <span className="flex items-center justify-center gap-1"><AlertTriangle className="w-3 h-3 text-amber-400"/>Alto</span>}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 5: pH */}
            {currentStep === 5 && (
              <div className="space-y-6 animate-[slide-in-from-bottom_0.8s_ease-out]">
                <BigStepper value={ph} onChange={setPh} step={0.1} min={0} max={14} decimals={1} unit="pH" fieldType="ph" colorClass={getValidationColor(ph, targets?.phMin ? parseFloat(String(targets.phMin)) : null, targets?.phMax ? parseFloat(String(targets.phMax)) : null)} />
                <div className="flex items-center justify-center gap-4 flex-wrap">
                  {targets?.phMin && targets?.phMax && (
                    <p className="text-xs text-center text-muted-foreground flex items-center gap-1">
                      <Target className="w-3 h-3 text-primary"/> {parseFloat(String(targets.phMin))}–{parseFloat(String(targets.phMax))} pH
                    </p>
                  )}
                  {lastLogs?.[0]?.ph != null && (
                    <p className="text-xs text-center text-muted-foreground/70">
                      Último: pH {parseFloat(String(lastLogs[0].ph)).toFixed(1)}
                    </p>
                  )}
                </div>
                <div className="pt-4 pb-2">
                  <RangeSlider
                    min={0}
                    max={14}
                    step={0.1}
                    value={parseFloat(ph) || 7}
                    onChange={(v) => setPh(v.toFixed(1))}
                    trackGradient="linear-gradient(to right, #dc2626 0%, #f97316 28.5%, #eab308 42.8%, #22c55e 50%, #3b82f6 64.2%, #8b5cf6 100%)"
                    formatTooltip={(v) => `pH ${v.toFixed(1)}`}
                    size="lg"
                    labels={[
                      { position: 0, label: "0", sublabel: "Ácido", color: "#dc2626" },
                      { position: 50, label: "7", sublabel: "Neutro", color: "#22c55e" },
                      { position: 100, label: "14", sublabel: "Alcalino", color: "#8b5cf6" },
                    ]}
                  />
                </div>
              </div>
            )}

            {/* Step 6: EC */}
            {currentStep === 6 && (
              <div className="space-y-4 animate-[slide-in-from-bottom_0.8s_ease-out]">
                <BigStepper value={ec} onChange={setEc} step={0.1} min={0} max={10} decimals={1} unit="mS/cm" colorClass={getValidationColor(ec, targets?.ecMin ? parseFloat(String(targets.ecMin)) : null, targets?.ecMax ? parseFloat(String(targets.ecMax)) : null)} />
                <div className="flex items-center justify-center gap-4 flex-wrap">
                  {targets?.ecMin && targets?.ecMax && (
                    <p className="text-xs text-center text-muted-foreground flex items-center gap-1">
                      <Target className="w-3 h-3 text-primary"/> {parseFloat(String(targets.ecMin))}–{parseFloat(String(targets.ecMax))} mS/cm
                    </p>
                  )}
                  {lastLogs?.[0]?.ec != null && (
                    <p className="text-xs text-center text-muted-foreground/70">
                      Último: {parseFloat(String(lastLogs[0].ec)).toFixed(1)} mS/cm
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Step 7: PPFD */}
            {currentStep === 7 && (
              <div className="space-y-4 animate-[slide-in-from-bottom_0.8s_ease-out]">
                {/* Light Intensity Slider */}
                {lightUnit === "ppfd" ? (
                  <div className="space-y-4 pt-4">
                    <BigStepper
                      value={ppfd > 0 ? String(ppfd) : ""}
                      onChange={(v) => setPpfd(parseInt(v) || 0)}
                      step={10}
                      min={0}
                      max={1200}
                      decimals={0}
                      unit="μmol/m²/s"
                      fieldType="light"
                      placeholder="600"
                    />
                    <div className="pb-2">
                      <RangeSlider
                        min={0}
                        max={1200}
                        step={10}
                        value={ppfd}
                        onChange={(val) => setPpfd(val)}
                        trackGradient="linear-gradient(to right, #3b82f6 0%, #10b981 33%, #eab308 66%, #ef4444 100%)"
                        formatTooltip={(v) => `${v} μmol/m²/s`}
                        size="lg"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 pt-4">
                    <div>
                      <BigStepper
                        value={luxValue}
                        onChange={(val) => {
                          const v = Math.min(100000, Math.max(0, val));
                          setLuxValue(v);
                          setPpfd(Math.round(v * 0.0185));
                        }}
                        step={1000}
                        min={0}
                        max={100000}
                        decimals={0}
                        unit="lux"
                        fieldType="light"
                        placeholder="35000"
                      />
                    </div>
                    <div className="pb-2">
                      <RangeSlider
                        min={0}
                        max={100000}
                        step={1000}
                        value={luxValue}
                        onChange={(val) => {
                          setLuxValue(val);
                          setPpfd(Math.round(val * 0.0185));
                        }}
                        trackGradient="linear-gradient(to right, #3b82f6 0%, #10b981 33%, #eab308 66%, #ef4444 100%)"
                        formatTooltip={(v) => `${(v / 1000).toFixed(0)}k lux`}
                        size="lg"
                      />
                    </div>
                    {luxValue > 0 && (
                      <p className="text-xs text-muted-foreground text-center">≈ {Math.round(luxValue * 0.0185)} μmol/m²/s</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Step 8: Summary */}
            {currentStep === 8 && (
              <div className="space-y-3 animate-[slide-in-from-bottom_0.8s_ease-out]">
                {tempC && (
                  <div className="p-4 bg-orange-500/10 rounded-xl border-l-4 border-orange-500">
                    <div className="text-sm text-muted-foreground">Temperatura</div>
                    <div className="text-2xl font-bold text-foreground flex items-center gap-1.5">
                      {tempC}°C
                      {sensorReading?.isFresh && <span className="text-[10px] font-bold text-cyan-400 bg-cyan-500/15 border border-cyan-500/30 rounded-full px-1.5 py-0.5 ml-1">AUTO</span>}
                    </div>
                  </div>
                )}
                {rhPct && (
                  <div className="p-4 bg-blue-500/10 rounded-xl border-l-4 border-blue-500">
                    <div className="text-sm text-muted-foreground">Umidade</div>
                    <div className="text-2xl font-bold text-foreground flex items-center gap-1.5">
                      {rhPct}%
                      {sensorReading?.isFresh && <span className="text-[10px] font-bold text-cyan-400 bg-cyan-500/15 border border-cyan-500/30 rounded-full px-1.5 py-0.5 ml-1">AUTO</span>}
                    </div>
                  </div>
                )}
                {/* VPD calculado (L2) */}
                {tempC && rhPct && (() => {
                  const t = parseFloat(tempC), rh = parseFloat(rhPct);
                  if (isNaN(t) || isNaN(rh)) return null;
                  const v = parseFloat((0.6108 * Math.exp((17.27 * t) / (t + 237.3)) * (1 - rh / 100)).toFixed(2));
                  const [color, label] = v < 0.4 ? ["#60a5fa","Muito baixo"] : v <= 0.8 ? ["#4ade80","Ideal – Vega"] : v <= 1.2 ? ["#a78bfa","Ideal – Flora"] : v <= 1.6 ? ["#fbbf24","Alto"] : ["#f87171","Crítico"];
                  return (
                    <div className="p-4 rounded-xl border-l-4" style={{ borderColor: color, background: color + "18" }}>
                      <div className="text-sm text-muted-foreground">VPD</div>
                      <div className="text-2xl font-bold tabular-nums" style={{ color }}>{v} kPa</div>
                      <div className="text-xs mt-0.5" style={{ color, opacity: 0.75 }}>{label}</div>
                    </div>
                  );
                })()}
                {wateringVolume && (
                  <div className="p-4 bg-green-500/10 rounded-xl border-l-4 border-green-500">
                    <div className="text-sm text-muted-foreground">Volume de Rega</div>
                    <div className="text-2xl font-bold text-foreground">{wateringVolume} ml</div>
                  </div>
                )}
                {runoffCollected && (
                  <div className="p-4 bg-teal-500/10 rounded-xl border-l-4 border-teal-500">
                    <div className="text-sm text-muted-foreground">Runoff Coletado</div>
                    <div className="text-2xl font-bold text-foreground">{runoffCollected} ml ({runoffPercentage}%)</div>
                  </div>
                )}
                {ph && (
                  <div className="p-4 bg-purple-500/10 rounded-xl border-l-4 border-purple-500">
                    <div className="text-sm text-muted-foreground">pH</div>
                    <div className="text-2xl font-bold text-foreground">{ph}</div>
                  </div>
                )}
                {ec && (
                  <div className="p-4 bg-yellow-500/10 rounded-xl border-l-4 border-yellow-500">
                    <div className="text-sm text-muted-foreground">EC</div>
                    <div className="text-2xl font-bold text-foreground">{ec} mS/cm</div>
                  </div>
                )}
                {ppfd > 0 && (
                  <div className="p-4 bg-amber-500/10 rounded-xl border-l-4 border-amber-500">
                    <div className="text-sm text-muted-foreground">PPFD ({turn})</div>
                    <div className="text-2xl font-bold text-foreground">{ppfd} μmol/m²/s</div>
                  </div>
                )}
              </div>
            )}

            {/* Step 9: Plant health question */}
            {currentStep === 9 && recordPlantHealth === null && logMode !== 'trichome' && (
              <div className="space-y-4 animate-[slide-in-from-bottom_0.8s_ease-out]">
                <p className="text-center text-sm text-muted-foreground">
                  <span className="flex items-center justify-center gap-1"><CheckCircle2 className="w-4 h-4 text-green-500"/>Registro da estufa salvo! Deseja também registrar a saúde das plantas?</span>
                </p>
                <Button
                  onClick={() => setRecordPlantHealth(true)}
                  className="w-full h-16 text-lg font-semibold rounded-2xl bg-rose-700 hover:bg-rose-700 text-white shadow-lg border-0"
                >
                  <Heart className="mr-2 h-6 w-6" />
                  Registrar Saúde das Plantas
                </Button>
                <Button
                  onClick={resetForm}
                  variant="outline"
                  className="w-full h-14 text-base font-semibold rounded-2xl border-2 border-primary/30 text-primary hover:bg-primary/5"
                >
                  <ArrowRight className="mr-2 h-5 w-5" />
                  Registrar outra estufa
                </Button>
                <Button
                  onClick={() => {
                    resetForm();
                    setLocation("/");
                  }}
                  variant="ghost"
                  className="w-full h-12 text-base font-medium rounded-2xl text-muted-foreground"
                >
                  <SkipForward className="mr-2 h-5 w-5" />
                  Finalizar
                </Button>
              </div>
            )}

            {/* Step 9+: No active plants in tent */}
            {currentStep >= 9 && recordPlantHealth === true && !plantsLoading && plants.length === 0 && (
              <div className="flex flex-col items-center gap-4 py-6 animate-[slide-in-from-bottom_0.6s_ease-out]">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                  <Sprout className="w-8 h-8 text-muted-foreground" />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-foreground">Nenhuma planta ativa</p>
                  <p className="text-sm text-muted-foreground mt-1">Esta estufa não tem plantas ativas no momento.</p>
                </div>
                <Button
                  onClick={() => { resetForm(); setLocation("/"); }}
                  className="h-14 px-8 text-lg font-medium rounded-xl"
                >
                  <Check className="mr-2 h-5 w-5" />
                  Finalizar
                </Button>
              </div>
            )}

            {/* Step 10+: Plant health form (expanded) */}
            {currentStep >= 9 && recordPlantHealth === true && plants[currentPlantIndex] && (
              <div className="space-y-4">
                {/* Status buttons */}
                <div className="flex flex-col gap-3">
                  {[
                    { value: "healthy",   label: "Saudável", Icon: CheckCircle2, active: "bg-green-500 text-white shadow-lg border-transparent" },
                    { value: "attention", label: "Atenção",  Icon: AlertTriangle, active: "bg-yellow-500 text-white shadow-lg border-transparent" },
                    { value: "sick",      label: "Doente",   Icon: XCircle,       active: "bg-red-500 text-white shadow-lg border-transparent" },
                  ].map(({ value, label, Icon, active }) => {
                    const selected = (plantHealthRecords.get(plants[currentPlantIndex].id)?.status || "healthy") === value;
                    return (
                      <button
                        key={value}
                        onClick={() => updatePlantHealthRecord(plants[currentPlantIndex].id, "status", value)}
                        className={`flex items-center gap-5 w-full px-6 rounded-2xl font-bold text-lg transition-all duration-300 border-2 min-h-[72px] ${selected ? active : "bg-card text-card-foreground border-border active:scale-[0.98]"}`}
                      >
                        <Icon className="w-7 h-7 shrink-0" />
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Foto — primeiro, destaque */}
                {(plantHealthRecords.get(plants[currentPlantIndex].id)?.photoPreview || plantHealthRecords.get(plants[currentPlantIndex].id)?.photoUrl) ? (
                  <div className="relative">
                    <LazyImage
                      src={plantHealthRecords.get(plants[currentPlantIndex].id)?.photoPreview || plantHealthRecords.get(plants[currentPlantIndex].id)?.photoUrl!}
                      alt="Preview"
                      aspectRatio="16/9"
                      className="w-full h-48 rounded-xl"
                    />
                    {plantHealthRecords.get(plants[currentPlantIndex].id)?.photoUrl && (
                      <div className="absolute top-2 left-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full">✓ Enviada</div>
                    )}
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        updatePlantHealthRecord(plants[currentPlantIndex].id, "photoPreview", undefined);
                        updatePlantHealthRecord(plants[currentPlantIndex].id, "photoUrl", undefined);
                      }}
                      className="absolute top-2 right-2"
                    >
                      Remover
                    </Button>
                  </div>
                ) : uploadProgress.isUploading ? (
                  <div className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-green-500 rounded-xl bg-green-500/10">
                    <Loader2 className="h-8 w-8 text-green-500 animate-spin mb-2" />
                    <span className="text-sm text-green-500 font-medium">Enviando foto...</span>
                    <span className="text-xs text-green-500 mt-1">{uploadProgress.progress}%</span>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-green-400 hover:bg-green-500/5 transition-colors">
                    <Camera className="h-7 w-7 text-muted-foreground mb-1" />
                    <span className="text-sm text-muted-foreground">Adicionar Foto</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handlePhotoCapture}
                      className="hidden"
                    />
                  </label>
                )}

                {/* Observações — visível direto */}
                <Textarea
                  value={plantHealthRecords.get(plants[currentPlantIndex].id)?.notes || ""}
                  onChange={(e) => updatePlantHealthRecord(plants[currentPlantIndex].id, "notes", e.target.value)}
                  placeholder="Observações gerais..."
                  className="min-h-[80px] border-2 border-input rounded-xl bg-card text-foreground shadow-sm"
                />

                {/* Sintomas — colapsado por padrão */}
                <Accordion type="multiple" defaultValue={[]} className="space-y-0">
                  <AccordionItem value="symptoms" className="border border-border rounded-xl bg-card shadow-sm">
                    <AccordionTrigger className="px-4 py-3 hover:no-underline">
                      <span className="text-sm font-medium text-muted-foreground">Sintomas</span>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4">
                      <Input
                        value={plantHealthRecords.get(plants[currentPlantIndex].id)?.symptoms || ""}
                        onChange={(e) => updatePlantHealthRecord(plants[currentPlantIndex].id, "symptoms", e.target.value)}
                        placeholder="Ex: Folhas amareladas, manchas..."
                        className="h-12 border-2 border-input rounded-xl bg-card text-foreground shadow-sm"
                      />
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>
            )}
            {/* Pergunta: registrar tricomas? — só no modo planta, nunca no modo status/estufa */}
            {recordTrichomes === null && isFloraPhase && logMode === 'plant' && (
              <>
                <div className="flex justify-center mb-6">
                  <div className="relative flex items-center justify-center">
                    <div className="absolute w-44 h-44 border-4 border-dashed border-border rounded-full opacity-30 animate-[spin_20s_linear_infinite] pointer-events-none" />
                    <div className="w-32 h-32 rounded-full bg-violet-600 flex items-center justify-center shadow-xl animate-[slide-in-from-bottom_0.6s_ease-out]">
                      <Sparkles className="w-16 h-16 text-white" />
                    </div>
                  </div>
                </div>
                <div className="text-center space-y-2 animate-[slide-in-from-bottom_0.7s_ease-out]">
                  <h2 className="text-3xl font-bold text-foreground">Tricomas</h2>
                  <p className="text-lg text-muted-foreground">Deseja registrar os tricomas das plantas?</p>
                  <p className="text-sm text-muted-foreground">Etapa de floração detectada — momento ideal para acompanhar a maturação.</p>
                </div>
                <div className="space-y-3 animate-[slide-in-from-bottom_0.8s_ease-out]">
                  <Button
                    onClick={() => setRecordTrichomes(true)}
                    className="w-full h-16 text-lg font-semibold rounded-2xl bg-violet-700 hover:bg-violet-700 text-white shadow-lg border-0"
                  >
                    <Sparkles className="mr-2 h-6 w-6" />
                    Registrar Tricomas
                  </Button>
                  <Button
                    onClick={() => { toast.success("Registros salvos!"); resetForm(); setTimeout(() => setLocation("/"), 1500); }}
                    variant="outline"
                    className="w-full h-16 text-lg font-semibold rounded-2xl border-2"
                  >
                    <SkipForward className="mr-2 h-6 w-6" />
                    Finalizar
                  </Button>
                </div>
              </>
            )}

            {/* Formulário de tricomas por planta */}
            {recordTrichomes === true && plants[currentTrichomeIndex] && (() => {
              const plant = plants[currentTrichomeIndex];
              const rec = trichomeRecords.get(plant.id) || { status: "CLOUDY" as const, clearPct: "", cloudyPct: "", amberPct: "", notes: "" };
              const trichomeOptions: { value: "CLEAR"|"CLOUDY"|"AMBER"|"MIXED"; label: string; sub: string; gradient: string }[] = [
                { value: "CLEAR",  label: "Translúcidos",   sub: "Cedo demais",    gradient: "bg-sky-400" },
                { value: "CLOUDY", label: "Opacos",         sub: "Maturação ideal",gradient: "bg-slate-500" },
                { value: "AMBER",  label: "Âmbar",          sub: "Efeito sedativo",gradient: "bg-amber-500" },
                { value: "MIXED",  label: "Misturado",      sub: "Equilibrado",    gradient: "bg-violet-500" },
              ];
              return (
                <div className="space-y-4 animate-[slide-in-from-bottom_0.6s_ease-out]">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground/60 font-medium">
                        Planta {currentTrichomeIndex + 1} de {plants.length}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-violet-500/15 text-violet-400 border border-violet-500/20 font-semibold">
                        Tricomas
                      </span>
                    </div>
                    <div className="text-2xl font-black text-foreground truncate">{plant.name}</div>
                  </div>

                  {/* Status buttons */}
                  <div className="grid grid-cols-2 gap-3">
                    {trichomeOptions.map(({ value, label, sub, gradient }) => (
                      <button
                        key={value}
                        onClick={() => updateTrichomeRecord(plant.id, "status", value)}
                        className={`flex flex-col items-center justify-center gap-1 p-4 rounded-2xl border-2 font-bold transition-all duration-200 ${
                          rec.status === value
                            ? `${gradient} text-white border-transparent shadow-lg scale-[1.02]`
                            : "bg-card text-card-foreground border-border active:scale-[0.98]"
                        }`}
                      >
                        <span className="text-base font-bold">{label}</span>
                        <span className={`text-[11px] font-normal ${rec.status === value ? "text-white/80" : "text-muted-foreground"}`}>{sub}</span>
                      </button>
                    ))}
                  </div>

                  {/* Percentagens — colapsável */}
                  <Accordion type="multiple" defaultValue={[]} className="space-y-0">
                    <AccordionItem value="pcts" className="border border-border rounded-xl bg-card shadow-sm">
                      <AccordionTrigger className="px-4 py-3 hover:no-underline">
                        <span className="text-sm font-medium text-muted-foreground">Percentagens por tipo (opcional)</span>
                      </AccordionTrigger>
                      <AccordionContent className="px-4 pb-4">
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { field: "clearPct",  label: "Transl. %",  val: rec.clearPct },
                            { field: "cloudyPct", label: "Opacos %",   val: rec.cloudyPct },
                            { field: "amberPct",  label: "Âmbar %",    val: rec.amberPct },
                          ].map(({ field, label, val }) => (
                            <div key={field}>
                              <label className="text-[11px] text-muted-foreground block mb-1">{label}</label>
                              <Input
                                type="number"
                                inputMode="numeric"
                                min={0} max={100}
                                value={val}
                                onChange={(e) => updateTrichomeRecord(plant.id, field, e.target.value)}
                                placeholder="0"
                                className="h-10 text-center border-2 border-input rounded-xl"
                              />
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>

                  {/* Notas */}
                  <Input
                    value={rec.notes}
                    onChange={(e) => updateTrichomeRecord(plant.id, "notes", e.target.value)}
                    placeholder="Observações (opcional)"
                    className="h-12 border-2 border-input rounded-xl bg-card"
                  />
                </div>
              );
            })()}

          </div>
          </div>}
          {/* Navigation buttons — footer dentro do card */}
          {logMode !== null && <div className="shrink-0 border-t border-border/60 bg-card">
          {/* Hint: obrigatório foto/sintoma/nota para avançar na saúde da planta */}
          {currentStep >= 9 && recordPlantHealth === true && plants[currentPlantIndex] && recordTrichomes === null && (() => {
            const rec = plantHealthRecords.get(plants[currentPlantIndex].id);
            const hasDetail = !!(rec?.photoUrl || rec?.photoPreview || rec?.notes?.trim() || rec?.symptoms?.trim());
            if (hasDetail) return null;
            return (
              <p className="text-xs text-center text-amber-400 px-4 pt-2.5 pb-0.5 flex items-center justify-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Adicione uma foto, sintoma ou anotação para avançar
              </p>
            );
          })()}
          <div className="px-4 py-3 flex gap-3">
        {/* Back button - only for daily log steps */}
        {currentStep > 0 && currentStep < 9 && (
          <Button
            variant="outline"
            onClick={goBack}
            className="flex-1 h-14 text-lg font-medium rounded-xl"
          >
            <ArrowLeft className="mr-2 h-5 w-5" />
            Voltar
          </Button>
        )}

        {/* Next/Save button for daily log */}
        {currentStep < 8 && (
          <Button
            onClick={goNext}
            disabled={!canGoNext()}
            className="flex-1 h-14 text-lg font-medium rounded-xl"
          >
            Próximo
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        )}

        {/* Continue button on summary - saves daily log first */}
        {currentStep === 8 && (
          <Button
            onClick={() => {
              triggerHaptic('medium');
              handleSaveDailyLog();
            }}
            disabled={saveDailyLogMutation.isPending}
            className="flex-1 h-14 text-sm font-medium rounded-xl"
          >
            {saveDailyLogMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Check className="mr-2 h-5 w-5" />
                Salvar Registro
              </>
            )}
          </Button>
        )}

        {/* Plant health navigation */}
        {currentStep >= 9 && recordPlantHealth === true && plants[currentPlantIndex] && recordTrichomes === null && (() => {
          const rec = plantHealthRecords.get(plants[currentPlantIndex].id);
          const hasDetail = !!(rec?.photoUrl || rec?.photoPreview || rec?.notes?.trim() || rec?.symptoms?.trim());
          return (
          <>
            <AnimatedButton
              onClick={handleSkipPlantHealth}
              variant="outline"
              className="flex-1 h-14 text-lg font-medium rounded-xl"
            >
              <SkipForward className="mr-2 h-5 w-5" />
              Pular
            </AnimatedButton>
            <AnimatedButton
              onClick={handleSavePlantHealth}
              disabled={savePlantHealthMutation.isPending || uploadPhotoMutation.isPending || !hasDetail}
              className="flex-1 h-14 text-lg font-medium rounded-xl"
            >
              {(savePlantHealthMutation.isPending || uploadPhotoMutation.isPending) ? (
                <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Salvando...</>
              ) : currentPlantIndex < plants.length - 1 ? (
                <><Check className="mr-2 h-5 w-5" />Próxima Planta</>
              ) : (
                <><Check className="mr-2 h-5 w-5" />{isFloraPhase ? "Tricomas →" : "Finalizar"}</>
              )}
            </AnimatedButton>
          </>
          );
        })()}

        {/* Trichome navigation */}
        {recordTrichomes === true && plants[currentTrichomeIndex] && (
          <>
            <AnimatedButton
              onClick={handleSkipTrichome}
              variant="outline"
              className="flex-1 h-14 text-lg font-medium rounded-xl"
            >
              <SkipForward className="mr-2 h-5 w-5" />
              Pular
            </AnimatedButton>
            <AnimatedButton
              onClick={handleSaveTrichome}
              disabled={saveTrichomeMutation.isPending}
              className="flex-1 h-14 text-lg font-medium rounded-xl bg-violet-700 hover:bg-violet-700 text-white border-0"
            >
              {saveTrichomeMutation.isPending ? (
                <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Salvando...</>
              ) : currentTrichomeIndex < plants.length - 1 ? (
                <><Sparkles className="mr-2 h-5 w-5" />Próxima Planta</>
              ) : (
                <><Check className="mr-2 h-5 w-5" />Finalizar</>
              )}
            </AnimatedButton>
          </>
        )}
      </div></div>}
          </div>
        </div>
      </div>

      {/* Photo Upload Progress Overlay */}
      {uploadProgress.isUploading && (
        <PhotoUploadProgress
          stage={uploadProgress.stage}
          progress={uploadProgress.progress}
          originalSize={uploadProgress.originalSize}
          compressedSize={uploadProgress.compressedSize}
          reduction={uploadProgress.reduction}
        />
      )}
    </div>
    </PageTransition>
  );
}

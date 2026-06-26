import { useState, useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { AnimatedButton } from "@/components/AnimatedButton";
import { BigStepper } from "@/components/BigStepper";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Home, ThermometerSun, Droplets, Sprout, GlassWater, Droplet, TestTube, Zap, Sun, Check, ArrowLeft, ArrowRight, Heart, SkipForward, Activity, X, CheckCircle2, AlertTriangle, Target, Smartphone, Sparkles, Wifi } from "lucide-react";
import { CalcSlider } from "@/components/ui/calc-slider";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { uploadImage } from "@/lib/uploadImage";
import { PhotoUploadProgress, type UploadStage } from "@/components/PhotoUploadProgress";
import { PageTransition } from "@/components/PageTransition";
import { savePendingLog, isOnline } from "@/lib/offlineStorage";
import { haptics } from "@/lib/haptics";
import { markGardenCare } from "@/lib/gardenCare";
import { useSidebar } from "@/contexts/SidebarContext";
import { cn } from "@/lib/utils";
import { getCircleStyle, getPHColor, getValidationColor } from "@/lib/quickLogColors";
import { QuickLogModeSelector } from "@/components/QuickLogModeSelector";
import { PlantHealthForm } from "@/components/PlantHealthForm";
import { TrichomeForm } from "@/components/TrichomeForm";

// LST Techniques and Trichome types removed - available in individual plant pages
// getPHColor + getValidationColor agora vivem em @/lib/quickLogColors (import acima)

export default function QuickLog() {
  const { collapsed } = useSidebar();
  const [, setLocation] = useLocation();

  // Read ?mode= URL param to pre-select mode (from FAB mini menu)
  const urlMode = (() => {
    const m = new URLSearchParams(window.location.search).get('mode');
    if (m === 'status' || m === 'plant' || m === 'trichome') return m;
    return null;
  })();

  // ── Modo TUTORIAL/DEMO (?demo=1) ─────────────────────────────────────────────
  // Mostra a tela REAL de registro pro user se familiarizar, mas NÃO salva nada
  // (nenhuma query/mutation real). `then` = pra onde ir ao concluir/pular.
  // Usado pelo onboarding (wizard → demo → estufa) e por Settings.
  const isDemo = (() => {
    const p = new URLSearchParams(window.location.search);
    return p.get('demo') === '1';
  })();
  const demoThen = (() => new URLSearchParams(window.location.search).get('then') || '/')();
  const [demoComplete, setDemoComplete] = useState(false);

  // No demo já entra no fluxo "status" e pula a seleção de estufa (step 0):
  // usamos uma estufa de exemplo sintética, então começa no step 1 (Temperatura).
  const [currentStep, setCurrentStep] = useState(isDemo ? 1 : 0);
  const [logMode, setLogMode] = useState<'status' | 'plant' | 'trichome' | null>(isDemo ? 'status' : urlMode);
  const [confirmClose, setConfirmClose] = useState(false);
  const stepScrollRef = useRef<HTMLDivElement>(null);

  // Fecha ou pede confirmação se o usuário está no meio de um fluxo
  const handleClose = () => {
    // No tutorial não há dado pra perder — sai direto pro destino.
    if (isDemo) {
      setLocation(demoThen);
      return;
    }
    if (logMode !== null) {
      setConfirmClose(true);
    } else {
      setLocation('/');
    }
  };

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
  
  // Cultivo Orgânico: estufa orgânica não mede EC (step 6) nem runoff (step 4) —
  // são conceitos de cultivo mineral/hidro. Pulamos esses steps na navegação.
  // selectedTent é computado mais abaixo no render; goNext/goBack só executam em
  // click (pós-render), quando selectedTent já está definido.
  const goNext = () => {
    triggerHaptic('medium');
    const isOrganic = (selectedTent as any)?.cultivationMethod === 'ORGANIC';
    // Só pula temp/rh se a query já retornou (sensorReading !== undefined) e está fresca
    if (currentStep === 0 && sensorReading !== undefined && sensorReading?.isFresh && logMode === 'status') {
      return setCurrentStep(3);
    }
    if (logMode === 'status' && isOrganic) {
      if (currentStep === 3) return setCurrentStep(5); // Rega → pH (pula Runoff)
      if (currentStep === 5) return setCurrentStep(7); // pH → PPFD (pula EC)
    }
    setCurrentStep(prev => prev + 1);
  };

  const goBack = () => {
    triggerHaptic('light');
    const isOrganic = (selectedTent as any)?.cultivationMethod === 'ORGANIC';
    if (currentStep === 3 && sensorReading !== undefined && sensorReading?.isFresh && logMode === 'status') {
      return setCurrentStep(0);
    }
    if (logMode === 'status' && isOrganic) {
      if (currentStep === 7) return setCurrentStep(5); // PPFD → pH (pula EC)
      if (currentStep === 5) return setCurrentStep(3); // pH → Rega (pula Runoff)
    }
    setCurrentStep(prev => prev - 1);
  };

  // Auto-detect shift based on current time (AM before 6 PM, PM after 6 PM)
  const getDefaultShift = (): "AM" | "PM" => {
    const currentHour = new Date().getHours();
    return currentHour < 18 ? "AM" : "PM";
  };
  
  const [turn] = useState<"AM" | "PM">(getDefaultShift());
  
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
  const { data: tents = [], isLoading: tentsLoading } = trpc.tents.list.useQuery(undefined, { enabled: !isDemo });
  // No demo, estufa sintética de exemplo (mineral, mostra o fluxo completo).
  const DEMO_TENT = { id: -1, name: "Estufa de exemplo", category: "VEGA", cultivationMethod: "MINERAL" } as any;
  const selectedTent = isDemo ? DEMO_TENT : tents.find((t: any) => t.id === tentId);
  // Cultivo Orgânico: estufa orgânica não mede EC/runoff; pH é opcional/informativo.
  const isOrganicTent = (selectedTent as any)?.cultivationMethod === "ORGANIC";
  const isFloraPhase = selectedTent?.category === "FLORA";
  const floraTents = tents.filter((t: any) => t.category === "FLORA");

  // Auto-select single FLORA tent in trichome mode
  useEffect(() => {
    if (logMode === 'trichome' && floraTents.length === 1 && !tentId) {
      setTentId(floraTents[0].id);
      setCurrentStep(9);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logMode, floraTents.length, tentId]);

  // Fetch plants for selected tent (load when reaching step 9)
  const { data: plants = [], isLoading: plantsLoading } = trpc.plants.list.useQuery(
    { status: "ACTIVE" },
    {
      enabled: !!tentId && currentStep >= 9,
      select: (data) => data.filter((p: any) => p.currentTentId === tentId)
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
      markGardenCare(); // Modo Jardim: planta comemora ao voltar
      // Log saved — advance to plant health question (step 9)
      haptics.light();
      setCurrentStep(9);
    },
    onError: (error) => {
      haptics.error();
      toast.error(`Erro ao salvar: ${error.message}`);
    },
  });

  // Save plant health mutation
  const savePlantHealthMutation = trpc.plantHealth.create.useMutation({
    onSuccess: () => {
      if (currentPlantIndex < plants.length - 1) {
        haptics.light();
        setCurrentPlantIndex(currentPlantIndex + 1);
      } else if (isFloraPhase && logMode === 'plant') {
        // Propõe registro de tricomas após saúde (só no modo planta)
        haptics.light();
        setCurrentTrichomeIndex(0);
        setRecordTrichomes(null);
      } else {
        haptics.success();
        markGardenCare(); // Modo Jardim: planta comemora ao voltar
        toast.success("Registros salvos com sucesso!");
        resetForm();
        setTimeout(() => setLocation("/"), 1500);
      }
    },
    onError: (error: any) => {
      haptics.error();
      toast.error(`Erro ao salvar: ${error.message}`);
    },
  });

  // Save trichome mutation
  const saveTrichomeMutation = trpc.plantTrichomes.create.useMutation({
    onSuccess: () => {
      if (currentTrichomeIndex < plants.length - 1) {
        haptics.light();
        setCurrentTrichomeIndex(currentTrichomeIndex + 1);
      } else {
        haptics.success();
        markGardenCare(); // Modo Jardim: planta comemora ao voltar
        toast.success("Todos os registros salvos!");
        resetForm();
        setTimeout(() => setLocation("/"), 1500);
      }
    },
    onError: (error: any) => {
      haptics.error();
      toast.error(`Erro ao salvar tricomas: ${error.message}`);
    },
  });

  // Upload photo mutation
  const uploadPhotoMutation = trpc.plantPhotos.upload.useMutation({
    onSuccess: () => {
      haptics.success();
      markGardenCare(); // Modo Jardim: planta comemora ao voltar
      toast.success("Foto salva!");
    },
    onError: (error) => {
      haptics.error();
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
    // Modo tutorial: NÃO salva. Mostra celebração e sai pro destino (then).
    if (isDemo) {
      triggerHaptic('medium');
      setDemoComplete(true);
      setTimeout(() => setLocation(demoThen), 1600);
      return;
    }
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
          className={cn("fixed inset-0 overflow-hidden bg-background flex flex-col isolate", collapsed ? "lg:left-16" : "lg:left-64")}
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
            onClick={() => { triggerHaptic('light'); handleClose(); }}
            aria-label={isDemo ? "Pular tutorial" : "Cancelar registro"}
            className="absolute top-4 right-4 z-[200] w-10 h-10 flex items-center justify-center rounded-full bg-black/20 backdrop-blur-sm text-white hover:bg-black/35 active:scale-95 transition-all"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Banner de tutorial — modo demo (nada é salvo) */}
          {isDemo && !demoComplete && (
            <div className="shrink-0 bg-amber-500/12 border-b border-amber-500/25 px-4 py-2 text-center z-[150]">
              <p className="text-xs text-amber-700 dark:text-amber-400">
                <strong>Tutorial</strong> · este é um exemplo — nada é salvo. Brinque à vontade 😊
              </p>
            </div>
          )}

          {/* Tela de conclusão do tutorial */}
          {isDemo && demoComplete && (
            <div className="absolute inset-0 z-[300] bg-card flex flex-col items-center justify-center gap-4 text-center px-8 animate-[fade-in_0.3s_ease-out]">
              <div className="w-20 h-20 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center">
                <Check className="w-10 h-10 text-primary" strokeWidth={2.5} />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-xl font-bold text-foreground">Você fez seu primeiro registro! 🎉</h2>
                <p className="text-sm text-muted-foreground max-w-xs">
                  No dia a dia é só tocar no <strong>+</strong> da barra e escolher "Status da estufa".
                </p>
              </div>
              <Loader2 className="w-5 h-5 text-muted-foreground/50 animate-spin mt-1" />
            </div>
          )}
          {/* Seleção de tipo — aparece antes do step 0 */}
          {logMode === null && (
            <QuickLogModeSelector
              hasFloraTents={floraTents.length > 0}
              onTrichomeUnavailable={() => toast.info("Nenhuma planta em floração no momento")}
              onSelectMode={(mode) => {
                triggerHaptic('light');
                setLogMode(mode);
                if (mode === 'plant') {
                  setCurrentStep(0);
                  setRecordPlantHealth(true);
                } else if (mode === 'trichome') {
                  setCurrentStep(0);
                  setRecordTrichomes(true);
                }
              }}
            />
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
                      animate={getCircleStyle({ step: currentStep, tempC, rhPct, ph, ppfd }) as any}
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
                  {currentStep === 5 && (isOrganicTent ? "pH do solo (opcional)" : "Qual o pH da solução?")}
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
                        : `linear-gradient(135deg, rgba(${accentRgba},0.05) 0%, var(--card) 65%)`
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
                      className="text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 transition-colors font-medium disabled:opacity-40"
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
                      <span className="font-bold text-lg mono" style={{ color }}>{v} kPa</span>
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
                  <CalcSlider
                    label="pH da solução"
                    value={parseFloat(ph) || 7}
                    setValue={(v) => setPh(v.toFixed(1))}
                    min={0}
                    max={14}
                    step={0.1}
                    suffix="pH"
                    accent={getPHColor(parseFloat(ph) || 7)}
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
                      <CalcSlider
                        label="PPFD"
                        value={ppfd}
                        setValue={(val) => setPpfd(val)}
                        min={0}
                        max={1200}
                        step={10}
                        suffix="μmol/m²/s"
                        accent="var(--color-kpi-ppfd)"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 pt-4">
                    <div>
                      <BigStepper
                        value={String(luxValue)}
                        onChange={(val) => {
                          const num = parseFloat(val) || 0;
                          const v = Math.min(100000, Math.max(0, num));
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
                      <CalcSlider
                        label="Intensidade de luz"
                        value={luxValue}
                        setValue={(val) => {
                          setLuxValue(val);
                          setPpfd(Math.round(val * 0.0185));
                        }}
                        min={0}
                        max={100000}
                        step={1000}
                        suffix="lux"
                        accent="var(--color-kpi-ppfd)"
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
                    <div className="text-2xl font-semibold mono text-foreground flex items-center gap-1.5">
                      {tempC}°C
                      {sensorReading?.isFresh && <span className="text-xs font-bold text-cyan-400 bg-cyan-500/15 border border-cyan-500/30 rounded-full px-1.5 py-0.5 ml-1">AUTO</span>}
                    </div>
                  </div>
                )}
                {rhPct && (
                  <div className="p-4 bg-blue-500/10 rounded-xl border-l-4 border-blue-500">
                    <div className="text-sm text-muted-foreground">Umidade</div>
                    <div className="text-2xl font-semibold mono text-foreground flex items-center gap-1.5">
                      {rhPct}%
                      {sensorReading?.isFresh && <span className="text-xs font-bold text-cyan-400 bg-cyan-500/15 border border-cyan-500/30 rounded-full px-1.5 py-0.5 ml-1">AUTO</span>}
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
                      <div className="text-2xl font-semibold mono" style={{ color }}>{v} kPa</div>
                      <div className="text-xs mt-0.5" style={{ color, opacity: 0.75 }}>{label}</div>
                    </div>
                  );
                })()}
                {wateringVolume && (
                  <div className="p-4 bg-green-500/10 rounded-xl border-l-4 border-green-500">
                    <div className="text-sm text-muted-foreground">Volume de Rega</div>
                    <div className="text-2xl font-semibold mono text-foreground">{wateringVolume} ml</div>
                  </div>
                )}
                {runoffCollected && (
                  <div className="p-4 bg-teal-500/10 rounded-xl border-l-4 border-teal-500">
                    <div className="text-sm text-muted-foreground">Runoff Coletado</div>
                    <div className="text-2xl font-semibold mono text-foreground">{runoffCollected} ml ({runoffPercentage}%)</div>
                  </div>
                )}
                {ph && (
                  <div className="p-4 bg-purple-500/10 rounded-xl border-l-4 border-purple-500">
                    <div className="text-sm text-muted-foreground">pH</div>
                    <div className="text-2xl font-semibold mono text-foreground">{ph}</div>
                  </div>
                )}
                {ec && (
                  <div className="p-4 bg-yellow-500/10 rounded-xl border-l-4 border-yellow-500">
                    <div className="text-sm text-muted-foreground">EC</div>
                    <div className="text-2xl font-semibold mono text-foreground">{ec} mS/cm</div>
                  </div>
                )}
                {ppfd > 0 && (
                  <div className="p-4 bg-amber-500/10 rounded-xl border-l-4 border-amber-500">
                    <div className="text-sm text-muted-foreground">PPFD ({turn})</div>
                    <div className="text-2xl font-semibold mono text-foreground">{ppfd} μmol/m²/s</div>
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
              <PlantHealthForm
                record={plantHealthRecords.get(plants[currentPlantIndex].id)}
                onChange={(field, value) =>
                  updatePlantHealthRecord(plants[currentPlantIndex].id, field, value)
                }
                onPhotoCapture={handlePhotoCapture}
                uploadProgress={uploadProgress}
              />
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

            {/* Trichome: loading plants */}
            {recordTrichomes === true && plantsLoading && (
              <div className="flex flex-col items-center justify-center py-12 gap-4 animate-[fade-in_0.4s_ease-out]">
                <div className="w-20 h-20 rounded-full bg-violet-500/15 flex items-center justify-center">
                  <Sparkles className="w-10 h-10 text-violet-400 animate-pulse" />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-foreground">Carregando plantas…</p>
                  <p className="text-sm text-muted-foreground mt-1">Buscando plantas da estufa de floração</p>
                </div>
                <Loader2 className="w-5 h-5 animate-spin text-violet-400" />
              </div>
            )}

            {/* Trichome: no plants in tent */}
            {recordTrichomes === true && !plantsLoading && plants.length === 0 && (
              <div className="flex flex-col items-center gap-4 py-6 animate-[slide-in-from-bottom_0.6s_ease-out]">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                  <Sprout className="w-8 h-8 text-muted-foreground" />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-foreground">Nenhuma planta ativa</p>
                  <p className="text-sm text-muted-foreground mt-1">Esta estufa não tem plantas ativas para registrar tricomas.</p>
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

            {/* Formulário de tricomas por planta */}
            {recordTrichomes === true && plants[currentTrichomeIndex] && (
              <TrichomeForm
                plant={plants[currentTrichomeIndex]}
                currentIndex={currentTrichomeIndex}
                totalPlants={plants.length}
                record={trichomeRecords.get(plants[currentTrichomeIndex].id)}
                onChange={(field, value) =>
                  updateTrichomeRecord(plants[currentTrichomeIndex].id, field, value)
                }
              />
            )}

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
        {/* Back button - only for daily log steps. No demo, piso no step 1 (step 0
            de seleção de estufa é pulado, não dá pra voltar pra ele). */}
        {(isDemo ? currentStep > 1 : currentStep > 0) && currentStep < 9 && (
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
        {recordTrichomes === true && plantsLoading && (
          <div className="flex-1 h-14 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-violet-400" />
          </div>
        )}
        {recordTrichomes === true && !plantsLoading && plants[currentTrichomeIndex] && (
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

    {/* Confirm close mid-flow */}
    <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancelar registro?</AlertDialogTitle>
          <AlertDialogDescription>
            Os dados preenchidos não serão salvos. Tem certeza que quer sair?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Continuar preenchendo</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => setLocation('/')}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Sim, cancelar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </PageTransition>
  );
}

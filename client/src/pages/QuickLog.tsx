import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { AnimatedButton } from "@/components/AnimatedButton";
import { LazyImage } from "@/components/LazyImage";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Loader2, Home, ThermometerSun, Droplets, Sprout, Droplet, TestTube, Zap, Sun, Check, ArrowLeft, ArrowRight, Heart, SkipForward, Activity, Camera, Upload, X } from "lucide-react";
import { RangeSlider } from "@/components/ui/range-slider";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { uploadImage } from "@/lib/uploadImage";
import { PhotoUploadProgress, type UploadStage } from "@/components/PhotoUploadProgress";
import { PageTransition } from "@/components/PageTransition";

// LST Techniques and Trichome types removed - available in individual plant pages

export default function QuickLog() {
  const [, setLocation] = useLocation();
  const [currentStep, setCurrentStep] = useState(0);

  // Lock body scroll while this page is mounted
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  
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
  const [ph, setPh] = useState("");
  const [ec, setEc] = useState("");
  const [ppfd, setPpfd] = useState(400); // Valor inicial realista: 400 μmol/m²/s
  const [lightUnit, setLightUnit] = useState<"ppfd" | "lux">("ppfd"); // Toggle between Lux and PPFD
  const [luxValue, setLuxValue] = useState(20000); // Valor inicial realista: 20.000 lux

  // Plant health state - expanded
  const [recordPlantHealth, setRecordPlantHealth] = useState<boolean | null>(null);
  const [currentPlantIndex, setCurrentPlantIndex] = useState(0);
  const [plantHealthRecords, setPlantHealthRecords] = useState<Map<number, {
    status: string;
    symptoms: string;
    notes: string;
    photoUrl?: string;    // URL S3 após upload
    photoPreview?: string; // data URL local para preview
  }>>(new Map());

  // Fetch tents for selection
  const { data: tents = [], isLoading: tentsLoading } = trpc.tents.list.useQuery();

  // Fetch plants for selected tent (load when reaching step 9)
  const { data: plants = [], isLoading: plantsLoading } = trpc.plants.list.useQuery(
    { status: "ACTIVE" },
    {
      enabled: !!tentId && currentStep >= 9,
      select: (data) => data.filter(p => p.currentTentId === tentId)
    }
  );

  // Calculate runoff percentage
  const runoffPercentage = useMemo(() => {
    const watering = parseFloat(wateringVolume);
    const runoff = parseFloat(runoffCollected);
    if (!watering || !runoff || watering === 0) return null;
    return ((runoff / watering) * 100).toFixed(1);
  }, [wateringVolume, runoffCollected]);

  // Save daily log mutation
  const saveDailyLogMutation = trpc.dailyLogs.create.useMutation({
    onSuccess: () => {
      // Log saved — advance to plant health question (step 9)
      // Step 9 shows confirmation + option to record plant health
      setCurrentStep(9);
    },
    onError: (error) => {
      toast.error(`Erro ao salvar: ${error.message}`);
    },
  });

  // Save plant health mutation (now includes photo only)
  const savePlantHealthMutation = trpc.plantHealth.create.useMutation({
    onSuccess: () => {
      // Move to next plant or finish
      if (currentPlantIndex < plants.length - 1) {
        setCurrentPlantIndex(currentPlantIndex + 1);
      } else {
        // All plants done
        toast.success("✅ Registros salvos com sucesso!");
        resetForm();
        setTimeout(() => setLocation("/"), 1500);
      }
    },
    onError: (error: any) => {
      toast.error(`Erro ao salvar: ${error.message}`);
    },
  });

  // Upload photo mutation
  const uploadPhotoMutation = trpc.plantPhotos.upload.useMutation({
    onSuccess: (data) => {
      console.log('[QuickLog] Photo uploaded successfully:', data);
      toast.success("📸 Foto salva!");
    },
    onError: (error) => {
      console.error('[QuickLog] Photo upload failed:', error);
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
        toast.success("📸 Foto enviada com sucesso!");
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
    } else {
      // Last plant - finish
      toast.success("✅ Registro salvo com sucesso!");
      resetForm();
      setTimeout(() => setLocation("/"), 1500);
    }
  };

  const handleSaveDailyLog = () => {
    if (!tentId) {
      toast.error("Selecione uma estufa");
      return;
    }

    saveDailyLogMutation.mutate({
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
    });
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
    { id: 3, title: "Volume de Rega", icon: Sprout, gradient: "from-green-500 to-emerald-600" },
    { id: 4, title: "Runoff Coletado", icon: Droplet, gradient: "from-teal-500 to-cyan-600" },
    { id: 5, title: "pH", icon: TestTube, gradient: "from-purple-500 to-pink-600" },
    { id: 6, title: "EC", icon: Zap, gradient: "from-yellow-500 to-orange-600" },
    { id: 7, title: "PPFD", icon: Sun, gradient: "from-yellow-400 to-amber-600" },
    { id: 8, title: "Resumo", icon: Check, gradient: "from-green-500 to-emerald-600" },
  ];

  const currentStepData = steps[currentStep];

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
        <div className="h-dvh overflow-hidden bg-background flex flex-col pt-[env(safe-area-inset-top,0px)]">
      {/* Content */}
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        <div className="container mx-auto px-4 max-w-md h-full flex items-center">
          <div className="bg-card dark:bg-zinc-900 dark:border dark:border-zinc-700 rounded-2xl shadow-lg h-[85%] overflow-hidden w-full flex flex-col relative">
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
          {/* Step content */}
          <div className="flex-1 overflow-y-auto relative z-10 animate-[fade-in_0.5s_ease-out] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="min-h-full flex flex-col justify-center p-6 space-y-6">
            {/* Icon */}
            {currentStep < 9 && currentStepData && (
              <div className="flex justify-center mb-6">
                <div className="relative flex items-center justify-center">
                  <div className="absolute w-44 h-44 border-4 border-dashed border-border rounded-full opacity-30 animate-[spin_20s_linear_infinite] pointer-events-none" />
                  <div className={`w-32 h-32 rounded-full bg-gradient-to-br ${currentStepData.gradient} flex items-center justify-center shadow-xl animate-[slide-in-from-bottom_0.6s_ease-out]`}>
                    <currentStepData.icon className="w-16 h-16 text-white" />
                  </div>
                </div>
              </div>
            )}

            {currentStep === 9 && recordPlantHealth === null && (
              <div className="flex justify-center mb-6">
                <div className="relative flex items-center justify-center">
                  <div className="absolute w-44 h-44 border-4 border-dashed border-border rounded-full opacity-30 animate-[spin_20s_linear_infinite] pointer-events-none" />
                  <div className="w-32 h-32 rounded-full bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center shadow-xl animate-[slide-in-from-bottom_0.6s_ease-out]">
                    <Heart className="w-16 h-16 text-white" />
                  </div>
                </div>
              </div>
            )}

            {currentStep >= 9 && recordPlantHealth === true && plants[currentPlantIndex] && (
              <div className="flex items-center gap-4 animate-[slide-in-from-bottom_0.6s_ease-out]">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shrink-0">
                  <Activity className="w-7 h-7 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground font-medium">Planta {currentPlantIndex + 1} de {plants.length} · {plants[currentPlantIndex].code}</div>
                  <div className="text-2xl font-bold text-foreground truncate">{plants[currentPlantIndex].name}</div>
                  <div className="text-sm text-muted-foreground">Como está a saúde?</div>
                </div>
              </div>
            )}

            {/* Title */}
            {currentStep < 9 && currentStepData && (
              <div className="text-center space-y-2 animate-[slide-in-from-bottom_0.7s_ease-out]">
                <h2 className="text-3xl font-bold text-foreground">{currentStepData.title}</h2>
                <p className="text-lg text-muted-foreground">
                  {currentStep === 0 && "Selecione a estufa"}
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

            {currentStep === 9 && recordPlantHealth === null && (
              <div className="text-center space-y-2 animate-[slide-in-from-bottom_0.7s_ease-out]">
                <h2 className="text-3xl font-bold text-foreground">Saúde das Plantas</h2>
                <p className="text-lg text-muted-foreground">Deseja registrar a saúde das plantas?</p>
                <p className="text-sm text-muted-foreground">Você pode registrar a saúde das plantas desta estufa agora ou pular esta etapa.</p>
              </div>
            )}


            {/* Step 0: Tent selection */}
            {currentStep === 0 && (
              <div className="space-y-3 animate-[slide-in-from-bottom_0.8s_ease-out]">
                {tents.map((tent) => (
                  <button
                    key={tent.id}
                    onClick={() => setTentId(tent.id)}
                    className={`w-full p-6 rounded-2xl border-2 transition-all duration-300 text-left ${
                      tentId === tent.id
                        ? "bg-gradient-to-r from-green-500 to-emerald-600 text-white border-green-500 shadow-xl scale-105"
                        : "bg-card dark:bg-zinc-800 text-card-foreground border-border dark:border-zinc-600 hover:border-green-400 dark:hover:border-green-500 hover:shadow-lg"
                    }`}
                  >
                    <div className="font-bold text-xl">{tent.name}</div>
                    <div className="text-sm opacity-90">
                      {tent.category === "MAINTENANCE" ? "Manutenção" : 
                       tent.category === "VEGA" ? "Vegetativa" : 
                       tent.category === "FLORA" ? "Floração" : 
                       tent.category === "DRYING" ? "Secagem" : tent.category} • {tent.width}×{tent.depth}×{tent.height}cm
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Step 1: Temperature */}
            {currentStep === 1 && (
              <div className="space-y-4 animate-[slide-in-from-bottom_0.8s_ease-out]">
                <div className="flex items-center justify-center gap-4">
                  <Input
                    type="number"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={tempC}
                    onChange={(e) => {
                      const newValue = e.target.value;
                      if (newValue && !tempC) triggerHaptic('light');
                      setTempC(newValue);
                    }}
                    placeholder="25"
                    className={`w-40 md:w-52 text-center text-4xl md:text-5xl lg:text-6xl h-16 md:h-20 lg:h-24 border-2 rounded-2xl bg-background dark:bg-zinc-800 text-foreground shadow-lg transition-all duration-200 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
                      tempC
                        ? 'border-green-500 ring-2 ring-green-500/20'
                        : 'border-border'
                    }`}
                  />
                  <span className="text-3xl md:text-4xl lg:text-5xl font-bold text-muted-foreground">°C</span>
                </div>
              </div>
            )}

            {/* Step 2: Humidity */}
            {currentStep === 2 && (
              <div className="space-y-4 animate-[slide-in-from-bottom_0.8s_ease-out]">
                <div className="flex items-center justify-center gap-4">
                  <Input
                    type="number"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={rhPct}
                    onChange={(e) => {
                      const newValue = e.target.value;
                      if (newValue && !rhPct) triggerHaptic('light');
                      setRhPct(newValue);
                    }}
                    placeholder="60"
                    className={`w-40 md:w-52 text-center text-4xl md:text-5xl lg:text-6xl h-16 md:h-20 lg:h-24 border-2 rounded-2xl bg-background dark:bg-zinc-800 text-foreground shadow-lg transition-all duration-200 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
                      rhPct
                        ? 'border-green-500 ring-2 ring-green-500/20'
                        : 'border-border'
                    }`}
                  />
                  <span className="text-3xl md:text-4xl lg:text-5xl font-bold text-muted-foreground">%</span>
                </div>
              </div>
            )}

            {/* Step 3: Watering volume */}
            {currentStep === 3 && (
              <div className="space-y-4 animate-[slide-in-from-bottom_0.8s_ease-out]">
                <div className="flex items-center justify-center gap-4">
                  <Input
                    type="number"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={wateringVolume}
                    onChange={(e) => {
                      const newValue = e.target.value;
                      if (newValue && !wateringVolume) triggerHaptic('light');
                      setWateringVolume(newValue);
                    }}
                    placeholder="2000"
                    className={`text-center text-3xl md:text-4xl lg:text-5xl h-16 md:h-20 lg:h-24 border-2 rounded-2xl bg-background dark:bg-zinc-800 text-foreground shadow-lg transition-all duration-200 ${
                      wateringVolume
                        ? 'border-green-500 ring-2 ring-green-500/20'
                        : 'border-border focus:ring-4 focus:ring-green-500/10'
                    }`}
                  />
                  <span className="text-3xl md:text-4xl lg:text-5xl font-bold text-muted-foreground">ml</span>
                </div>
              </div>
            )}

            {/* Step 4: Runoff collected */}
            {currentStep === 4 && (
              <div className="space-y-4 animate-[slide-in-from-bottom_0.8s_ease-out]">
                <div className="flex items-center justify-center gap-4">
                  <Input
                    type="number"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={runoffCollected}
                    onChange={(e) => {
                      const newValue = e.target.value;
                      if (newValue && !runoffCollected) triggerHaptic('light');
                      setRunoffCollected(newValue);
                    }}
                    placeholder="300"
                    className={`text-center text-3xl md:text-4xl lg:text-5xl h-16 md:h-20 lg:h-24 border-2 rounded-2xl bg-background dark:bg-zinc-800 text-foreground shadow-lg transition-all duration-200 ${
                      runoffCollected
                        ? 'border-green-500 ring-2 ring-green-500/20'
                        : 'border-border focus:ring-4 focus:ring-teal-500/10'
                    }`}
                  />
                  <span className="text-3xl md:text-4xl lg:text-5xl font-bold text-muted-foreground">ml</span>
                </div>
                {runoffPercentage && (
                  <div className="text-center p-4 bg-muted rounded-xl border border-border animate-[slide-in-from-bottom_0.9s_ease-out]">
                    <div className="text-sm text-foreground/80">Porcentagem de Runoff</div>
                    <div className="text-3xl font-bold text-teal-500">{runoffPercentage}%</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {parseFloat(runoffPercentage) >= 15 && parseFloat(runoffPercentage) <= 20
                        ? "✓ Ideal"
                        : parseFloat(runoffPercentage) < 15
                        ? "⚠️ Baixo"
                        : "⚠️ Alto"}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 5: pH */}
            {currentStep === 5 && (
              <div className="space-y-6 animate-[slide-in-from-bottom_0.8s_ease-out]">
                <div className="flex items-center justify-center gap-4">
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    value={ph}
                    onChange={(e) => {
                      const newValue = e.target.value;
                      if (newValue && !ph) triggerHaptic('light');
                      setPh(newValue);
                    }}
                    placeholder="6.0"
                    className={`text-center text-3xl md:text-4xl lg:text-5xl h-16 md:h-20 lg:h-24 border-2 rounded-2xl bg-background dark:bg-zinc-800 text-foreground shadow-lg transition-all duration-200 ${
                      ph
                        ? 'border-green-500 ring-2 ring-green-500/20'
                        : 'border-border focus:ring-4 focus:ring-purple-500/10'
                    }`}
                  />
                  <span className="text-3xl md:text-4xl lg:text-5xl font-bold text-muted-foreground">pH</span>
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
                <div className="flex items-center justify-center gap-4">
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    value={ec}
                    onChange={(e) => {
                      const newValue = e.target.value;
                      if (newValue && !ec) triggerHaptic('light');
                      setEc(newValue);
                    }}
                    placeholder="1.5"
                    className={`text-center text-3xl md:text-4xl lg:text-5xl h-16 md:h-20 lg:h-24 border-2 rounded-2xl bg-background dark:bg-zinc-800 text-foreground shadow-lg transition-all duration-200 ${
                      ec
                        ? 'border-green-500 ring-2 ring-green-500/20'
                        : 'border-border focus:ring-4 focus:ring-yellow-500/10'
                    }`}
                  />
                  <span className="text-2xl md:text-3xl lg:text-4xl font-bold text-muted-foreground">mS/cm</span>
                </div>
              </div>
            )}

            {/* Step 7: PPFD */}
            {currentStep === 7 && (
              <div className="space-y-6 animate-[slide-in-from-bottom_0.8s_ease-out]">
                {/* Toggle Lux/PPFD */}
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={() => {
                      setLightUnit("ppfd");
                      // Convert lux to ppfd when switching
                      if (luxValue > 0) {
                        setPpfd(Math.round(luxValue * 0.0185));
                      }
                    }}
                    className={`px-6 py-2 rounded-lg font-medium transition-all duration-300 ${
                      lightUnit === "ppfd"
                        ? "bg-gradient-to-r from-amber-400 to-yellow-500 text-white shadow-md scale-105"
                        : "bg-card text-card-foreground border border-border"
                    }`}
                  >
                    PPFD
                  </button>
                  <button
                    onClick={() => {
                      setLightUnit("lux");
                      // Convert ppfd to lux when switching
                      if (ppfd > 0) {
                        setLuxValue(Math.round(ppfd / 0.0185));
                      }
                    }}
                    className={`px-6 py-2 rounded-lg font-medium transition-all duration-300 ${
                      lightUnit === "lux"
                        ? "bg-gradient-to-r from-amber-400 to-yellow-500 text-white shadow-md scale-105"
                        : "bg-card text-card-foreground border border-border"
                    }`}
                  >
                    Lux
                  </button>
                </div>

                {/* Toggle AM/PM */}
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={() => setTurn("AM")}
                    className={`px-8 py-3 rounded-xl font-semibold transition-all duration-300 ${
                      turn === "AM"
                        ? "bg-gradient-to-r from-yellow-400 to-orange-500 text-white shadow-lg scale-105"
                        : "bg-card text-card-foreground border-2 border-border"
                    }`}
                  >
                    ☀️ AM
                  </button>
                  <button
                    onClick={() => setTurn("PM")}
                    className={`px-8 py-3 rounded-xl font-semibold transition-all duration-300 ${
                      turn === "PM"
                        ? "bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg scale-105"
                        : "bg-card text-card-foreground border-2 border-border"
                    }`}
                  >
                    🌙 PM
                  </button>
                </div>

                {/* Light Intensity Slider */}
                {lightUnit === "ppfd" ? (
                  <div className="space-y-4 pt-4">
                    <div className="flex items-center gap-3">
                      <Input
                        type="number"
                        inputMode="numeric"
                        step={10}
                        min={0}
                        max={1200}
                        value={ppfd || ""}
                        onChange={(e) => {
                          const val = Math.min(1200, Math.max(0, parseInt(e.target.value) || 0));
                          setPpfd(val);
                        }}
                        placeholder="600"
                        className={`text-center text-3xl md:text-4xl lg:text-5xl h-16 md:h-20 lg:h-24 border-2 rounded-2xl bg-background dark:bg-zinc-800 text-foreground shadow-lg transition-all duration-200 ${
                          ppfd > 0
                            ? 'border-amber-500 ring-2 ring-amber-500/20'
                            : 'border-border focus:ring-4 focus:ring-amber-500/10'
                        }`}
                      />
                      <span className="text-xs md:text-sm font-bold text-muted-foreground whitespace-nowrap">μmol/m²/s</span>
                    </div>
                    <div className="pb-2">
                      <RangeSlider
                        min={0}
                        max={1200}
                        step={10}
                        value={ppfd}
                        onChange={(val) => setPpfd(val)}
                        trackGradient="linear-gradient(to right, #3b82f6 0%, #10b981 33%, #eab308 66%, #ef4444 100%)"
                        formatTooltip={(v) => `${v} μmol/m²/s`}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 pt-4">
                    <div className="flex items-center gap-3">
                      <Input
                        type="number"
                        inputMode="numeric"
                        step={1000}
                        min={0}
                        max={100000}
                        value={luxValue || ""}
                        onChange={(e) => {
                          const val = Math.min(100000, Math.max(0, parseInt(e.target.value) || 0));
                          setLuxValue(val);
                          setPpfd(Math.round(val * 0.0185));
                        }}
                        placeholder="35000"
                        className={`text-center text-3xl md:text-4xl lg:text-5xl h-16 md:h-20 lg:h-24 border-2 rounded-2xl bg-background dark:bg-zinc-800 text-foreground shadow-lg transition-all duration-200 ${
                          luxValue > 0
                            ? 'border-amber-500 ring-2 ring-amber-500/20'
                            : 'border-border focus:ring-4 focus:ring-amber-500/10'
                        }`}
                      />
                      <span className="text-2xl md:text-3xl lg:text-4xl font-bold text-muted-foreground">lux</span>
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
                    <div className="text-2xl font-bold text-foreground">{tempC}°C</div>
                  </div>
                )}
                {rhPct && (
                  <div className="p-4 bg-blue-500/10 rounded-xl border-l-4 border-blue-500">
                    <div className="text-sm text-muted-foreground">Umidade</div>
                    <div className="text-2xl font-bold text-foreground">{rhPct}%</div>
                  </div>
                )}
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
            {currentStep === 9 && recordPlantHealth === null && (
              <div className="space-y-4 animate-[slide-in-from-bottom_0.8s_ease-out]">
                <p className="text-center text-sm text-muted-foreground">
                  ✅ Registro da estufa salvo! Deseja também registrar a saúde das plantas?
                </p>
                <Button
                  onClick={() => setRecordPlantHealth(true)}
                  className="w-full h-16 text-lg font-semibold rounded-2xl bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-600 hover:to-rose-700 shadow-lg"
                >
                  <Heart className="mr-2 h-6 w-6" />
                  Registrar Saúde das Plantas
                </Button>
                <Button
                  onClick={() => {
                    resetForm();
                    setLocation("/");
                  }}
                  variant="outline"
                  className="w-full h-16 text-lg font-semibold rounded-2xl border-2"
                >
                  <SkipForward className="mr-2 h-6 w-6" />
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
                  className="h-14 px-8 text-lg font-medium rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700"
                >
                  <Check className="mr-2 h-5 w-5" />
                  Finalizar
                </Button>
              </div>
            )}

            {/* Step 10+: Plant health form (expanded) */}
            {currentStep >= 9 && recordPlantHealth === true && plants[currentPlantIndex] && (
              <div className="space-y-4">
                {/* Status buttons — empilhados com ícone à esquerda */}
                <div className="flex flex-col gap-2">
                  {[
                    { value: "healthy",   label: "Saudável", icon: "✓", active: "bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-md" },
                    { value: "attention", label: "Atenção",  icon: "⚠️", active: "bg-gradient-to-r from-yellow-500 to-orange-500 text-white shadow-md" },
                    { value: "sick",      label: "Doente",   icon: "✕", active: "bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-md" },
                  ].map(({ value, label, icon, active }) => {
                    const selected = (plantHealthRecords.get(plants[currentPlantIndex].id)?.status || "healthy") === value;
                    return (
                      <button
                        key={value}
                        onClick={() => updatePlantHealthRecord(plants[currentPlantIndex].id, "status", value)}
                        className={`flex items-center gap-4 w-full px-5 py-4 rounded-xl font-semibold text-base transition-all duration-300 ${selected ? active : "bg-card text-card-foreground border-2 border-border"}`}
                      >
                        <span className="text-xl w-6 text-center">{icon}</span>
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Sintomas e Notas — colapsável, fechado por padrão */}
                <Accordion type="multiple" defaultValue={[]} className="space-y-0">
                  <AccordionItem value="details" className="border border-border rounded-xl bg-card shadow-sm">
                    <AccordionTrigger className="px-4 py-3 hover:no-underline">
                      <span className="text-sm font-medium text-muted-foreground">Sintomas e Notas (opcional)</span>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4 space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">Sintomas</label>
                        <Input
                          value={plantHealthRecords.get(plants[currentPlantIndex].id)?.symptoms || ""}
                          onChange={(e) => updatePlantHealthRecord(plants[currentPlantIndex].id, "symptoms", e.target.value)}
                          placeholder="Ex: Folhas amareladas, manchas..."
                          className="h-12 border-2 border-input rounded-xl bg-card text-foreground shadow-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">Notas</label>
                        <Textarea
                          value={plantHealthRecords.get(plants[currentPlantIndex].id)?.notes || ""}
                          onChange={(e) => updatePlantHealthRecord(plants[currentPlantIndex].id, "notes", e.target.value)}
                          placeholder="Observações gerais..."
                          className="min-h-[80px] border-2 border-input rounded-xl bg-card text-foreground shadow-sm"
                        />
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>

                {/* Foto — direto, sem accordion */}
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
                    <span className="text-sm text-muted-foreground">Foto (opcional)</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handlePhotoCapture}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            )}
          </div>
          </div>
          {/* Navigation buttons — footer dentro do card */}
          <div className="shrink-0 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] border-t border-border flex gap-3 bg-card dark:bg-zinc-900">
        {/* Back button - only for daily log steps */}
        {currentStep > 0 && currentStep < 9 && (
          <Button
            variant="outline"
            onClick={() => {
              triggerHaptic('light');
              setCurrentStep(currentStep - 1);
            }}
            className="flex-1 h-14 text-lg font-medium rounded-xl"
          >
            <ArrowLeft className="mr-2 h-5 w-5" />
            Voltar
          </Button>
        )}

        {/* Next/Save button for daily log */}
        {currentStep < 8 && (
          <Button
            onClick={() => {
              triggerHaptic('medium');
              setCurrentStep(currentStep + 1);
            }}
            disabled={!canGoNext()}
            className="flex-1 h-14 text-lg font-medium rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700"
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
            className="flex-1 h-14 text-sm font-medium rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700"
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
        {currentStep >= 9 && recordPlantHealth === true && plants[currentPlantIndex] && (
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
              disabled={savePlantHealthMutation.isPending || uploadPhotoMutation.isPending}
              className="flex-1 h-14 text-lg font-medium rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700"
            >
              {(savePlantHealthMutation.isPending || uploadPhotoMutation.isPending) ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Salvando...
                </>
              ) : currentPlantIndex < plants.length - 1 ? (
                <>
                  <Check className="mr-2 h-5 w-5" />
                  Próxima Planta
                </>
              ) : (
                <>
                  <Check className="mr-2 h-5 w-5" />
                  Finalizar
                </>  
              )}
            </AnimatedButton>
          </>
        )}
      </div>
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

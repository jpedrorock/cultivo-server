import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Loader2, Home, ThermometerSun, Droplets, Sprout, Droplet, TestTube, Zap, Sun, Check, ArrowLeft, ArrowRight, Heart, SkipForward, Activity, Camera, Upload } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

// LST Techniques and Trichome types removed - available in individual plant pages

export default function QuickLog() {
  const [, setLocation] = useLocation();
  const [currentStep, setCurrentStep] = useState(0);
  
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
  const [ppfd, setPpfd] = useState(0);
  const [lightUnit, setLightUnit] = useState<"ppfd" | "lux">("ppfd"); // Toggle between Lux and PPFD
  const [luxValue, setLuxValue] = useState(0);

  // Plant health state - expanded
  const [recordPlantHealth, setRecordPlantHealth] = useState<boolean | null>(null);
  const [currentPlantIndex, setCurrentPlantIndex] = useState(0);
  const [plantHealthRecords, setPlantHealthRecords] = useState<Map<number, {
    status: string;
    symptoms: string;
    notes: string;
    photoBase64?: string;
  }>>(new Map());

  // Fetch tents for selection
  const { data: tents = [], isLoading: tentsLoading } = trpc.tents.list.useQuery();

  // Fetch plants for selected tent (load when reaching step 9)
  const { data: plants = [] } = trpc.plants.list.useQuery(
    {},
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
      if (plants.length === 0) {
        // No plants in tent
        toast.success("✅ Registro da estufa salvo com sucesso!");
        resetForm();
        setTimeout(() => setLocation("/"), 1500);
      } else if (recordPlantHealth === false) {
        // User initially said no, but ask again
        toast.success("✅ Registro da estufa salvo!", {
          description: "Deseja registrar saúde das plantas agora?",
          action: {
            label: "Sim, registrar",
            onClick: () => {
              setRecordPlantHealth(true);
              setCurrentStep(9); // Go to plant health
            },
          },
          cancel: {
            label: "Não, voltar",
            onClick: () => {
              resetForm();
              setLocation("/");
            },
          },
        });
      } else {
        // Continue to plant health
        toast.success("✅ Registro da estufa salvo!");
        setCurrentStep(9); // Go to first plant health step
      }
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
    setPpfd(0);
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

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Foto muito grande! Máximo 5MB");
      return;
    }

    // Convert to base64
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      updatePlantHealthRecord(plants[currentPlantIndex].id, "photoBase64", base64);
      toast.success("📸 Foto adicionada!");
    };
    reader.readAsDataURL(file);
  };

  const handleSavePlantHealth = async () => {
    const plant = plants[currentPlantIndex];
    const record = plantHealthRecords.get(plant.id);

    if (!record) {
      toast.error("Nenhum dado para salvar");
      return;
    }

    try {
      // Save health status WITH photo (same as PlantHealthTab)
      const healthStatusMap: Record<string, "HEALTHY" | "STRESSED" | "SICK"> = {
        healthy: "HEALTHY",
        attention: "STRESSED",
        sick: "SICK",
      };

      console.log('[QuickLog] Saving health log with photo:', {
        plantId: plant.id,
        hasPhoto: !!record.photoBase64,
        status: healthStatusMap[record.status]
      });

      await savePlantHealthMutation.mutateAsync({
        plantId: plant.id,
        healthStatus: healthStatusMap[record.status] || "HEALTHY",
        symptoms: record.symptoms || undefined,
        treatment: undefined,
        notes: record.notes || undefined,
        photoBase64: record.photoBase64 || undefined, // ✅ Send photo in same mutation!
      });

      console.log('[QuickLog] Health log saved successfully with photo');
      if (record.photoBase64) {
        toast.success("📸 Foto salva!");
      }

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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50">
        <Loader2 className="h-12 w-12 animate-spin text-green-600" />
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex flex-col">
      {/* Content */}
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        <div className="container mx-auto px-4 max-w-md h-full flex items-center">
          <div className="bg-card dark:bg-card rounded-2xl shadow-lg p-6 space-y-6 relative max-h-[85vh] overflow-y-auto w-full">
          {/* Decorative animated circle */}
          {currentStep < 9 && currentStepData && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 border-4 border-dashed border-gray-200 dark:border-gray-600 rounded-full opacity-30 animate-[spin_20s_linear_infinite] pointer-events-none" />
          )}

          {/* Step content */}
          <div className="relative z-10 space-y-6 animate-[fade-in_0.5s_ease-out]">
            {/* Icon */}
            {currentStep < 9 && currentStepData && (
              <div className="flex justify-center mb-6">
                <div className={`w-32 h-32 rounded-full bg-gradient-to-br ${currentStepData.gradient} flex items-center justify-center shadow-xl animate-[slide-in-from-bottom_0.6s_ease-out]`}>
                  <currentStepData.icon className="w-16 h-16 text-white" />
                </div>
              </div>
            )}

            {currentStep === 9 && recordPlantHealth === null && (
              <div className="flex justify-center mb-6">
                <div className="w-32 h-32 rounded-full bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center shadow-xl animate-[slide-in-from-bottom_0.6s_ease-out]">
                  <Heart className="w-16 h-16 text-white" />
                </div>
              </div>
            )}

            {currentStep >= 9 && recordPlantHealth === true && plants[currentPlantIndex] && (
              <div className="flex justify-center mb-6">
                <div className="w-32 h-32 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-xl animate-[slide-in-from-bottom_0.6s_ease-out]">
                  <Activity className="w-16 h-16 text-white" />
                </div>
              </div>
            )}

            {/* Title */}
            {currentStep < 9 && currentStepData && (
              <div className="text-center space-y-2 animate-[slide-in-from-bottom_0.7s_ease-out]">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{currentStepData.title}</h2>
                <p className="text-lg text-gray-500">
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
                <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Saúde das Plantas</h2>
                <p className="text-lg text-gray-500">Deseja registrar a saúde das plantas?</p>
                <p className="text-sm text-gray-400">Você pode registrar a saúde das plantas desta estufa agora ou pular esta etapa.</p>
              </div>
            )}

            {currentStep >= 9 && recordPlantHealth === true && plants[currentPlantIndex] && (
              <div className="text-center space-y-2 animate-[slide-in-from-bottom_0.7s_ease-out]">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{plants[currentPlantIndex].name}</h2>
                <p className="text-lg text-gray-500">Como está a saúde?</p>
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
                        : "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600 hover:border-green-300 hover:shadow-lg"
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
                    className={`text-center text-4xl h-20 border-2 rounded-2xl bg-card dark:bg-card text-foreground shadow-lg transition-all duration-200 ${
                      tempC
                        ? 'border-green-500 dark:border-green-400 ring-2 ring-green-200 dark:ring-green-900'
                        : 'border-gray-300 dark:border-gray-600 focus:ring-4 focus:ring-orange-100'
                    }`}
                  />
                  <span className="text-4xl font-bold text-gray-400">°C</span>
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
                    className={`text-center text-4xl h-20 border-2 rounded-2xl bg-card dark:bg-card text-foreground shadow-lg transition-all duration-200 ${
                      rhPct
                        ? 'border-green-500 dark:border-green-400 ring-2 ring-green-200 dark:ring-green-900'
                        : 'border-gray-300 dark:border-gray-600 focus:ring-4 focus:ring-blue-100'
                    }`}
                  />
                  <span className="text-4xl font-bold text-gray-400">%</span>
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
                    className={`text-center text-4xl h-20 border-2 rounded-2xl bg-card dark:bg-card text-foreground shadow-lg transition-all duration-200 ${
                      wateringVolume
                        ? 'border-green-500 dark:border-green-400 ring-2 ring-green-200 dark:ring-green-900'
                        : 'border-gray-300 dark:border-gray-600 focus:ring-4 focus:ring-green-100'
                    }`}
                  />
                  <span className="text-4xl font-bold text-gray-400">ml</span>
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
                    className={`text-center text-4xl h-20 border-2 rounded-2xl bg-card dark:bg-card text-foreground shadow-lg transition-all duration-200 ${
                      runoffCollected
                        ? 'border-green-500 dark:border-green-400 ring-2 ring-green-200 dark:ring-green-900'
                        : 'border-gray-300 dark:border-gray-600 focus:ring-4 focus:ring-teal-100'
                    }`}
                  />
                  <span className="text-4xl font-bold text-gray-400">ml</span>
                </div>
                {runoffPercentage && (
                  <div className="text-center p-4 bg-gradient-to-r from-teal-50 to-cyan-50 rounded-xl border border-teal-200 animate-[slide-in-from-bottom_0.9s_ease-out]">
                    <div className="text-sm text-gray-600">Porcentagem de Runoff</div>
                    <div className="text-3xl font-bold text-teal-600 dark:text-teal-400">{runoffPercentage}%</div>
                    <div className="text-xs text-gray-500 mt-1">
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
              <div className="space-y-4 animate-[slide-in-from-bottom_0.8s_ease-out]">
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
                    className={`text-center text-4xl h-20 border-2 rounded-2xl bg-card dark:bg-card text-foreground shadow-lg transition-all duration-200 ${
                      ph
                        ? 'border-green-500 dark:border-green-400 ring-2 ring-green-200 dark:ring-green-900'
                        : 'border-gray-300 dark:border-gray-600 focus:ring-4 focus:ring-purple-100'
                    }`}
                  />
                  <span className="text-4xl font-bold text-gray-400">pH</span>
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
                    className={`text-center text-4xl h-20 border-2 rounded-2xl bg-card dark:bg-card text-foreground shadow-lg transition-all duration-200 ${
                      ec
                        ? 'border-green-500 dark:border-green-400 ring-2 ring-green-200 dark:ring-green-900'
                        : 'border-gray-300 dark:border-gray-600 focus:ring-4 focus:ring-yellow-100'
                    }`}
                  />
                  <span className="text-4xl font-bold text-gray-400">mS/cm</span>
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
                        : "bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-200 border border-gray-300 dark:border-gray-600"
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
                        : "bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-200 border border-gray-300 dark:border-gray-600"
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
                        : "bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-200 border-2 border-gray-200 dark:border-gray-600"
                    }`}
                  >
                    ☀️ AM
                  </button>
                  <button
                    onClick={() => setTurn("PM")}
                    className={`px-8 py-3 rounded-xl font-semibold transition-all duration-300 ${
                      turn === "PM"
                        ? "bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg scale-105"
                        : "bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-200 border-2 border-gray-200 dark:border-gray-600"
                    }`}
                  >
                    🌙 PM
                  </button>
                </div>

                {/* Light Intensity Slider */}
                <div className="space-y-4">
                  {lightUnit === "ppfd" ? (
                    <>
                      <div className="text-center">
                        <div className="text-5xl font-bold text-gray-900 dark:text-gray-100">{ppfd}</div>
                        <div className="text-sm text-gray-500">μmol/m²/s</div>
                      </div>
                      <div className="relative">
                        <input
                          type="range"
                          min="0"
                          max="1500"
                          step="10"
                          value={ppfd}
                          onChange={(e) => setPpfd(parseInt(e.target.value))}
                          className="w-full h-10 rounded-full appearance-none cursor-pointer"
                          style={{
                            background: `linear-gradient(to right, #fbbf24 0%, #f59e0b ${(ppfd / 1500) * 100}%, #e5e7eb ${(ppfd / 1500) * 100}%, #e5e7eb 100%)`,
                          }}
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-center">
                        <div className="text-5xl font-bold text-gray-900 dark:text-gray-100">{luxValue}</div>
                        <div className="text-sm text-gray-500">Lux</div>
                        {luxValue > 0 && (
                          <div className="text-xs text-gray-400 mt-1">≈ {Math.round(luxValue * 0.0185)} μmol/m²/s</div>
                        )}
                      </div>
                      <div className="relative">
                        <input
                          type="range"
                          min="0"
                          max="80000"
                          step="500"
                          value={luxValue}
                          onChange={(e) => {
                            const lux = parseInt(e.target.value);
                            setLuxValue(lux);
                            // Auto-convert to PPFD for storage
                            setPpfd(Math.round(lux * 0.0185));
                          }}
                          className="w-full h-10 rounded-full appearance-none cursor-pointer"
                          style={{
                            background: `linear-gradient(to right, #fbbf24 0%, #f59e0b ${(luxValue / 80000) * 100}%, #e5e7eb ${(luxValue / 80000) * 100}%, #e5e7eb 100%)`,
                          }}
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Step 8: Summary */}
            {currentStep === 8 && (
              <div className="space-y-3 animate-[slide-in-from-bottom_0.8s_ease-out]">
                {tempC && (
                  <div className="p-4 bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-950 dark:to-red-950 rounded-xl border-l-4 border-orange-500">
                    <div className="text-sm text-gray-600 dark:text-gray-300">Temperatura</div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{tempC}°C</div>
                  </div>
                )}
                {rhPct && (
                  <div className="p-4 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950 dark:to-cyan-950 rounded-xl border-l-4 border-blue-500">
                    <div className="text-sm text-gray-600 dark:text-gray-300">Umidade</div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{rhPct}%</div>
                  </div>
                )}
                {wateringVolume && (
                  <div className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950 rounded-xl border-l-4 border-green-500">
                    <div className="text-sm text-gray-600 dark:text-gray-300">Volume de Rega</div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{wateringVolume} ml</div>
                  </div>
                )}
                {runoffCollected && (
                  <div className="p-4 bg-gradient-to-r from-teal-50 to-cyan-50 dark:from-teal-950 dark:to-cyan-950 rounded-xl border-l-4 border-teal-500">
                    <div className="text-sm text-gray-600 dark:text-gray-300">Runoff Coletado</div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{runoffCollected} ml ({runoffPercentage}%)</div>
                  </div>
                )}
                {ph && (
                  <div className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950 dark:to-pink-950 rounded-xl border-l-4 border-purple-500">
                    <div className="text-sm text-gray-600 dark:text-gray-300">pH</div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{ph}</div>
                  </div>
                )}
                {ec && (
                  <div className="p-4 bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-950 dark:to-orange-950 rounded-xl border-l-4 border-yellow-500">
                    <div className="text-sm text-gray-600 dark:text-gray-300">EC</div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{ec} mS/cm</div>
                  </div>
                )}
                {ppfd > 0 && (
                  <div className="p-4 bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950 dark:to-yellow-950 rounded-xl border-l-4 border-amber-500">
                    <div className="text-sm text-gray-600 dark:text-gray-300">PPFD ({turn})</div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{ppfd} μmol/m²/s</div>
                  </div>
                )}
              </div>
            )}

            {/* Step 9: Plant health question */}
            {currentStep === 9 && recordPlantHealth === null && (
              <div className="space-y-4 animate-[slide-in-from-bottom_0.8s_ease-out]">
                <Button
                  onClick={() => setRecordPlantHealth(true)}
                  className="w-full h-16 text-lg font-semibold rounded-2xl bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-600 hover:to-rose-700 shadow-lg"
                >
                  <Heart className="mr-2 h-6 w-6" />
                  Registrar Saúde das Plantas
                </Button>
                <Button
                  onClick={handleSaveDailyLog}
                  disabled={saveDailyLogMutation.isPending}
                  variant="outline"
                  className="w-full h-16 text-lg font-semibold rounded-2xl border-2"
                >
                  {saveDailyLogMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <SkipForward className="mr-2 h-6 w-6" />
                      Pular e Finalizar
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* Step 10+: Plant health form (expanded) */}
            {currentStep >= 9 && recordPlantHealth === true && plants[currentPlantIndex] && (
              <div className="space-y-4">
                {/* Plant info */}
                <div className="p-4 bg-card rounded-xl shadow-lg border-l-4 border-emerald-500 mb-6">
                  <div className="text-sm text-gray-500">Planta {currentPlantIndex + 1} de {plants.length}</div>
                  <div className="font-bold text-lg text-gray-900 dark:text-gray-100">{plants[currentPlantIndex].name}</div>
                  <div className="text-sm text-gray-600">{plants[currentPlantIndex].code}</div>
                </div>

                <Accordion type="multiple" defaultValue={["health"]} className="space-y-3">
                  {/* Health Status Section */}
                  <AccordionItem value="health" className="border border-border rounded-xl bg-card shadow-sm">
                    <AccordionTrigger className="px-4 py-3 hover:no-underline">
                      <div className="flex items-center gap-2">
                        <Activity className="h-5 w-5 text-emerald-600" />
                        <span className="font-semibold">Status de Saúde</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4 space-y-4">
                      {/* Status selection */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                        <div className="grid grid-cols-3 gap-2">
                          {["healthy", "attention", "sick"].map((status) => (
                            <button
                              key={status}
                              onClick={() => updatePlantHealthRecord(plants[currentPlantIndex].id, "status", status)}
                              className={`py-3 px-4 rounded-xl font-semibold transition-all duration-300 ${
                                (plantHealthRecords.get(plants[currentPlantIndex].id)?.status || "healthy") === status
                                  ? status === "healthy"
                                    ? "bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg"
                                    : status === "attention"
                                    ? "bg-gradient-to-r from-yellow-500 to-orange-600 text-white shadow-lg"
                                    : "bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-lg"
                                  : "bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-200 border-2 border-gray-200 dark:border-gray-600"
                              }`}
                            >
                              {status === "healthy" ? "✓ Saudável" : status === "attention" ? "⚠️ Atenção" : "✗ Doente"}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Symptoms */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Sintomas (opcional)</label>
                        <Input
                          value={plantHealthRecords.get(plants[currentPlantIndex].id)?.symptoms || ""}
                          onChange={(e) => updatePlantHealthRecord(plants[currentPlantIndex].id, "symptoms", e.target.value)}
                          placeholder="Ex: Folhas amareladas, manchas..."
                          className="h-12 border-2 border-input rounded-xl bg-card text-foreground shadow-sm"
                        />
                      </div>

                      {/* Notes */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Notas (opcional)</label>
                        <Textarea
                          value={plantHealthRecords.get(plants[currentPlantIndex].id)?.notes || ""}
                          onChange={(e) => updatePlantHealthRecord(plants[currentPlantIndex].id, "notes", e.target.value)}
                          placeholder="Observações gerais..."
                          className="min-h-[80px] border-2 border-input rounded-xl bg-card text-foreground shadow-sm"
                        />
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Photo Section */}
                  <AccordionItem value="photo" className="border border-border rounded-xl bg-card shadow-sm">
                    <AccordionTrigger className="px-4 py-3 hover:no-underline">
                      <div className="flex items-center gap-2">
                        <Camera className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                        <span className="font-semibold">Foto (opcional)</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4 space-y-4">
                      <div className="space-y-3">
                        {plantHealthRecords.get(plants[currentPlantIndex].id)?.photoBase64 ? (
                          <div className="relative">
                            <img
                              src={plantHealthRecords.get(plants[currentPlantIndex].id)?.photoBase64}
                              alt="Preview"
                              className="w-full h-48 object-cover rounded-xl"
                            />
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => updatePlantHealthRecord(plants[currentPlantIndex].id, "photoBase64", undefined)}
                              className="absolute top-2 right-2"
                            >
                              Remover
                            </Button>
                          </div>
                        ) : (
                          <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl cursor-pointer hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-950 transition-colors">
                            <Upload className="h-8 w-8 text-gray-400 mb-2" />
                            <span className="text-sm text-gray-500">Tirar foto ou selecionar</span>
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
                    </AccordionContent>
                  </AccordionItem>

                  {/* Trichomes and LST sections removed - available in individual plant pages */}
                </Accordion>
              </div>
            )}
          </div>
          </div>
        </div>
      </div>

      {/* Progress dots - only show for daily log steps */}
      {currentStep < 9 && (
        <div className="flex justify-center gap-2 py-6">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className={`h-2 rounded-full transition-all duration-300 ${
                index === currentStep
                  ? "w-8 bg-green-500"
                  : index < currentStep
                  ? "w-2 bg-green-300"
                  : "w-2 bg-gray-300"
              }`}
            />
          ))}
        </div>
      )}

      {/* Navigation buttons */}
      <div className="fixed bottom-0 left-0 right-0 p-6 pb-24 md:pb-6 bg-background border-t border-border flex gap-3">
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

        {/* Continue button on summary */}
        {currentStep === 8 && (
          <Button
            onClick={() => {
              triggerHaptic('medium');
              setCurrentStep(9);
            }}
            className="flex-1 h-14 text-lg font-medium rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700"
          >
            <Check className="mr-2 h-5 w-5" />
            Continuar
          </Button>
        )}

        {/* Plant health navigation */}
        {currentStep >= 9 && recordPlantHealth === true && plants[currentPlantIndex] && (
          <>
            <Button
              onClick={handleSkipPlantHealth}
              variant="outline"
              className="flex-1 h-14 text-lg font-medium rounded-xl"
            >
              <SkipForward className="mr-2 h-5 w-5" />
              Pular
            </Button>
            <Button
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
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  Sparkles,
  X,
  ZoomIn,
  Download,
  Camera,
  Image,
  ChevronDown,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";
import {
  processImage,
  blobToBase64,
  formatFileSize,
  isHEIC,
  processImageFile,
} from "@/lib/imageUtils";

interface PlantTrichomesTabProps {
  plantId: number;
}

const STATUS_OPTIONS = [
  {
    value: "CLEAR",
    label: "Transparente",
    emoji: "⚪",
    color: "bg-gray-500/15 text-gray-700 dark:text-gray-300 border-gray-500/30",
    selectedColor: "bg-gray-500/25 border-gray-500 ring-2 ring-gray-500/40",
    barColor: "bg-gray-400",
  },
  {
    value: "CLOUDY",
    label: "Leitoso",
    emoji: "🔵",
    color: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
    selectedColor: "bg-blue-500/25 border-blue-500 ring-2 ring-blue-500/40",
    barColor: "bg-blue-400",
  },
  {
    value: "AMBER",
    label: "Âmbar",
    emoji: "🟠",
    color: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30",
    selectedColor: "bg-orange-500/25 border-orange-500 ring-2 ring-orange-500/40",
    barColor: "bg-orange-400",
  },
  {
    value: "MIXED",
    label: "Misto",
    emoji: "🟣",
    color: "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30",
    selectedColor: "bg-purple-500/25 border-purple-500 ring-2 ring-purple-500/40",
    barColor: "bg-purple-400",
  },
];

export default function PlantTrichomesTab({
  plantId,
}: PlantTrichomesTabProps) {
  const [trichomeStatus, setTrichomeStatus] = useState<
    "CLEAR" | "CLOUDY" | "AMBER" | "MIXED"
  >("CLEAR");
  const [weekNumber, setWeekNumber] = useState("");
  const [clearPercent, setClearPercent] = useState("");
  const [cloudyPercent, setCloudyPercent] = useState("");
  const [amberPercent, setAmberPercent] = useState("");
  const [notes, setNotes] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const { data: plant } = trpc.plants.getById.useQuery({ id: plantId });
  const { data: trichomeLogs, refetch } =
    trpc.plantTrichomes.list.useQuery({ plantId });

  const createTrichomeLog = trpc.plantTrichomes.create.useMutation({
    onSuccess: () => {
      toast.success("Registro de tricomas adicionado!");
      setWeekNumber("");
      setClearPercent("");
      setCloudyPercent("");
      setAmberPercent("");
      setNotes("");
      setPhotoPreview(null);
      setPhotoFile(null);
      setIsFormOpen(false);
      refetch();
    },
    onError: (error) => {
      toast.error(`Erro ao adicionar registro: ${error.message}`);
    },
  });

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    let file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/") && !isHEIC(file)) {
      toast.error("Por favor, selecione apenas imagens");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx 10MB)");
      return;
    }

    try {
      if (isHEIC(file)) {
        toast.info("🔄 Convertendo HEIC para JPEG...");
        file = await processImageFile(file);
        toast.success("✅ Imagem convertida!");
      }

      toast.info("Processando imagem...");

      const processedBlob = await processImage(file, {
        maxWidth: 1080,
        maxHeight: 1440,
        quality: 0.85,
        
        
      });

      const processedFile = new File([processedBlob], file.name, {
        type: "image/jpeg",
      });
      setPhotoFile(processedFile);

      const base64 = await blobToBase64(processedBlob);
      setPhotoPreview(base64);

      const originalSize = formatFileSize(file.size);
      const newSize = formatFileSize(processedFile.size);
      toast.success(`Imagem otimizada: ${originalSize} → ${newSize}`);
    } catch (error) {
      console.error("Erro ao processar imagem:", error);
      toast.error("Erro ao processar imagem");
    }
  };

  const handleSubmit = () => {
    if (!weekNumber) {
      toast.error("Informe a semana do ciclo");
      return;
    }

    if (photoFile) {
      const reader = new FileReader();
      reader.onloadend = () => {
        createTrichomeLog.mutate({
          plantId,
          weekNumber: parseInt(weekNumber),
          trichomeStatus,
          clearPercent: clearPercent ? parseInt(clearPercent) : undefined,
          cloudyPercent: cloudyPercent ? parseInt(cloudyPercent) : undefined,
          amberPercent: amberPercent ? parseInt(amberPercent) : undefined,
          notes: notes || undefined,
          photoBase64: reader.result as string,
        });
      };
      reader.readAsDataURL(photoFile);
    } else {
      createTrichomeLog.mutate({
        plantId,
        weekNumber: parseInt(weekNumber),
        trichomeStatus,
        clearPercent: clearPercent ? parseInt(clearPercent) : undefined,
        cloudyPercent: cloudyPercent ? parseInt(cloudyPercent) : undefined,
        amberPercent: amberPercent ? parseInt(amberPercent) : undefined,
        notes: notes || undefined,
      });
    }
  };

  const getStatusOption = (status: string) =>
    STATUS_OPTIONS.find((s) => s.value === status) || STATUS_OPTIONS[0];

  const getHarvestRecommendation = (
    status: string,
    cloudyPct?: number,
    amberPct?: number
  ) => {
    if (status === "CLEAR") {
      return {
        text: "Ainda cedo - aguarde mais tempo",
        emoji: "⏳",
        color: "text-gray-600 dark:text-gray-400",
        border: "border-gray-400",
      };
    }
    if (status === "CLOUDY" && (cloudyPct || 0) >= 70) {
      return {
        text: "Ponto ideal para efeito cerebral",
        emoji: "🧠",
        color: "text-blue-600 dark:text-blue-400",
        border: "border-blue-500",
      };
    }
    if (status === "AMBER" || (amberPct || 0) >= 30) {
      return {
        text: "Ponto ideal para efeito corporal",
        emoji: "💪",
        color: "text-orange-600 dark:text-orange-400",
        border: "border-orange-500",
      };
    }
    if (status === "MIXED") {
      return {
        text: "Efeito balanceado - colha quando preferir",
        emoji: "⚖️",
        color: "text-purple-600 dark:text-purple-400",
        border: "border-purple-500",
      };
    }
    return {
      text: "Continue monitorando",
      emoji: "🔍",
      color: "text-muted-foreground",
      border: "border-muted",
    };
  };

  return (
    <div className="space-y-6 pb-24">
      {/* Current Week Info */}
      {plant && (
        <div className="flex items-center gap-2 text-sm px-1">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <span className="text-muted-foreground">
            Germinada há{" "}
            <span className="font-semibold text-foreground">
              {Math.floor(
                (Date.now() - new Date(plant.createdAt).getTime()) /
                  (1000 * 60 * 60 * 24)
              )}{" "}
              dias
            </span>
          </span>
        </div>
      )}

      {/* Collapsible Form */}
      <Collapsible open={isFormOpen} onOpenChange={setIsFormOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between p-4 bg-card border rounded-lg hover:bg-accent/50 transition-colors">
            <span className="flex items-center gap-2 font-medium text-sm">
              <Plus className="w-4 h-4" />
              Registrar Tricomas
            </span>
            <ChevronDown
              className={`w-4 h-4 transition-transform duration-200 ${isFormOpen ? "rotate-180" : ""}`}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Card className="border-t-0 rounded-t-none -mt-[1px]">
            <CardContent className="pt-4 space-y-4">
              {/* Week + Status in one row */}
              <div className="flex gap-3 items-end">
                <div className="space-y-1.5 w-24">
                  <Label className="text-sm">Semana *</Label>
                  <Input
                    type="number"
                    min="1"
                    placeholder="Ex: 8"
                    value={weekNumber}
                    onChange={(e) => setWeekNumber(e.target.value)}
                  />
                </div>
                <div className="flex-1 space-y-1.5">
                  <Label className="text-sm">Status</Label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {STATUS_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          setTrichomeStatus(option.value as any)
                        }
                        className={`flex items-center justify-center gap-1 px-2 py-2 border rounded-lg text-xs font-medium transition-all duration-200 ${
                          trichomeStatus === option.value
                            ? option.selectedColor
                            : `${option.color} hover:scale-[1.02]`
                        }`}
                      >
                        <span>{option.emoji}</span>
                        <span className="hidden sm:inline">
                          {option.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Percentages - Compact */}
              <div className="space-y-1.5">
                <Label className="text-sm">Proporção (%)</Label>
                <div className="grid grid-cols-3 gap-2">
                  <div className="relative">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      placeholder="Transp."
                      value={clearPercent}
                      onChange={(e) => setClearPercent(e.target.value)}
                      className="text-sm pr-6"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      ⚪
                    </span>
                  </div>
                  <div className="relative">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      placeholder="Leitoso"
                      value={cloudyPercent}
                      onChange={(e) => setCloudyPercent(e.target.value)}
                      className="text-sm pr-6"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      🔵
                    </span>
                  </div>
                  <div className="relative">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      placeholder="Âmbar"
                      value={amberPercent}
                      onChange={(e) => setAmberPercent(e.target.value)}
                      className="text-sm pr-6"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      🟠
                    </span>
                  </div>
                </div>
              </div>

              {/* Photo Upload - Compact */}
              <div className="space-y-2">
                <Label className="text-sm">Foto Macro</Label>
                {!photoPreview ? (
                  <div className="flex gap-2">
                    <label className="flex-1 flex items-center justify-center gap-2 h-12 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors bg-primary/5 border-primary/30">
                      <Camera className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium text-primary">
                        Câmera
                      </span>
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*,image/jpeg,image/jpg,image/png,image/heic,image/heif"
                        capture="environment"
                        onChange={handlePhotoSelect}
                      />
                    </label>
                    <label className="flex-1 flex items-center justify-center gap-2 h-12 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                      <Image className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        Galeria
                      </span>
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*,image/jpeg,image/jpg,image/png,image/heic,image/heif"
                        onChange={handlePhotoSelect}
                      />
                    </label>
                  </div>
                ) : (
                  <div className="relative inline-block">
                    <img
                      src={photoPreview}
                      alt="Preview"
                      className="w-24 h-32 object-cover rounded-lg border"
                    />
                    <button
                      type="button"
                      className="absolute -top-2 -right-2 w-6 h-6 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform"
                      onClick={() => {
                        setPhotoPreview(null);
                        setPhotoFile(null);
                      }}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="trichome-notes" className="text-sm">
                  Notas
                </Label>
                <Textarea
                  id="trichome-notes"
                  placeholder="Observações sobre a maturação..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="resize-none text-sm"
                />
              </div>

              <Button
                onClick={handleSubmit}
                disabled={createTrichomeLog.isPending}
                className="w-full sm:w-auto"
              >
                {createTrichomeLog.isPending ? "Salvando..." : "Registrar"}
              </Button>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* Trichome Logs Timeline */}
      <div className="space-y-3">
        <h3 className="text-base font-semibold flex items-center gap-2">
          <Sparkles className="w-4 h-4" />
          Histórico de Tricomas
          {trichomeLogs && trichomeLogs.length > 0 && (
            <span className="text-xs text-muted-foreground font-normal">
              ({trichomeLogs.length} registro
              {trichomeLogs.length !== 1 ? "s" : ""})
            </span>
          )}
        </h3>
        {trichomeLogs && trichomeLogs.length > 0 ? (
          <div className="space-y-2">
            {trichomeLogs.map((log: any) => {
              const status = getStatusOption(log.trichomeStatus);
              const recommendation = getHarvestRecommendation(
                log.trichomeStatus,
                log.cloudyPercent || undefined,
                log.amberPercent || undefined
              );
              const hasPercentages =
                log.clearPercent !== null ||
                log.cloudyPercent !== null ||
                log.amberPercent !== null;

              return (
                <div
                  key={log.id}
                  className="border rounded-lg bg-card overflow-hidden"
                >
                  {/* Main Row */}
                  <div className="px-4 py-3 space-y-3">
                    <div className="flex items-center gap-3">
                      {/* Photo Thumbnail */}
                      {log.photoUrl ? (
                        <div
                          className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 cursor-pointer ring-1 ring-border hover:ring-2 hover:ring-primary/50 transition-all"
                          onClick={() => setLightboxPhoto(log.photoUrl)}
                        >
                          <img
                            src={log.photoUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-muted/50 flex items-center justify-center flex-shrink-0">
                          <Sparkles className="w-5 h-5 text-muted-foreground/40" />
                        </div>
                      )}

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium border ${status.color}`}
                          >
                            {status.emoji} {status.label}
                          </span>
                          {log.weekNumber && (
                            <span className="text-xs font-medium text-foreground bg-muted px-2 py-0.5 rounded-full">
                              Sem. {log.weekNumber}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {new Date(log.logDate).toLocaleString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        {/* Recommendation inline */}
                        <p
                          className={`text-xs mt-1 ${recommendation.color}`}
                        >
                          {recommendation.emoji} {recommendation.text}
                        </p>
                      </div>
                    </div>

                    {/* Percentage Bar - Compact Visual */}
                    {hasPercentages && (
                      <div className="space-y-1.5">
                        <div className="flex h-3 rounded-full overflow-hidden bg-muted/50">
                          {log.clearPercent !== null &&
                            log.clearPercent > 0 && (
                              <div
                                className="bg-gray-400 transition-all"
                                style={{
                                  width: `${log.clearPercent}%`,
                                }}
                              />
                            )}
                          {log.cloudyPercent !== null &&
                            log.cloudyPercent > 0 && (
                              <div
                                className="bg-blue-400 transition-all"
                                style={{
                                  width: `${log.cloudyPercent}%`,
                                }}
                              />
                            )}
                          {log.amberPercent !== null &&
                            log.amberPercent > 0 && (
                              <div
                                className="bg-orange-400 transition-all"
                                style={{
                                  width: `${log.amberPercent}%`,
                                }}
                              />
                            )}
                        </div>
                        <div className="flex justify-between text-xs sm:text-[10px] text-foreground sm:text-muted-foreground font-medium sm:font-normal">
                          {log.clearPercent !== null && (
                            <span>⚪ {log.clearPercent}%</span>
                          )}
                          {log.cloudyPercent !== null && (
                            <span>🔵 {log.cloudyPercent}%</span>
                          )}
                          {log.amberPercent !== null && (
                            <span>🟠 {log.amberPercent}%</span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Notes */}
                    {log.notes && (
                      <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
                        {log.notes}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="py-8 text-center">
              <Sparkles className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                Nenhum registro de tricomas ainda
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Clique em "Registrar Tricomas" para acompanhar a maturação
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Lightbox */}
      {lightboxPhoto && (
        <div
          className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4"
          onClick={() => setLightboxPhoto(null)}
        >
          <div className="relative max-w-5xl w-full h-full flex flex-col items-center justify-center">
            <img
              src={lightboxPhoto}
              alt="Foto ampliada"
              className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
            <div className="absolute top-4 right-4 flex gap-2">
              <Button
                size="icon"
                variant="secondary"
                className="bg-white/10 hover:bg-white/20 backdrop-blur-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  try {
                    const a = document.createElement("a");
                    a.href = lightboxPhoto;
                    a.download = `planta-${plantId}-tricomas-${Date.now()}.jpg`;
                    a.target = "_blank";
                    a.rel = "noopener noreferrer";
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    toast.success("Foto baixada!");
                  } catch {
                    toast.error("Erro ao baixar foto");
                  }
                }}
              >
                <Download className="w-4 h-4 text-white" />
              </Button>
              <Button
                size="icon"
                variant="destructive"
                className="bg-red-500/80 hover:bg-red-500"
                onClick={() => setLightboxPhoto(null)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

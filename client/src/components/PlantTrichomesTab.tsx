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
  ChevronLeft,
  ChevronRight,
  Calendar,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { uploadImage } from "@/lib/uploadImage";
import { TrichomesTabSkeleton } from "@/components/TabSkeletons";
import { LazyImage } from "@/components/LazyImage";

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
  const [photoUploadedUrl, setPhotoUploadedUrl] = useState<string | null>(null); // URL S3 após upload
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number>(0);
  const [isFormOpen, setIsFormOpen] = useState(false);
  
  // Swipe gesture states
  const [touchStart, setTouchStart] = useState<number>(0);
  const [touchEnd, setTouchEnd] = useState<number>(0);
  const [swipeOffset, setSwipeOffset] = useState<number>(0);
  const [isSwiping, setIsSwiping] = useState<boolean>(false);

  const { data: plant } = trpc.plants.getById.useQuery({ id: plantId });
  const { data: trichomeLogs, refetch, isLoading } =
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
      setPhotoUploadedUrl(null);
      setIsFormOpen(false);
      refetch();
    },
    onError: (error) => {
      toast.error(`Erro ao adicionar registro: ${error.message}`);
    },
  });

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Aceitar qualquer imagem (incluindo HEIC sem mime type no iOS Safari)
    const isImage = file.type.startsWith("image/") || file.type === "" || file.name.match(/\.(jpg|jpeg|png|gif|webp|heic|heif|bmp|tiff)$/i);
    if (!isImage) {
      toast.error("Por favor, selecione apenas imagens");
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx 20MB)");
      return;
    }

    // Preview local imediato
    const previewUrl = URL.createObjectURL(file);
    setPhotoPreview(previewUrl);
    setPhotoUploadedUrl(null);

    try {
      setIsUploadingPhoto(true);
      toast.info("📸 Enviando foto...");

      const url = await uploadImage(file);

      setPhotoUploadedUrl(url);
      setIsUploadingPhoto(false);
      toast.success("📸 Foto enviada com sucesso!");
    } catch (error: any) {
      console.error("[PlantTrichomesTab] Erro ao enviar imagem:", error);
      setPhotoPreview(null);
      setPhotoUploadedUrl(null);
      setIsUploadingPhoto(false);
      toast.error(error?.message || "Erro ao enviar imagem. Tente novamente.");
    }
  };

  const handleSubmit = () => {
    if (!weekNumber) {
      toast.error("Informe a semana do ciclo");
      return;
    }

    if (isUploadingPhoto) {
      toast.error("Aguarde o envio da foto terminar.");
      return;
    }

    // Foto já foi enviada ao S3 via /api/upload/image — apenas passa a URL
    createTrichomeLog.mutate({
      plantId,
      weekNumber: parseInt(weekNumber),
      trichomeStatus,
      clearPercent: clearPercent ? parseInt(clearPercent) : undefined,
      cloudyPercent: cloudyPercent ? parseInt(cloudyPercent) : undefined,
      amberPercent: amberPercent ? parseInt(amberPercent) : undefined,
      notes: notes || undefined,
      photoUrl: photoUploadedUrl || undefined,
    });
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
                    type="text"
                    inputMode="numeric"
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
                      type="text"
                      inputMode="numeric"
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
                      type="text"
                      inputMode="numeric"
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
                      type="text"
                      inputMode="numeric"
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
                {isUploadingPhoto ? (
                  <div className="flex items-center justify-center gap-3 h-12 border-2 border-dashed border-green-400 dark:border-green-600 rounded-lg bg-green-50 dark:bg-green-950">
                    <Loader2 className="w-4 h-4 text-green-500 animate-spin" />
                    <span className="text-sm text-green-600 dark:text-green-400 font-medium">Enviando foto...</span>
                  </div>
                ) : !photoPreview ? (
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
                        setPhotoUploadedUrl(null);
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
                disabled={createTrichomeLog.isPending || isUploadingPhoto}
                className="w-full sm:w-auto"
              >
                {isUploadingPhoto ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Aguardando foto...</>
                ) : createTrichomeLog.isPending ? "Salvando..." : "Registrar"}
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
        {isLoading ? (
          <TrichomesTabSkeleton />
        ) : trichomeLogs && trichomeLogs.length > 0 ? (
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
                          className="cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0"
                          onClick={() => {
                            const photoLogs = trichomeLogs?.filter((l: any) => l.photoUrl) || [];
                            const index = photoLogs.findIndex((l: any) => l.id === log.id);
                            setLightboxIndex(index);
                            setLightboxPhoto(log.photoUrl);
                          }}
                        >
                          <LazyImage
                            src={log.photoUrl}
                            alt="Trichome inspection photo"
                            aspectRatio="1/1"
                            className="w-12 h-12 rounded-lg"
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
      {lightboxPhoto &&
        (() => {
          const photoLogs =
            trichomeLogs?.filter((l: any) => l.photoUrl) || [];
          const currentLog = photoLogs[lightboxIndex];
          const totalPhotos = photoLogs.length;

          const handlePrevious = (e: React.MouseEvent) => {
            e.stopPropagation();
            if (lightboxIndex > 0) {
              setLightboxIndex(lightboxIndex - 1);
              setLightboxPhoto(photoLogs[lightboxIndex - 1].photoUrl!);
            }
          };

          const handleNext = (e: React.MouseEvent) => {
            e.stopPropagation();
            if (lightboxIndex < totalPhotos - 1) {
              setLightboxIndex(lightboxIndex + 1);
              setLightboxPhoto(photoLogs[lightboxIndex + 1].photoUrl!);
            }
          };

          const handleDownload = (e: React.MouseEvent) => {
            e.stopPropagation();
            try {
              const a = document.createElement("a");
              a.href = lightboxPhoto;
              a.download = `planta-${plantId}-tricomas-${currentLog?.id || Date.now()}.jpg`;
              a.target = "_blank";
              a.rel = "noopener noreferrer";
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              toast.success("Foto baixada!");
            } catch (error) {
              toast.error("Erro ao baixar foto");
            }
          };

          const handleTouchStart = (e: React.TouchEvent) => {
            setTouchStart(e.targetTouches[0].clientX);
            setTouchEnd(e.targetTouches[0].clientX);
            setIsSwiping(true);
          };

          const handleTouchMove = (e: React.TouchEvent) => {
            if (!isSwiping) return;
            const currentTouch = e.targetTouches[0].clientX;
            setTouchEnd(currentTouch);
            const offset = currentTouch - touchStart;
            setSwipeOffset(offset);
          };

          const handleTouchEnd = () => {
            if (!isSwiping) return;
            setIsSwiping(false);
            const swipeDistance = touchEnd - touchStart;
            const minSwipeDistance = 50;
            if (Math.abs(swipeDistance) > minSwipeDistance) {
              if (swipeDistance > 0 && lightboxIndex > 0) {
                setLightboxIndex(lightboxIndex - 1);
                setLightboxPhoto(photoLogs[lightboxIndex - 1].photoUrl!);
              } else if (swipeDistance < 0 && lightboxIndex < totalPhotos - 1) {
                setLightboxIndex(lightboxIndex + 1);
                setLightboxPhoto(photoLogs[lightboxIndex + 1].photoUrl!);
              }
            }
            setSwipeOffset(0);
            setTouchStart(0);
            setTouchEnd(0);
          };

          return (
            <div
              className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4"
              onClick={() => setLightboxPhoto(null)}
            >
              <div className="relative max-w-5xl w-full h-full flex flex-col items-center justify-center">
                <div
                  className="relative w-full flex items-center justify-center"
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                  style={{
                    transform: isSwiping ? `translateX(${swipeOffset}px)` : 'translateX(0)',
                    transition: isSwiping ? 'none' : 'transform 0.3s ease-out',
                  }}
                >
                  <img
                    src={lightboxPhoto}
                    alt="Foto ampliada"
                    className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>

                <div
                  className="mt-4 text-center text-white"
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="text-sm opacity-80">
                    {new Date(
                      currentLog?.logDate || Date.now()
                    ).toLocaleString("pt-BR")}
                  </p>
                  <p className="text-xs opacity-60 mt-1">
                    Foto {lightboxIndex + 1} de {totalPhotos}
                  </p>
                </div>

                <div className="absolute top-4 right-4 flex gap-2">
                  <Button
                    size="icon"
                    variant="secondary"
                    className="bg-white/10 hover:bg-white/20 backdrop-blur-sm"
                    onClick={handleDownload}
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

                {totalPhotos > 1 && (
                  <>
                    {lightboxIndex > 0 && (
                      <Button
                        size="icon"
                        variant="secondary"
                        className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 backdrop-blur-sm"
                        onClick={handlePrevious}
                      >
                        <ChevronLeft className="w-6 h-6 text-white" />
                      </Button>
                    )}
                    {lightboxIndex < totalPhotos - 1 && (
                      <Button
                        size="icon"
                        variant="secondary"
                        className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 backdrop-blur-sm"
                        onClick={handleNext}
                      >
                        <ChevronRight className="w-6 h-6 text-white" />
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })()}
    </div>
  );
}

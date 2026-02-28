import { useState } from "react";
import { PhotoUploadProgress, type UploadStage } from "@/components/PhotoUploadProgress";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  Heart,
  X,
  ZoomIn,
  Download,
  ChevronLeft,
  ChevronRight,
  Edit,
  Trash2,
  Camera,
  Image,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import {
  prepareImageForUpload,
  formatFileSize,
} from "@/lib/imageUtils";
import EditHealthLogDialog from "@/components/EditHealthLogDialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";
import UploadProgress from "@/components/UploadProgress";
import { HealthTabSkeleton } from "@/components/TabSkeletons";
import { LazyImage } from "@/components/LazyImage";

interface PlantHealthTabProps {
  plantId: number;
}

const STATUS_OPTIONS = [
  {
    value: "HEALTHY",
    label: "Saudável",
    emoji: "🟢",
    color: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30",
    selectedColor: "bg-green-500/25 border-green-500 ring-2 ring-green-500/40",
  },
  {
    value: "STRESSED",
    label: "Estressada",
    emoji: "🟡",
    color: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
    selectedColor: "bg-yellow-500/25 border-yellow-500 ring-2 ring-yellow-500/40",
  },
  {
    value: "SICK",
    label: "Doente",
    emoji: "🔴",
    color: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
    selectedColor: "bg-red-500/25 border-red-500 ring-2 ring-red-500/40",
  },
  {
    value: "RECOVERING",
    label: "Recuperando",
    emoji: "🟣",
    color: "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30",
    selectedColor: "bg-purple-500/25 border-purple-500 ring-2 ring-purple-500/40",
  },
];

export default function PlantHealthTab({ plantId }: PlantHealthTabProps) {
  const [healthStatus, setHealthStatus] = useState<
    "HEALTHY" | "STRESSED" | "SICK" | "RECOVERING"
  >("HEALTHY");
  const [symptoms, setSymptoms] = useState("");
  const [treatment, setTreatment] = useState("");
  const [notes, setNotes] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number>(0);
  const [editingLog, setEditingLog] = useState<any | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "processing" | "uploading" | "success" | "error">("idle");
  const [uploadMessage, setUploadMessage] = useState<string>("");
  
  // Photo upload progress state
  const [uploadProgress, setUploadProgress] = useState<{
    isUploading: boolean;
    stage: UploadStage;
    progress: number;
    originalSize?: string;
    compressedSize?: string;
    reduction?: number;
  }>({ isUploading: false, stage: "converting", progress: 0 });
  
  const [deleteHealthLogConfirm, setDeleteHealthLogConfirm] = useState<{ open: boolean; id: number | null }>({
    open: false, id: null
  });

  // Swipe gesture states
  const [touchStart, setTouchStart] = useState<number>(0);
  const [touchEnd, setTouchEnd] = useState<number>(0);
  const [swipeOffset, setSwipeOffset] = useState<number>(0);
  const [isSwiping, setIsSwiping] = useState<boolean>(false);

  const { data: healthLogs, refetch, isLoading } = trpc.plantHealth.list.useQuery({
    plantId,
  });

  const utils = trpc.useUtils();

  const createHealthLog = trpc.plantHealth.create.useMutation({
    onSuccess: () => {
      console.log('[PlantHealthTab] Health log created successfully');
      toast.success("Registro de saúde adicionado!");
      setSymptoms("");
      setTreatment("");
      setNotes("");
      setPhotoPreview(null);
      setPhotoFile(null);
      setIsFormOpen(false);
      setUploadStatus("idle");
      setUploadMessage("");
      refetch();
      utils.plants.list.invalidate();
      utils.plants.getById.invalidate({ id: plantId });
    },
    onError: (error) => {
      console.error('[PlantHealthTab] Failed to create health log:', error);
      setUploadStatus("error");
      setUploadMessage("Erro ao salvar foto");
      toast.error(`Erro: ${error.message}`);
      setTimeout(() => setUploadStatus("idle"), 3000);
    },
  });

  const updateHealthLog = trpc.plantHealth.update.useMutation({
    onSuccess: () => {
      toast.success("Registro atualizado!");
      utils.plants.list.invalidate();
      utils.plants.getById.invalidate({ id: plantId });
      setIsEditModalOpen(false);
      setEditingLog(null);
      refetch();
    },
    onError: (error) => {
      toast.error(`Erro ao atualizar: ${error.message}`);
    },
  });

  const handleEditSave = (data: any) => {
    updateHealthLog.mutate(data);
  };

  const deleteHealthLog = trpc.plantHealth.delete.useMutation({
    onSuccess: () => {
      toast.success("Registro excluído!");
      refetch();
    },
    onError: (error) => {
      toast.error(`Erro ao excluir: ${error.message}`);
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

    try {
      setUploadProgress({
        isUploading: true,
        stage: "converting",
        progress: 20,
        originalSize: formatFileSize(file.size),
      });
      setUploadStatus("processing");
      setUploadMessage("Processando imagem...");

      setUploadProgress(prev => ({ ...prev, stage: "compressing", progress: 50 }));

      // Pipeline completo: HEIC → JPEG + compressão + base64
      const result = await prepareImageForUpload(file, {
        maxWidth: 1920,
        maxHeight: 1920,
        quality: 0.82,
      });

      console.log('[PlantHealthTab] Photo processed:', {
        originalSize: result.originalSize,
        compressedSize: result.compressedSize,
        reduction: `${result.reduction}%`,
        mimeType: result.mimeType,
      });

      setUploadProgress(prev => ({
        ...prev,
        stage: "uploading",
        progress: 80,
        compressedSize: result.compressedSize,
        reduction: result.reduction,
      }));

      // Criar File para manter compatibilidade com handleSubmit
      const processedFile = new File(
        [result.blob],
        file.name.replace(/\.(heic|heif)$/i, '.jpg'),
        { type: result.mimeType }
      );
      setPhotoFile(processedFile);
      setPhotoPreview(result.base64);

      setUploadProgress(prev => ({ ...prev, stage: "complete", progress: 100 }));
      setUploadStatus("success");
      setUploadMessage(`Imagem pronta: ${result.originalSize} → ${result.compressedSize}`);

      setTimeout(() => {
        setUploadProgress({ isUploading: false, stage: "converting", progress: 0 });
        toast.success(`📸 Foto pronta! (${result.originalSize} → ${result.compressedSize}${result.reduction > 0 ? `, -${result.reduction}%` : ""})`);
        setUploadStatus("idle");
      }, 1500);
    } catch (error: any) {
      console.error("[PlantHealthTab] Erro ao processar imagem:", error);
      setUploadProgress({ isUploading: false, stage: "converting", progress: 0 });
      setUploadStatus("error");
      setUploadMessage("Erro ao processar imagem");
      toast.error(error?.message || "Erro ao processar imagem. Tente novamente.");
      setTimeout(() => setUploadStatus("idle"), 3000);
    }
  };

  const handleSubmit = () => {
    console.log('[PlantHealthTab] handleSubmit called:', {
      hasPhoto: !!photoFile,
      photoName: photoFile?.name,
      photoSize: photoFile?.size,
      hasSymptoms: !!symptoms,
      hasTreatment: !!treatment,
      hasNotes: !!notes
    });
    
    if (!photoFile && !symptoms && !treatment && !notes) {
      toast.error("Adicione pelo menos uma foto ou informa\u00e7\u00e3o");
      return;
    }

    if (photoFile) {
      console.log('[PlantHealthTab] Reading photo file...');
      setUploadStatus("uploading");
      setUploadMessage("Enviando foto para CDN...");
      const reader = new FileReader();
      reader.onloadend = () => {
        createHealthLog.mutate({
          plantId,
          healthStatus,
          symptoms: symptoms || undefined,
          treatment: treatment || undefined,
          notes: notes || undefined,
          photoBase64: reader.result as string,
        });
      };
      reader.readAsDataURL(photoFile);
    } else {
      createHealthLog.mutate({
        plantId,
        healthStatus,
        symptoms: symptoms || undefined,
        treatment: treatment || undefined,
        notes: notes || undefined,
      });
    }
  };

  const getStatusOption = (status: string) =>
    STATUS_OPTIONS.find((s) => s.value === status) || STATUS_OPTIONS[0];

  return (
    <div className="space-y-6 pb-24">
      {/* Collapsible Form */}
      <Collapsible open={isFormOpen} onOpenChange={setIsFormOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between p-4 bg-card border rounded-lg hover:bg-accent/50 transition-colors">
            <span className="flex items-center gap-2 font-medium text-sm">
              <Plus className="w-4 h-4" />
              Registrar Saúde
            </span>
            <ChevronDown
              className={`w-4 h-4 transition-transform duration-200 ${isFormOpen ? "rotate-180" : ""}`}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Card className="border-t-0 rounded-t-none -mt-[1px]">
            <CardContent className="pt-4 space-y-4">
              {/* Status Selector - Compact Buttons */}
              <div className="space-y-2">
                <Label className="text-sm">Status de Saúde</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {STATUS_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setHealthStatus(option.value as any)}
                      className={`flex items-center justify-center gap-1.5 px-3 py-2.5 border rounded-lg text-sm font-medium transition-all duration-200 ${
                        healthStatus === option.value
                          ? option.selectedColor
                          : `${option.color} hover:scale-[1.02]`
                      }`}
                    >
                      <span>{option.emoji}</span>
                      <span>{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Photo Upload - Compact */}
              <div className="space-y-2">
                <Label className="text-sm">Foto da Planta</Label>
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

              {/* Upload Progress Indicator */}
              <UploadProgress
                status={uploadStatus}
                message={uploadMessage}
              />

              {/* Text Fields - More Compact */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="symptoms" className="text-sm">
                    Sintomas
                  </Label>
                  <Textarea
                    id="symptoms"
                    placeholder="Deficiências, pragas, manchas..."
                    value={symptoms}
                    onChange={(e) => setSymptoms(e.target.value)}
                    rows={2}
                    className="resize-none text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="treatment" className="text-sm">
                    Tratamento
                  </Label>
                  <Textarea
                    id="treatment"
                    placeholder="Ações tomadas, produtos..."
                    value={treatment}
                    onChange={(e) => setTreatment(e.target.value)}
                    rows={2}
                    className="resize-none text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="notes" className="text-sm">
                  Notas
                </Label>
                <Textarea
                  id="notes"
                  placeholder="Observações gerais..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="resize-none text-sm"
                />
              </div>

              <Button
                onClick={handleSubmit}
                disabled={createHealthLog.isPending}
                className="w-full sm:w-auto"
              >
                {createHealthLog.isPending ? "Salvando..." : "Registrar"}
              </Button>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* Health Logs Timeline */}
      <div className="space-y-3">
        <h3 className="text-base font-semibold flex items-center gap-2">
          <Heart className="w-4 h-4" />
          Histórico de Saúde
          {healthLogs && healthLogs.length > 0 && (
            <span className="text-xs text-muted-foreground font-normal">
              ({healthLogs.length} registro{healthLogs.length !== 1 ? "s" : ""})
            </span>
          )}
        </h3>
        {isLoading ? (
          <HealthTabSkeleton />
        ) : healthLogs && healthLogs.length > 0 ? (
          <div className="space-y-2">
            {healthLogs.map((log: any) => {
              const status = getStatusOption(log.healthStatus);
              const hasDetails = log.symptoms || log.treatment || log.notes;
              return (
                <div
                  key={log.id}
                  className="border rounded-lg bg-card overflow-hidden"
                >
                  {/* Main Row - Always Visible */}
                  <Accordion type="single" collapsible>
                    <AccordionItem value={`log-${log.id}`} className="border-0">
                      <div className="flex items-center gap-3 px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        {/* Photo Thumbnail */}
                        {log.photoUrl ? (
                          <div
                            className="flex-shrink-0 cursor-pointer ring-1 ring-border hover:ring-2 hover:ring-primary/50 transition-all rounded-lg"
                            onClick={() => {
                              const photoLogs =
                                healthLogs?.filter(
                                  (l: any) => l.photoUrl
                                ) || [];
                              const index = photoLogs.findIndex(
                                (l: any) => l.id === log.id
                              );
                              setLightboxIndex(index);
                              setLightboxPhoto(log.photoUrl);
                            }}
                          >
                            <LazyImage
                              src={log.photoUrl}
                              alt="Plant health photo"
                              aspectRatio="1/1"
                              className="w-12 h-12 rounded-lg"
                            />
                          </div>
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-muted/50 flex items-center justify-center flex-shrink-0">
                            <Heart className="w-5 h-5 text-muted-foreground/40" />
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
                            <span className="text-xs text-muted-foreground">
                              {new Date(log.logDate).toLocaleString("pt-BR", {
                                day: "2-digit",
                                month: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          {log.symptoms && (
                            <p className="text-xs text-muted-foreground mt-1 truncate">
                              {log.symptoms}
                            </p>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <div
                            role="button"
                            tabIndex={0}
                            className="p-1.5 rounded-md hover:bg-muted transition-colors cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingLog(log);
                              setIsEditModalOpen(true);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setEditingLog(log);
                                setIsEditModalOpen(true);
                              }
                            }}
                          >
                            <Edit className="w-3.5 h-3.5 text-muted-foreground" />
                          </div>
                          <div
                            role="button"
                            tabIndex={0}
                            className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors cursor-pointer"
                            onClick={() => setDeleteHealthLogConfirm({ open: true, id: log.id })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setDeleteHealthLogConfirm({ open: true, id: log.id });
                              }
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-500" />
                          </div>
                          {(hasDetails || log.photoUrl) && (
                            <AccordionTrigger className="p-1.5 hover:no-underline [&>svg]:w-3.5 [&>svg]:h-3.5" />
                          )}
                        </div>
                      </div>

                      {/* Expandable Details */}
                      {(hasDetails || log.photoUrl) && (
                        <AccordionContent>
                          <div className="px-4 pb-4 pt-1 border-t">
                            <div className="flex flex-col md:flex-row gap-4 pt-3">
                              {/* Text Details */}
                              {hasDetails && (
                                <div className="flex-1 space-y-2.5">
                                  {log.symptoms && (
                                    <div className="bg-muted/40 rounded-lg p-3">
                                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                                        Sintomas
                                      </p>
                                      <p className="text-sm">{log.symptoms}</p>
                                    </div>
                                  )}
                                  {log.treatment && (
                                    <div className="bg-muted/40 rounded-lg p-3">
                                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                                        Tratamento
                                      </p>
                                      <p className="text-sm">
                                        {log.treatment}
                                      </p>
                                    </div>
                                  )}
                                  {log.notes && (
                                    <div className="bg-muted/40 rounded-lg p-3">
                                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                                        Notas
                                      </p>
                                      <p className="text-sm">{log.notes}</p>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Photo */}
                              {log.photoUrl && (
                                <div className="md:w-48 flex-shrink-0">
                                  <div
                                    className="relative group aspect-[3/4] w-full cursor-pointer rounded-lg overflow-hidden"
                                    onClick={() => {
                                      const photoLogs =
                                        healthLogs?.filter(
                                          (l: any) => l.photoUrl
                                        ) || [];
                                      const index = photoLogs.findIndex(
                                        (l: any) => l.id === log.id
                                      );
                                      setLightboxIndex(index);
                                      setLightboxPhoto(log.photoUrl);
                                    }}
                                  >
                                    <img
                                      src={log.photoUrl}
                                      alt="Foto da planta"
                                      className="w-full h-full object-cover"
                                    />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                      <ZoomIn className="w-6 h-6 text-white" />
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </AccordionContent>
                      )}
                    </AccordionItem>
                  </Accordion>
                </div>
              );
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="py-8 text-center">
              <Heart className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                Nenhum registro de saúde ainda
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Clique em "Registrar Saúde" para adicionar o primeiro registro
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Lightbox */}
      {lightboxPhoto &&
        (() => {
          const photoLogs =
            healthLogs?.filter((l: any) => l.photoUrl) || [];
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
              a.download = `planta-${plantId}-saude-${currentLog?.id || Date.now()}.jpg`;
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

      {/* Edit Modal */}
      <EditHealthLogDialog
        open={isEditModalOpen}
        onOpenChange={setIsEditModalOpen}
        healthLog={editingLog}
        onSave={handleEditSave}
        isSaving={updateHealthLog.isPending}
      />

      {/* Delete Health Log Confirm Dialog */}
      <Dialog open={deleteHealthLogConfirm.open} onOpenChange={(open) => !open && setDeleteHealthLogConfirm({ open: false, id: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Excluir Registro de Saúde
            </DialogTitle>
            <DialogDescription>
              Deseja realmente excluir este registro de saúde? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteHealthLogConfirm({ open: false, id: null })}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteHealthLogConfirm.id) {
                  deleteHealthLog.mutate({ id: deleteHealthLogConfirm.id });
                  setDeleteHealthLogConfirm({ open: false, id: null });
                }
              }}
              disabled={deleteHealthLog.isPending}
            >
              <AlertTriangle className="w-4 h-4 mr-2" />
              Excluir Registro
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
  );
}

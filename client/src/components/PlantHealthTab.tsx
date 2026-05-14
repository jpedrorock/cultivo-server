import { useState, useEffect } from "react";
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
  Edit,
  Trash2,
  Camera,
  Image,
  ChevronDown,
  Loader2,
  Bot,
} from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { uploadImage } from "@/lib/uploadImage";
import EditHealthLogDialog from "@/components/EditHealthLogDialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";
import UploadProgress from "@/components/UploadProgress";
import { HealthTabSkeleton } from "@/components/TabSkeletons";

interface PlantHealthTabProps {
  plantId: number;
}

const STATUS_OPTIONS = [
  {
    value: "HEALTHY",
    label: "Saudável",
    dot: "bg-green-500",
    color: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30",
    selectedColor: "bg-green-500/25 border-green-500 ring-2 ring-green-500/40",
  },
  {
    value: "STRESSED",
    label: "Estressada",
    dot: "bg-yellow-400",
    color: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
    selectedColor: "bg-yellow-500/25 border-yellow-500 ring-2 ring-yellow-500/40",
  },
  {
    value: "SICK",
    label: "Doente",
    dot: "bg-red-500",
    color: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
    selectedColor: "bg-red-500/25 border-red-500 ring-2 ring-red-500/40",
  },
  {
    value: "RECOVERING",
    label: "Recuperando",
    dot: "bg-purple-500",
    color: "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30",
    selectedColor: "bg-purple-500/25 border-purple-500 ring-2 ring-purple-500/40",
  },
];

export default function PlantHealthTab({ plantId }: PlantHealthTabProps) {
  const [, navigate] = useLocation();
  const [healthStatus, setHealthStatus] = useState<
    "HEALTHY" | "STRESSED" | "SICK" | "RECOVERING"
  >("HEALTHY");
  const [symptoms, setSymptoms] = useState("");
  const [treatment, setTreatment] = useState("");
  const [notes, setNotes] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoUploadedUrl, setPhotoUploadedUrl] = useState<string | null>(null);
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

  const { data: healthLogs, refetch, isLoading } = trpc.plantHealth.list.useQuery({
    plantId,
  });

  const utils = trpc.useUtils();

  // Sync healthStatus from the most recent log when form is closed
  useEffect(() => {
    if (healthLogs && healthLogs.length > 0 && !isFormOpen) {
      setHealthStatus(healthLogs[0].healthStatus as "HEALTHY" | "STRESSED" | "SICK" | "RECOVERING");
    }
  }, [healthLogs, isFormOpen]);

  const createHealthLog = trpc.plantHealth.create.useMutation({
    onSuccess: (_, vars) => {
      const isCritical = vars.healthStatus === "SICK" || vars.healthStatus === "STRESSED";
      if (isCritical) {
        toast("Registro de saúde salvo", {
          description: "A IA pode ajudar a diagnosticar o problema.",
          action: {
            label: "Diagnosticar com IA",
            onClick: () => navigate(`/chat/${plantId}`),
          },
          icon: <Bot className="w-4 h-4 text-blue-400" />,
          duration: 8000,
        });
      } else {
        toast.success("Registro de saúde adicionado!");
      }
      setSymptoms("");
      setTreatment("");
      setNotes("");
      setPhotoPreview(null);
      setPhotoUploadedUrl(null);
      setIsFormOpen(false);
      setUploadStatus("idle");
      setUploadMessage("");
      refetch();
      utils.plants.list.invalidate();
      utils.plants.getById.invalidate({ id: plantId });
    },
    onError: (error) => {
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

    // Preview local imediato
    const previewUrl = URL.createObjectURL(file);
    setPhotoPreview(previewUrl);
    setPhotoUploadedUrl(null);

    try {
      setUploadProgress({ isUploading: true, stage: "uploading", progress: 10 });
      setUploadStatus("uploading");
      setUploadMessage("Enviando foto...");

      // Upload direto: servidor converte HEIC + comprime com sharp
      const url = await uploadImage(file, (pct) => {
        setUploadProgress(prev => ({ ...prev, progress: 10 + Math.round(pct * 0.85) }));
      });

      setPhotoUploadedUrl(url);
      setUploadProgress(prev => ({ ...prev, stage: "complete", progress: 100 }));
      setUploadStatus("success");
      setUploadMessage("Foto enviada!");

      setTimeout(() => {
        setUploadProgress({ isUploading: false, stage: "converting", progress: 0 });
        toast.success("Foto enviada com sucesso!");
        setUploadStatus("idle");
      }, 1000);
    } catch (error: any) {
      console.error("[PlantHealthTab] Erro ao enviar imagem:", error);
      setPhotoPreview(null);
      setPhotoUploadedUrl(null);
      setUploadProgress({ isUploading: false, stage: "converting", progress: 0 });
      setUploadStatus("error");
      setUploadMessage("Erro ao enviar imagem");
      toast.error(error?.message || "Erro ao enviar imagem. Tente novamente.");
      setTimeout(() => setUploadStatus("idle"), 3000);
    }
  };

  const handleSubmit = () => {
    if (!photoUploadedUrl && !symptoms && !treatment && !notes) {
      toast.error("Adicione pelo menos uma foto ou informação");
      return;
    }

    // Foto já foi enviada ao S3 via /api/upload/image — apenas passa a URL
    createHealthLog.mutate({
      plantId,
      healthStatus,
      symptoms: symptoms || undefined,
      treatment: treatment || undefined,
      notes: notes || undefined,
      photoUrl: photoUploadedUrl || undefined,
    });
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
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 inline-block ${option.dot}`}/>
                      <span>{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Photo Upload - Compact */}
              <div className="space-y-2">
                <Label className="text-sm">Foto da Planta</Label>
                {uploadProgress.isUploading ? (
                  <div className="flex items-center justify-center gap-3 h-12 border-2 border-dashed border-green-400 dark:border-green-600 rounded-lg bg-green-50 dark:bg-green-950">
                    <Loader2 className="w-4 h-4 text-green-500 animate-spin" />
                    <span className="text-sm text-green-600 dark:text-green-400 font-medium">Enviando... {uploadProgress.progress}%</span>
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
                disabled={createHealthLog.isPending || uploadProgress.isUploading}
                className="w-full sm:w-auto"
              >
                {uploadProgress.isUploading ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Aguardando foto...</>
                ) : createHealthLog.isPending ? "Salvando..." : "Registrar"}
              </Button>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* Health Logs Timeline */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Heart className="w-4 h-4" />
            Histórico de Saúde
            {healthLogs && healthLogs.length > 0 && (
              <span className="text-xs text-muted-foreground font-normal">
                ({healthLogs.length} registro{healthLogs.length !== 1 ? "s" : ""})
              </span>
            )}
          </h3>
        </div>
        {/* Visual mini-timeline */}
        {!isLoading && healthLogs && healthLogs.length >= 2 && (
          <div className="bg-muted/30 rounded-xl px-4 py-3 overflow-x-auto">
            <div className="flex items-end gap-0 min-w-max">
              {[...healthLogs].reverse().map((log: any, i: number, arr: any[]) => {
                const s = getStatusOption(log.healthStatus);
                return (
                  <div key={log.id} className="flex items-end">
                    <div className="flex flex-col items-center gap-1">
                      <span className={`w-3 h-3 rounded-full ${s.dot} ring-2 ring-background`} />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(log.logDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                      </span>
                    </div>
                    {i < arr.length - 1 && (
                      <div className="w-6 h-px bg-border mb-[18px] mx-0.5" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {isLoading ? (
          <HealthTabSkeleton />
        ) : healthLogs && healthLogs.length > 0 ? (
          <div className="space-y-2">
            {healthLogs.map((log: any) => {
              const status = getStatusOption(log.healthStatus);
              const hasDetails = log.symptoms || log.treatment || log.notes;
              return (
                <div key={log.id} className="rounded-2xl border border-border/40 bg-card overflow-hidden">
                  <Accordion type="single" collapsible>
                    <AccordionItem value={`log-${log.id}`} className="border-0">
                      {/* Header do card */}
                      <div className="flex items-center gap-3 px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                        {/* Status + data */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg font-medium border ${status.color}`}>
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${status.dot}`}/>{status.label}
                            </span>
                            <span className="text-xs text-muted-foreground/60">
                              {new Date(log.logDate).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                          {log.symptoms && (
                            <p className="text-xs text-muted-foreground/70 truncate">{log.symptoms}</p>
                          )}
                        </div>

                        {/* Ações inline */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted transition-colors"
                            onClick={(e) => { e.stopPropagation(); setEditingLog(log); setIsEditModalOpen(true); }}
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          {hasDetails && (
                            <AccordionTrigger className="w-8 h-8 flex items-center justify-center rounded-lg hover:no-underline hover:bg-muted [&>svg]:w-3.5 [&>svg]:h-3.5 [&>svg]:text-muted-foreground/40" />
                          )}
                          <button
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            onClick={() => setDeleteHealthLogConfirm({ open: true, id: log.id })}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Detalhes expansíveis */}
                      {hasDetails && (
                        <AccordionContent>
                          <div className="px-4 pb-4 pt-1 border-t border-border/30 space-y-2">
                            {log.symptoms && (
                              <div className="rounded-xl border border-border/40 bg-card/50 px-3 py-2.5">
                                <p className="text-xs text-muted-foreground/60 uppercase tracking-wider mb-1">Sintomas</p>
                                <p className="text-sm text-foreground">{log.symptoms}</p>
                              </div>
                            )}
                            {log.treatment && (
                              <div className="rounded-xl border border-border/40 bg-card/50 px-3 py-2.5">
                                <p className="text-xs text-muted-foreground/60 uppercase tracking-wider mb-1">Tratamento</p>
                                <p className="text-sm text-foreground">{log.treatment}</p>
                              </div>
                            )}
                            {log.notes && (
                              <div className="rounded-xl border border-border/40 bg-card/50 px-3 py-2.5">
                                <p className="text-xs text-muted-foreground/60 uppercase tracking-wider mb-1">Notas</p>
                                <p className="text-sm text-foreground">{log.notes}</p>
                              </div>
                            )}
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
          // Empty state com CTA: ao clicar abre o form diretamente (em vez
          // de só mandar o user "procurar o botão"). Reduz friction pro
          // primeiro registro de saúde da planta.
          <div className="rounded-2xl border border-border/40 bg-gradient-to-b from-rose-500/5 to-transparent py-10 px-6 text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
              <Heart className="w-7 h-7 text-rose-400" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">Comece a acompanhar a saúde</p>
              <p className="text-xs text-muted-foreground max-w-xs mx-auto leading-relaxed">
                Tira uma foto e registra o status — vira histórico permanente que ajuda
                a detectar problemas cedo.
              </p>
            </div>
            <button
              onClick={() => setIsFormOpen(true)}
              className="inline-flex items-center gap-1.5 bg-rose-500/90 hover:bg-rose-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Fazer primeiro registro
            </button>
          </div>
        )}
      </div>


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

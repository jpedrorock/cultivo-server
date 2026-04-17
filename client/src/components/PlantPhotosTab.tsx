import { useRef, useState, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { uploadImage } from "@/lib/uploadImage";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Camera,
  Loader2,
  Trash2,
  X,
  ChevronLeft,
  ChevronRight,
  ImageOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface Props {
  plantId: number;
}

export default function PlantPhotosTab({ plantId }: Props) {
  const utils = trpc.useUtils();
  const { data: photos = [], isLoading } = trpc.plantPhotos.list.useQuery(
    { plantId },
    { enabled: !!plantId }
  );

  // Lightbox
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Swipe / pinch-zoom
  const [scale, setScale] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const pinchRef = useRef<{ startDist: number; startScale: number } | null>(null);
  const panRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  const lastTapRef = useRef(0);
  const imageRef = useRef<HTMLDivElement>(null);

  // Upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);

  const saveUrlMutation = trpc.plantPhotos.saveUrl.useMutation({
    onError: (e) => toast.error(`Erro ao salvar foto: ${e.message}`),
  });

  const deleteMutation = trpc.plantPhotos.delete.useMutation({
    onSuccess: () => {
      utils.plantPhotos.list.invalidate({ plantId });
      toast.success("Foto removida");
      setLightboxIdx(null);
      setDeleteConfirmOpen(false);
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  // ── Upload ────────────────────────────────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;

    const validFiles = files.filter(f => {
      if (!f.type.startsWith("image/")) { toast.error(`"${f.name}" não é uma imagem`); return false; }
      if (f.size > 20 * 1024 * 1024) { toast.error(`"${f.name}" é muito grande (máx. 20MB)`); return false; }
      return true;
    });
    if (validFiles.length === 0) return;

    setUploading(true);
    setUploadProgress({ done: 0, total: validFiles.length });

    let saved = 0;
    for (const file of validFiles) {
      try {
        const photoUrl = await uploadImage(file);
        await saveUrlMutation.mutateAsync({ plantId, photoUrl });
        saved++;
        setUploadProgress({ done: saved, total: validFiles.length });
      } catch (err: any) {
        toast.error(err?.message ?? `Erro ao enviar ${file.name}`);
      }
    }

    utils.plantPhotos.list.invalidate({ plantId });
    if (saved > 0) toast.success(saved === 1 ? "Foto salva!" : `${saved} fotos salvas!`);
    setUploading(false);
    setUploadProgress(null);
  };

  // ── Zoom helpers ──────────────────────────────────────────────────────────
  const resetZoom = useCallback(() => {
    setScale(1); setPanX(0); setPanY(0);
  }, []);

  const openLightbox = (idx: number) => { resetZoom(); setLightboxIdx(idx); };
  const closeLightbox = () => { setLightboxIdx(null); resetZoom(); };

  const goPrev = useCallback(() => {
    resetZoom();
    setSwipeOffset(0);
    setLightboxIdx(i => (i != null && i > 0 ? i - 1 : i));
  }, [resetZoom]);

  const goNext = useCallback(() => {
    resetZoom();
    setSwipeOffset(0);
    setLightboxIdx(i => (i != null && i < photos.length - 1 ? i + 1 : i));
  }, [resetZoom, photos.length]);

  // Non-passive touch listener for pinch prevention
  useEffect(() => {
    const el = imageRef.current;
    if (!el) return;
    const onMove = (e: TouchEvent) => {
      if (e.touches.length === 2 || (e.touches.length === 1 && scale > 1)) e.preventDefault();
    };
    el.addEventListener("touchmove", onMove, { passive: false });
    return () => el.removeEventListener("touchmove", onMove);
  }, [scale]);

  const getPinchDist = (t: TouchList) => {
    const dx = t[0].clientX - t[1].clientX;
    const dy = t[0].clientY - t[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      setIsSwiping(false); setSwipeOffset(0);
      pinchRef.current = { startDist: getPinchDist(e.touches), startScale: scale };
    } else if (e.touches.length === 1) {
      const now = Date.now();
      if (now - lastTapRef.current < 300) {
        lastTapRef.current = 0;
        scale > 1 ? resetZoom() : setScale(2.5);
        return;
      }
      lastTapRef.current = now;
      if (scale > 1) {
        panRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, panX, panY };
      } else {
        touchStartX.current = e.touches[0].clientX;
        touchEndX.current = e.touches[0].clientX;
        setIsSwiping(true);
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      const ratio = getPinchDist(e.touches) / pinchRef.current.startDist;
      const ns = Math.min(Math.max(pinchRef.current.startScale * ratio, 1), 6);
      setScale(ns);
      if (ns <= 1) { setPanX(0); setPanY(0); }
    } else if (e.touches.length === 1) {
      if (scale > 1 && panRef.current) {
        setPanX(panRef.current.panX + e.touches[0].clientX - panRef.current.startX);
        setPanY(panRef.current.panY + e.touches[0].clientY - panRef.current.startY);
      } else if (isSwiping) {
        touchEndX.current = e.touches[0].clientX;
        setSwipeOffset(e.touches[0].clientX - touchStartX.current);
      }
    }
  };

  const handleTouchEnd = () => {
    pinchRef.current = null;
    panRef.current = null;
    if (scale < 1.08) resetZoom();
    if (isSwiping && scale <= 1) {
      setIsSwiping(false);
      const dist = touchEndX.current - touchStartX.current;
      if (Math.abs(dist) > 50) { dist > 0 ? goPrev() : goNext(); }
      else setSwipeOffset(0);
    }
  };

  // ── Group photos by month ─────────────────────────────────────────────────
  const grouped: { label: string; items: typeof photos }[] = [];
  for (const photo of photos) {
    const label = format(new Date(photo.photoDate), "MMMM 'de' yyyy", { locale: ptBR });
    const last = grouped[grouped.length - 1];
    if (last && last.label === label) last.items.push(photo);
    else grouped.push({ label, items: [photo] });
  }

  const currentPhoto = lightboxIdx != null ? photos[lightboxIdx] : null;

  return (
    <div className="pb-6">
      {/* Upload button */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="w-full mb-5 flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 text-muted-foreground hover:text-primary transition-all py-5 disabled:opacity-50"
      >
        {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
        <span className="text-sm font-medium">
          {uploading && uploadProgress
            ? `Enviando ${uploadProgress.done}/${uploadProgress.total}…`
            : uploading
            ? "Enviando…"
            : "Tirar / escolher fotos"}
        </span>
      </button>

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && photos.length === 0 && (
        <div className="flex flex-col items-center py-12 gap-3 text-muted-foreground">
          <ImageOff className="w-10 h-10 opacity-30" />
          <p className="text-sm">Nenhuma foto ainda</p>
          <p className="text-xs opacity-60">Toque no botão acima para adicionar a primeira</p>
        </div>
      )}

      {/* Photo grid grouped by month */}
      {grouped.map(({ label, items }) => (
        <div key={label} className="mb-6">
          <p className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-2 capitalize">
            {label}
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {items.map((photo) => {
              const idx = photos.findIndex(p => p.id === photo.id);
              return (
                <button
                  key={photo.id}
                  onClick={() => openLightbox(idx)}
                  className="group relative aspect-square rounded-xl overflow-hidden bg-muted/40 active:scale-95 transition-transform"
                >
                  <img
                    src={photo.photoUrl}
                    alt={photo.description || format(new Date(photo.photoDate), "dd/MM/yyyy")}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2 pointer-events-none">
                    <span className="text-[10px] text-white/90 font-medium leading-tight">
                      {format(new Date(photo.photoDate), "dd/MM/yy")}
                    </span>
                    {(photo as any).weekNumber && (
                      <span className="text-[9px] text-white/60">Sem. {(photo as any).weekNumber}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* ── Lightbox ── */}
      {lightboxIdx !== null && currentPhoto && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col" onClick={closeLightbox}>
          {/* Top bar */}
          <div
            className="flex items-center justify-between px-4 pt-12 pb-2 shrink-0"
            onClick={e => e.stopPropagation()}
          >
            <span className="text-sm text-white/50">
              {lightboxIdx + 1} / {photos.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                className="w-10 h-10 rounded-full flex items-center justify-center text-red-400 hover:bg-red-500/10 active:scale-90 transition-transform"
                onClick={() => setDeleteConfirmOpen(true)}
              >
                <Trash2 className="w-4.5 h-4.5" />
              </button>
              <button
                className="w-10 h-10 rounded-full flex items-center justify-center text-white/60 hover:bg-white/10 active:scale-90 transition-transform"
                onClick={closeLightbox}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Image area */}
          <div
            className="flex-1 flex items-center justify-center relative px-2 overflow-hidden"
            ref={imageRef}
            onClick={e => e.stopPropagation()}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{ touchAction: scale > 1 ? "none" : "pan-y" }}
          >
            {lightboxIdx > 0 && (
              <button
                className="absolute left-2 z-10 w-10 h-10 rounded-full bg-black/40 flex items-center justify-center text-white active:scale-90 transition-transform"
                onClick={goPrev}
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}

            <img
              src={currentPhoto.photoUrl}
              alt={currentPhoto.description || ""}
              className="max-h-full max-w-full object-contain rounded-lg select-none"
              draggable={false}
              style={{
                transform: `translateX(${scale > 1 ? panX : swipeOffset}px) translateY(${panY}px) scale(${scale})`,
                transition: pinchRef.current || panRef.current || isSwiping ? "none" : "transform 0.2s ease-out",
                cursor: scale > 1 ? "grab" : "default",
              }}
            />

            {lightboxIdx < photos.length - 1 && (
              <button
                className="absolute right-2 z-10 w-10 h-10 rounded-full bg-black/40 flex items-center justify-center text-white active:scale-90 transition-transform"
                onClick={goNext}
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            )}

            {scale > 1 && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-1 rounded-full pointer-events-none">
                {Math.round(scale * 100)}%
              </div>
            )}
          </div>

          {/* Bottom: date + week + description */}
          <div
            className="px-5 py-4 pb-8 shrink-0 text-center"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <p className="text-xs text-white/40">
                {format(new Date(currentPhoto.photoDate), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
              </p>
              {(currentPhoto as any).weekNumber && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/50">
                  Semana {(currentPhoto as any).weekNumber}
                </span>
              )}
            </div>
            {currentPhoto.description && (
              <p className="text-sm text-white/70 mt-1">{currentPhoto.description}</p>
            )}
          </div>
        </div>
      )}

      {/* ── Delete confirm dialog ── */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" />
              Excluir foto?
            </DialogTitle>
            <DialogDescription>
              Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (lightboxIdx != null && photos[lightboxIdx]) {
                  deleteMutation.mutate({ photoId: photos[lightboxIdx].id });
                }
              }}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

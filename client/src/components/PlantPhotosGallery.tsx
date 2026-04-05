import { useRef, useState, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
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
  Download,
  CheckSquare,
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
  plantName: string;
}

type Photo = {
  id: number;
  plantId: number;
  photoUrl: string;
  photoKey?: string | null;
  cycleId?: number | null;
  weekNumber?: number | null;
  description?: string | null;
  photoDate: Date | string;
  createdAt: Date | string;
  source?: "gallery" | "health" | null;
  healthStatus?: string | null;
};

async function downloadPhotoWithExif(
  photo: Photo,
  plantName: string
) {
  const response = await fetch(photo.photoUrl);
  const blob = await response.blob();

  const isJpeg = blob.type === 'image/jpeg' || /\.(jpg|jpeg)/i.test(photo.photoUrl);

  let finalBlob = blob;
  if (isJpeg) {
    try {
      // Dynamic import to avoid CJS module breaking React singleton in Vite
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const piexifMod: any = await import('piexifjs');
      const piexif = piexifMod.default ?? piexifMod;

      const arrayBuffer = await blob.arrayBuffer();
      const binary = Array.from(new Uint8Array(arrayBuffer)).map(b => String.fromCharCode(b)).join('');

      const exifObj: any = { '0th': {}, 'Exif': {}, 'GPS': {} };
      const dateStr = new Date(photo.photoDate).toISOString().replace(/[-:T]/g, ':').slice(0, 19);
      const weekLabel = photo.weekNumber ? ` — Semana ${photo.weekNumber}` : '';
      exifObj['0th'][piexif.ImageIFD.ImageDescription] = `${plantName}${weekLabel}`;
      exifObj['0th'][piexif.ImageIFD.Artist] = plantName;
      exifObj['0th'][piexif.ImageIFD.Software] = 'Cultivo App';
      exifObj['0th'][piexif.ImageIFD.DateTime] = dateStr;
      exifObj['Exif'][piexif.ExifIFD.UserComment] = `Cultivo App | ${plantName}${weekLabel}`;

      const exifBytes = piexif.dump(exifObj);
      const newBinary = piexif.insert(exifBytes, binary);
      const byteArray = new Uint8Array(newBinary.length);
      for (let i = 0; i < newBinary.length; i++) byteArray[i] = newBinary.charCodeAt(i);
      finalBlob = new Blob([byteArray], { type: 'image/jpeg' });
    } catch {
      // fallback: use original blob
    }
  }

  const date = new Date(photo.photoDate);
  const dateFormatted = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const weekSuffix = photo.weekNumber ? `_S${photo.weekNumber}` : '';
  const safeName = plantName.replace(/[^a-zA-Z0-9]/g, '_');
  const filename = `${safeName}_${dateFormatted}${weekSuffix}.jpg`;

  const url = URL.createObjectURL(finalBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function downloadMultiple(photos: Photo[], plantName: string) {
  for (let i = 0; i < photos.length; i++) {
    await downloadPhotoWithExif(photos[i], plantName);
    if (i < photos.length - 1) await new Promise(r => setTimeout(r, 350));
  }
}

export default function PlantPhotosGallery({ plantId, plantName }: Props) {
  const utils = trpc.useUtils();
  const { data: photos = [], isLoading } = trpc.plantPhotos.list.useQuery(
    { plantId },
    { enabled: !!plantId }
  );

  const typedPhotos = photos as Photo[];

  // Selection mode
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Lightbox
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Download state
  const [downloading, setDownloading] = useState(false);

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

  // Timelapse scrub on thumbnail strip
  const [isScrubbing, setIsScrubbing] = useState(false);
  const scrubStartX = useRef(0);
  const scrubStartIdx = useRef(0);
  const thumbStripRef = useRef<HTMLDivElement>(null);

  const handleScrubStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    scrubStartX.current = clientX;
    scrubStartIdx.current = lightboxIdx ?? 0;
    setIsScrubbing(true);
  }, [lightboxIdx]);

  const handleScrubMove = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (!isScrubbing) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const stripWidth = thumbStripRef.current?.offsetWidth ?? window.innerWidth;
    // Map full strip width to all photos
    const deltaX = clientX - scrubStartX.current;
    const photosPerPx = typedPhotos.length / stripWidth;
    const deltaIdx = Math.round(deltaX * photosPerPx * 2.5);
    const newIdx = Math.max(0, Math.min(typedPhotos.length - 1, scrubStartIdx.current - deltaIdx));
    if (newIdx !== lightboxIdx) {
      resetZoom();
      setSwipeOffset(0);
      setLightboxIdx(newIdx);
    }
  }, [isScrubbing, lightboxIdx, typedPhotos.length, resetZoom]);

  const handleScrubEnd = useCallback(() => {
    setIsScrubbing(false);
  }, []);

  // Upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const uploadMutation = trpc.plantPhotos.upload.useMutation({
    onSuccess: () => {
      utils.plantPhotos.list.invalidate({ plantId });
      toast.success("Foto salva!");
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
    onSettled: () => setUploading(false),
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
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Selecione uma imagem válida"); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("Imagem muito grande (máx. 10MB)"); return; }
    setUploading(true);
    const reader = new FileReader();
    reader.onload = () => {
      uploadMutation.mutate({ plantId, photoBase64: reader.result as string });
    };
    reader.onerror = () => { setUploading(false); toast.error("Erro ao ler arquivo"); };
    reader.readAsDataURL(file);
    e.target.value = "";
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
    setLightboxIdx(i => (i != null && i < typedPhotos.length - 1 ? i + 1 : i));
  }, [resetZoom, typedPhotos.length]);

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

  const getPinchDist = (t: React.TouchList) => {
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

  // ── Selection helpers ─────────────────────────────────────────────────────
  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  // ── Group photos by month ─────────────────────────────────────────────────
  const grouped: { label: string; items: Photo[] }[] = [];
  for (const photo of typedPhotos) {
    const label = format(new Date(photo.photoDate), "MMMM 'de' yyyy", { locale: ptBR });
    const last = grouped[grouped.length - 1];
    if (last && last.label === label) last.items.push(photo);
    else grouped.push({ label, items: [photo] });
  }

  const currentPhoto = lightboxIdx != null ? typedPhotos[lightboxIdx] : null;

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleDownloadAll = async () => {
    if (typedPhotos.length === 0) return;
    setDownloading(true);
    try {
      await downloadMultiple(typedPhotos, plantName);
    } catch {
      toast.error("Erro ao baixar fotos");
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadSelected = async () => {
    const selectedPhotos = typedPhotos.filter(p => selected.has(p.id));
    if (selectedPhotos.length === 0) return;
    setDownloading(true);
    try {
      await downloadMultiple(selectedPhotos, plantName);
    } catch {
      toast.error("Erro ao baixar fotos");
    } finally {
      setDownloading(false);
      exitSelectMode();
    }
  };

  const handleDownloadSingle = async (photo: Photo) => {
    try {
      await downloadPhotoWithExif(photo, plantName);
    } catch {
      toast.error("Erro ao baixar foto");
    }
  };

  return (
    <div className="pb-6">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Top action bar */}
      <div className="flex items-center gap-2 mb-5">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex-1 flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 text-muted-foreground hover:text-primary transition-all py-3 disabled:opacity-50"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
          <span className="text-xs font-medium">
            {uploading ? "Salvando…" : "Upload foto"}
          </span>
        </button>

        {typedPhotos.length > 0 && (
          <>
            <button
              onClick={() => {
                if (selectMode) exitSelectMode();
                else setSelectMode(true);
              }}
              className={`flex items-center gap-1.5 px-3 py-3 rounded-xl border text-xs font-medium transition-all ${
                selectMode
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
              }`}
            >
              <CheckSquare className="w-4 h-4" />
              {selectMode ? "Cancelar" : "Selecionar"}
            </button>

            <button
              onClick={handleDownloadAll}
              disabled={downloading}
              className="flex items-center gap-1.5 px-3 py-3 rounded-xl border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all disabled:opacity-50"
            >
              {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Baixar tudo
            </button>
          </>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && typedPhotos.length === 0 && (
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
              const idx = typedPhotos.findIndex(p => p.id === photo.id);
              const isSelected = selected.has(photo.id);
              return (
                <button
                  key={photo.id}
                  onClick={() => {
                    if (selectMode) toggleSelect(photo.id);
                    else openLightbox(idx);
                  }}
                  className={`relative aspect-square rounded-xl overflow-hidden bg-muted/40 active:scale-95 transition-transform ${
                    isSelected ? "ring-2 ring-primary ring-offset-1" : ""
                  }`}
                >
                  <img
                    src={photo.photoUrl}
                    alt={photo.description || format(new Date(photo.photoDate), "dd/MM/yyyy")}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {/* Week badge */}
                  {photo.weekNumber && (
                    <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[9px] font-bold px-1 py-px rounded">
                      S{photo.weekNumber}
                    </div>
                  )}
                  {/* Health log badge */}
                  {photo.source === "health" && (
                    <div className="absolute top-1 left-1 bg-emerald-500/80 text-white text-[8px] font-bold px-1 py-px rounded leading-tight">
                      saúde
                    </div>
                  )}
                  {/* Selection checkbox overlay */}
                  {selectMode && (
                    <div className={`absolute top-1 right-1 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                      isSelected
                        ? "bg-primary border-primary"
                        : "bg-black/40 border-white/70"
                    }`}>
                      {isSelected && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* ── Floating selection action bar ── */}
      {selectMode && selected.size > 0 && (
        <div className="fixed bottom-20 left-4 right-4 z-40">
          <button
            onClick={handleDownloadSelected}
            disabled={downloading}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm shadow-lg active:scale-98 transition-transform disabled:opacity-70"
          >
            {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Baixar {selected.size} {selected.size === 1 ? "foto" : "fotos"} selecionada{selected.size === 1 ? "" : "s"}
          </button>
        </div>
      )}

      {/* ── Lightbox ── */}
      {lightboxIdx !== null && currentPhoto && (
        <div className="fixed inset-0 z-[200] bg-black/95 flex flex-col" onClick={closeLightbox}>
          {/* Top bar */}
          <div
            className="flex items-center justify-between px-4 pt-12 pb-2 shrink-0"
            onClick={e => e.stopPropagation()}
          >
            <span className="text-sm text-white/50">
              {lightboxIdx + 1} / {typedPhotos.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                className="w-10 h-10 rounded-full flex items-center justify-center text-white/60 hover:bg-white/10 active:scale-90 transition-transform"
                onClick={() => handleDownloadSingle(currentPhoto)}
              >
                <Download className="w-4.5 h-4.5" />
              </button>
              {currentPhoto.source !== "health" && (
                <button
                  className="w-10 h-10 rounded-full flex items-center justify-center text-red-400 hover:bg-red-500/10 active:scale-90 transition-transform"
                  onClick={() => setDeleteConfirmOpen(true)}
                >
                  <Trash2 className="w-4.5 h-4.5" />
                </button>
              )}
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
                transition: pinchRef.current || panRef.current || isSwiping || isScrubbing ? "none" : "transform 0.2s ease-out",
                opacity: isScrubbing ? 0.85 : 1,
                cursor: scale > 1 ? "grab" : "default",
              }}
            />

            {lightboxIdx < typedPhotos.length - 1 && (
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

          {/* Thumbnail strip — tap to jump, drag to scrub (timelapse) */}
          <div
            ref={thumbStripRef}
            className={`flex gap-1.5 overflow-x-auto px-4 py-3 shrink-0 select-none ${isScrubbing ? 'cursor-grabbing' : 'cursor-grab'}`}
            style={{ scrollbarWidth: 'none', touchAction: 'none' }}
            onClick={e => e.stopPropagation()}
            onMouseDown={handleScrubStart}
            onMouseMove={handleScrubMove}
            onMouseUp={handleScrubEnd}
            onMouseLeave={handleScrubEnd}
            onTouchStart={handleScrubStart}
            onTouchMove={handleScrubMove}
            onTouchEnd={handleScrubEnd}
          >
            {/* Scrub hint label */}
            {!isScrubbing && typedPhotos.length > 2 && (
              <div className="absolute bottom-[90px] left-1/2 -translate-x-1/2 pointer-events-none">
                <span className="text-[9px] text-white/20 tracking-widest uppercase">← arrastar →</span>
              </div>
            )}
            {typedPhotos.map((p, i) => (
              <button
                key={p.id}
                onPointerDown={e => e.stopPropagation()}
                onClick={() => { if (!isScrubbing) { resetZoom(); setLightboxIdx(i); } }}
                className={`shrink-0 w-12 h-12 rounded-lg overflow-hidden border-2 transition-all pointer-events-none ${
                  i === lightboxIdx
                    ? 'border-white scale-110'
                    : Math.abs(i - (lightboxIdx ?? 0)) <= 1
                      ? 'border-transparent opacity-70'
                      : 'border-transparent opacity-40'
                }`}
              >
                <img src={p.photoUrl} alt="" className="w-full h-full object-cover" draggable={false} />
              </button>
            ))}
          </div>

          {/* Bottom: date + description */}
          <div
            className="px-5 py-3 shrink-0 text-center"
            style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom, 1rem))' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <p className="text-xs text-white/40">
                {format(new Date(currentPhoto.photoDate), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
              </p>
              {currentPhoto.weekNumber && (
                <span className="bg-white/10 text-white/70 text-[10px] font-bold px-2 py-px rounded-full">
                  S{currentPhoto.weekNumber}
                </span>
              )}
              {currentPhoto.source === "health" && (
                <span className="bg-emerald-500/30 text-emerald-300 text-[10px] font-bold px-2 py-px rounded-full">
                  registro de saúde
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
              Esta acao nao pode ser desfeita.
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
                if (lightboxIdx != null && typedPhotos[lightboxIdx]) {
                  deleteMutation.mutate({ photoId: typedPhotos[lightboxIdx].id });
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

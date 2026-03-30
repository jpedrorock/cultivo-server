import React, { useState, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Camera, X, ZoomIn, Trash2 } from "lucide-react";
import { GallerySkeletonLoader } from "@/components/SkeletonLoader";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface PlantPhotosTabProps {
  plantId: number;
}

export default function PlantPhotosTab({ plantId }: PlantPhotosTabProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [deletePhotoConfirm, setDeletePhotoConfirm] = useState(false);
  
  // Swipe gesture states
  const [touchStart, setTouchStart] = useState<number>(0);
  const [touchEnd, setTouchEnd] = useState<number>(0);
  const [swipeOffset, setSwipeOffset] = useState<number>(0);
  const [isSwiping, setIsSwiping] = useState<boolean>(false);

  // Pinch-to-zoom states
  const [scale, setScale] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const pinchRef = useRef<{ startDist: number; startScale: number } | null>(null);
  const panRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  const lastTapRef = useRef(0);
  const imageRef = useRef<HTMLDivElement>(null);

  // Query para buscar fotos da planta
  const { data: photos = [], isLoading, refetch } = trpc.plants.getPhotos.useQuery(
    { plantId },
    { enabled: !!plantId }
  );

  const uploadPhoto = trpc.plants.uploadPhoto.useMutation({
    onSuccess: () => {
      toast.success("Foto enviada com sucesso!");
      refetch();
      setUploading(false);
    },
    onError: (error) => {
      toast.error(`Erro ao enviar foto: ${error.message}`);
      setUploading(false);
    },
  });

  const deletePhoto = trpc.plants.deletePhoto.useMutation({
    onSuccess: () => {
      toast.success("Foto excluída com sucesso!");
      refetch();
      setLightboxOpen(false);
    },
    onError: (error) => {
      toast.error(`Erro ao excluir foto: ${error.message}`);
    },
  });

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validar tipo de arquivo
    if (!file.type.startsWith("image/")) {
      toast.error("Por favor, selecione uma imagem válida");
      return;
    }

    // Validar tamanho (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Imagem muito grande. Máximo 5MB");
      return;
    }

    setUploading(true);

    // Converter para base64
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      await uploadPhoto.mutateAsync({
        plantId,
        imageData: base64,
        mimeType: file.type,
      });
    };
    reader.readAsDataURL(file);
  };

  const resetZoom = useCallback(() => {
    setScale(1);
    setPanX(0);
    setPanY(0);
  }, []);

  const openLightbox = (index: number) => {
    setCurrentImageIndex(index);
    resetZoom();
    setLightboxOpen(true);
  };

  const closeLightbox = () => {
    setLightboxOpen(false);
    resetZoom();
  };

  const nextImage = useCallback(() => {
    resetZoom();
    setCurrentImageIndex((prev) => (prev + 1) % photos.length);
  }, [photos.length, resetZoom]);

  const prevImage = useCallback(() => {
    resetZoom();
    setCurrentImageIndex((prev) => (prev - 1 + photos.length) % photos.length);
  }, [photos.length, resetZoom]);

  const handleDeletePhoto = () => {
    const photoId = photos[currentImageIndex]?.id;
    if (photoId) {
      deletePhoto.mutate({ id: photoId });
    }
  };

  // Attach non-passive touch listeners to support preventDefault (required for pinch zoom)
  useEffect(() => {
    const el = imageRef.current;
    if (!el) return;

    const onTouchMove = (e: TouchEvent) => {
      // Prevent browser native zoom when we have 2 fingers or when panning
      if (e.touches.length === 2 || (e.touches.length === 1 && scale > 1)) {
        e.preventDefault();
      }
    };

    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", onTouchMove);
  }, [scale]);

  const getPinchDist = (touches: TouchList) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Start pinch
      setIsSwiping(false);
      setSwipeOffset(0);
      pinchRef.current = { startDist: getPinchDist(e.touches), startScale: scale };
    } else if (e.touches.length === 1) {
      const now = Date.now();
      // Double-tap to toggle zoom
      if (now - lastTapRef.current < 300) {
        lastTapRef.current = 0;
        if (scale > 1) { resetZoom(); } else { setScale(2.5); }
        return;
      }
      lastTapRef.current = now;

      if (scale > 1) {
        // Pan mode
        panRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, panX, panY };
      } else {
        // Swipe navigation mode
        setTouchStart(e.targetTouches[0].clientX);
        setTouchEnd(e.targetTouches[0].clientX);
        setIsSwiping(true);
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      // Pinch zoom
      const newDist = getPinchDist(e.touches);
      const ratio = newDist / pinchRef.current.startDist;
      const newScale = Math.min(Math.max(pinchRef.current.startScale * ratio, 1), 6);
      setScale(newScale);
      // If scale snapped to 1, reset pan
      if (newScale <= 1) { setPanX(0); setPanY(0); }
    } else if (e.touches.length === 1) {
      if (scale > 1 && panRef.current) {
        // Pan the zoomed image
        const dx = e.touches[0].clientX - panRef.current.startX;
        const dy = e.touches[0].clientY - panRef.current.startY;
        setPanX(panRef.current.panX + dx);
        setPanY(panRef.current.panY + dy);
      } else if (isSwiping) {
        // Horizontal swipe to navigate
        const currentTouch = e.targetTouches[0].clientX;
        setTouchEnd(currentTouch);
        setSwipeOffset(currentTouch - touchStart);
      }
    }
  };

  const handleTouchEnd = () => {
    pinchRef.current = null;
    panRef.current = null;

    // Snap scale back to 1 if barely pinched
    if (scale < 1.08) resetZoom();

    if (isSwiping && scale <= 1) {
      setIsSwiping(false);
      const swipeDistance = touchEnd - touchStart;
      if (Math.abs(swipeDistance) > 50) {
        if (swipeDistance > 0) prevImage();
        else nextImage();
      }
      setSwipeOffset(0);
      setTouchStart(0);
      setTouchEnd(0);
    }
  };

  return (
    <div className="space-y-6">
      {/* Upload Button */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Galeria de Fotos</h3>
        <label htmlFor="photo-upload">
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={uploading}
            onClick={() => document.getElementById("photo-upload")?.click()}
          >
            <Camera className="w-4 h-4 mr-2" />
            {uploading ? "Enviando..." : "Adicionar Foto"}
          </Button>
          <input
            id="photo-upload"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileSelect}
            disabled={uploading}
          />
        </label>
      </div>

      {/* Gallery Grid with Loading State */}
      {isLoading ? (
        <GallerySkeletonLoader count={6} />
      ) : photos.length === 0 ? (
        <div className="text-center py-12 bg-muted/30 rounded-lg border-2 border-dashed border-muted">
          <Camera className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Nenhuma foto ainda</p>
          <p className="text-sm text-muted-foreground mt-1">
            Adicione fotos para acompanhar o desenvolvimento da planta
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {photos.map((photo: { id: number; url: string; createdAt: string }, index: number) => (
            <div
              key={photo.id}
              className="aspect-square rounded-lg overflow-hidden bg-muted cursor-pointer group relative"
              onClick={() => openLightbox(index)}
            >
              <img
                src={photo.url}
                alt={`Foto ${index + 1}`}
                className="w-full h-full object-cover transition-transform group-hover:scale-105"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                <ZoomIn className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                {new Date(photo.createdAt).toLocaleDateString("pt-BR")}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightboxOpen && photos.length > 0 && (
        <div
          className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center"
          onClick={closeLightbox}
        >
          <button
            className="absolute top-4 right-4 text-white hover:text-gray-300 z-10"
            onClick={(e) => {
              e.stopPropagation();
              closeLightbox();
            }}
          >
            <X className="w-8 h-8" />
          </button>

          <button
            className="absolute top-4 left-4 text-white hover:text-red-400 z-10"
            onClick={(e) => {
              e.stopPropagation();
              setDeletePhotoConfirm(true);
            }}
          >
            <span className="text-sm flex items-center gap-1"><Trash2 className="w-4 h-4"/>Excluir</span>
          </button>

          <button
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:text-gray-300 text-4xl z-10"
            onClick={(e) => {
              e.stopPropagation();
              prevImage();
            }}
          >
            ‹
          </button>

          <button
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:text-gray-300 text-4xl z-10"
            onClick={(e) => {
              e.stopPropagation();
              nextImage();
            }}
          >
            ›
          </button>

          <div
            ref={imageRef}
            className="max-w-4xl max-h-[90vh] w-full h-full flex items-center justify-center p-4 overflow-hidden"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{ touchAction: scale > 1 ? 'none' : 'pan-y' }}
          >
            <img
              src={photos[currentImageIndex]?.url}
              alt={`Foto ${currentImageIndex + 1}`}
              className="max-w-full max-h-full object-contain select-none"
              draggable={false}
              onClick={(e) => e.stopPropagation()}
              style={{
                transform: `translateX(${scale > 1 ? panX : swipeOffset}px) translateY(${panY}px) scale(${scale})`,
                transition: pinchRef.current || panRef.current || isSwiping ? 'none' : 'transform 0.25s ease-out',
                cursor: scale > 1 ? 'grab' : 'default',
              }}
            />
          </div>

          {/* Zoom indicator */}
          {scale > 1 && (
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-1 rounded-full">
              {Math.round(scale * 100)}%
            </div>
          )}

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm">
            {currentImageIndex + 1} / {photos.length}
          </div>
        </div>
      )}

      {/* Delete Photo Confirm Dialog */}
      <Dialog open={deletePhotoConfirm} onOpenChange={setDeletePhotoConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" />
              Excluir Foto
            </DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir esta foto? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeletePhotoConfirm(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => {
                setDeletePhotoConfirm(false);
                handleDeletePhoto();
              }}
              disabled={deletePhoto.isPending}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Excluir Foto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

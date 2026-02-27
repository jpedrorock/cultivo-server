import React, { useState } from "react";
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

  const openLightbox = (index: number) => {
    setCurrentImageIndex(index);
    setLightboxOpen(true);
  };

  const closeLightbox = () => {
    setLightboxOpen(false);
  };

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % photos.length);
  };

  const prevImage = () => {
    setCurrentImageIndex((prev) => (prev - 1 + photos.length) % photos.length);
  };

  const handleDeletePhoto = () => {
    const photoId = photos[currentImageIndex]?.id;
    if (photoId) {
      deletePhoto.mutate({ id: photoId });
    }
  };

  // Touch event handlers for swipe gestures
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
      if (swipeDistance > 0) {
        prevImage();
      } else if (swipeDistance < 0) {
        nextImage();
      }
    }
    setSwipeOffset(0);
    setTouchStart(0);
    setTouchEnd(0);
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
            <span className="text-sm">🗑️ Excluir</span>
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
            className="max-w-4xl max-h-[90vh] w-full h-full flex items-center justify-center p-4"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{
              transform: isSwiping ? `translateX(${swipeOffset}px)` : 'translateX(0)',
              transition: isSwiping ? 'none' : 'transform 0.3s ease-out',
            }}
          >
            <img
              src={photos[currentImageIndex]?.url}
              alt={`Foto ${currentImageIndex + 1}`}
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>

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

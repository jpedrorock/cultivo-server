/**
 * PhotoPicker — botão que abre câmera/galeria de forma cross-platform.
 *
 * Native (iOS/Android):
 *  - Mostra action sheet nativa: "Câmera" | "Galeria" | "Cancelar"
 *  - Foto retorna como File pronto pra uploadImage()
 *  - Permissões pedidas automaticamente
 *
 * Web/PWA:
 *  - input[type=file] hidden com accept=image/*
 *  - Em mobile browser, abre action sheet do sistema (similar)
 *
 * Drop-in pra substituir `<input type=file>` existente:
 *
 * ```tsx
 * // Antes:
 * <input type="file" accept="image/*" onChange={(e) => uploadImage(e.target.files[0])} />
 *
 * // Depois:
 * <PhotoPicker onPick={(file) => uploadImage(file)}>
 *   <Button>📷 Adicionar foto</Button>
 * </PhotoPicker>
 * ```
 *
 * O `children` é renderizado como trigger. Se omitido, usa botão padrão.
 */

import { useRef, useState } from "react";
import { Camera as CameraIcon, Image as ImageIcon, X, Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { isNativeCameraAvailable, takeNativePhoto, type PhotoSource } from "@/lib/nativeCamera";
import { haptics } from "@/lib/haptics";
import { toast } from "sonner";

export interface PhotoPickerProps {
  /** Callback quando user escolhe foto. File compatível com uploadImage(). */
  onPick: (file: File) => void;
  /** Callback opcional ao cancelar. */
  onCancel?: () => void;
  /** Trigger custom. Se omitido, usa botão padrão "Adicionar foto". */
  children?: React.ReactNode;
  /** Qualidade JPEG 0-100 (só native). Default 85. */
  quality?: number;
  /** Aceita tipos de arquivo no input web. Default "image/*". */
  accept?: string;
  /** Desabilita o picker (loading externo). */
  disabled?: boolean;
}

export function PhotoPicker({
  onPick,
  onCancel,
  children,
  quality = 85,
  accept = "image/*",
  disabled = false,
}: PhotoPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleTriggerClick = async () => {
    if (disabled || loading) return;
    await haptics.light();
    if (isNativeCameraAvailable()) {
      // Native: abre nossa action sheet (em vez de Camera.Prompt do plugin
      // pra garantir UX consistente com tema dark do app)
      setSheetOpen(true);
    } else {
      // Web: fallback input file
      inputRef.current?.click();
    }
  };

  const handleNativeSource = async (source: PhotoSource) => {
    setSheetOpen(false);
    setLoading(true);
    try {
      const file = await takeNativePhoto({ source, quality });
      if (file) {
        await haptics.success();
        onPick(file);
      } else {
        onCancel?.();
      }
    } catch (err: any) {
      await haptics.error();
      toast.error(err?.message ?? "Não foi possível abrir câmera/galeria.");
    } finally {
      setLoading(false);
    }
  };

  const handleWebFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Limpa pra que o mesmo arquivo possa ser selecionado de novo
    if (inputRef.current) inputRef.current.value = "";
    if (file) {
      onPick(file);
    } else {
      onCancel?.();
    }
  };

  return (
    <>
      {/* Trigger — wraps children ou usa botão default */}
      <button
        type="button"
        onClick={handleTriggerClick}
        disabled={disabled || loading}
        className="inline-block"
        style={{ all: children ? "unset" : undefined, cursor: disabled ? "not-allowed" : "pointer" }}
      >
        {children ?? (
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-60">
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CameraIcon className="w-4 h-4" />
            )}
            {loading ? "Abrindo..." : "Adicionar foto"}
          </span>
        )}
      </button>

      {/* Hidden input pra fallback web */}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        capture="environment"
        onChange={handleWebFileChange}
        className="hidden"
        aria-hidden="true"
      />

      {/* Action sheet nativa em mobile (custom UI consistente com app) */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl px-4 pb-6"
          style={{ paddingBottom: "max(24px, env(safe-area-inset-bottom))" }}
        >
          <SheetHeader className="mb-4">
            <SheetTitle className="text-base">Adicionar foto</SheetTitle>
          </SheetHeader>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => handleNativeSource("camera")}
              className="w-full flex items-center gap-3 px-4 py-4 rounded-xl bg-card hover:bg-muted/60 active:bg-muted transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                <CameraIcon className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">Tirar foto</p>
                <p className="text-xs text-muted-foreground">Usar câmera</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleNativeSource("gallery")}
              className="w-full flex items-center gap-3 px-4 py-4 rounded-xl bg-card hover:bg-muted/60 active:bg-muted transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center">
                <ImageIcon className="w-5 h-5 text-blue-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">Escolher da galeria</p>
                <p className="text-xs text-muted-foreground">Foto existente</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setSheetOpen(false);
                onCancel?.();
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
              Cancelar
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

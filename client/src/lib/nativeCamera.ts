/**
 * nativeCamera.ts — abre câmera/galeria nativa e retorna File compatível
 * com uploadImage() existente.
 *
 * Por que ter wrapper em vez de chamar Camera direto?
 *  1. uploadImage() recebe File. Capacitor Camera retorna URI ou base64.
 *     Aqui convertemos pra File pra que o resto do código não precise saber
 *     se a foto veio de câmera nativa ou input file.
 *  2. Centralizar configs (qualidade, dimensão, formato) num lugar só.
 *  3. iOS exige `NSCameraUsageDescription` e `NSPhotoLibraryUsageDescription`
 *     no Info.plist — documentado nos comentários.
 *
 * Permissões necessárias no Info.plist (iOS) — documentar no app:
 *   NSCameraUsageDescription = "Cultivo usa a câmera para registrar fotos das suas plantas"
 *   NSPhotoLibraryUsageDescription = "Cultivo precisa acessar suas fotos para anexar imagens às plantas"
 *
 * Android: permissões CAMERA e READ_MEDIA_IMAGES são solicitadas
 *   automaticamente pelo plugin via runtime permission API. Sem config manual.
 */

import { isNative } from "./platform";

export type PhotoSource = "camera" | "gallery" | "prompt";

export interface NativePhotoOptions {
  /** "camera" abre câmera direto, "gallery" galeria, "prompt" deixa o user escolher (default) */
  source?: PhotoSource;
  /** Qualidade JPEG 0-100. Default 85 — bom balanço pra plantas. */
  quality?: number;
  /** Largura/altura máxima — Capacitor faz resize antes de retornar. Default 1920. */
  maxDimension?: number;
}

/**
 * Detecta se a câmera nativa está disponível no contexto atual.
 * Hoje: só native. PWAs podem usar `navigator.mediaDevices.getUserMedia`
 * mas não vale a pena duplicar — o input[type=file capture=camera] cobre.
 */
export function isNativeCameraAvailable(): boolean {
  return isNative();
}

/**
 * Abre o picker nativo e retorna um File pronto pra uploadImage().
 *
 * Retorna null se o user cancelou.
 * Lança Error se a permissão foi negada ou erro inesperado.
 */
export async function takeNativePhoto(opts: NativePhotoOptions = {}): Promise<File | null> {
  if (!isNative()) {
    throw new Error("Camera nativa não disponível neste contexto");
  }

  const { source = "prompt", quality = 85, maxDimension = 1920 } = opts;

  const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");

  // Mapeia nosso enum pro do plugin
  const sourceMap = {
    camera: CameraSource.Camera,
    gallery: CameraSource.Photos,
    prompt: CameraSource.Prompt, // mostra action sheet nativa
  };

  try {
    const photo = await Camera.getPhoto({
      quality,
      width: maxDimension,
      height: maxDimension,
      // dataUrl = base64 — único formato que dá pra converter em File facilmente
      // sem expor file:// URIs ao XHR (que falha no iOS por segurança WebKit)
      resultType: CameraResultType.DataUrl,
      source: sourceMap[source],
      // saveToGallery = false: foto da câmera fica só no app, não na galeria do user
      saveToGallery: false,
      // correctOrientation = true: roda automaticamente baseado em EXIF
      correctOrientation: true,
    });

    if (!photo.dataUrl) return null;

    // Converte dataUrl (base64) → Blob → File
    const blob = dataUrlToBlob(photo.dataUrl);
    const ext = photo.format || "jpeg";
    const filename = `plant-photo-${Date.now()}.${ext}`;

    return new File([blob], filename, { type: blob.type || "image/jpeg" });
  } catch (err: any) {
    // Plugin lança erro genérico quando user cancela — distinguir
    const msg = err?.message ?? String(err);
    if (msg.toLowerCase().includes("cancel") || msg.toLowerCase().includes("user denied")) {
      return null;
    }
    if (msg.toLowerCase().includes("permission")) {
      throw new Error("Permissão de câmera/galeria negada. Habilite em Ajustes do iOS/Android.");
    }
    throw err;
  }
}

/**
 * Verifica/pede permissões de câmera + galeria.
 * Útil pra mostrar UI explicativa antes do prompt nativo.
 */
export async function checkCameraPermissions(): Promise<{
  camera: "granted" | "denied" | "prompt";
  photos: "granted" | "denied" | "prompt";
}> {
  if (!isNative()) {
    return { camera: "denied", photos: "denied" };
  }
  try {
    const { Camera } = await import("@capacitor/camera");
    const result = await Camera.checkPermissions();
    return {
      camera: normalizePermission(result.camera),
      photos: normalizePermission(result.photos),
    };
  } catch {
    return { camera: "denied", photos: "denied" };
  }
}

export async function requestCameraPermissions(): Promise<void> {
  if (!isNative()) return;
  try {
    const { Camera } = await import("@capacitor/camera");
    await Camera.requestPermissions({ permissions: ["camera", "photos"] });
  } catch {
    /* ignored — chamador pode chamar checkCameraPermissions depois */
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function dataUrlToBlob(dataUrl: string): Blob {
  // dataUrl: "data:image/jpeg;base64,iVBORw0KGgoA..."
  const [meta, base64] = dataUrl.split(",");
  const mimeMatch = meta?.match(/data:([^;]+);base64/);
  const mime = mimeMatch?.[1] ?? "image/jpeg";

  // Browser tem atob global
  const binary = atob(base64);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function normalizePermission(p: string | undefined): "granted" | "denied" | "prompt" {
  if (p === "granted") return "granted";
  if (p === "denied") return "denied";
  return "prompt"; // limited / prompt / prompt-with-rationale → tudo "prompt" pra UI
}

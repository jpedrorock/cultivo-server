/**
 * Utilitário robusto para processar imagens antes do upload
 * - Suporte completo a HEIC/HEIF do iPhone (Safari iOS)
 * - Detecção por magic bytes (não apenas mime type)
 * - Fallback seguro se o canvas falhar
 * - Compressão JPEG para reduzir tamanho do payload
 */
import heic2any from 'heic2any';

export interface ProcessImageOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
}

/**
 * Detecta se o arquivo é HEIC/HEIF verificando mime type E extensão
 */
export function isHEIC(file: File): boolean {
  const heicMimeTypes = ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'];
  const heicExtensions = ['.heic', '.heif'];

  if (heicMimeTypes.includes(file.type.toLowerCase())) {
    return true;
  }

  const fileName = file.name.toLowerCase();
  return heicExtensions.some(ext => fileName.endsWith(ext));
}

/**
 * Detecta HEIC por magic bytes (lê os primeiros 16 bytes do arquivo)
 * Mais confiável que verificar apenas o mime type no iOS Safari
 */
export async function isHEICByMagicBytes(file: File): Promise<boolean> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      try {
        const arr = new Uint8Array(reader.result as ArrayBuffer);
        if (arr.length >= 12) {
          // HEIC/HEIF: bytes 4-7 devem ser 'ftyp' (66 74 79 70)
          const ftyp = String.fromCharCode(arr[4], arr[5], arr[6], arr[7]);
          if (ftyp === 'ftyp') {
            const brand = String.fromCharCode(arr[8], arr[9], arr[10], arr[11]).toLowerCase();
            const heicBrands = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'];
            if (heicBrands.some(b => brand.startsWith(b.substring(0, 3)))) {
              resolve(true);
              return;
            }
          }
        }
        resolve(false);
      } catch {
        resolve(false);
      }
    };
    reader.onerror = () => resolve(false);
    reader.readAsArrayBuffer(file.slice(0, 16));
  });
}

/**
 * Processa imagem com compressão otimizada
 * - Redimensiona para max configurado (mantém aspect ratio)
 * - Comprime com qualidade configurável
 * - Usa JPEG (menor que PNG para fotos)
 * - Fallback: retorna o blob original se o canvas falhar
 */
export async function processImage(
  file: File | Blob,
  options: ProcessImageOptions = {}
): Promise<Blob> {
  const {
    maxWidth = 1920,
    maxHeight = 1920,
    quality = 0.82,
  } = options;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();

      img.onload = () => {
        try {
          let width = img.width;
          let height = img.height;

          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            console.warn('[processImage] Canvas context unavailable, using original file');
            resolve(file instanceof Blob ? file : new Blob([file], { type: 'image/jpeg' }));
            return;
          }

          // Fundo branco para evitar fundo preto em JPEG
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (blob && blob.size > 0) {
                resolve(blob);
              } else {
                console.warn('[processImage] canvas.toBlob returned null, using original');
                resolve(file instanceof Blob ? file : new Blob([file], { type: 'image/jpeg' }));
              }
            },
            'image/jpeg',
            quality
          );
        } catch (err) {
          console.error('[processImage] Canvas error:', err);
          resolve(file instanceof Blob ? file : new Blob([file], { type: 'image/jpeg' }));
        }
      };

      img.onerror = (err) => {
        console.error('[processImage] Image load error:', err);
        reject(new Error('Não foi possível carregar a imagem. Tente novamente.'));
      };

      img.src = e.target?.result as string;
    };

    reader.onerror = () => {
      reject(new Error('Erro ao ler o arquivo de imagem.'));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Converte Blob para base64 string (data URL)
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Erro ao converter imagem para base64'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Formata tamanho de arquivo para exibição
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Converte arquivo HEIC para JPEG (com fallback para PNG)
 */
export async function convertHEICToJPEG(file: File): Promise<File> {
  try {
    console.log('[convertHEICToJPEG] Converting:', file.name, formatFileSize(file.size));
    const convertedBlob = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.85,
    });
    const blob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
    const fileName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
    const result = new File([blob], fileName, { type: 'image/jpeg' });
    console.log('[convertHEICToJPEG] Done:', formatFileSize(result.size));
    return result;
  } catch (jpegError) {
    console.warn('[convertHEICToJPEG] JPEG failed, trying PNG:', jpegError);
    try {
      const convertedBlob = await heic2any({ blob: file, toType: 'image/png', quality: 1 });
      const blob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
      const fileName = file.name.replace(/\.(heic|heif)$/i, '.png');
      return new File([blob], fileName, { type: 'image/png' });
    } catch (pngError) {
      console.error('[convertHEICToJPEG] Both conversions failed:', pngError);
      throw new Error('Não foi possível converter a imagem HEIC. Tente tirar a foto novamente.');
    }
  }
}

// Alias para compatibilidade com código existente
export const convertHEICToPNG = convertHEICToJPEG;

/**
 * Processa arquivo de imagem com conversão automática de HEIC
 * Detecta por mime type E por magic bytes (mais confiável no iOS Safari)
 */
export async function processImageFile(file: File): Promise<File> {
  // Verificar por mime type/extensão primeiro
  if (isHEIC(file)) {
    console.log('[processImageFile] HEIC detected by mime/extension');
    return await convertHEICToJPEG(file);
  }

  // Verificar por magic bytes (iOS às vezes não define mime type corretamente)
  const heicByBytes = await isHEICByMagicBytes(file);
  if (heicByBytes) {
    console.log('[processImageFile] HEIC detected by magic bytes');
    return await convertHEICToJPEG(file);
  }

  return file;
}

/**
 * Pipeline completo de processamento de imagem para upload
 * Nunca lança exceção — sempre retorna algo utilizável
 */
export async function prepareImageForUpload(
  file: File,
  options: ProcessImageOptions = {}
): Promise<{
  blob: Blob;
  base64: string;
  originalSize: string;
  compressedSize: string;
  reduction: number;
  mimeType: string;
}> {
  const originalSize = file.size;
  const originalSizeStr = formatFileSize(originalSize);

  // Passo 1: Converter HEIC se necessário
  let processedFile: File = file;
  try {
    processedFile = await processImageFile(file);
  } catch (heicError) {
    console.error('[prepareImageForUpload] HEIC conversion failed:', heicError);
  }

  // Passo 2: Comprimir imagem
  let processedBlob: Blob;
  try {
    processedBlob = await processImage(processedFile, {
      maxWidth: options.maxWidth ?? 1920,
      maxHeight: options.maxHeight ?? 1920,
      quality: options.quality ?? 0.82,
    });
  } catch (compressError) {
    console.error('[prepareImageForUpload] Compression failed, using original:', compressError);
    processedBlob = processedFile;
  }

  // Passo 3: Converter para base64
  const base64 = await blobToBase64(processedBlob);

  const compressedSize = processedBlob.size;
  const compressedSizeStr = formatFileSize(compressedSize);
  const reduction = originalSize > 0
    ? Math.max(0, Math.round((1 - compressedSize / originalSize) * 100))
    : 0;

  return {
    blob: processedBlob,
    base64,
    originalSize: originalSizeStr,
    compressedSize: compressedSizeStr,
    reduction,
    mimeType: processedBlob.type || 'image/jpeg',
  };
}

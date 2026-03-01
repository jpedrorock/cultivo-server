/**
 * Storage — Armazenamento Local de Arquivos
 *
 * Versão servidor independente: sem AWS SDK, sem MinIO, sem S3.
 * Salva arquivos diretamente no disco do servidor.
 *
 * Compatível com o código existente que importa de './_core/storage'.
 */

import {
  storageLocalPut,
  storageLocalGet,
  storageLocalDelete,
} from '../storageLocal';

export interface FileMetadata {
  key: string;
  url: string;
  contentType: string;
  size: number;
  uploadedAt: Date;
}

/**
 * Faz upload de um arquivo para o disco do servidor
 */
export async function uploadFile(
  fileBuffer: Buffer,
  fileName: string,
  contentType: string = 'application/octet-stream',
  _metadata?: Record<string, string>
): Promise<FileMetadata> {
  const key = `uploads/${Date.now()}-${fileName}`;
  const { url } = await storageLocalPut(key, fileBuffer, contentType);

  return {
    key,
    url,
    contentType,
    size: fileBuffer.length,
    uploadedAt: new Date(),
  };
}

/**
 * Faz upload de uma imagem (sem compressão — o frontend já comprime)
 */
export async function uploadImage(
  fileBuffer: Buffer,
  fileName: string,
  _metadata?: Record<string, string>
): Promise<FileMetadata> {
  return uploadFile(fileBuffer, fileName, 'image/jpeg');
}

/**
 * Retorna a URL pública de um arquivo
 */
export function getPublicUrl(key: string): string {
  return `/uploads/${key.replace(/^\/+/, '')}`;
}

/**
 * Retorna a URL de download de um arquivo (sem expiração — é uma URL estática)
 */
export async function getSignedDownloadUrl(
  key: string,
  _expiresIn: number = 3600
): Promise<string> {
  const { url } = await storageLocalGet(key);
  return url;
}

/**
 * Deleta um arquivo do disco
 */
export async function deleteFile(key: string): Promise<void> {
  await storageLocalDelete(key);
}

/**
 * Inicialização — não necessária para armazenamento local
 */
export async function initializeBucket(): Promise<void> {
  console.log('[Storage] Usando armazenamento local (disco do servidor)');
}

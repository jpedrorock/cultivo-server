/**
 * Sistema unificado de storage — Armazenamento Local
 *
 * Salva arquivos diretamente no disco do servidor, na pasta /uploads.
 * As imagens são servidas como arquivos estáticos via Express.
 *
 * Não há dependência de serviços externos (S3, MinIO, etc.).
 * Tudo roda no próprio servidor.
 */

import {
  storageLocalPut,
  storageLocalGet,
  storageLocalDelete,
  storageLocalList,
} from './storageLocal';

/**
 * Salva arquivo no disco do servidor
 * @param relKey - Caminho relativo do arquivo (ex: "plant-photos/123456.jpg")
 * @param data - Dados do arquivo (Buffer, Uint8Array ou string)
 * @param contentType - Tipo MIME do arquivo
 * @returns Objeto com key e url pública do arquivo
 */
export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = 'application/octet-stream'
): Promise<{ key: string; url: string }> {
  return storageLocalPut(relKey, data, contentType);
}

/**
 * Obtém URL pública de um arquivo no disco
 * @param relKey - Caminho relativo do arquivo
 * @returns Objeto com key e url pública
 */
export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  return storageLocalGet(relKey);
}

/**
 * Deleta arquivo do disco do servidor
 * @param relKey - Caminho relativo do arquivo
 */
export async function storageDelete(relKey: string): Promise<void> {
  return storageLocalDelete(relKey);
}

/**
 * Lista arquivos em um diretório do disco
 * @param prefix - Prefixo do caminho (ex: "plant-photos/")
 * @returns Array de objetos com key e url
 */
export async function storageList(prefix: string): Promise<Array<{ key: string; url: string }>> {
  return storageLocalList(prefix);
}

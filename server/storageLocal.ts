/**
 * Sistema de armazenamento local de arquivos
 *
 * Salva arquivos diretamente no disco do servidor.
 * Não depende de nenhum serviço externo (S3, MinIO, etc.).
 *
 * Estrutura de pastas:
 *   uploads/
 *     plant-photos/     → fotos de plantas
 *     health-logs/      → fotos de registros de saúde
 *     daily-logs/       → fotos de registros diários
 *     exports/          → arquivos exportados
 *
 * As imagens são servidas como arquivos estáticos via Express:
 *   GET /uploads/plant-photos/123456.jpg
 *
 * Implementação 100% async (fs/promises) — `writeFileSync` no path quente
 * de upload bloqueava o event loop e degradava throughput sob carga.
 * Apenas `initializeStorageDirectories` segue síncrono pois roda 1x no boot
 * antes do servidor aceitar conexões.
 */

import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';

// Diretório base para uploads (relativo à raiz do projeto)
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');

/**
 * Garante que o diretório existe (async).
 * mkdir com recursive=true é idempotente — não falha se já existir.
 */
async function ensureDirExistsAsync(dirPath: string): Promise<void> {
  await fsp.mkdir(dirPath, { recursive: true });
}

/**
 * Normaliza a chave removendo barras iniciais
 */
function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, '');
}

/**
 * Salva arquivo no disco do servidor
 * @param relKey - Caminho relativo do arquivo (ex: "plant-photos/123456.jpg")
 * @param data - Dados do arquivo (Buffer, Uint8Array ou string)
 * @param contentType - Tipo MIME do arquivo (não usado no local, apenas para compatibilidade)
 * @returns Objeto com key e url pública do arquivo
 */
export async function storageLocalPut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _contentType = 'application/octet-stream'
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const filePath = path.join(UPLOADS_DIR, key);

  // Criar diretórios intermediários se não existirem
  await ensureDirExistsAsync(path.dirname(filePath));

  // Converter dados para Buffer se necessário
  let buffer: Buffer;
  if (typeof data === 'string') {
    buffer = Buffer.from(data, 'base64');
  } else if (data instanceof Uint8Array) {
    buffer = Buffer.from(data);
  } else {
    buffer = data;
  }

  // Salvar arquivo no disco — async, não bloqueia event loop
  await fsp.writeFile(filePath, buffer);

  console.log(`[StorageLocal] Saved: ${key} (${buffer.length} bytes)`);

  return {
    key,
    url: `/uploads/${key}`,
  };
}

/**
 * Obtém URL pública de um arquivo no disco
 * @param relKey - Caminho relativo do arquivo
 * @returns Objeto com key e url pública
 */
export async function storageLocalGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return {
    key,
    url: `/uploads/${key}`,
  };
}

/**
 * Deleta arquivo do disco do servidor
 * @param relKey - Caminho relativo do arquivo
 */
export async function storageLocalDelete(relKey: string): Promise<void> {
  const key = normalizeKey(relKey);
  const filePath = path.join(UPLOADS_DIR, key);

  try {
    await fsp.unlink(filePath);
    console.log(`[StorageLocal] Deleted: ${key}`);
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      console.warn(`[StorageLocal] File not found for deletion: ${key}`);
      return;
    }
    throw err;
  }
}

/**
 * Lista arquivos em um diretório do disco
 * @param prefix - Prefixo do caminho (ex: "plant-photos/")
 * @returns Array de objetos com key e url
 */
export async function storageLocalList(
  prefix: string
): Promise<Array<{ key: string; url: string }>> {
  const normalizedPrefix = normalizeKey(prefix);
  const dirPath = path.join(UPLOADS_DIR, normalizedPrefix);

  // readdir com withFileTypes evita um stat por entrada
  const files: Array<{ key: string; url: string }> = [];

  async function walkDir(dir: string, basePrefix: string) {
    let items: import('fs').Dirent[];
    try {
      items = await fsp.readdir(dir, { withFileTypes: true });
    } catch (err: any) {
      if (err?.code === 'ENOENT') return;
      throw err;
    }
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        await walkDir(fullPath, path.join(basePrefix, item.name));
      } else {
        const key = path.join(basePrefix, item.name).replace(/\\/g, '/');
        files.push({ key, url: `/uploads/${key}` });
      }
    }
  }

  await walkDir(dirPath, normalizedPrefix);
  return files;
}

/**
 * Verifica se um arquivo existe no disco (async).
 * Usa stat em vez de existsSync (deprecated por race conditions e bloqueio).
 */
export async function storageLocalExists(relKey: string): Promise<boolean> {
  const key = normalizeKey(relKey);
  try {
    await fsp.access(path.join(UPLOADS_DIR, key), fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Retorna o tamanho total em bytes do diretório de uploads (async).
 */
export async function storageLocalGetTotalSize(): Promise<number> {
  let total = 0;

  async function calcSize(dir: string): Promise<void> {
    let items: import('fs').Dirent[];
    try {
      items = await fsp.readdir(dir, { withFileTypes: true });
    } catch (err: any) {
      if (err?.code === 'ENOENT') return;
      throw err;
    }
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        await calcSize(fullPath);
      } else {
        const stat = await fsp.stat(fullPath);
        total += stat.size;
      }
    }
  }

  await calcSize(UPLOADS_DIR);
  return total;
}

/**
 * Inicializa a estrutura de diretórios de uploads.
 *
 * SÍNCRONO de propósito: roda 1x no boot, antes do server.listen.
 * Garantir que os diretórios existam antes de qualquer request faz
 * código upstream mais simples (sem race entre boot e primeiro upload).
 */
export function initializeStorageDirectories(): void {
  const dirs = ['plant-photos', 'health-logs', 'daily-logs', 'exports'];

  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  for (const dir of dirs) {
    fs.mkdirSync(path.join(UPLOADS_DIR, dir), { recursive: true });
  }

  console.log(`[StorageLocal] Storage initialized at: ${UPLOADS_DIR}`);
}

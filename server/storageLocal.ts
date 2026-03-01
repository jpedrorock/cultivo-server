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
 */

import fs from 'fs';
import path from 'path';

// Diretório base para uploads (relativo à raiz do projeto)
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');

/**
 * Garante que o diretório de uploads (e subdiretórios) existe
 */
function ensureDirExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
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
  contentType = 'application/octet-stream'
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const filePath = path.join(UPLOADS_DIR, key);

  // Criar diretórios intermediários se não existirem
  ensureDirExists(path.dirname(filePath));

  // Converter dados para Buffer se necessário
  let buffer: Buffer;
  if (typeof data === 'string') {
    buffer = Buffer.from(data, 'base64');
  } else if (data instanceof Uint8Array) {
    buffer = Buffer.from(data);
  } else {
    buffer = data;
  }

  // Salvar arquivo no disco
  fs.writeFileSync(filePath, buffer);

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

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log(`[StorageLocal] Deleted: ${key}`);
  } else {
    console.warn(`[StorageLocal] File not found for deletion: ${key}`);
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

  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const files: Array<{ key: string; url: string }> = [];

  function walkDir(dir: string, basePrefix: string) {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        walkDir(fullPath, path.join(basePrefix, item));
      } else {
        const key = path.join(basePrefix, item).replace(/\\/g, '/');
        files.push({ key, url: `/uploads/${key}` });
      }
    }
  }

  walkDir(dirPath, normalizedPrefix);
  return files;
}

/**
 * Verifica se um arquivo existe no disco
 * @param relKey - Caminho relativo do arquivo
 */
export function storageLocalExists(relKey: string): boolean {
  const key = normalizeKey(relKey);
  return fs.existsSync(path.join(UPLOADS_DIR, key));
}

/**
 * Retorna o tamanho total em bytes do diretório de uploads
 */
export function storageLocalGetTotalSize(): number {
  let total = 0;

  function calcSize(dir: string) {
    if (!fs.existsSync(dir)) return;
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        calcSize(fullPath);
      } else {
        total += stat.size;
      }
    }
  }

  calcSize(UPLOADS_DIR);
  return total;
}

/**
 * Inicializa a estrutura de diretórios de uploads
 */
export function initializeStorageDirectories(): void {
  const dirs = [
    'plant-photos',
    'health-logs',
    'daily-logs',
    'exports',
  ];

  ensureDirExists(UPLOADS_DIR);

  for (const dir of dirs) {
    ensureDirExists(path.join(UPLOADS_DIR, dir));
  }

  console.log(`[StorageLocal] Storage initialized at: ${UPLOADS_DIR}`);
}

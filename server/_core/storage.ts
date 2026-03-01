import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ENV } from './env';
import sharp from 'sharp';

/**
 * Cliente S3 configurado para MinIO
 */
const s3Client = new S3Client({
  region: ENV.s3Region || 'us-east-1',
  endpoint: ENV.s3Endpoint,
  credentials: {
    accessKeyId: ENV.s3AccessKey,
    secretAccessKey: ENV.s3SecretKey,
  },
  forcePathStyle: true, // Essencial para MinIO
});

/**
 * Interface para metadados de arquivo
 */
export interface FileMetadata {
  bucket: string;
  key: string;
  contentType: string;
  size: number;
  uploadedAt: Date;
}

/**
 * Comprime uma imagem para aspect ratio 3:4
 */
export async function compressImage(
  buffer: Buffer,
  options: {
    width?: number;
    height?: number;
    quality?: number;
  } = {}
): Promise<Buffer> {
  const { width = 400, height = 533, quality = 80 } = options; // 3:4 ratio

  return sharp(buffer)
    .resize(width, height, {
      fit: 'cover',
      position: 'center',
    })
    .jpeg({ quality, progressive: true })
    .toBuffer();
}

/**
 * Faz upload de um arquivo para o S3/MinIO
 */
export async function uploadFile(
  fileBuffer: Buffer,
  fileName: string,
  contentType: string = 'application/octet-stream',
  metadata?: Record<string, string>
): Promise<FileMetadata> {
  const bucket = ENV.s3Bucket;
  const key = `${Date.now()}-${fileName}`;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: fileBuffer,
    ContentType: contentType,
    Metadata: metadata,
  });

  try {
    await s3Client.send(command);

    return {
      bucket,
      key,
      contentType,
      size: fileBuffer.length,
      uploadedAt: new Date(),
    };
  } catch (error) {
    console.error('[Storage] Upload failed', error);
    throw new Error('Falha ao fazer upload do arquivo');
  }
}

/**
 * Faz upload de uma imagem comprimida
 */
export async function uploadImage(
  fileBuffer: Buffer,
  fileName: string,
  metadata?: Record<string, string>
): Promise<FileMetadata> {
  // Comprimir imagem para aspect ratio 3:4
  const compressedBuffer = await compressImage(fileBuffer);

  // Upload
  return uploadFile(compressedBuffer, fileName, 'image/jpeg', metadata);
}

/**
 * Gera uma URL pré-assinada para download
 */
export async function getSignedDownloadUrl(
  key: string,
  expiresIn: number = 3600 // 1 hora
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: ENV.s3Bucket,
    Key: key,
  });

  try {
    return await getSignedUrl(s3Client, command, { expiresIn });
  } catch (error) {
    console.error('[Storage] Failed to generate signed URL', error);
    throw new Error('Falha ao gerar URL de download');
  }
}

/**
 * Gera uma URL pré-assinada para upload
 */
export async function getSignedUploadUrl(
  fileName: string,
  expiresIn: number = 3600 // 1 hora
): Promise<string> {
  const key = `${Date.now()}-${fileName}`;

  const command = new PutObjectCommand({
    Bucket: ENV.s3Bucket,
    Key: key,
  });

  try {
    return await getSignedUrl(s3Client, command, { expiresIn });
  } catch (error) {
    console.error('[Storage] Failed to generate signed upload URL', error);
    throw new Error('Falha ao gerar URL de upload');
  }
}

/**
 * Deleta um arquivo do S3/MinIO
 */
export async function deleteFile(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: ENV.s3Bucket,
    Key: key,
  });

  try {
    await s3Client.send(command);
  } catch (error) {
    console.error('[Storage] Delete failed', error);
    throw new Error('Falha ao deletar arquivo');
  }
}

/**
 * Obtém a URL pública de um arquivo (funciona se o bucket for público)
 */
export function getPublicUrl(key: string): string {
  const endpoint = ENV.s3Endpoint.replace(/\/$/, ''); // Remove trailing slash
  const bucket = ENV.s3Bucket;
  return `${endpoint}/${bucket}/${key}`;
}

/**
 * Inicializa o bucket se não existir
 */
export async function initializeBucket(): Promise<void> {
  try {
    // Tentar criar o bucket
    // Nota: MinIO pode não suportar CreateBucket via SDK, então isso pode falhar
    // Você pode criar o bucket manualmente via console MinIO
    console.log('[Storage] Bucket initialization skipped (create manually via MinIO console)');
  } catch (error) {
    console.warn('[Storage] Bucket initialization warning', error);
  }
}

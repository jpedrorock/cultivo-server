/**
 * Upload Router — POST /api/upload/image
 *
 * Aceita multipart/form-data com campo "file".
 * Converte qualquer formato (incluindo HEIC do iPhone) para JPEG via sharp,
 * redimensiona para máximo 1920px, e faz upload para S3.
 * Retorna { url: string } com a URL pública do S3.
 */
import { Router, Request, Response } from "express";
import multer from "multer";
import sharp from "sharp";
import { storagePut } from "./storage";

const router = Router();

// Multer: armazena em memória (sem disco), limite de 20MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (_req, file, cb) => {
    // Aceitar qualquer imagem — incluindo HEIC (image/heic, image/heif) e sem mime type
    const allowed = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/gif",
      "image/heic",
      "image/heif",
      "image/avif",
      "image/tiff",
      "application/octet-stream", // iOS às vezes envia HEIC sem mime type
      "",
    ];
    const mime = (file.mimetype || "").toLowerCase();
    if (allowed.includes(mime) || mime.startsWith("image/")) {
      cb(null, true);
    } else {
      // Aceitar mesmo assim — sharp vai tentar processar
      cb(null, true);
    }
  },
});

router.post(
  "/image",
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Nenhum arquivo enviado." });
      }

      const buffer = req.file.buffer;
      const originalName = req.file.originalname || "photo";

      // Processar com sharp: converte HEIC/qualquer formato → JPEG, redimensiona
      let processedBuffer: Buffer;
      try {
        processedBuffer = await sharp(buffer, {
          // Força leitura mesmo sem header correto (HEIC sem mime type)
          failOn: "none",
        })
          .rotate() // Corrige orientação EXIF automaticamente
          .resize(1920, 1920, {
            fit: "inside",
            withoutEnlargement: true,
          })
          .jpeg({
            quality: 82,
            progressive: true,
            mozjpeg: true,
          })
          .toBuffer();
      } catch (sharpError) {
        console.error("[upload] sharp processing failed:", sharpError);
        // Fallback: enviar o buffer original sem processar
        processedBuffer = buffer;
      }

      // Gerar chave única no S3
      const timestamp = Date.now();
      const random = Math.random().toString(36).slice(2, 8);
      const baseName = originalName.replace(/\.[^.]+$/, "").replace(/[^a-z0-9]/gi, "_").slice(0, 30);
      const fileKey = `plant-photos/${timestamp}-${random}-${baseName}.jpg`;

      // Upload para S3
      const { url } = await storagePut(fileKey, processedBuffer, "image/jpeg");

      console.log(`[upload] Success: ${fileKey} (${processedBuffer.length} bytes) → ${url}`);

      return res.json({ url });
    } catch (error) {
      console.error("[upload] Error:", error);
      return res.status(500).json({ error: "Erro ao processar o upload da imagem." });
    }
  }
);

export default router;

/**
 * Upload Router — POST /api/upload/image
 *
 * Aceita multipart/form-data com campo "file".
 * Envia o arquivo diretamente para o S3/CDN sem processamento no servidor.
 * O browser já faz a compressão e conversão antes de enviar (via canvas no frontend).
 * Retorna { url: string } com a URL pública do S3.
 *
 * Nota: Não usa sharp para evitar problemas com binários nativos no ambiente de deploy.
 */
import { Router, Request, Response } from "express";
import multer from "multer";
import { storagePut } from "./storage";

const router = Router();

// Multer: armazena em memória (sem disco), limite de 20MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (_req, _file, cb) => {
    // Aceitar qualquer arquivo — o frontend já garante que é imagem
    cb(null, true);
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
      const mimeType = req.file.mimetype || "image/jpeg";

      // Determinar extensão baseada no mime type
      const extMap: Record<string, string> = {
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif",
        "image/heic": "heic",
        "image/heif": "heif",
      };
      const ext = extMap[mimeType.toLowerCase()] || "jpg";

      // Gerar chave única no S3
      const timestamp = Date.now();
      const random = Math.random().toString(36).slice(2, 8);
      const baseName = originalName
        .replace(/\.[^.]+$/, "")
        .replace(/[^a-z0-9]/gi, "_")
        .slice(0, 30);
      const fileKey = `plant-photos/${timestamp}-${random}-${baseName}.${ext}`;

      // Upload direto para S3 sem processamento
      const { url } = await storagePut(fileKey, buffer, mimeType);

      console.log(`[upload] Success: ${fileKey} (${buffer.length} bytes) → ${url}`);

      return res.json({ url });
    } catch (error) {
      console.error("[upload] Error:", error);
      return res.status(500).json({ error: "Erro ao processar o upload da imagem." });
    }
  }
);

export default router;

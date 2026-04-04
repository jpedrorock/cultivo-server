/**
 * Upload Router — POST /api/upload/image
 *
 * Aceita multipart/form-data com campo "file".
 * Envia o arquivo diretamente para o S3/CDN sem processamento no servidor.
 * O browser já faz a compressão e conversão antes de enviar (via canvas no frontend).
 * Retorna { url: string } com a URL pública do S3.
 *
 * Também expõe GET /thumbnail?url=...&w=200&h=267&q=70
 * para servir imagens redimensionadas com sharp (evita carregar originais 1920px em cards pequenos).
 */
import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { storagePut } from "./storage";

// Sharp: importado dinamicamente para não quebrar em ambientes sem binários nativos
let sharpLib: typeof import("sharp") | null = null;
try {
  sharpLib = require("sharp");
} catch {
  console.warn("[thumbnail] sharp não disponível — thumbnails servem original");
}

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
      const errMsg = error instanceof Error ? error.message : String(error);
      const errStack = error instanceof Error ? error.stack : undefined;
      console.error("[upload] Error:", errMsg);
      if (errStack) console.error("[upload] Stack:", errStack);
      return res.status(500).json({ error: "Erro ao processar o upload da imagem.", detail: errMsg });
    }
  }
);

// GET /thumbnail?url=/uploads/plant-photos/xxx.jpg&w=200&h=267&q=70
router.get("/thumbnail", async (req: Request, res: Response) => {
  try {
    const { url, w, h, q } = req.query as Record<string, string>;
    if (!url) return res.status(400).json({ error: "url param required" });

    const width  = Math.min(parseInt(w || "200", 10) || 200, 800);
    const height = parseInt(h || "0", 10) || undefined;
    const quality = Math.min(parseInt(q || "70", 10) || 70, 100);

    // Only serve local /uploads files for security
    if (!url.startsWith("/uploads/")) {
      return res.redirect(url);
    }

    const uploadsDir = path.resolve(process.cwd(), "uploads");
    const relativePath = url.replace(/^\/uploads\//, "");
    const filePath = path.resolve(uploadsDir, relativePath);

    // Prevent path traversal
    if (!filePath.startsWith(uploadsDir)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File not found" });
    }

    if (!sharpLib) {
      // Fallback: serve original
      return res.sendFile(filePath);
    }

    const sharp = sharpLib as any;
    const buffer = await sharp(filePath)
      .resize(width, height || null, { fit: "cover", position: "centre" })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();

    res.set({
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "Vary": "Accept",
    });
    return res.send(buffer);
  } catch (error) {
    console.error("[thumbnail] Error:", error);
    return res.status(500).json({ error: "Thumbnail error" });
  }
});

export default router;

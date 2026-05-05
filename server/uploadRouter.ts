/**
 * Upload Router — endpoints autenticados de imagens.
 *
 * Segurança:
 *  - Toda rota exige sessão JWT válida (cookie ou Bearer).
 *  - mimetype declarado pelo cliente é IGNORADO — formato é detectado por
 *    sharp.metadata() lendo magic bytes do buffer.
 *  - Buffer é RE-ENCODADO via sharp antes de gravar — qualquer payload
 *    embedado em metadata/EXIF é descartado, e o resultado é forçadamente
 *    um JPEG/WebP/PNG válido.
 *  - Rate limit por IP no upload (50/hora) para mitigar enchimento de disco.
 *  - GET /thumbnail só atende paths internos `/uploads/...`. Antes redirectava
 *    para qualquer URL externa (open redirect — vetor clássico de phishing).
 */
import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import fsp from "fs/promises";
import rateLimit from "express-rate-limit";
import { storagePut } from "./storage";
import { authenticateRequest } from "./_core/auth";

// Sharp: importado dinamicamente para não quebrar em ambientes sem binários nativos
let sharpLib: typeof import("sharp") | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  sharpLib = require("sharp");
} catch {
  console.warn("[upload] sharp não disponível — uploads de imagem ficarão indisponíveis");
}

const router = Router();

// ── Auth middleware ─────────────────────────────────────────────────────────

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = await authenticateRequest(req);
  if (!user) {
    return res.status(401).json({ error: "Autenticação necessária" });
  }
  // Anexa o user ao request para os handlers
  (req as any).user = user;
  next();
}

// Aplica auth em TODAS as rotas deste router
router.use(requireAuth);

// Rate limit por IP — 50 uploads/hora é suficiente para uso normal
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 50,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: "Muitos uploads. Aguarde antes de tentar novamente." },
});

// ── Upload de imagem ────────────────────────────────────────────────────────

// Multer em memória, limite 20MB. fileFilter relaxado (mimetype do cliente
// não é confiável); validação real é feita por sharp.metadata() abaixo.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

// Formatos sharp que aceitamos e como tratá-los na saída
const ACCEPTED_FORMATS = new Set(["jpeg", "jpg", "png", "webp", "gif", "heif", "heic", "avif"]);

router.post(
  "/image",
  uploadLimiter,
  upload.single("file"),
  async (req: Request, res: Response) => {
    const userId = (req as any).user?.id as number | undefined;

    if (!sharpLib) {
      return res.status(503).json({ error: "Processamento de imagens indisponível no servidor" });
    }
    if (!req.file) {
      return res.status(400).json({ error: "Nenhum arquivo enviado." });
    }

    const sharp = sharpLib;
    const inputBuffer = req.file.buffer;

    // 1) Detectar formato real lendo magic bytes (não confiar no mimetype do cliente).
    //    Erros aqui são quase sempre arquivo corrompido ou tipo errado — devolve 400.
    let metadata: import("sharp").Metadata;
    try {
      metadata = await sharp(inputBuffer).metadata();
    } catch (err) {
      console.warn(`[upload] metadata fail user=${userId} size=${inputBuffer.length} mime=${req.file.mimetype}: ${(err as Error)?.message}`);
      return res.status(400).json({ error: "Arquivo enviado não é uma imagem válida ou está corrompido." });
    }

    const detectedFormat = (metadata.format || "").toLowerCase();
    if (!ACCEPTED_FORMATS.has(detectedFormat)) {
      return res.status(400).json({
        error: `Formato "${detectedFormat || "desconhecido"}" não suportado. Use JPEG, PNG, WebP, GIF ou HEIC.`,
      });
    }

    // 2) Re-encode — força saída válida e descarta EXIF/payloads embedados.
    //    Erros aqui podem ser sharp/libvips (HEIC sem suporte, GIF malformado, etc.) —
    //    devolve 422 com a causa real para o usuário entender o problema.
    let outBuffer: Buffer;
    let outMime: string;
    let outExt: string;

    try {
      if (detectedFormat === "png") {
        outBuffer = await sharp(inputBuffer).png({ compressionLevel: 8 }).toBuffer();
        outMime = "image/png"; outExt = "png";
      } else if (detectedFormat === "webp") {
        outBuffer = await sharp(inputBuffer, { animated: true }).webp({ quality: 85 }).toBuffer();
        outMime = "image/webp"; outExt = "webp";
      } else if (detectedFormat === "gif") {
        outBuffer = await sharp(inputBuffer, { animated: true }).gif().toBuffer();
        outMime = "image/gif"; outExt = "gif";
      } else if (detectedFormat === "heif" || detectedFormat === "heic") {
        // HEIC do iPhone — converter explicitamente para JPEG
        // Pode falhar se libvips foi compilada sem suporte HEIF (Alpine slim)
        try {
          outBuffer = await sharp(inputBuffer).rotate().jpeg({ quality: 88, mozjpeg: true }).toBuffer();
          outMime = "image/jpeg"; outExt = "jpg";
        } catch (heifErr) {
          console.error(`[upload] HEIC convert fail user=${userId} size=${inputBuffer.length}: ${(heifErr as Error)?.message}`);
          return res.status(422).json({
            error: "Servidor sem suporte para HEIC. Tire a foto em JPEG (Configurações iOS → Câmera → Formato → Mais Compatível) ou converta antes de enviar.",
          });
        }
      } else {
        // JPEG / AVIF / JFIF / outros → JPEG limpo, sem EXIF
        outBuffer = await sharp(inputBuffer).rotate().jpeg({ quality: 88, mozjpeg: true }).toBuffer();
        outMime = "image/jpeg"; outExt = "jpg";
      }
    } catch (err) {
      const errMsg = (err as Error)?.message ?? String(err);
      console.error(`[upload] sharp encode fail user=${userId} fmt=${detectedFormat} size=${inputBuffer.length}: ${errMsg}`);
      return res.status(422).json({
        error: `Não foi possível processar a imagem (${detectedFormat}). Tente outra foto ou outro formato.`,
      });
    }

    // 3) Persistir no storage. Falha aqui é problema do servidor (disco cheio,
    //    permissão, etc.) — devolve 500 com mensagem clara e log detalhado.
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 8);
    const fileKey = `plant-photos/${userId}-${timestamp}-${random}.${outExt}`;

    try {
      const { url } = await storagePut(fileKey, outBuffer, outMime);
      console.log(`[upload] user=${userId} ${detectedFormat}→${outExt} ${inputBuffer.length}B→${outBuffer.length}B → ${fileKey}`);
      return res.json({ url });
    } catch (err) {
      const errMsg = (err as Error)?.message ?? String(err);
      console.error(`[upload] storage fail user=${userId} key=${fileKey}: ${errMsg}`);
      return res.status(500).json({ error: "Falha ao salvar a imagem no servidor. Tente novamente." });
    }
  }
);

// ── Thumbnail ────────────────────────────────────────────────────────────────

router.get("/thumbnail", async (req: Request, res: Response) => {
  try {
    const { url, w, h, q } = req.query as Record<string, string>;
    if (!url) return res.status(400).json({ error: "url param required" });

    // SOMENTE paths internos /uploads/. Antes redirectava para qualquer URL
    // externa (open redirect — atacante usava o domínio do app pra phishing).
    if (!url.startsWith("/uploads/")) {
      return res.status(400).json({ error: "Apenas URLs locais /uploads/ são suportadas" });
    }

    const width  = Math.min(parseInt(w || "200", 10) || 200, 800);
    const height = parseInt(h || "0", 10) || undefined;
    const quality = Math.min(parseInt(q || "70", 10) || 70, 100);

    const uploadsDir = path.resolve(process.cwd(), "uploads");
    const relativePath = url.replace(/^\/uploads\//, "");
    const filePath = path.resolve(uploadsDir, relativePath);

    // Prevenção de path traversal
    const rel = path.relative(uploadsDir, filePath);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    try {
      await fsp.access(filePath);
    } catch {
      return res.status(404).json({ error: "File not found" });
    }

    if (!sharpLib) {
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

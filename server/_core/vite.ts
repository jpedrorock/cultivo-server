import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
// vite é importado dinamicamente para não ser exigido em produção (é devDependency)

export async function setupVite(app: Express, server: Server) {
  const { createServer: createViteServer } = await import("vite");

  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  // Não importamos vite.config aqui — Vite descobre o arquivo automaticamente
  // pelo cwd. Isso evita que @tailwindcss/vite (devDep) entre no bundle de produção.
  const vite = await createViteServer({
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  // Em produção, dist/index.js está em dist/, então 'public' resolve para dist/public
  // Em desenvolvimento com tsx, o arquivo está em server/_core/, então precisamos subir 2 níveis
  const isCompiledBuild = import.meta.dirname.endsWith("/dist") || import.meta.dirname.endsWith("\\dist");
  const distPath = isCompiledBuild
    ? path.resolve(import.meta.dirname, "public")
    : path.resolve(import.meta.dirname, "../..", "dist", "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use(express.static(distPath));

  // SPA fallback — devolve index.html SÓ pra rotas de página (HTML).
  //
  // BUG ANTIGO: o `app.use("*")` devolvia index.html pra QUALQUER 404,
  // incluindo `/assets/<chunk-antigo>.js`. Quando o usuário ficava com a
  // app aberta durante um deploy, ao navegar pra outra rota o lazy-loader
  // pedia chunks com hashes antigos. O servidor (que já tinha a build
  // nova com hashes diferentes) não achava o arquivo, caía no fallback
  // e devolvia index.html com Content-Type: text/html. Browser:
  //
  //   "Failed to load module script: Expected a JavaScript-or-Wasm module
  //    script but the server responded with a MIME type of text/html"
  //
  // → app travada até user fazer hard reload.
  //
  // FIX: extensões de asset (.js, .css, .map, .wasm, .png, etc.) que não
  // existirem viram 404 cru. O cliente (main.tsx) tem handler de
  // `vite:preloadError` que captura e recarrega a página → user pega a
  // build nova de forma transparente.
  const ASSET_EXT_RE = /\.(?:js|mjs|cjs|css|map|wasm|json|woff2?|ttf|otf|eot|png|jpe?g|gif|svg|webp|avif|ico|mp4|webm|mp3|wav|pdf|txt|xml)$/i;

  app.use("*", (req, res) => {
    if (ASSET_EXT_RE.test(req.originalUrl.split("?")[0])) {
      // Asset que não existe — 404 explícito pro browser detectar e o
      // client recarregar.
      res.status(404).type("text/plain").send("Not Found");
      return;
    }
    // Rota de página (sem extensão de asset) → SPA fallback OK
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}

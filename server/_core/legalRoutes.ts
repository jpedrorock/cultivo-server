import type { Express, Request, Response } from "express";
import { privacyPolicyHtml, termsOfServiceHtml } from "./legalPages";

/**
 * Serve as páginas legais em /privacy e /terms.
 *
 * Servidas como HTML estático puro (sem SPA) porque:
 *   1. Crawlers da Apple/Google Play scrapeiam essas URLs durante App Review
 *      pra validar que existem. Sem JS executável, sem dúvida.
 *   2. Carrega instantâneo em dispositivos lentos.
 *   3. Acessível mesmo se o app frontend estiver fora do ar.
 */
export function registerLegalRoutes(app: Express) {
  app.get("/privacy", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600"); // 1h cache
    res.send(privacyPolicyHtml);
  });

  app.get("/terms", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(termsOfServiceHtml);
  });
}

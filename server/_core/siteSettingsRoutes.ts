/**
 * siteSettingsRoutes.ts
 *
 * Endpoints REST para configurações globais do site (tabela siteSettings, singleton id=1).
 *
 * Rotas:
 *   GET  /api/public/site-settings  — sem autenticação; retorna campos públicos
 *   GET  /api/admin/site-settings   — requer role=admin
 *   PATCH /api/admin/site-settings  — requer role=admin; persiste no banco
 *
 * O painel /admin do cultivo-site (cultivo-site/src/pages/admin/index.astro) consome
 * estas rotas via fetch com credentials: "include" (cookie JWT).
 */

import type { Express, Request, Response } from "express";
import { getMysqlPool } from "../mysql-pool";
import { authenticateRequest } from "./auth";

const ALLOWED_ORIGINS = [
  "https://cultivo.pro",
  "https://www.cultivo.pro",
  "http://localhost:4321", // cultivo-site dev
];

function setCors(req: Request, res: Response): void {
  const origin = req.headers.origin ?? "";
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

export function registerSiteSettingsRoutes(app: Express): void {
  // ── OPTIONS preflight ────────────────────────────────────────────────────────
  app.options("/api/public/site-settings", (req, res) => {
    setCors(req, res);
    res.sendStatus(204);
  });
  app.options("/api/admin/site-settings", (req, res) => {
    setCors(req, res);
    res.sendStatus(204);
  });

  // ── GET /api/public/site-settings ────────────────────────────────────────────
  // Sem autenticação — retorna apenas campos que o site público precisa renderizar
  app.get("/api/public/site-settings", async (req: Request, res: Response) => {
    setCors(req, res);
    try {
      const pool = getMysqlPool();
      const [rows] = await pool.query(
        "SELECT `pricingPt`, `pricingEn`, `contactEmail` FROM `siteSettings` WHERE `id` = 1 LIMIT 1"
      ) as [Array<{ pricingPt: string | null; pricingEn: string | null; contactEmail: string | null }>, unknown];

      const row = rows[0] ?? { pricingPt: null, pricingEn: null, contactEmail: null };
      res.json({
        pricingPt:    row.pricingPt,
        pricingEn:    row.pricingEn,
        contactEmail: row.contactEmail,
      });
    } catch (err) {
      console.error("[site-settings] GET public error:", err);
      res.status(500).json({ error: "Erro interno" });
    }
  });

  // ── GET /api/admin/site-settings ─────────────────────────────────────────────
  // Requer autenticação + role=admin
  app.get("/api/admin/site-settings", async (req: Request, res: Response) => {
    setCors(req, res);
    const user = await authenticateRequest(req);
    if (!user) {
      res.status(401).json({ error: "Não autenticado" });
      return;
    }
    if (user.role !== "admin") {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    try {
      const pool = getMysqlPool();
      const [rows] = await pool.query(
        "SELECT `pricingPt`, `pricingEn`, `contactEmail`, `formspreeId`, `betaWaitlistEnabled`, `updatedAt` FROM `siteSettings` WHERE `id` = 1 LIMIT 1"
      ) as [Array<{
        pricingPt: string | null;
        pricingEn: string | null;
        contactEmail: string | null;
        formspreeId: string | null;
        betaWaitlistEnabled: number;
        updatedAt: Date;
      }>, unknown];

      const row = rows[0] ?? {
        pricingPt: null,
        pricingEn: null,
        contactEmail: null,
        formspreeId: null,
        betaWaitlistEnabled: 0,
        updatedAt: new Date(),
      };

      res.json({
        pricing: {
          pt: row.pricingPt,
          en: row.pricingEn,
        },
        contactEmail:        row.contactEmail,
        formspreeId:         row.formspreeId,
        betaWaitlistEnabled: Boolean(row.betaWaitlistEnabled),
        lastUpdated:         row.updatedAt,
      });
    } catch (err) {
      console.error("[site-settings] GET admin error:", err);
      res.status(500).json({ error: "Erro interno" });
    }
  });

  // ── PATCH /api/admin/site-settings ───────────────────────────────────────────
  // Requer autenticação + role=admin; atualiza campos no singleton id=1
  app.patch("/api/admin/site-settings", async (req: Request, res: Response) => {
    setCors(req, res);
    const user = await authenticateRequest(req);
    if (!user) {
      res.status(401).json({ error: "Não autenticado" });
      return;
    }
    if (user.role !== "admin") {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const {
      pricingPt,
      pricingEn,
      contactEmail,
      formspreeId,
      betaWaitlistEnabled,
    } = req.body as {
      pricingPt?: string;
      pricingEn?: string;
      contactEmail?: string;
      formspreeId?: string;
      betaWaitlistEnabled?: boolean;
    };

    try {
      const pool = getMysqlPool();
      await pool.query(
        `UPDATE \`siteSettings\` SET
           \`pricingPt\`           = ?,
           \`pricingEn\`           = ?,
           \`contactEmail\`        = ?,
           \`formspreeId\`         = ?,
           \`betaWaitlistEnabled\` = ?
         WHERE \`id\` = 1`,
        [
          pricingPt    ?? null,
          pricingEn    ?? null,
          contactEmail ?? null,
          formspreeId  ?? null,
          betaWaitlistEnabled ? 1 : 0,
        ]
      );

      // Retorna o updatedAt recém gerado pelo MySQL
      const [rows] = await pool.query(
        "SELECT `updatedAt` FROM `siteSettings` WHERE `id` = 1 LIMIT 1"
      ) as [Array<{ updatedAt: Date }>, unknown];

      res.json({ lastUpdated: rows[0]?.updatedAt ?? new Date() });
    } catch (err) {
      console.error("[site-settings] PATCH error:", err);
      res.status(500).json({ error: "Erro interno" });
    }
  });
}

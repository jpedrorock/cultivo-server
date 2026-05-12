/**
 * device — sub-router tRPC pra gestão de device tokens (ESP32 display) via web.
 *
 * Espelha o endpoint REST legado `POST /api/device/generate-token` (deviceRoutes.ts)
 * mas oferece API tRPC tipada pra UI nova (client/src/pages/Dispositivos.tsx).
 *
 * Cada token autoriza um ESP32 a falar com a API REST `/api/device/*`. Token
 * é amarrado a UMA estufa (tentId) + UM grupo (groupId) + UM dono (ownerUserId
 * — usado pelo /device-toggle pra pegar a config Tuya certa).
 *
 * Schema da tabela `deviceTokens`:
 *   id, token (64 hex), name, tentId, groupId, ownerUserId, createdAt
 *
 * Como `deviceTokens` é gerenciada via raw SQL no dbMigrations.ts e NÃO está
 * no drizzle/schema.ts, usamos raw queries via mysql-pool — mesmo padrão de
 * deviceRoutes.ts (consistência com o resto da feature).
 */
import { z } from "zod";
import crypto from "crypto";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getMysqlPool } from "../mysql-pool";
import { validateTentOwnership } from "./_helpers";

export const deviceRouter = router({
  /**
   * Lista todos os tokens do grupo do user logado.
   *
   * Join com `tents` pra trazer `tentName` — UI mostra "Display da Veg (Estufa 3)"
   * sem precisar de fetch extra.
   */
  listTokens: protectedProcedure.query(async ({ ctx }) => {
    const pool = getMysqlPool();
    const groupId = ctx.user.groupId;
    if (groupId == null) return [];

    const [rows]: any = await pool.execute(
      `SELECT
         dt.id, dt.token, dt.name, dt.tentId, dt.createdAt,
         t.name AS tentName
       FROM deviceTokens dt
       LEFT JOIN tents t ON t.id = dt.tentId
       WHERE dt.groupId = ?
       ORDER BY dt.createdAt DESC`,
      [groupId]
    );

    return (rows as any[]).map(r => ({
      id: r.id as number,
      token: r.token as string,
      name: r.name as string,
      tentId: r.tentId as number,
      tentName: (r.tentName as string | null) ?? null,
      createdAt: new Date(r.createdAt).toISOString(),
    }));
  }),

  /**
   * Cria um token novo pra uma estufa específica.
   *
   * - Valida ownership da estufa (anti-cross-tenant)
   * - `ownerUserId` = user que tá criando (importa pro /device-toggle decidir
   *    qual config Tuya usar quando o ESP chamar a API)
   * - Token = 64 hex chars (256-bit) gerados via crypto.randomBytes
   *
   * Retorna `{ token }` — UI mostra UMA vez pro user copiar; depois fica
   * mascarado (12 chars no início + 4 no fim).
   */
  createToken: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(100),
      tentId: z.number().int().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      await validateTentOwnership(input.tentId, ctx.user.groupId);
      const pool = getMysqlPool();
      const token = crypto.randomBytes(32).toString('hex');

      await pool.execute(
        `INSERT INTO deviceTokens (token, name, tentId, groupId, ownerUserId)
         VALUES (?, ?, ?, ?, ?)`,
        [token, input.name, input.tentId, ctx.user.groupId ?? 0, ctx.user.id]
      );

      return { token };
    }),

  /**
   * Remove um token. Multi-tenancy: WHERE id = ? AND groupId = ? pra evitar
   * que user de outro grupo apague tokens alheios via id-guessing.
   */
  deleteToken: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const pool = getMysqlPool();
      const [result]: any = await pool.execute(
        `DELETE FROM deviceTokens WHERE id = ? AND groupId = ?`,
        [input.id, ctx.user.groupId ?? 0]
      );
      if (result.affectedRows === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Token não encontrado" });
      }
      return { success: true };
    }),
});

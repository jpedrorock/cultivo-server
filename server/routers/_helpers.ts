/**
 * Helpers compartilhados entre os sub-routers (server/routers/*.ts).
 *
 * Antes ficavam inline no topo de server/routers.ts mas conforme extraímos
 * sub-routers pra arquivos próprios, eles precisam acessar esses validadores.
 *
 * Mantém os helpers de ownership (validateTentOwnership, etc.) num lugar
 * único — Single Source of Truth.
 */

import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { tents, cycles, plants, taskTemplates, taskInstances } from "../../drizzle/schema";

// ── Limites de plano (T28) ────────────────────────────────────────────────────
// Espelha as capacidades por tier de client/src/_core/hooks/usePlan.ts.
// Objetivo principal: bloquear o plano Free dos recursos pagos no backend
// (o paywall do front é só UX e pode ser contornado batendo direto na API).
type PlanTier = "free" | "starter" | "cloud" | "pro";
export type PlanFeature = "photos" | "aiChat" | "iot" | "presets" | "customAlerts";

const PLAN_FEATURES: Record<PlanTier, Record<PlanFeature, boolean>> = {
  free:    { photos: false, aiChat: false, iot: false, presets: false, customAlerts: false },
  starter: { photos: true,  aiChat: false, iot: false, presets: true,  customAlerts: true  },
  cloud:   { photos: true,  aiChat: true,  iot: true,  presets: true,  customAlerts: true  },
  pro:     { photos: true,  aiChat: true,  iot: true,  presets: true,  customAlerts: true  },
};

const FEATURE_INFO: Record<PlanFeature, { label: string; minPlan: string }> = {
  photos:       { label: "Fotos das plantas",           minPlan: "Starter" },
  presets:      { label: "Presets salvos",              minPlan: "Starter" },
  customAlerts: { label: "Alertas personalizados",      minPlan: "Starter" },
  aiChat:       { label: "Doctor Jah (IA)",             minPlan: "Cloud"   },
  iot:          { label: "Integração IoT (Tuya/ESP32)", minPlan: "Cloud"   },
};

/**
 * Bloqueia o acesso a um recurso pago se o plano do usuário não o inclui.
 * Plano nulo/desconhecido → permissivo (não bloqueia usuários grandfathered
 * sem plano definido — mesmo espírito do fallback `?? "pro"` de tents.ts).
 * Free, porém, é explícito e fica bloqueado dos recursos pagos.
 */
export function requirePlanFeature(user: { plan?: string | null } | undefined, feature: PlanFeature): void {
  const plan = user?.plan as PlanTier | null | undefined;
  if (!plan || !(plan in PLAN_FEATURES)) return; // desconhecido → não bloqueia
  if (!PLAN_FEATURES[plan][feature]) {
    const info = FEATURE_INFO[feature];
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `${info.label} requer o plano ${info.minPlan} ou superior. Faça upgrade para usar.`,
    });
  }
}

/**
 * Valida que uma estufa pertence ao grupo do usuário.
 * Lança erro se não pertencer — use em todos os routers que acessam recursos via tentId.
 */
export async function validateTentOwnership(tentId: number, groupId: number | null | undefined): Promise<void> {
  const database = await getDb();
  if (!database) throw new Error("Banco de dados não inicializado");
  if (groupId == null) throw new Error("Acesso negado: usuário sem grupo atribuído");
  const [tent] = await database.select({ id: tents.id, groupId: tents.groupId }).from(tents).where(eq(tents.id, tentId)).limit(1);
  if (!tent) throw new Error("Estufa não encontrada");
  if (tent.groupId !== groupId) {
    throw new Error("Acesso negado: estufa não pertence ao seu grupo");
  }
}

/**
 * Valida que um ciclo pertence ao grupo do usuário (via tent do ciclo).
 */
export async function validateCycleOwnership(cycleId: number, groupId: number | null | undefined): Promise<void> {
  const database = await getDb();
  if (!database) throw new Error("Banco de dados não inicializado");
  const [cycle] = await database.select({ id: cycles.id, tentId: cycles.tentId }).from(cycles).where(eq(cycles.id, cycleId)).limit(1);
  if (!cycle) throw new Error("Ciclo não encontrado");
  await validateTentOwnership(cycle.tentId, groupId);
}

/**
 * Valida que uma planta pertence ao grupo do usuário.
 */
export async function validatePlantOwnership(plantId: number, groupId: number | null | undefined): Promise<void> {
  const database = await getDb();
  if (!database) throw new Error("Banco de dados não inicializado");
  if (groupId == null) throw new Error("Acesso negado: usuário sem grupo atribuído");
  const [plant] = await database.select({ id: plants.id, groupId: plants.groupId }).from(plants).where(eq(plants.id, plantId)).limit(1);
  if (!plant) throw new Error("Planta não encontrada");
  if (plant.groupId !== groupId) {
    throw new Error("Acesso negado: planta não pertence ao seu grupo");
  }
}

/**
 * D3 — Seed task instances for a tent immediately after cycle creation/promotion.
 * Garante que tarefas aparecem na Home/Tasks tab sem o usuário precisar
 * navegar manualmente. Usado por cycles e tasks routers.
 */
export async function seedWeekTasks(
  database: Awaited<ReturnType<typeof getDb>>,
  tentId: number,
  tentCategory: string,
  phase: "CLONING" | "VEGA" | "FLORA" | "MAINTENANCE" | "DRYING",
  weekNumber: number
): Promise<void> {
  if (!database) return;

  const context = tentCategory === "MAINTENANCE" ? "TENT_A" : "TENT_BC";
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  // MAINTENANCE and DRYING don't filter by weekNumber
  const noWeekFilter = phase === "MAINTENANCE" || phase === "DRYING" || phase === "CLONING";

  const templates = await database
    .select()
    .from(taskTemplates)
    .where(
      noWeekFilter
        ? and(eq(taskTemplates.context, context), eq(taskTemplates.phase, phase))
        : and(
            eq(taskTemplates.context, context),
            eq(taskTemplates.phase, phase),
            eq(taskTemplates.weekNumber, weekNumber)
          )
    );

  for (const template of templates) {
    const existing = await database
      .select({ id: taskInstances.id })
      .from(taskInstances)
      .where(
        and(
          eq(taskInstances.tentId, tentId),
          eq(taskInstances.taskTemplateId, template.id),
          eq(taskInstances.occurrenceDate, startOfWeek)
        )
      )
      .limit(1);

    if (existing.length === 0) {
      await database.insert(taskInstances).values({
        tentId,
        taskTemplateId: template.id,
        occurrenceDate: startOfWeek,
        isDone: false,
      });
    }
  }
}

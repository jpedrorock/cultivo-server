/**
 * Helpers compartilhados entre os sub-routers (server/routers/*.ts).
 *
 * Antes ficavam inline no topo de server/routers.ts mas conforme extraímos
 * sub-routers pra arquivos próprios, eles precisam acessar esses validadores.
 *
 * Mantém os helpers de ownership (validateTentOwnership, etc.) num lugar
 * único — Single Source of Truth.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { tents, cycles, plants } from "../../drizzle/schema";

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

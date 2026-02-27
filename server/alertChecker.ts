import { getDb } from "./db";
import { cycles, weeklyTargets, alertSettings, alertHistory, tents, notificationSettings } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { notifyOwner } from "./_core/notification";

/**
 * Verifica se os valores estão dentro da faixa ideal e dispara alertas se necessário
 */
export async function checkAndNotifyAlerts(tentId: number, values: {
  tempC?: string;
  rhPct?: string;
  ppfd?: number;
}) {
  const database = await getDb();
  if (!database) return;

  // 0. Verificar se o sistema está pausado globalmente
  const globalSettings = await database
    .select({ systemPaused: notificationSettings.systemPaused })
    .from(notificationSettings)
    .limit(1);

  if (globalSettings.length > 0 && globalSettings[0].systemPaused) {
    return; // Sistema pausado pelo usuário — não gerar alertas
  }

  // 1. Buscar configurações de alertas da estufa
  const settings = await database
    .select()
    .from(alertSettings)
    .where(eq(alertSettings.tentId, tentId))
    .limit(1);

  if (settings.length === 0 || !settings[0].alertsEnabled) {
    return; // Alertas desabilitados para esta estufa
  }

  const config = settings[0];

  // 2. Buscar ciclo ativo da estufa
  const activeCycles = await database
    .select()
    .from(cycles)
    .where(and(eq(cycles.tentId, tentId), eq(cycles.status, "ACTIVE")))
    .limit(1);

  if (activeCycles.length === 0) {
    return; // Sem ciclo ativo
  }

  const cycle = activeCycles[0];

  // 3. Calcular fase e semana atual
  const now = new Date();
  const startDate = new Date(cycle.startDate);
  const daysSinceStart = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  
  // Determinar fase baseado em floraStartDate
  let phase: "CLONING" | "VEGA" | "FLORA" | "MAINTENANCE";
  let weekNumber: number;
  
  if (cycle.floraStartDate) {
    const floraStart = new Date(cycle.floraStartDate);
    if (now >= floraStart) {
      phase = "FLORA";
      const daysSinceFlora = Math.floor((now.getTime() - floraStart.getTime()) / (1000 * 60 * 60 * 24));
      weekNumber = Math.floor(daysSinceFlora / 7) + 1;
    } else {
      phase = "VEGA";
      weekNumber = Math.floor(daysSinceStart / 7) + 1;
    }
  } else {
    phase = "VEGA";
    weekNumber = Math.floor(daysSinceStart / 7) + 1;
  }

  // 4. Buscar targets ideais
  const targets = await database
    .select()
    .from(weeklyTargets)
    .where(
      and(
        eq(weeklyTargets.strainId, cycle.strainId),
        eq(weeklyTargets.phase, phase),
        eq(weeklyTargets.weekNumber, weekNumber)
      )
    )
    .limit(1);

  if (targets.length === 0) {
    return; // Sem targets definidos
  }

  const target = targets[0];

  // 5. Buscar nome da estufa
  const tentData = await database
    .select()
    .from(tents)
    .where(eq(tents.id, tentId))
    .limit(1);

  const tentName = tentData[0]?.name || `Estufa ${tentId}`;

  // 6. Verificar cada métrica e criar alertas
  const alerts: Array<{
    metric: "TEMP" | "RH" | "PPFD";
    value: number;
    targetMin: number | null;
    targetMax: number | null;
    message: string;
  }> = [];

  // Temperatura
  if (config.tempEnabled && values.tempC && target.tempMin && target.tempMax) {
    const temp = parseFloat(values.tempC);
    const min = parseFloat(target.tempMin.toString());
    const max = parseFloat(target.tempMax.toString());

    if (temp < min) {
      alerts.push({
        metric: "TEMP",
        value: temp,
        targetMin: min,
        targetMax: max,
        message: `🌡️ ALERTA: ${tentName} - Temperatura BAIXA (${temp}°C). Ideal: ${min}-${max}°C`,
      });
    } else if (temp > max) {
      alerts.push({
        metric: "TEMP",
        value: temp,
        targetMin: min,
        targetMax: max,
        message: `🌡️ ALERTA: ${tentName} - Temperatura ALTA (${temp}°C). Ideal: ${min}-${max}°C`,
      });
    }
  }

  // Umidade
  if (config.rhEnabled && values.rhPct && target.rhMin && target.rhMax) {
    const rh = parseFloat(values.rhPct);
    const min = parseFloat(target.rhMin.toString());
    const max = parseFloat(target.rhMax.toString());

    if (rh < min) {
      alerts.push({
        metric: "RH",
        value: rh,
        targetMin: min,
        targetMax: max,
        message: `💧 ALERTA: ${tentName} - Umidade BAIXA (${rh}%). Ideal: ${min}-${max}%`,
      });
    } else if (rh > max) {
      alerts.push({
        metric: "RH",
        value: rh,
        targetMin: min,
        targetMax: max,
        message: `💧 ALERTA: ${tentName} - Umidade ALTA (${rh}%). Ideal: ${min}-${max}%`,
      });
    }
  }

  // PPFD
  if (config.ppfdEnabled && values.ppfd && target.ppfdMin && target.ppfdMax) {
    const ppfd = values.ppfd;
    const min = parseFloat(target.ppfdMin.toString());
    const max = parseFloat(target.ppfdMax.toString());

    if (ppfd < min) {
      alerts.push({
        metric: "PPFD",
        value: ppfd,
        targetMin: min,
        targetMax: max,
        message: `☀️ ALERTA: ${tentName} - Luz BAIXA (${ppfd} µmol/m²/s). Ideal: ${min}-${max}`,
      });
    } else if (ppfd > max) {
      alerts.push({
        metric: "PPFD",
        value: ppfd,
        targetMin: min,
        targetMax: max,
        message: `☀️ ALERTA: ${tentName} - Luz ALTA (${ppfd} µmol/m²/s). Ideal: ${min}-${max}`,
      });
    }
  }

  // 7. Salvar alertas no histórico e enviar notificações
  for (const alert of alerts) {
    // Salvar no histórico
    await database.insert(alertHistory).values({
      tentId,
      metric: alert.metric,
      value: alert.value.toString(),
      targetMin: alert.targetMin?.toString() || null,
      targetMax: alert.targetMax?.toString() || null,
      message: alert.message,
      notificationSent: true,
    });

    // Enviar notificação por email
    try {
      await notifyOwner({
        title: `Alerta: ${tentName}`,
        content: alert.message,
      });
    } catch (error) {
      console.error("Erro ao enviar notificação:", error);
    }
  }

  if (alerts.length > 0) {
    console.log(`✅ ${alerts.length} alerta(s) disparado(s) para ${tentName}`);
  }
}

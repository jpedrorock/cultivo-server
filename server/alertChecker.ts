import { getDb } from "./db";
import { cycles, weeklyTargets, alertSettings, alertHistory, tents, notificationSettings, dailyLogs } from "../drizzle/schema";
import { eq, and, desc, gte } from "drizzle-orm";

/**
 * Verifica se os valores estão dentro da faixa ideal e salva alertas no app
 * Não envia email — alertas ficam visíveis apenas dentro do app
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

  // Guard: ciclos de MAINTENANCE/DRYING/CLONING não têm cepa — sem targets para verificar
  if (!cycle.strainId) {
    return;
  }

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
  const newAlerts: Array<{
    metric: "TEMP" | "RH" | "PPFD";
    direction: "HIGH" | "LOW";
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
      newAlerts.push({
        metric: "TEMP",
        direction: "LOW",
        value: temp,
        targetMin: min,
        targetMax: max,
        message: `🌡️ ALERTA: ${tentName} - Temperatura BAIXA (${temp}°C). Ideal: ${min}-${max}°C`,
      });
    } else if (temp > max) {
      newAlerts.push({
        metric: "TEMP",
        direction: "HIGH",
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
      newAlerts.push({
        metric: "RH",
        direction: "LOW",
        value: rh,
        targetMin: min,
        targetMax: max,
        message: `💧 ALERTA: ${tentName} - Umidade BAIXA (${rh}%). Ideal: ${min}-${max}%`,
      });
    } else if (rh > max) {
      newAlerts.push({
        metric: "RH",
        direction: "HIGH",
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
      newAlerts.push({
        metric: "PPFD",
        direction: "LOW",
        value: ppfd,
        targetMin: min,
        targetMax: max,
        message: `☀️ ALERTA: ${tentName} - Luz BAIXA (${ppfd} µmol/m²/s). Ideal: ${min}-${max}`,
      });
    } else if (ppfd > max) {
      newAlerts.push({
        metric: "PPFD",
        direction: "HIGH",
        value: ppfd,
        targetMin: min,
        targetMax: max,
        message: `☀️ ALERTA: ${tentName} - Luz ALTA (${ppfd} µmol/m²/s). Ideal: ${min}-${max}`,
      });
    }
  }

  // 7. Salvar alertas no histórico — com deduplicação de 4h por métrica+direção
  //    Evita flood de alertas idênticos, mas permite HIGH e LOW da mesma métrica
  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);

  // Buscar alertas recentes (últimas 4h) para este tent de uma vez
  const recentAlerts = await database
    .select({ metric: alertHistory.metric, value: alertHistory.value, targetMax: alertHistory.targetMax })
    .from(alertHistory)
    .where(and(eq(alertHistory.tentId, tentId), gte(alertHistory.createdAt, fourHoursAgo)));

  // Chave = "METRIC_HIGH" ou "METRIC_LOW" — deriva direção do valor vs targetMax
  const recentMetrics = new Set(
    recentAlerts.map(a => {
      const v = parseFloat(a.value);
      const tMax = a.targetMax ? parseFloat(a.targetMax) : null;
      const dir = tMax !== null && v > tMax ? "HIGH" : "LOW";
      return `${a.metric}_${dir}`;
    })
  );

  let saved = 0;
  for (const alert of newAlerts) {
    const key = `${alert.metric}_${alert.direction}`;
    // Pular se já existe alerta recente para a mesma métrica+direção
    if (recentMetrics.has(key)) {
      console.log(`⏭️  Alerta duplicado ignorado (${key} — já existe nas últimas 4h)`);
      continue;
    }
    await database.insert(alertHistory).values({
      tentId,
      metric: alert.metric,
      value: alert.value.toString(),
      targetMin: alert.targetMin?.toString() || null,
      targetMax: alert.targetMax?.toString() || null,
      message: alert.message,
      notificationSent: false,
    });
    // Adicionar ao set local para evitar duplicatas dentro do mesmo lote
    recentMetrics.add(alert.metric);
    saved++;
  }

  if (saved > 0) {
    console.log(`✅ ${saved} alerta(s) registrado(s) para ${tentName}`);
  }

  // 8. Detecção de tendências (L3)
  await detectTrends(tentId, tentName);
}

/**
 * L3 — Detecta tendências crescentes ou decrescentes nos últimos logs.
 * Cria alertas de TREND no alertHistory quando 4 registros consecutivos
 * mostram movimento consistente acima do limiar de variação.
 */
async function detectTrends(tentId: number, tentName: string) {
  const database = await getDb();
  if (!database) return;

  // Buscar os últimos 6 registros da estufa
  const recentLogs = await database
    .select({ tempC: dailyLogs.tempC, rhPct: dailyLogs.rhPct, logDate: dailyLogs.logDate })
    .from(dailyLogs)
    .where(eq(dailyLogs.tentId, tentId))
    .orderBy(desc(dailyLogs.logDate))
    .limit(6);

  if (recentLogs.length < 4) return;

  // Ordenar do mais antigo ao mais recente para calcular deltas
  const sorted = [...recentLogs].reverse();

  const trendAlerts: Array<{ metric: "TEMP" | "RH"; message: string }> = [];

  // ── Temperatura ───────────────────────────────────
  const temps = sorted.map(l => l.tempC ? parseFloat(l.tempC.toString()) : null).filter((v): v is number => v !== null);
  if (temps.length >= 4) {
    const last4 = temps.slice(-4);
    const deltas = last4.slice(1).map((v, i) => v - last4[i]);
    const allRising  = deltas.every(d => d > 0);
    const allFalling = deltas.every(d => d < 0);
    const totalDelta = Math.abs(last4[last4.length - 1] - last4[0]);
    if ((allRising || allFalling) && totalDelta >= 2) {
      const dir = allRising ? "subindo" : "caindo";
      trendAlerts.push({
        metric: "TEMP",
        message: `[TREND] 🌡️ ${tentName} — Temperatura ${dir} há 4 registros (${last4[0].toFixed(1)}°C → ${last4[last4.length - 1].toFixed(1)}°C)`,
      });
    }
  }

  // ── Umidade ───────────────────────────────────────
  const rhs = sorted.map(l => l.rhPct ? parseFloat(l.rhPct.toString()) : null).filter((v): v is number => v !== null);
  if (rhs.length >= 4) {
    const last4 = rhs.slice(-4);
    const deltas = last4.slice(1).map((v, i) => v - last4[i]);
    const allRising  = deltas.every(d => d > 0);
    const allFalling = deltas.every(d => d < 0);
    const totalDelta = Math.abs(last4[last4.length - 1] - last4[0]);
    if ((allRising || allFalling) && totalDelta >= 5) {
      const dir = allRising ? "subindo" : "caindo";
      trendAlerts.push({
        metric: "RH",
        message: `[TREND] 💧 ${tentName} — Umidade ${dir} há 4 registros (${last4[0].toFixed(0)}% → ${last4[last4.length - 1].toFixed(0)}%)`,
      });
    }
  }

  if (trendAlerts.length === 0) return;

  // Deduplicação: não repetir o mesmo TREND nas últimas 12h
  const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
  const recentTrends = await database
    .select({ metric: alertHistory.metric, message: alertHistory.message })
    .from(alertHistory)
    .where(and(eq(alertHistory.tentId, tentId), gte(alertHistory.createdAt, twelveHoursAgo)));

  for (const ta of trendAlerts) {
    const alreadySent = recentTrends.some(
      (rt: any) => rt.metric === ta.metric && rt.message.startsWith("[TREND]")
    );
    if (!alreadySent) {
      await database.insert(alertHistory).values({
        tentId,
        metric: ta.metric,
        value: "0",
        message: ta.message,
        notificationSent: false,
      });
      console.log(`📈 [TREND] Alerta de tendência registrado: ${ta.message}`);
    }
  }
}

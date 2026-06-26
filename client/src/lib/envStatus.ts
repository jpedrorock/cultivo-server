/**
 * Classificação de métricas ambientais em status de linguagem natural —
 * usado pelo Modo Simples (proposta "Dashboard humano" #2) pra traduzir
 * números (Temp/RH/VPD) em "confortável / está frio / muito úmido".
 *
 * Puro e sem dependências — comparação de valor vs faixa ideal.
 */
export type EnvStatus = "low" | "ok" | "high" | "unknown";

export function classifyEnvMetric(
  value: number | string | null | undefined,
  min: number | string | null | undefined,
  max: number | string | null | undefined,
): EnvStatus {
  if (value == null || min == null || max == null) return "unknown";
  const v = typeof value === "string" ? parseFloat(value) : value;
  const lo = typeof min === "string" ? parseFloat(min) : min;
  const hi = typeof max === "string" ? parseFloat(max) : max;
  if (!Number.isFinite(v) || !Number.isFinite(lo) || !Number.isFinite(hi)) return "unknown";
  if (v < lo) return "low";
  if (v > hi) return "high";
  return "ok";
}

type Metric = "temp" | "rh" | "vpd";

// Rótulo curto em linguagem natural por métrica + status.
const LABELS: Record<Metric, Record<EnvStatus, string>> = {
  temp: { low: "está frio", ok: "confortável", high: "está quente", unknown: "sem leitura" },
  rh: { low: "ar seco", ok: "confortável", high: "muito úmido", unknown: "sem leitura" },
  // VPD alto = ar seco (planta "com sede"); VPD baixo = ar muito úmido.
  vpd: { low: "muito úmido", ok: "ideal", high: "ar seco", unknown: "sem leitura" },
};

export function envStatusLabel(metric: Metric, status: EnvStatus): string {
  return LABELS[metric][status];
}

/** true = dentro do ideal (mostra ✓); false = precisa de atenção (mostra ⚠). */
export function envStatusOk(status: EnvStatus): boolean {
  return status === "ok";
}

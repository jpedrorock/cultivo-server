import { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceArea,
} from "recharts";
import { CHART_AXIS_COLOR, CHART_TARGET_FILL, CHART_TARGET_STROKE } from "@/lib/chartColors";
import { Thermometer, Droplets, Sun, Beaker, Zap } from "lucide-react";
import { LivePill } from "@/components/LivePill";

type Parameter = "all" | "temp" | "rh" | "ppfd" | "ph" | "ec";

interface DataPoint {
  date: string;
  temp?: number;
  rh?: number;
  ppfd?: number;
  ph?: number;
  ec?: number;
}

interface TentChartWidgetProps {
  tentId: string;
  tentName: string;
  data: DataPoint[];
}

// Normalization ranges for each parameter
const normalizationRanges = {
  temp: { min: 15, max: 35 }, // °C
  rh: { min: 30, max: 90 }, // %
  ppfd: { min: 0, max: 1000 }, // µmol/m²/s
  ph: { min: 5, max: 8 },
  ec: { min: 0, max: 3 }, // mS/cm
};

// Ideal values for each parameter (will be normalized for display)
const idealValues = {
  temp: 24, // °C - ideal temperature
  rh: 60, // % - ideal humidity
  ppfd: 600, // µmol/m²/s - ideal light intensity
  ph: 6.0, // ideal pH
  ec: 1.8, // mS/cm - ideal EC
};

// Ideal ranges for target-band (ReferenceArea) — raw values, normalized on use
const idealRanges: Record<keyof typeof idealValues, { min: number; max: number }> = {
  temp: { min: 22, max: 26 },    // 22–26 °C
  rh:   { min: 45, max: 65 },    // 45–65 %
  ppfd: { min: 600, max: 900 },  // 600–900 µmol
  ph:   { min: 6.0, max: 6.8 },  // 6.0–6.8
  ec:   { min: 1.6, max: 2.2 },  // 1.6–2.2 mS/cm
};

// Normalize value to 0-100% scale
function normalizeValue(value: number | undefined, param: keyof typeof normalizationRanges): number | undefined {
  if (value === undefined || value === null) return undefined;
  const range = normalizationRanges[param];
  const normalized = ((value - range.min) / (range.max - range.min)) * 100;
  return Math.max(0, Math.min(100, normalized)); // Clamp to 0-100
}

const parameterConfig = {
  temp: {
    key: "temp",
    label: "Temperatura",
    color: "#f97316", // orange-500
    icon: Thermometer,
    unit: "°C",
  },
  rh: {
    key: "rh",
    label: "Umidade",
    color: "#3b82f6", // blue-500
    icon: Droplets,
    unit: "%",
  },
  ppfd: {
    key: "ppfd",
    label: "PPFD",
    color: "#eab308", // yellow-500
    icon: Sun,
    unit: "µmol",
  },
  ph: {
    key: "ph",
    label: "pH",
    color: "#a855f7", // purple-500
    icon: Beaker,
    unit: "",
  },
  ec: {
    key: "ec",
    label: "EC",
    color: "#22c55e", // green-500
    icon: Zap,
    unit: "mS/cm",
  },
};

export function TentChartWidget({ tentId: _tentId, tentName, data }: TentChartWidgetProps) {
  const [selectedParam, setSelectedParam] = useState<Parameter>("all");

  // Normalize data for better visualization
  const normalizedData = data.map(point => ({
    date: point.date,
    temp: normalizeValue(point.temp, 'temp'),
    rh: normalizeValue(point.rh, 'rh'),
    ppfd: normalizeValue(point.ppfd, 'ppfd'),
    ph: normalizeValue(point.ph, 'ph'),
    ec: normalizeValue(point.ec, 'ec'),
    // Keep original values for tooltip
    tempRaw: point.temp,
    rhRaw: point.rh,
    ppfdRaw: point.ppfd,
    phRaw: point.ph,
    ecRaw: point.ec,
  }));

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const visibleParams =
    selectedParam === "all"
      ? (["temp", "rh", "ppfd", "ph", "ec"] as const)
      : [selectedParam];

  // Calculate dynamic Y-axis domain based on NORMALIZED visible data
  const yAxisDomain = useMemo(() => {
    if (normalizedData.length === 0) return [0, 100];

    let min = Infinity;
    let max = -Infinity;

    // Collect all NORMALIZED values from visible parameters
    normalizedData.forEach(point => {
      visibleParams.forEach(param => {
        const value = point[param];
        if (value !== undefined && value !== null) {
          min = Math.min(min, value);
          max = Math.max(max, value);
        }
      });
    });

    // Include NORMALIZED ideal values in the range calculation
    visibleParams.forEach(param => {
      const idealRaw = idealValues[param];
      const idealNormalized = normalizeValue(idealRaw, param);
      if (idealNormalized !== undefined) {
        min = Math.min(min, idealNormalized);
        max = Math.max(max, idealNormalized);
      }
    });

    // If no valid data found, return default
    if (!isFinite(min) || !isFinite(max)) return [0, 100];

    // Add 10% padding to avoid lines touching edges
    const range = max - min;
    const padding = range * 0.1;
    
    return [
      Math.max(0, Math.floor(min - padding)), // Don't go below 0
      Math.min(100, Math.ceil(max + padding)),  // Don't go above 100
    ];
  }, [normalizedData, visibleParams]);

  // Check if there's insufficient data
  const hasInsufficientData = data.length > 0 && data.length < 3;

  return (
    <div className="bg-card rounded-xl shadow-lg border border-border p-4 mt-4">
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-bold text-foreground">
            {tentName}
          </h3>
          <LivePill count={data.length} label="DIAS" color="var(--primary)" pulse={false} />
        </div>
      </div>

      {/* Parameter Selector */}
      <div className="mb-3 flex items-center gap-2">
        <button
          onClick={() => setSelectedParam("all")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            selectedParam === "all"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          Todos
        </button>
        <div className="flex gap-1">
          {(Object.keys(parameterConfig) as Array<keyof typeof parameterConfig>).map((key) => {
            const config = parameterConfig[key];
            const Icon = config.icon;
            return (
              <button
                key={key}
                onClick={() => setSelectedParam(key as Parameter)}
                className={`p-1.5 rounded-lg transition-colors ${
                  selectedParam === key
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
                title={config.label}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={normalizedData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: CHART_AXIS_COLOR(), fontFamily: 'var(--font-mono)' }}
            stroke={CHART_AXIS_COLOR()}
          />
          <YAxis
            domain={yAxisDomain}
            tick={{ fontSize: 11, fill: CHART_AXIS_COLOR(), fontFamily: 'var(--font-mono)' }}
            stroke={CHART_AXIS_COLOR()}
            label={{ value: '%', angle: 0, position: 'top', offset: 10, fontSize: 10, fill: CHART_AXIS_COLOR() }}
          />
          {selectedParam !== "all" && (
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                fontSize: "11px",
              }}
              labelStyle={{ color: "var(--foreground)", fontSize: "10px" }}
              formatter={(value, name, payload) => {
                const num = typeof value === 'number' ? value : undefined;
                const nameStr = typeof name === 'string' ? name : undefined;
                if (num === undefined || !nameStr) return ['--', nameStr || ''];
                const param = nameStr as keyof typeof parameterConfig;
                const config = parameterConfig[param];
                const rawValue = (payload as any)?.payload?.[`${param}Raw`];
                if (rawValue !== undefined && typeof rawValue === 'number') {
                  return [`${rawValue.toFixed(1)}${config.unit} (${num.toFixed(0)}%)`, config.label];
                }
                return [`${num.toFixed(0)}%`, config.label];
              }}
            />
          )}
          <Legend
            wrapperStyle={{ fontSize: "11px" }}
            formatter={(value) => {
              const param = value as keyof typeof parameterConfig;
              return parameterConfig[param]?.label || value;
            }}
          />

          {/* Target-band: faixa ideal sutil (verde) por parâmetro — substitui ReferenceLine dashed */}
          {visibleParams.map((param) => {
            const range = idealRanges[param];
            const y1 = normalizeValue(range.min, param);
            const y2 = normalizeValue(range.max, param);
            if (y1 === undefined || y2 === undefined) return null;
            return (
              <ReferenceArea
                key={`band-${param}`}
                y1={y1}
                y2={y2}
                fill={CHART_TARGET_FILL}
                stroke={CHART_TARGET_STROKE}
                strokeWidth={1}
                ifOverflow="hidden"
              />
            );
          })}

          {/* Data Lines */}
          {visibleParams.map((param) => {
            const config = parameterConfig[param];
            return (
              <Line
                key={param}
                type="monotone"
                dataKey={config.key}
                name={config.key}
                stroke={config.color}
                strokeWidth={2}
                dot={{ r: 3, fill: config.color }}
                activeDot={{ r: 5 }}
                connectNulls
                animationDuration={800}
                animationBegin={0}
                animationEasing="ease-out"
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>

      {/* No Data Message */}
      {data.length === 0 && (
        <div className="text-center py-4 text-muted-foreground text-sm">
          Nenhum registro na última semana
        </div>
      )}

      {/* Insufficient Data Warning */}
      {hasInsufficientData && (
        <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
          <p className="text-xs text-yellow-600 dark:text-yellow-500 text-center">
            ⚠️ Dados insuficientes ({data.length} {data.length === 1 ? 'dia' : 'dias'}). Recomendado pelo menos 3 dias para análise confiável.
          </p>
        </div>
      )}

      {/* Ideal Values Legend */}
      {data.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-xs text-muted-foreground mb-2 font-medium">Valores Ideais (linhas pontilhadas):</p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
            <div className="flex items-center gap-1.5">
              <Thermometer className="w-3.5 h-3.5" style={{ color: parameterConfig.temp.color }} />
              <span className="text-muted-foreground">{idealValues.temp}°C</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Droplets className="w-3.5 h-3.5" style={{ color: parameterConfig.rh.color }} />
              <span className="text-muted-foreground">{idealValues.rh}%</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Sun className="w-3.5 h-3.5" style={{ color: parameterConfig.ppfd.color }} />
              <span className="text-muted-foreground">{idealValues.ppfd}µmol</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Beaker className="w-3.5 h-3.5" style={{ color: parameterConfig.ph.color }} />
              <span className="text-muted-foreground">pH {idealValues.ph}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" style={{ color: parameterConfig.ec.color }} />
              <span className="text-muted-foreground">{idealValues.ec}mS/cm</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

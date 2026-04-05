import { useMemo } from "react";
import { normalizeTechniqueName, TECHNIQUE_CONFIGS } from "@/features/training/techniqueConfigs";

interface TrainingLog {
  id: number;
  technique: string;
  nodePosition?: string | null;
  logDate: Date | string;
}

interface Props {
  logs: TrainingLog[];
  onBadgeClick?: (logId: number) => void;
}

// Mapeia nodePosition → coordenadas no SVG (viewBox 300x360)
const POSITION_COORDS: Record<string, { x: number; y: number }> = {
  top:          { x: 150, y: 72  },
  left:         { x:  72, y: 165 },
  right:        { x: 228, y: 165 },
  all:          { x: 150, y: 155 },
  bottom_third: { x: 150, y: 278 },
  middle:       { x: 150, y: 210 },
};

const DEFAULT_COORDS = { x: 150, y: 155 };

export default function PlantTrainingDiagram({ logs, onBadgeClick }: Props) {
  // Agrupar logs pelo mesmo nodePosition para evitar sobreposição
  const markers = useMemo(() => {
    const groups: Record<string, { logId: number; color: string; label: string }[]> = {};
    for (const log of logs) {
      const pos = log.nodePosition ?? "all";
      if (!groups[pos]) groups[pos] = [];
      const techId = normalizeTechniqueName(log.technique);
      const cfg = techId ? TECHNIQUE_CONFIGS[techId] : null;
      groups[pos].push({
        logId: log.id,
        color: cfg?.color ?? "#6b7280",
        label: cfg?.name ?? log.technique,
      });
    }
    return Object.entries(groups).map(([pos, items]) => ({
      pos,
      coords: POSITION_COORDS[pos] ?? DEFAULT_COORDS,
      items,
    }));
  }, [logs]);

  return (
    <div className="w-full flex justify-center">
      <svg
        viewBox="0 0 300 360"
        className="w-full max-w-[260px] h-auto"
        style={{ filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.08))" }}
        aria-label="Diagrama da planta"
      >
        {/* ── Fundo ── */}
        <rect x="0" y="0" width="300" height="360" rx="16" fill="var(--color-card, #f8faf8)" />

        {/* ── Vaso ── */}
        <polygon points="105,330 195,330 185,355 115,355" fill="#795548" />
        <polygon points="100,318 200,318 195,330 105,330" fill="#5D4037" />
        {/* Terra */}
        <ellipse cx="150" cy="318" rx="50" ry="6" fill="#3E2723" opacity="0.6" />

        {/* ── Caule principal ── */}
        <line x1="150" y1="316" x2="150" y2="100" stroke="#4e7c3f" strokeWidth="5" strokeLinecap="round" />

        {/* ── Galhos laterais ── */}
        {/* Galho esquerdo inferior */}
        <path d="M150,270 Q115,250 72,255" stroke="#4e7c3f" strokeWidth="3" fill="none" strokeLinecap="round" />
        {/* Galho direito inferior */}
        <path d="M150,270 Q185,250 228,255" stroke="#4e7c3f" strokeWidth="3" fill="none" strokeLinecap="round" />
        {/* Galho esquerdo médio */}
        <path d="M150,210 Q110,192 72,200" stroke="#4e7c3f" strokeWidth="3" fill="none" strokeLinecap="round" />
        {/* Galho direito médio */}
        <path d="M150,210 Q190,192 228,200" stroke="#4e7c3f" strokeWidth="3" fill="none" strokeLinecap="round" />
        {/* Galho esquerdo superior */}
        <path d="M150,155 Q115,140 85,148" stroke="#4e7c3f" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        {/* Galho direito superior */}
        <path d="M150,155 Q185,140 215,148" stroke="#4e7c3f" strokeWidth="2.5" fill="none" strokeLinecap="round" />

        {/* ── Folhas (fan leaves) ── */}
        {/* Esq inferior */}
        <ellipse cx="62" cy="252" rx="16" ry="8" fill="#5a9e47" opacity="0.7" transform="rotate(-15,62,252)" />
        {/* Dir inferior */}
        <ellipse cx="238" cy="252" rx="16" ry="8" fill="#5a9e47" opacity="0.7" transform="rotate(15,238,252)" />
        {/* Esq médio */}
        <ellipse cx="62" cy="197" rx="15" ry="7" fill="#5a9e47" opacity="0.75" transform="rotate(-10,62,197)" />
        {/* Dir médio */}
        <ellipse cx="238" cy="197" rx="15" ry="7" fill="#5a9e47" opacity="0.75" transform="rotate(10,238,197)" />
        {/* Esq superior */}
        <ellipse cx="78" cy="145" rx="13" ry="6" fill="#66b34a" opacity="0.8" transform="rotate(-8,78,145)" />
        {/* Dir superior */}
        <ellipse cx="222" cy="145" rx="13" ry="6" fill="#66b34a" opacity="0.8" transform="rotate(8,222,145)" />

        {/* ── Nós (pontos de ramificação) ── */}
        {[270, 210, 155].map((y) => (
          <circle key={y} cx="150" cy={y} r="4" fill="#3b6b2c" />
        ))}

        {/* ── Top / Bud ── */}
        {/* Triângulo */}
        <polygon points="150,58 135,90 165,90" fill="#5a9e47" opacity="0.9" />
        <polygon points="150,68 140,90 160,90" fill="#7ac155" opacity="0.8" />
        {/* Brilho */}
        <circle cx="145" cy="72" r="3" fill="rgba(255,255,255,0.45)" />

        {/* ── Nós de interação (pontos clicáveis nas posições) ── */}
        {/* Mostrar círculo cinza translúcido nas posições sem markers */}
        {logs.length === 0 && (
          <>
            {Object.entries(POSITION_COORDS).map(([pos, { x, y }]) => (
              <circle key={pos} cx={x} cy={y} r="7" fill="rgba(100,100,100,0.08)" stroke="rgba(100,100,100,0.18)" strokeWidth="1" />
            ))}
            <text x="150" y="340" textAnchor="middle" fontSize="9" fill="rgba(100,100,100,0.5)">
              Nenhum treinamento registrado
            </text>
          </>
        )}

        {/* ── Badges de técnica ── */}
        {markers.map(({ pos, coords, items }) => {
          // Se mais de 1 item no mesmo ponto, empilhar com offset
          return items.map((item, i) => {
            const offsetX = i === 0 ? 0 : (i % 2 === 1 ? 18 : -18);
            const offsetY = i === 0 ? 0 : Math.floor(i / 2) * -16;
            const cx = coords.x + offsetX;
            const cy = coords.y + offsetY;

            return (
              <g
                key={`${pos}-${item.logId}`}
                onClick={() => onBadgeClick?.(item.logId)}
                style={{ cursor: onBadgeClick ? "pointer" : "default" }}
              >
                {/* Pulso externo */}
                <circle cx={cx} cy={cy} r="13" fill={item.color} opacity="0.15" />
                {/* Círculo principal */}
                <circle cx={cx} cy={cy} r="9" fill={item.color} />
                {/* Letra inicial */}
                <text
                  x={cx}
                  y={cy + 4}
                  textAnchor="middle"
                  fontSize="8"
                  fontWeight="bold"
                  fill="white"
                >
                  {item.label.charAt(0).toUpperCase()}
                </text>
                {/* Tooltip com nome */}
                <title>{item.label}</title>
              </g>
            );
          });
        })}
      </svg>
    </div>
  );
}

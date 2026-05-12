interface MiniSparklineProps {
  values: number[];
  color: string;
  w?: number;
  h?: number;
  /** Único por instância — evita colisão de IDs SVG entre múltiplos cards na mesma página. */
  chartId?: string;
}

/**
 * Sparkline em formato de "onda sonora": linha neon com fill refletido
 * embaixo + um sweep de luz branca varrendo da esquerda pra direita em loop.
 *
 * Usado nos cards de estufa (Home + TentDetails) pra mostrar a tendência
 * curta (últimas leituras) de temp / RH / VPD num espaço bem pequeno.
 *
 * Renderiza nada se houver menos de 2 valores (não dá pra desenhar linha).
 */
export function MiniSparkline({ values, color, w = 72, h = 28, chartId = "" }: MiniSparklineProps) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const uid = `spark-${chartId || color.replace(/[^a-z0-9]/gi, "")}`;

  // Pontos da linha — mapeados na metade superior (h*0.12 … h*0.88)
  // Quando todos os valores são iguais (range=0), centraliza a linha no meio do SVG
  const pts = values.map((v, i) => ({
    x: (i / (values.length - 1)) * w,
    y: range === 0 ? h * 0.5 : h * 0.88 - ((v - min) / range) * h * 0.76,
  }));

  // Path da linha principal
  const linePath = pts.reduce(
    (acc, p, i) =>
      i === 0
        ? `M ${p.x.toFixed(1)},${p.y.toFixed(1)}`
        : `${acc} L ${p.x.toFixed(1)},${p.y.toFixed(1)}`,
    "",
  );

  // Path do fill: linha + borda inferior fechada → área de preenchimento
  const fillPath = `${linePath} L ${w},${h} L 0,${h} Z`;

  // Path espelhado na metade inferior (reflexo): y invertido em relação ao centro h
  // Quando range=0 (linha central), reflexo coincide com a linha — sutil mas presente
  const reflPts = pts.map((p) => ({ x: p.x, y: range === 0 ? h * 0.5 : h - p.y + h * 0.12 }));
  const reflPath = reflPts.reduce(
    (acc, p, i) =>
      i === 0
        ? `M ${p.x.toFixed(1)},${p.y.toFixed(1)}`
        : `${acc} L ${p.x.toFixed(1)},${p.y.toFixed(1)}`,
    "",
  );

  // Scan ocupa ~38% da largura e varre da esquerda para direita em loop
  const scanW = Math.round(w * 0.38);

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={{ overflow: "visible", display: "block", opacity: 0.95 }}
    >
      <defs>
        {/* Glow da linha principal */}
        <filter id={`${uid}-glow`} x="-40%" y="-200%" width="180%" height="500%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Fill degradê: cor viva → transparente descendo */}
        <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>

        {/* Reflexo degradê: transparente → muito suave subindo */}
        <linearGradient id={`${uid}-refl`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor={color} stopOpacity="0.10" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>

        {/* Sweep: faixa de luz branca que varre horizontalmente */}
        <linearGradient id={`${uid}-sweep`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="white" stopOpacity="0" />
          <stop offset="30%" stopColor="white" stopOpacity="0.6" />
          <stop offset="55%" stopColor="white" stopOpacity="1" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>

        <mask id={`${uid}-smask`}>
          <rect x="0" y="-8" width={scanW} height={h + 16} fill={`url(#${uid}-sweep)`}>
            <animateTransform
              attributeName="transform"
              type="translate"
              values={`${-scanW},0; ${w + scanW},0`}
              dur="2.8s"
              repeatCount="indefinite"
              calcMode="linear"
            />
          </rect>
        </mask>
      </defs>

      {/* Fill sob a linha */}
      <path d={fillPath} fill={`url(#${uid}-fill)`} />

      {/* Reflexo (espelho inferior) — cria efeito de onda sonora */}
      <path
        d={reflPath}
        fill="none"
        stroke={color}
        strokeWidth="1"
        strokeOpacity="0.22"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d={`${reflPath} L ${w},${h * 0.88} L 0,${h * 0.88} Z`} fill={`url(#${uid}-refl)`} />

      {/* Linha principal base — dim */}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeOpacity="0.45"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Linha principal com glow — brilhante */}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeOpacity="0.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={`url(#${uid}-glow)`}
      />

      {/* Sweep de luz sobre a linha */}
      <path
        d={linePath}
        fill="none"
        stroke="white"
        strokeWidth="2.5"
        strokeOpacity="1"
        strokeLinecap="round"
        strokeLinejoin="round"
        mask={`url(#${uid}-smask)`}
      />
    </svg>
  );
}

/**
 * calc-helpers.tsx — Design helpers compartilhados entre calculadoras
 *
 * Exporta CalcEyebrow e CalcRunning para manter o DNA visual consistente
 * entre Calculators.tsx, Nutrients.tsx e qualquer outra calculadora futura.
 */

/** Eyebrow mono uppercase acima do headline editorial de cada calculadora */
export function CalcEyebrow({ text }: { text: string }) {
  return (
    <div className="mono text-xs uppercase tracking-[0.3em] text-muted-foreground mb-1.5">
      ↳ {text}
    </div>
  );
}

/** Indicador "ao vivo" — bolinha pulsante + label "ao vivo" no canto do painel */
export function CalcRunning() {
  return (
    <div className="absolute top-4 right-4 mono text-xs uppercase tracking-[0.22em] text-muted-foreground/50 flex items-center gap-1.5 pointer-events-none">
      <span className="h-1.5 w-1.5 rounded-full bg-primary pulse-dot" />
      ao vivo
    </div>
  );
}

import { useState } from "react";
import { X } from "lucide-react";
import { Link } from "wouter";
import { usePlan } from "@/_core/hooks/usePlan";
import { isNative } from "@/lib/platform";
import { usePaywall } from "@/components/PaywallGate";
import { haptics } from "@/lib/haptics";

interface AdBannerProps {
  /** Identificador da posição (pra logging/analytics futuro) */
  slot: string;
  className?: string;
}

/**
 * Banner de ad — só renderiza pra Free em mobile.
 *
 * Mock por enquanto: ocupa altura realística (~60px, padrão "Anchored Adaptive
 * Banner" do AdMob) com placeholder visual. O CTA pra Pro é discreto abaixo
 * (1 linha de texto cinza) + botão "✕" pequeno no canto direito do banner —
 * padrão usado por Spotify Free, Strava, etc.
 *
 * Quando @capacitor-community/admob for plugado:
 *   - Substituir o <div placeholder> por <AdMob.Banner adId="..." size="ADAPTIVE_BANNER" />
 *   - Manter o link rodapé + botão "✕"
 */
export function AdBanner({ slot, className }: AdBannerProps) {
  const { isPro } = usePlan();
  const paywall = usePaywall();
  const [dismissed, setDismissed] = useState(false);

  // Pro não vê ads. Web também não (mock só faz sentido em mobile).
  if (isPro || !isNative() || dismissed) return null;

  const handleDismiss = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await haptics.light();
    setDismissed(true);
    paywall.open("Remova os anúncios e desbloqueie tudo com o Cultivo Pro.");
  };

  return (
    <div className={className} data-ad-slot={slot}>
      {/* Banner placeholder com altura próxima do real (AdMob Adaptive = ~50-90dp).
          60px é uma média razoável que não rouba muito espaço. */}
      <div className="relative h-[60px] rounded-md bg-muted/40 border border-border/40 overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center gap-2 px-3">
          {/* Skeleton "loading" pra parecer um ad sendo carregado */}
          <div className="w-8 h-8 rounded bg-muted-foreground/15 shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-2 w-1/3 rounded bg-muted-foreground/15" />
            <div className="h-2 w-2/3 rounded bg-muted-foreground/10" />
          </div>
        </div>

        {/* Label "ad" + botão de fechar (CTA pro Pro) */}
        <span className="absolute top-1 left-1.5 text-[8px] uppercase tracking-wider text-muted-foreground/60 font-bold leading-none">
          Anúncio
        </span>
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute top-0.5 right-0.5 w-6 h-6 flex items-center justify-center rounded-full text-muted-foreground/70 active:bg-muted-foreground/10"
          aria-label="Remover anúncios"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* CTA rodapé discreto */}
      <Link href="/settings/subscription" className="block">
        <p className="text-[10px] text-muted-foreground text-center mt-1 leading-tight">
          <span className="text-emerald-400 font-medium">Remover anúncios →</span>
        </p>
      </Link>

      {paywall.PaywallElement}
    </div>
  );
}

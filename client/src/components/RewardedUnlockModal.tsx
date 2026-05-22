import { useEffect, useState } from "react";
import { Play, Sparkles, X, Check, Lock } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { REWARDED_DURATION_MS, REWARDED_UNLOCK_HOURS } from "@/lib/ads";
import { haptics } from "@/lib/haptics";

interface RewardedUnlockModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  calculatorTitle: string;
  /** Chamado quando o usuário "assistiu" o ad até o fim */
  onRewardEarned: () => void;
  /** Chamado quando usuário escolhe ir pro paywall em vez de assistir ad */
  onOpenPaywall: () => void;
}

type Phase = "offer" | "watching" | "rewarded";

export function RewardedUnlockModal({
  open,
  onOpenChange,
  calculatorTitle,
  onRewardEarned,
  onOpenPaywall,
}: RewardedUnlockModalProps) {
  const [phase, setPhase] = useState<Phase>("offer");
  const [elapsed, setElapsed] = useState(0);

  // Reset ao abrir
  useEffect(() => {
    if (open) {
      setPhase("offer");
      setElapsed(0);
    }
  }, [open]);

  // Timer "assistindo"
  useEffect(() => {
    if (phase !== "watching") return;
    const start = Date.now();
    const interval = setInterval(() => {
      const ms = Date.now() - start;
      setElapsed(ms);
      if (ms >= REWARDED_DURATION_MS) {
        clearInterval(interval);
        setPhase("rewarded");
        haptics.success();
        onRewardEarned();
      }
    }, 100);
    return () => clearInterval(interval);
  }, [phase, onRewardEarned]);

  const handleWatch = async () => {
    await haptics.medium();
    setPhase("watching");
  };

  const handleClose = async () => {
    if (phase === "watching") {
      // confirmação implícita: fechar = desistiu, não ganha
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
        <DialogTitle className="sr-only">Desbloquear {calculatorTitle}</DialogTitle>

        <button
          onClick={handleClose}
          className="absolute top-3 right-3 z-10 rounded-full p-1.5 bg-background/80 hover:bg-background"
          aria-label="Fechar"
        >
          <X className="w-4 h-4" />
        </button>

        {phase === "offer" && (
          <div className="p-6 space-y-5">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
                <Lock className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-amber-500">Calculadora Pro</p>
                <h2 className="text-lg font-bold text-foreground leading-tight">{calculatorTitle}</h2>
              </div>
            </div>

            <p className="text-sm text-muted-foreground leading-relaxed">
              Quer testar agora sem assinar? Assista um vídeo de <strong className="text-foreground">15 segundos</strong> e use grátis por <strong className="text-foreground">{REWARDED_UNLOCK_HOURS}h</strong>.
            </p>

            <Button onClick={handleWatch} className="w-full bg-amber-500 hover:bg-amber-600 text-white" size="lg">
              <Play className="w-4 h-4 mr-2 fill-current" />
              Assistir vídeo (15s)
            </Button>

            <div className="relative flex items-center justify-center gap-3 my-1">
              <span className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">ou</span>
              <span className="h-px flex-1 bg-border" />
            </div>

            <Button onClick={() => { onOpenChange(false); onOpenPaywall(); }} variant="outline" className="w-full" size="lg">
              <Sparkles className="w-4 h-4 mr-2" />
              Assinar Pro e usar sem limites
            </Button>

            <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
              Vídeo desbloqueia apenas esta calculadora por 24h.
              Assinatura Pro libera tudo permanentemente.
            </p>
          </div>
        )}

        {phase === "watching" && (
          <div className="p-6 space-y-5">
            <div className="aspect-video bg-gradient-to-br from-amber-500/20 to-amber-700/30 rounded-xl flex items-center justify-center relative overflow-hidden">
              <div className="absolute inset-0 flex items-center justify-center">
                <Play className="w-12 h-12 text-white/30 fill-current animate-pulse" />
              </div>
              <span className="absolute top-2 left-2 bg-background/80 backdrop-blur-sm px-2 py-1 rounded text-[10px] font-bold text-foreground">
                ANÚNCIO • {Math.max(0, Math.ceil((REWARDED_DURATION_MS - elapsed) / 1000))}s
              </span>
            </div>
            <div className="space-y-2">
              <Progress value={(elapsed / REWARDED_DURATION_MS) * 100} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">
                Aguarde o fim do vídeo para desbloquear.
              </p>
            </div>
            <p className="text-[10px] text-amber-500/80 text-center leading-relaxed">
              💡 Preview do anúncio. AdMob real será habilitado em breve.
            </p>
          </div>
        )}

        {phase === "rewarded" && (
          <div className="p-6 space-y-5 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto">
              <Check className="w-8 h-8 text-emerald-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground mb-1">
                Desbloqueado!
              </h2>
              <p className="text-sm text-muted-foreground">
                Você pode usar <strong className="text-foreground">{calculatorTitle}</strong> grátis pelas próximas <strong className="text-foreground">{REWARDED_UNLOCK_HOURS}h</strong>.
              </p>
            </div>
            <Button onClick={handleClose} className="w-full" size="lg">
              Abrir calculadora
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useState } from "react";
import { Check, Loader2, Sparkles, X, Users, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import type { PurchasesOffering, PurchasesPackage } from "@revenuecat/purchases-capacitor";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { usePlan } from "@/_core/hooks/usePlan";
import { isNative } from "@/lib/platform";
import { initRevenueCat, getCurrentOffering, purchase, restorePurchases } from "@/lib/revenuecat";
import { useAuth } from "@/_core/hooks/useAuth";
import { haptics } from "@/lib/haptics";
import { useBackButton } from "@/lib/androidBackButton";

interface PaywallSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: string;
}

const PRO_BENEFITS = [
  "Estufas ilimitadas",
  "Todas as calculadoras (NPK, EC, pH, Rega Automática)",
  "Fotos das plantas ilimitadas",
  "Chat com IA especialista",
  "Integração Tuya / SmartLife / ESP32",
  "Histórico completo + export CSV",
  "Sem anúncios",
];

type Period = "yearly" | "monthly";

const MOCK_PRICES = {
  pro:  { yearly: { total: "$99",  perMonth: "$8.25/mês",          discount: "17%" }, monthly: { total: "$10", subtitle: "Cobrança mensal" } },
  team: { yearly: { total: "$200", perMonth: "$5.55/mês por pessoa", discount: "17%" }, monthly: { total: "$20", subtitle: "Cobrança mensal" } },
} as const;

export function PaywallSheet({ open, onOpenChange, trigger }: PaywallSheetProps) {
  const { user } = useAuth();
  const { refetch: refetchPlan } = usePlan();

  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [rcReady, setRcReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("yearly");

  // Android back button fecha o paywall em vez de sair da rota
  useBackButton(open, () => {
    if (purchasing) return true; // bloqueia durante compra em progresso
    onOpenChange(false);
    return true;
  }, "paywall-sheet");

  useEffect(() => {
    if (!open || !user) return;
    if (!isNative()) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const ok = await initRevenueCat(user.id);
      if (cancelled) return;
      setRcReady(ok);
      if (ok) {
        const off = await getCurrentOffering();
        if (!cancelled) setOffering(off);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, user]);

  const handlePurchase = async (pkg: PurchasesPackage) => {
    setPurchasing(pkg.identifier);
    await haptics.medium();
    const result = await purchase(pkg);
    setPurchasing(null);
    if (result.cancelled) return;
    if (!result.success) {
      await haptics.error();
      toast.error(result.error ?? "Não foi possível concluir a compra.");
      return;
    }
    await haptics.success();
    toast.success("Bem-vindo ao Cultivo Pro!");
    await refetchPlan();
    onOpenChange(false);
  };

  const handleRestore = async () => {
    await haptics.light();
    const result = await restorePurchases();
    if (!result.success) {
      await haptics.error();
      toast.error(result.error ?? "Nada para restaurar.");
      return;
    }
    if (result.isPro) {
      await haptics.success();
      toast.success("Pro restaurado!");
      await refetchPlan();
      onOpenChange(false);
    } else {
      toast.info("Nenhuma assinatura Pro encontrada nesta Apple ID/Google Account.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
        <DialogTitle className="sr-only">Cultivo Pro</DialogTitle>

        <button
          onClick={() => onOpenChange(false)}
          className="absolute top-4 right-4 z-10 rounded-full p-1.5 bg-background/80 hover:bg-background"
          aria-label="Fechar"
        >
          <X className="w-4 h-4" />
        </button>

        {/* ── Hero atmosférico — mesma linguagem da tela de Login ── */}
        <div className="relative overflow-hidden px-6 pt-8 pb-6">
          {/* Blob verde topo */}
          <div aria-hidden className="pointer-events-none absolute -top-[40%] left-1/2 -translate-x-1/2 w-[360px] h-[360px] rounded-full blur-3xl opacity-[0.22]"
               style={{ background: 'radial-gradient(circle, oklch(0.68 0.20 145) 0%, transparent 65%)' }} />
          {/* Blob índigo canto direito */}
          <div aria-hidden className="pointer-events-none absolute -top-[10%] -right-[20%] w-[220px] h-[220px] rounded-full blur-2xl opacity-[0.14]"
               style={{ background: 'radial-gradient(circle, oklch(0.62 0.17 245) 0%, transparent 70%)' }} />

          <div className="relative flex items-start gap-4">
            {/* Ícone Pro com halo */}
            <div className="relative shrink-0">
              <div className="absolute inset-[-6px] rounded-3xl blur-xl opacity-60 pointer-events-none"
                   style={{ background: 'radial-gradient(circle, oklch(0.68 0.20 145 / 0.60) 0%, transparent 70%)' }} />
              <div className="relative w-14 h-14 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center shadow-lg">
                <img src="/icon.svg" alt="Cultivo" className="w-9 h-9" />
              </div>
            </div>

            <div className="flex-1 min-w-0 pt-0.5">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Cultivo Pro</span>
              </div>
              <h2 className="text-xl font-black text-foreground tracking-tight leading-tight">
                Desbloqueie tudo
              </h2>
              {trigger && (
                <p className="text-sm text-muted-foreground mt-1 leading-snug">
                  {trigger}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 space-y-2.5">
          {PRO_BENEFITS.map((benefit) => (
            <div key={benefit} className="flex items-start gap-2.5 text-sm">
              <Check className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
              <span className="text-foreground">{benefit}</span>
            </div>
          ))}
        </div>

        <div className="px-6 pb-6 pt-2 space-y-3">
          {loading && (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loading && !isNative() && (
            <div className="rounded-xl border border-border bg-muted/30 p-4 text-center space-y-1">
              <p className="text-sm font-medium text-foreground">Disponível no app mobile</p>
              <p className="text-xs text-muted-foreground">
                Baixe o Cultivo no iOS ou Android para assinar o Pro.
              </p>
            </div>
          )}

          {!loading && isNative() && !rcReady && (
            <>
              {/* Toggle Anual / Mensal — padrão usado por Spotify, Headspace, Strava */}
              <div className="flex p-1 bg-muted/60 rounded-full">
                <button
                  type="button"
                  onClick={() => setPeriod("yearly")}
                  className={`flex-1 py-2 text-xs font-bold rounded-full transition-all flex items-center justify-center gap-1.5 ${
                    period === "yearly" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                  }`}
                >
                  Anual
                  <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded ${
                    period === "yearly" ? "bg-emerald-500 text-white" : "bg-muted-foreground/20 text-muted-foreground"
                  }`}>
                    -17%
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setPeriod("monthly")}
                  className={`flex-1 py-2 text-xs font-bold rounded-full transition-all ${
                    period === "monthly" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                  }`}
                >
                  Mensal
                </button>
              </div>

              {/* Card Pro Individual */}
              <div className="rounded-xl border border-emerald-500/50 bg-emerald-500/5 p-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
                    <UserIcon className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="text-sm font-bold text-foreground">Pro Individual</span>
                      <span className="text-lg font-bold text-foreground">
                        {period === "yearly" ? MOCK_PRICES.pro.yearly.total : MOCK_PRICES.pro.monthly.total}
                        <span className="text-xs font-normal text-muted-foreground ml-1">
                          /{period === "yearly" ? "ano" : "mês"}
                        </span>
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {period === "yearly"
                        ? `Equivale a ${MOCK_PRICES.pro.yearly.perMonth}`
                        : MOCK_PRICES.pro.monthly.subtitle}
                    </p>
                  </div>
                </div>
              </div>

              {/* Card Pro Grupo */}
              <div className="rounded-xl border-2 border-violet-500/50 bg-gradient-to-br from-violet-500/10 to-transparent p-4 relative">
                <span className="absolute -top-2 right-3 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-violet-500 text-white">
                  Família
                </span>
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-violet-500/20 flex items-center justify-center shrink-0">
                    <Users className="w-4 h-4 text-violet-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="text-sm font-bold text-foreground">Pro Grupo · até 3</span>
                      <span className="text-lg font-bold text-foreground">
                        {period === "yearly" ? MOCK_PRICES.team.yearly.total : MOCK_PRICES.team.monthly.total}
                        <span className="text-xs font-normal text-muted-foreground ml-1">
                          /{period === "yearly" ? "ano" : "mês"}
                        </span>
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {period === "yearly"
                        ? `Equivale a ${MOCK_PRICES.team.yearly.perMonth}`
                        : MOCK_PRICES.team.monthly.subtitle}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-center mt-2">
                <p className="text-xs text-muted-foreground">
                  💡 Preview dos preços. Pagamento real será habilitado em breve.
                </p>
              </div>
            </>
          )}

          {!loading && isNative() && rcReady && offering && offering.availablePackages.length > 0 && (
            <>
              {offering.availablePackages.map((pkg) => {
                const isAnnual = pkg.packageType === "ANNUAL";
                const product = pkg.product;
                return (
                  <button
                    key={pkg.identifier}
                    onClick={() => handlePurchase(pkg)}
                    disabled={purchasing !== null}
                    className={`w-full rounded-xl border p-4 text-left transition disabled:opacity-50 ${
                      isAnnual
                        ? "border-emerald-500 bg-emerald-500/10"
                        : "border-border hover:border-foreground/30"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-foreground">{product.title}</span>
                        {isAnnual && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500 text-white">
                            Melhor preço
                          </span>
                        )}
                      </div>
                      <span className="text-base font-bold text-foreground">{product.priceString}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{product.description}</p>
                    {purchasing === pkg.identifier && (
                      <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Processando...
                      </div>
                    )}
                  </button>
                );
              })}

              <Button
                variant="ghost"
                size="sm"
                onClick={handleRestore}
                className="w-full text-xs text-muted-foreground"
              >
                Restaurar compras anteriores
              </Button>
            </>
          )}

          <p className="text-[10px] text-muted-foreground text-center leading-relaxed pt-2">
            Renovação automática. Cancele a qualquer momento nas configurações da sua conta Apple ID ou Google Play.
            Ao assinar você concorda com os{" "}
            <a href="/terms" target="_blank" rel="noopener" className="underline">Termos de Uso</a>
            {" "}e{" "}
            <a href="/privacy" target="_blank" rel="noopener" className="underline">Política de Privacidade</a>.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

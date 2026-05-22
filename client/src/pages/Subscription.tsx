import { useState } from "react";
import { Sparkles, Check, Loader2, ExternalLink, RefreshCw, Download, Users, User } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { PageTransition, ListItemAnimation, StaggerList } from "@/components/PageTransition";
import { Button } from "@/components/ui/button";
import { usePlan, type PlanTier } from "@/_core/hooks/usePlan";
import { useAuth } from "@/_core/hooks/useAuth";
import { usePaywall } from "@/components/PaywallGate";
import { restorePurchases } from "@/lib/revenuecat";
import { isNative, isIOS, isAndroid } from "@/lib/platform";
import { haptics } from "@/lib/haptics";
import { trpc } from "@/lib/trpc";

type PlanCardData = {
  tier: PlanTier;
  label: string;
  tagline: string;
  highlight?: string;
  monthly: string | null;
  yearly: string | null;
  perCapita?: string;
  features: string[];
  cta: string;
  badge?: string;
  icon: typeof User;
  accentClass: string;
};

const PLANS: PlanCardData[] = [
  {
    tier: "free",
    label: "Free",
    tagline: "Pra começar",
    monthly: "$0",
    yearly: null,
    features: [
      "1 estufa",
      "3 calculadoras (LUX/PPFD, Rega, VPD)",
      "Registro diário básico",
      "Com anúncios",
    ],
    cta: "Plano atual",
    icon: User,
    accentClass: "border-border bg-card",
  },
  {
    tier: "pro",
    label: "Pro Individual",
    tagline: "Pra quem cultiva sozinho",
    monthly: "$10",
    yearly: "$99",
    perCapita: "$8.25/mês",
    features: [
      "Estufas ilimitadas",
      "Todas as 7 calculadoras",
      "Fotos das plantas",
      "Chat com IA especialista",
      "Integração Tuya / SmartLife / ESP32",
      "Sem anúncios",
    ],
    cta: "Assinar Pro",
    icon: Sparkles,
    accentClass: "border-emerald-500/50 bg-gradient-to-br from-emerald-500/10 to-transparent",
  },
  {
    tier: "team",
    label: "Pro Grupo",
    tagline: "Compartilhe com até 3 pessoas",
    highlight: "Melhor pra famílias",
    monthly: "$20",
    yearly: "$200",
    perCapita: "$5.55/mês por pessoa",
    features: [
      "Tudo do Pro Individual",
      "Até 3 membros no mesmo grupo",
      "Estufas compartilhadas",
      "Convites por código",
      "Ideal pra casais / família",
    ],
    cta: "Assinar Pro Grupo",
    icon: Users,
    accentClass: "border-violet-500/50 bg-gradient-to-br from-violet-500/15 to-transparent",
  },
];

export default function Subscription() {
  const { user } = useAuth();
  const { tier, isPro, isTeam, refetch } = usePlan();
  const paywall = usePaywall();
  const [restoring, setRestoring] = useState(false);
  const [exporting, setExporting] = useState(false);
  const exportBackup = trpc.backup.export.useQuery(undefined, { enabled: false });

  const handleExport = async () => {
    setExporting(true);
    await haptics.light();
    try {
      const result = await exportBackup.refetch();
      if (!result.data) throw new Error("Sem dados");
      const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
      link.download = `cultivo-backup-${ts}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      await haptics.success();
      toast.success("Backup exportado!");
    } catch (err: any) {
      await haptics.error();
      toast.error(`Erro ao exportar: ${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    await haptics.light();
    const result = await restorePurchases();
    setRestoring(false);
    if (!result.success) {
      await haptics.error();
      toast.error(result.error ?? "Nada para restaurar.");
      return;
    }
    if (result.isPro) {
      await haptics.success();
      toast.success("Assinatura restaurada!");
      await refetch();
    } else {
      toast.info("Nenhuma assinatura encontrada nesta Apple ID / Google Account.");
    }
  };

  const openManageSubscription = () => {
    if (isIOS()) window.open("https://apps.apple.com/account/subscriptions", "_blank");
    else if (isAndroid()) window.open("https://play.google.com/store/account/subscriptions", "_blank");
    else toast.info("Gerencie sua assinatura no app mobile.");
  };

  const currentPlanLabel =
    tier === "team" ? "Pro Grupo" : tier === "pro" ? "Pro Individual" : "Free";

  return (
    <PageTransition>
      <div className="min-h-screen bg-background">
        <PageHeader backHref="/settings" title="Minha Assinatura" />

        <main className="container mx-auto px-4 py-6 pb-28 sm:pb-8 max-w-2xl">
          <StaggerList className="space-y-5">
            {/* Card de status atual */}
            <ListItemAnimation>
              <div className={`rounded-2xl border p-5 ${
                isTeam ? "border-violet-500/40 bg-gradient-to-br from-violet-500/15 to-transparent" :
                isPro ? "border-emerald-500/40 bg-gradient-to-br from-emerald-500/15 to-transparent" :
                "border-border bg-card"
              }`}>
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                  Plano atual
                </p>
                <div className="flex items-start gap-3">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                    isTeam ? "bg-violet-500/20" : isPro ? "bg-emerald-500/20" : "bg-muted/30"
                  }`}>
                    {isTeam ? <Users className="w-5 h-5 text-violet-400" /> :
                     isPro ? <Sparkles className="w-5 h-5 text-emerald-400" /> :
                     <User className="w-5 h-5 text-muted-foreground" />}
                  </div>
                  <div className="flex-1">
                    <h2 className="text-xl font-bold text-foreground">Cultivo {currentPlanLabel}</h2>
                    <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                  </div>
                </div>
                {isPro && isNative() && (
                  <Button variant="outline" onClick={openManageSubscription} className="w-full mt-4" size="sm">
                    <ExternalLink className="w-3.5 h-3.5 mr-2" />
                    Gerenciar na {isIOS() ? "Apple ID" : "Play Store"}
                  </Button>
                )}
              </div>
            </ListItemAnimation>

            {/* Lista de planos disponíveis */}
            <ListItemAnimation>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-2 mt-2">
                {isPro ? "Comparar planos" : "Escolha seu plano"}
              </p>
              <div className="space-y-3">
                {PLANS.map(plan => {
                  const Icon = plan.icon;
                  const isCurrent = plan.tier === tier;
                  return (
                    <div
                      key={plan.tier}
                      className={`rounded-2xl border-2 p-5 relative overflow-hidden ${plan.accentClass} ${
                        isCurrent ? "ring-2 ring-foreground/20" : ""
                      }`}
                    >
                      {plan.highlight && !isCurrent && (
                        <span className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-violet-500 text-white">
                          {plan.highlight}
                        </span>
                      )}
                      {isCurrent && (
                        <span className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-foreground text-background">
                          ✓ Atual
                        </span>
                      )}
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className="w-4 h-4 text-muted-foreground" />
                        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          {plan.label}
                        </span>
                      </div>
                      <h3 className="text-lg font-bold text-foreground mb-3">{plan.tagline}</h3>

                      {plan.yearly && (
                        <div className="mb-3">
                          <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-bold text-foreground">{plan.yearly}</span>
                            <span className="text-sm text-muted-foreground">/ano</span>
                          </div>
                          {plan.perCapita && (
                            <p className="text-xs text-muted-foreground">{plan.perCapita}</p>
                          )}
                          <p className="text-[11px] text-muted-foreground">ou {plan.monthly}/mês</p>
                        </div>
                      )}
                      {!plan.yearly && plan.monthly && (
                        <div className="mb-3">
                          <span className="text-2xl font-bold text-foreground">{plan.monthly}</span>
                        </div>
                      )}

                      <ul className="space-y-1.5 mb-4">
                        {plan.features.map(f => (
                          <li key={f} className="flex items-start gap-2 text-sm">
                            <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                            <span className="text-foreground">{f}</span>
                          </li>
                        ))}
                      </ul>

                      {!isCurrent && plan.tier !== "free" && (
                        <Button
                          onClick={() => paywall.open(`Cultivo ${plan.label}`)}
                          className={`w-full ${
                            plan.tier === "team" ? "bg-violet-500 hover:bg-violet-600" : "bg-emerald-500 hover:bg-emerald-600"
                          } text-white`}
                          size="sm"
                        >
                          {plan.cta}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </ListItemAnimation>

            {/* Exportar dados */}
            <ListItemAnimation>
              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="flex items-start gap-3">
                  <Download className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <h3 className="text-sm font-bold text-foreground mb-1">
                      Exportar meus dados
                    </h3>
                    <p className="text-xs text-muted-foreground mb-3">
                      Baixe um arquivo JSON com todas as suas estufas, plantas, ciclos, fotos e histórico.
                      {isPro && " Recomendamos exportar antes de cancelar a assinatura."}
                    </p>
                    <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
                      {exporting ? (
                        <><Loader2 className="w-3 h-3 mr-2 animate-spin" /> Exportando...</>
                      ) : (
                        <><Download className="w-3 h-3 mr-2" /> Baixar backup</>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </ListItemAnimation>

            {/* Restaurar compras — só mobile */}
            {isNative() && (
              <ListItemAnimation>
                <div className="rounded-2xl border border-border bg-card p-5">
                  <div className="flex items-start gap-3">
                    <RefreshCw className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <h3 className="text-sm font-bold text-foreground mb-1">Restaurar compras</h3>
                      <p className="text-xs text-muted-foreground mb-3">
                        Se você já comprou em outro dispositivo (mesma Apple ID / Google Account).
                      </p>
                      <Button variant="outline" size="sm" onClick={handleRestore} disabled={restoring}>
                        {restoring ? (
                          <><Loader2 className="w-3 h-3 mr-2 animate-spin" /> Verificando...</>
                        ) : ("Restaurar")}
                      </Button>
                    </div>
                  </div>
                </div>
              </ListItemAnimation>
            )}

            <ListItemAnimation>
              <p className="text-[11px] text-muted-foreground text-center leading-relaxed px-4">
                Renovação automática. Cancele a qualquer momento nas configurações da sua conta {isIOS() ? "Apple ID" : isAndroid() ? "Google Play" : "Apple ID / Google Play"}.
              </p>
            </ListItemAnimation>
          </StaggerList>

          {paywall.PaywallElement}
        </main>
      </div>
    </PageTransition>
  );
}

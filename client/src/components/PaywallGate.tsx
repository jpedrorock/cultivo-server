import { useState, type ReactNode } from "react";
import { Lock, Sparkles } from "lucide-react";
import { usePlan } from "@/_core/hooks/usePlan";
import { PaywallSheet } from "@/components/PaywallSheet";
import { haptics } from "@/lib/haptics";

type Feature =
  | { kind: "calculator"; id: string }
  | { kind: "tent"; currentCount: number }
  | { kind: "photos" }
  | { kind: "aiChat" }
  | { kind: "customAlerts" }
  | { kind: "iot" }
  | { kind: "presets" };

interface PaywallGateProps {
  feature: Feature;
  children: ReactNode;
  /** Mensagem customizada exibida no paywall ao gatear */
  trigger?: string;
  /** Render alternativo quando bloqueado (default: lock overlay sobre children) */
  blockedRender?: (open: () => void) => ReactNode;
}

function isAllowed(feature: Feature, limits: ReturnType<typeof usePlan>["limits"], isPro: boolean): boolean {
  if (isPro) return true;
  switch (feature.kind) {
    case "calculator":
      return limits.allowedCalculators.includes(feature.id);
    case "tent":
      return limits.maxTents === null || feature.currentCount < limits.maxTents;
    case "photos":
      return limits.photosEnabled;
    case "aiChat":
      return limits.aiChatEnabled;
    case "customAlerts":
      return limits.customAlertsEnabled;
    case "iot":
      return limits.iotIntegrationsEnabled;
    case "presets":
      return limits.presetsEnabled;
  }
}

function triggerText(feature: Feature): string {
  switch (feature.kind) {
    case "calculator":
      return "Esta calculadora faz parte do plano Pro.";
    case "tent":
      return `O plano Free permite ${feature.currentCount === 0 ? "1 estufa" : `apenas ${feature.currentCount} estufa(s)`}. Faça upgrade para criar mais.`;
    case "photos":
      return "Fotos das plantas são exclusivas do plano Pro.";
    case "aiChat":
      return "O chat com IA especialista é exclusivo Pro.";
    case "customAlerts":
      return "Alertas customizados são exclusivos Pro.";
    case "iot":
      return "Integração com Tuya / SmartLife / ESP32 é exclusiva Pro.";
    case "presets":
      return "Salvar predefinições é exclusivo Pro.";
  }
}

/**
 * Bloqueia children quando o usuário não tem acesso àquela feature.
 * Ao tocar/clicar, abre o paywall.
 *
 * Uso:
 *   <PaywallGate feature={{ kind: "calculator", id: "nutrients" }}>
 *     <CalculatorCard ... />
 *   </PaywallGate>
 */
export function PaywallGate({ feature, children, trigger, blockedRender }: PaywallGateProps) {
  const { isPro, limits } = usePlan();
  const [open, setOpen] = useState(false);
  const allowed = isAllowed(feature, limits, isPro);

  const openPaywall = () => {
    haptics.light();
    setOpen(true);
  };

  if (allowed) return <>{children}</>;

  if (blockedRender) {
    return (
      <>
        {blockedRender(openPaywall)}
        <PaywallSheet open={open} onOpenChange={setOpen} trigger={trigger ?? triggerText(feature)} />
      </>
    );
  }

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={openPaywall}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") openPaywall(); }}
        className="relative cursor-pointer group"
      >
        <div className="pointer-events-none opacity-50 grayscale-[60%]">{children}</div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex items-center gap-1.5 rounded-full bg-foreground/85 text-background px-3 py-1.5 text-xs font-bold shadow-lg backdrop-blur-sm">
            <Lock className="w-3 h-3" />
            <span>Pro</span>
            <Sparkles className="w-3 h-3" />
          </div>
        </div>
      </div>
      <PaywallSheet open={open} onOpenChange={setOpen} trigger={trigger ?? triggerText(feature)} />
    </>
  );
}

/**
 * Wrapper imperativo: usa quando precisa abrir o paywall a partir de um botão
 * customizado (não através de overlay sobre children).
 */
export function usePaywall() {
  const [open, setOpen] = useState(false);
  const [currentTrigger, setCurrentTrigger] = useState<string | undefined>();

  return {
    open: (trigger?: string) => {
      haptics.light();
      setCurrentTrigger(trigger);
      setOpen(true);
    },
    close: () => setOpen(false),
    PaywallElement: (
      <PaywallSheet open={open} onOpenChange={setOpen} trigger={currentTrigger} />
    ),
  };
}

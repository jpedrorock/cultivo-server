/**
 * About — tela de informações do app.
 *
 * Mostra:
 *  - Logo + nome + versão + build
 *  - Link pra Privacy / Terms
 *  - Email de suporte (clicável)
 *  - Plataforma (web / iOS / Android)
 *  - Botão "Apagar dados deste dispositivo" (limpa Preferences locais — não toca no servidor)
 *  - Easter egg: tap 7x no logo → mostra modo dev (env, tier, etc)
 *
 * Útil pra suporte: "qual a versão do app?" tem resposta visível.
 */

import { useState } from "react";
import { Preferences } from "@capacitor/preferences";
import { Mail, FileText, Lock as LockIcon, Trash2, Smartphone, Globe, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/PageHeader";
import { PageTransition } from "@/components/PageTransition";
import { Button } from "@/components/ui/button";
import { isNative, getPlatform } from "@/lib/platform";
import { haptics } from "@/lib/haptics";
import { usePlan } from "@/_core/hooks/usePlan";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Versão hardcoded — sincronizar com package.json no release
// (não conseguimos importar package.json no client por design do Vite)
const APP_VERSION = "2.0.0";
const SUPPORT_EMAIL = "suporte@cultivo.pro";
const BUILD_DATE = "2026-05-21";

export default function About() {
  const { tier } = usePlan();
  const [logoTaps, setLogoTaps] = useState(0);
  const [showDevPanel, setShowDevPanel] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const platform = getPlatform();
  const platformLabel =
    platform === "ios" ? "iOS" : platform === "android" ? "Android" : "Web";
  const platformIcon = platform === "ios" || platform === "android" ? Smartphone : Globe;
  const PlatformIcon = platformIcon;

  const handleLogoTap = () => {
    haptics.light();
    const next = logoTaps + 1;
    setLogoTaps(next);
    if (next >= 7) {
      setShowDevPanel(true);
      setLogoTaps(0);
      haptics.success();
    }
  };

  const handleResetLocalData = async () => {
    if (resetting) return;
    await haptics.heavy();
    setResetting(true);
    try {
      // Apaga TUDO do Preferences (mantém o que tá no servidor intacto)
      await Preferences.clear();
      // Apaga localStorage (web/PWA)
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {
        /* navegação privada */
      }
      // Apaga caches do React Query persisters (se houver)
      try {
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
      } catch {
        /* no-op */
      }
      await haptics.success();
      toast.success("Dados locais apagados. Recarregando…");
      // Pequeno delay pra usuário ver o toast antes do reload
      setTimeout(() => {
        window.location.href = "/login";
      }, 800);
    } catch (err) {
      await haptics.error();
      toast.error("Falha ao apagar dados locais.");
      setResetting(false);
    }
  };

  return (
    <PageTransition>
      <div className="min-h-screen bg-background pb-28">
        <PageHeader backHref="/settings" title="Sobre" />

        <main className="container mx-auto px-4 py-8 max-w-md">
          {/* Hero — logo + nome + versão */}
          <div className="text-center mb-8">
            <button
              type="button"
              onClick={handleLogoTap}
              className="inline-block active:scale-95 transition-transform"
              aria-label="Logo Cultivo"
            >
              <div className="w-20 h-20 mx-auto mb-3">
                <img src="/icon.svg" alt="Cultivo" className="w-full h-full" />
              </div>
            </button>
            <h1 className="text-2xl font-bold text-foreground">Cultivo</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Versão {APP_VERSION} · Build {BUILD_DATE}
            </p>
          </div>

          {/* Plataforma + plano (info rápida) */}
          <div className="rounded-2xl border border-border bg-card p-4 mb-4 grid grid-cols-2 gap-3 text-center">
            <div>
              <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-muted flex items-center justify-center">
                <PlatformIcon className="w-4 h-4 text-muted-foreground" />
              </div>
              <p className="text-xs font-semibold text-foreground">{platformLabel}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Plataforma</p>
            </div>
            <div>
              <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-primary/10 flex items-center justify-center">
                <span className="text-xs font-bold text-primary uppercase">{tier}</span>
              </div>
              <p className="text-xs font-semibold text-foreground capitalize">{tier}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Plano</p>
            </div>
          </div>

          {/* Links principais */}
          <div className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden mb-6">
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=Suporte%20Cultivo%20App%20v${APP_VERSION}`}
              className="flex items-center gap-3 px-4 py-3.5 hover:bg-muted/60 active:bg-muted transition-colors"
            >
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Mail className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">Falar com suporte</p>
                <p className="text-xs text-muted-foreground truncate">{SUPPORT_EMAIL}</p>
              </div>
            </a>

            <a
              href="/privacy"
              target="_blank"
              rel="noopener"
              className="flex items-center gap-3 px-4 py-3.5 hover:bg-muted/60 active:bg-muted transition-colors"
            >
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <LockIcon className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">Política de Privacidade</p>
                <p className="text-xs text-muted-foreground">Como tratamos seus dados</p>
              </div>
            </a>

            <a
              href="/terms"
              target="_blank"
              rel="noopener"
              className="flex items-center gap-3 px-4 py-3.5 hover:bg-muted/60 active:bg-muted transition-colors"
            >
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">Termos de Uso</p>
                <p className="text-xs text-muted-foreground">Regras de utilização</p>
              </div>
            </a>
          </div>

          {/* Zona de perigo */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
              Avançado
            </p>
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <button
                type="button"
                onClick={() => {
                  haptics.light();
                  setResetOpen(true);
                }}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-destructive/5 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                  <Trash2 className="w-4 h-4 text-destructive" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-destructive">
                    Apagar dados deste dispositivo
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Limpa cache, preferências e dados locais (servidor não é afetado)
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* Dev panel (escondido — 7 taps no logo) */}
          {showDevPanel && (
            <div className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-1.5 text-xs font-mono">
              <p className="text-amber-400 font-bold mb-2">🔧 DEV INFO</p>
              <p>
                <span className="text-muted-foreground">platform:</span> {platform}
              </p>
              <p>
                <span className="text-muted-foreground">tier:</span> {tier}
              </p>
              <p>
                <span className="text-muted-foreground">native:</span> {String(isNative())}
              </p>
              <p>
                <span className="text-muted-foreground">env:</span> {import.meta.env.MODE}
              </p>
              <p>
                <span className="text-muted-foreground">UA:</span>{" "}
                <span className="break-all">{navigator.userAgent}</span>
              </p>
              <button
                type="button"
                onClick={() => setShowDevPanel(false)}
                className="mt-2 text-xs text-muted-foreground hover:text-foreground underline"
              >
                Esconder
              </button>
            </div>
          )}

          {/* Copyright */}
          <p className="text-center text-xs text-muted-foreground mt-8 leading-relaxed">
            © {new Date().getFullYear()} Cultivo
            <br />
            Feito com 🌱 por quem cultiva.
          </p>
        </main>

        {/* Confirmação reset local */}
        <Dialog open={resetOpen} onOpenChange={setResetOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 ring-1 ring-amber-500/30 flex items-center justify-center mb-3">
                <Trash2 className="w-5 h-5 text-amber-400" />
              </div>
              <DialogTitle>Apagar dados deste dispositivo?</DialogTitle>
              <DialogDescription>
                Vai limpar cache de imagens, preferências de tema, tour de boas-vindas,
                lembretes locais e o token de login. Seus dados no servidor{" "}
                <strong>não são afetados</strong> — basta logar de novo pra recuperá-los.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setResetOpen(false)} disabled={resetting}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={handleResetLocalData} disabled={resetting}>
                {resetting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Apagando...
                  </>
                ) : (
                  "Apagar e relogar"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageTransition>
  );
}

import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "cloud.evapro.cultivo",
  appName: "Cultivo",
  webDir: "dist/public",
  ios: {
    // never = WebView ocupa a tela inteira (incluindo área do notch).
    // O CSS do app já gerencia safe areas via env(safe-area-inset-*) e
    // pt-safe (vide PageLayout). "always" causava barra branca no topo
    // porque empurrava o WebView pra baixo do notch, expondo o fundo.
    contentInset: "never",
    // scheme custom URL pra deep links (cultivo://). Mantém "Cultivo" original
    // por compatibilidade + iremos adicionar cloud.evapro.cultivo:// também via
    // Info.plist CFBundleURLSchemes pra OAuth callbacks e QR codes.
    scheme: "Cultivo",
    // Restringe a WebView a navegar apenas pra domínios "app-bound" definidos
    // em Info.plist (WKAppBoundDomains). Sem isso, prompt injection em resposta
    // da IA poderia abrir página de phishing dentro do WebView com a UI do app.
    limitsNavigationsToAppBoundDomains: true,
    // Background da WebView (visível só durante carregamento ou overscroll).
    // Match o tema escuro pra não dar flash branco.
    backgroundColor: "#0a0e14",
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#0a0e14",
  },
  server: {
    androidScheme: "https",
    iosScheme: "https",
  },
  plugins: {
    SplashScreen: {
      // launchAutoHide: false → controlamos o hide manualmente no main.tsx
      // pra evitar flash branco quando o app ainda tá montando React +
      // carregando auth check + queries iniciais.
      launchAutoHide: false,
      // launchShowDuration vira teto de segurança caso JS nunca chame hide()
      // (ex: erro fatal no boot). Sem isso, app fica preso no splash.
      launchShowDuration: 4000,
      // fadeOutDuration faz uma transição suave em vez de pop seco
      launchFadeOutDuration: 300,
      backgroundColor: "#0a0e14",
      androidScaleType: "CENTER_CROP",
      splashFullScreen: true,
      splashImmersive: true,
      // showSpinner false: sem círculo branco (não combina com app dark)
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0a0e14",
    },
  },
};

export default config;

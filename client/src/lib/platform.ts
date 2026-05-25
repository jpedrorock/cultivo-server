export type Platform = "web" | "ios" | "android";

/**
 * Acessa o objeto Capacitor global de forma segura.
 * - Em apps Capacitor (iOS/Android): objeto injetado pelo runtime
 * - Em PWA/web: undefined → todos os helpers retornam fallback web
 * Evita import estático de @capacitor/core (não instalado no build web).
 */
function cap() {
  return typeof window !== "undefined"
    ? (window as unknown as { Capacitor?: { getPlatform(): string; isNativePlatform(): boolean } }).Capacitor
    : undefined;
}

export function getPlatform(): Platform {
  const p = cap()?.getPlatform() ?? "web";
  if (p === "ios" || p === "android") return p;
  return "web";
}

export function isNative(): boolean {
  return cap()?.isNativePlatform() ?? false;
}

export function isIOS(): boolean {
  return getPlatform() === "ios";
}

export function isAndroid(): boolean {
  return getPlatform() === "android";
}

/**
 * Detecta se o PWA está rodando em modo "standalone" — ou seja, instalado
 * na home screen (iOS Safari ou Android Chrome), não dentro do browser.
 *
 * Quando standalone, sofre dos mesmos problemas do Capacitor:
 * - Status bar do iOS cobre conteúdo no topo
 * - Rubber-band/overscroll afeta header sticky
 * - PullToRefresh JS conflita com scroll container interno
 *
 * Soluções aplicadas no Capacitor (via classes CSS) também valem pro PWA
 * standalone — esse helper permite o tratamento uniforme.
 */
export function isPWAStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

/**
 * Marca o <html> com classes que indicam contexto de exibição:
 * - `capacitor-native` + `capacitor-{ios|android}` → empacotado em Capacitor
 * - `pwa-standalone` → PWA instalado na home screen
 *
 * Permite CSS específico sem afetar o uso via browser normal.
 *
 * Mutuamente exclusivo: Capacitor tem precedência sobre PWA standalone.
 */
export function applyPlatformClasses(): void {
  const html = document.documentElement;
  if (isNative()) {
    html.classList.add("capacitor-native");
    html.classList.add(`capacitor-${getPlatform()}`);
  } else if (isPWAStandalone()) {
    html.classList.add("pwa-standalone");
  }
}

/**
 * Resolve a URL absoluta para chamadas REST `/api/...`.
 * Web: retorna o path como veio (same-origin).
 * Mobile: prepende VITE_API_BASE_URL (ex: https://app.cultivo.pro).
 */
export function apiUrl(path: string): string {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";
  if (!isNative() || !base) return path;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

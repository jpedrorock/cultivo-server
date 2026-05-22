import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, ReactNode, ErrorInfo } from "react";
import { captureException } from "@/lib/sentry";

interface Props {
  children: ReactNode;
  /** Modo compacto para uso dentro de tabs/cards — não ocupa a tela toda */
  inline?: boolean;
  /** Mensagem customizada exibida no modo inline */
  message?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  // React passa o componentStack — útil pra debugar onde o erro veio.
  // Reportamos pro Sentry SEMPRE — em dev vira console.error (via lib/sentry.ts).
  componentDidCatch(error: Error, info: ErrorInfo) {
    captureException(error, {
      componentStack: info.componentStack,
      mode: this.props.inline ? "inline" : "fullscreen",
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      // Modo inline: card compacto, não ocupa a tela
      if (this.props.inline) {
        return (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex flex-col items-center gap-3 text-center my-2">
            <AlertTriangle className="w-6 h-6 text-destructive/70" />
            <p className="text-sm text-muted-foreground">
              {this.props.message ?? "Erro ao carregar esta seção."}
            </p>
            <button
              onClick={this.handleReset}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-muted hover:bg-muted/80 text-foreground transition-colors"
            >
              <RotateCcw size={12} />
              Tentar novamente
            </button>
          </div>
        );
      }

      // Modo tela cheia (comportamento original, mas sem stack trace em produção)
      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-sm p-8 gap-4 text-center">
            <AlertTriangle size={40} className="text-destructive mb-2 flex-shrink-0" />
            <h2 className="text-lg font-semibold">Ocorreu um erro inesperado.</h2>
            <p className="text-sm text-muted-foreground">
              Tente recarregar a página. Se o problema persistir, entre em contato com o suporte.
            </p>
            <div className="flex gap-2 mt-2">
              <button
                onClick={this.handleReset}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm",
                  "border border-border hover:bg-muted transition-colors"
                )}
              >
                <RotateCcw size={14} />
                Tentar novamente
              </button>
              <button
                onClick={() => window.location.reload()}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm",
                  "bg-primary text-primary-foreground hover:opacity-90 cursor-pointer"
                )}
              >
                Recarregar Página
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

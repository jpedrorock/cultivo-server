import { Sprout } from "lucide-react";

interface Step {
  /** "1" | "2" | "3" — vira o badge circular à esquerda */
  number: string;
  title: string;
  description: string;
  /** Primeiro passo em destaque (verde); demais em cinza */
  active?: boolean;
}

const STEPS: Step[] = [
  {
    number: "1",
    title: "Crie sua primeira estufa",
    description: "Defina nome, tamanho e categoria (Vega, Flora, Manutenção…)",
    active: true,
  },
  {
    number: "2",
    title: "Adicione suas plantas",
    description: "Cadastre mudas, clones ou plantas com strain e semana",
  },
  {
    number: "3",
    title: "Registre os parâmetros diários",
    description: "Temperatura, umidade, PPFD, pH, EC e rega — tudo num só lugar",
  },
];

/**
 * Empty state da Home — mostrado quando o usuário ainda não criou nenhuma
 * estufa. Lista os 3 passos do onboarding e o CTA para abrir o modal de
 * criação. Sem state interno: o componente apenas notifica o pai via
 * `onCreateTent` quando o botão é clicado.
 */
export function EmptyOnboarding({ onCreateTent }: { onCreateTent: () => void }) {
  return (
    <div className="flex flex-col items-center py-10 px-4 max-w-md mx-auto">
      {/* Ícone central */}
      <div className="w-20 h-20 rounded-2xl bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center mb-6">
        <Sprout className="w-10 h-10 text-primary" />
      </div>

      <h2 className="text-xl font-bold text-foreground mb-1 text-center">Bem-vindo ao Cultivo</h2>
      <p className="text-sm text-muted-foreground text-center mb-8">
        Siga os passos abaixo para começar a monitorar seu cultivo.
      </p>

      {/* Passos */}
      <div className="w-full space-y-3 mb-8">
        {STEPS.map((step) => (
          <div
            key={step.number}
            className={
              step.active
                ? "rounded-2xl border border-primary/30 bg-primary/5 p-4 flex items-start gap-3"
                : "rounded-2xl border border-border/60 bg-muted/30 p-4 flex items-start gap-3"
            }
          >
            <div
              className={
                step.active
                  ? "w-7 h-7 rounded-full bg-primary flex items-center justify-center shrink-0 mt-0.5"
                  : "w-7 h-7 rounded-full bg-muted-foreground/20 flex items-center justify-center shrink-0 mt-0.5"
              }
            >
              <span
                className={
                  step.active
                    ? "text-xs font-bold text-primary-foreground"
                    : "text-xs font-bold text-muted-foreground"
                }
              >
                {step.number}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p
                className={
                  step.active
                    ? "text-sm font-semibold text-foreground"
                    : "text-sm font-semibold text-muted-foreground"
                }
              >
                {step.title}
              </p>
              <p
                className={
                  step.active
                    ? "text-xs text-muted-foreground mt-0.5"
                    : "text-xs text-muted-foreground/70 mt-0.5"
                }
              >
                {step.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <button
        onClick={onCreateTent}
        className="w-full flex items-center justify-center gap-2 rounded-2xl bg-primary text-primary-foreground font-semibold py-4 text-sm active:scale-[0.98] transition-transform shadow-lg shadow-primary/20"
      >
        <Sprout className="w-5 h-5" />
        Criar primeira estufa
      </button>
    </div>
  );
}

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Sprout, Flower2, Wind } from "lucide-react";

export type PhaseConfirmType = "FLORA" | "DRYING" | "CLONING";

interface PhaseConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phase: PhaseConfirmType;
  tentName: string;
  onConfirm: () => void;
}

const PHASE_CONFIG: Record<
  PhaseConfirmType,
  {
    icon: React.ElementType;
    label: string;
    description: string;
    bgColor: string;
    iconColor: string;
    confirmClass: string;
    confirmLabel: string;
  }
> = {
  FLORA: {
    icon: Flower2,
    label: "Avançar para Floração",
    description:
      "As plantas entrarão no ciclo 12/12. Esta ação iniciará a fase de floração e não pode ser desfeita facilmente.",
    bgColor:
      "bg-purple-500/10 border border-purple-500/30 dark:bg-purple-500/15 dark:border-purple-500/35",
    iconColor: "text-purple-500 dark:text-purple-400",
    confirmClass:
      "bg-violet-500 hover:bg-violet-600 text-white border-0",
    confirmLabel: "Sim, iniciar Floração",
  },
  DRYING: {
    icon: Wind,
    label: "Avançar para Secagem",
    description:
      "As plantas serão colhidas e a estufa entrará em modo de secagem. Confirme apenas se a colheita estiver pronta.",
    bgColor:
      "bg-amber-500/10 border border-amber-500/30 dark:bg-amber-500/15 dark:border-amber-500/35",
    iconColor: "text-amber-600 dark:text-amber-400",
    confirmClass:
      "bg-amber-500 hover:bg-amber-600 text-black border-0",
    confirmLabel: "Sim, iniciar Secagem",
  },
  CLONING: {
    icon: Sprout,
    label: "Tirar Clones",
    description:
      "Serão selecionadas as plantas mãe para clonagem. A estufa entrará em fase de clonagem.",
    bgColor:
      "bg-sky-500/10 border border-sky-500/30 dark:bg-sky-500/15 dark:border-sky-500/35",
    iconColor: "text-sky-500 dark:text-sky-400",
    confirmClass:
      "bg-sky-500 hover:bg-sky-600 text-black border-0",
    confirmLabel: "Sim, iniciar Clonagem",
  },
};

export function PhaseConfirmDialog({
  open,
  onOpenChange,
  phase,
  tentName,
  onConfirm,
}: PhaseConfirmDialogProps) {
  const config = PHASE_CONFIG[phase];
  const Icon = config.icon;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-[420px]">
        <AlertDialogHeader>
          {/* Bloco colorido por fase */}
          <div className={`rounded-xl p-4 mb-2 flex items-center gap-3 ${config.bgColor}`}>
            <div className={`p-2 rounded-full bg-background/60 ${config.iconColor}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <p className={`font-semibold text-sm ${config.iconColor}`}>
                {config.label}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{tentName}</p>
            </div>
          </div>

          <AlertDialogTitle className="text-lg">
            Confirmar avanço de fase?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm leading-relaxed">
            {config.description}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel className="flex-1">Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={`flex-1 ${config.confirmClass}`}
          >
            {config.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

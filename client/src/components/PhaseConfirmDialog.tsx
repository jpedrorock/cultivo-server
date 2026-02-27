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
      "bg-green-500/10 border border-green-500/30 dark:bg-green-500/15 dark:border-green-500/35",
    iconColor: "text-green-600 dark:text-green-400",
    confirmClass:
      "bg-green-600 hover:bg-green-700 text-white focus:ring-green-500",
    confirmLabel: "Sim, iniciar Floração",
  },
  DRYING: {
    icon: Wind,
    label: "Avançar para Secagem",
    description:
      "As plantas serão colhidas e a estufa entrará em modo de secagem. Confirme apenas se a colheita estiver pronta.",
    bgColor:
      "bg-orange-500/10 border border-orange-500/30 dark:bg-orange-500/15 dark:border-orange-500/35",
    iconColor: "text-orange-600 dark:text-orange-400",
    confirmClass:
      "bg-orange-500 hover:bg-orange-600 text-white focus:ring-orange-500",
    confirmLabel: "Sim, iniciar Secagem",
  },
  CLONING: {
    icon: Sprout,
    label: "Tirar Clones",
    description:
      "Serão selecionadas as plantas mãe para clonagem. A estufa entrará em fase de clonagem.",
    bgColor:
      "bg-blue-500/10 border border-blue-500/30 dark:bg-blue-500/15 dark:border-blue-500/35",
    iconColor: "text-blue-600 dark:text-blue-400",
    confirmClass:
      "bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-500",
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

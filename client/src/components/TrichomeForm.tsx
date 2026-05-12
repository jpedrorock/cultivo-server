import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export type TrichomeStatus = "CLEAR" | "CLOUDY" | "AMBER" | "MIXED";

export interface TrichomeRecord {
  status: TrichomeStatus;
  clearPct: string;
  cloudyPct: string;
  amberPct: string;
  notes: string;
}

interface Plant {
  id: number;
  name: string;
}

interface TrichomeFormProps {
  plant: Plant;
  /** Posição atual na fila (0-indexed) — só pra exibir "Planta 1 de 4". */
  currentIndex: number;
  /** Total de plantas em flora — para o "1 de 4". */
  totalPlants: number;
  /** Registro atual (parcial — pode ser undefined se ainda não tocou). */
  record: TrichomeRecord | undefined;
  /** Atualiza um campo do registro desta planta. */
  onChange: (field: keyof TrichomeRecord, value: string) => void;
}

const TRICHOME_OPTIONS: Array<{
  value: TrichomeStatus;
  label: string;
  sub: string;
  /** Classe Tailwind do background quando selecionado */
  gradient: string;
}> = [
  { value: "CLEAR", label: "Translúcidos", sub: "Cedo demais", gradient: "bg-sky-400" },
  { value: "CLOUDY", label: "Opacos", sub: "Maturação ideal", gradient: "bg-slate-500" },
  { value: "AMBER", label: "Âmbar", sub: "Efeito sedativo", gradient: "bg-amber-500" },
  { value: "MIXED", label: "Misturado", sub: "Equilibrado", gradient: "bg-violet-500" },
];

const PCT_FIELDS: Array<{ field: keyof TrichomeRecord; label: string }> = [
  { field: "clearPct", label: "Transl. %" },
  { field: "cloudyPct", label: "Opacos %" },
  { field: "amberPct", label: "Âmbar %" },
];

const DEFAULT_RECORD: TrichomeRecord = {
  status: "CLOUDY",
  clearPct: "",
  cloudyPct: "",
  amberPct: "",
  notes: "",
};

/**
 * Formulário de tricomas de uma planta no QuickLog: 4 botões de status
 * (Translúcidos / Opacos / Âmbar / Misturado), percentagens opcionais
 * num acordeão e notas livres.
 *
 * Header mostra "Planta N de M" + nome da planta + badge "Tricomas".
 */
export function TrichomeForm({
  plant,
  currentIndex,
  totalPlants,
  record,
  onChange,
}: TrichomeFormProps) {
  const rec = record ?? DEFAULT_RECORD;

  return (
    <div className="space-y-4 animate-[slide-in-from-bottom_0.6s_ease-out]">
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground/60 font-medium">
            Planta {currentIndex + 1} de {totalPlants}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-violet-500/15 text-violet-400 border border-violet-500/20 font-semibold">
            Tricomas
          </span>
        </div>
        <div className="text-2xl font-black text-foreground truncate">{plant.name}</div>
      </div>

      {/* Status buttons */}
      <div className="grid grid-cols-2 gap-3">
        {TRICHOME_OPTIONS.map(({ value, label, sub, gradient }) => {
          const selected = rec.status === value;
          return (
            <button
              key={value}
              onClick={() => onChange("status", value)}
              className={`flex flex-col items-center justify-center gap-1 p-4 rounded-2xl border-2 font-bold transition-all duration-200 ${
                selected
                  ? `${gradient} text-white border-transparent shadow-lg scale-[1.02]`
                  : "bg-card text-card-foreground border-border active:scale-[0.98]"
              }`}
            >
              <span className="text-base font-bold">{label}</span>
              <span
                className={`text-[11px] font-normal ${
                  selected ? "text-white/80" : "text-muted-foreground"
                }`}
              >
                {sub}
              </span>
            </button>
          );
        })}
      </div>

      {/* Percentagens — colapsável */}
      <Accordion type="multiple" defaultValue={[]} className="space-y-0">
        <AccordionItem value="pcts" className="border border-border rounded-xl bg-card shadow-sm">
          <AccordionTrigger className="px-4 py-3 hover:no-underline">
            <span className="text-sm font-medium text-muted-foreground">
              Percentagens por tipo (opcional)
            </span>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="grid grid-cols-3 gap-2">
              {PCT_FIELDS.map(({ field, label }) => (
                <div key={field}>
                  <label className="text-[11px] text-muted-foreground block mb-1">{label}</label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={100}
                    value={rec[field] as string}
                    onChange={(e) => onChange(field, e.target.value)}
                    placeholder="0"
                    className="h-10 text-center border-2 border-input rounded-xl"
                  />
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Notas */}
      <Input
        value={rec.notes}
        onChange={(e) => onChange("notes", e.target.value)}
        placeholder="Observações (opcional)"
        className="h-12 border-2 border-input rounded-xl bg-card"
      />
    </div>
  );
}

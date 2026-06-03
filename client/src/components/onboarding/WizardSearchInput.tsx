/**
 * WizardSearchInput — campo de busca com debounce pro onboarding.
 *
 * Usado no step 3 do wizard (escolha de strain): o usuário digita e o
 * componente emite `onDebouncedChange` 250ms depois da última tecla — evita
 * refiltrar/refazer query a cada caractere.
 *
 * Mostra resultados como lista tocável abaixo do input. Cada resultado pode
 * ter label + sublabel (ex: nome da strain + "Indica · 8sem flora").
 *
 * Parte da E2 do épico Onboarding (ver BACKLOG).
 */
import { useState, useEffect, useRef } from "react";
import { Search, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptics } from "@/lib/haptics";

export interface WizardSearchResult {
  id: string;
  label: string;
  sublabel?: string;
}

interface WizardSearchInputProps {
  placeholder?: string;
  results: WizardSearchResult[];
  /** Disparado 250ms após a última tecla com o termo já trimmado */
  onDebouncedChange: (query: string) => void;
  onSelect: (result: WizardSearchResult) => void;
  /** Mostra spinner enquanto a query externa está carregando */
  loading?: boolean;
  /** Termo mínimo pra disparar busca (default 1) */
  minChars?: number;
  /** Debounce em ms (default 250) */
  debounceMs?: number;
  className?: string;
}

export function WizardSearchInput({
  placeholder = "Buscar...",
  results,
  onDebouncedChange,
  onSelect,
  loading = false,
  minChars = 1,
  debounceMs = 250,
  className,
}: WizardSearchInputProps) {
  const [value, setValue] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce: emite onDebouncedChange depois de `debounceMs` parado
  useEffect(() => {
    const trimmed = value.trim();
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onDebouncedChange(trimmed.length >= minChars ? trimmed : "");
    }, debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // onDebouncedChange é estável (vem do pai); só reage a `value`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, debounceMs, minChars]);

  const handleSelect = (r: WizardSearchResult) => {
    haptics.light().catch(() => {});
    onSelect(r);
  };

  const showResults = value.trim().length >= minChars;

  return (
    <div className={cn("w-full", className)}>
      {/* Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60 pointer-events-none" />
        <input
          type="text"
          inputMode="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-card border border-border rounded-2xl pl-9 pr-9 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-1 focus:ring-primary/30 transition-colors"
        />
        {loading ? (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60 animate-spin" />
        ) : value ? (
          <button
            type="button"
            onClick={() => setValue("")}
            aria-label="Limpar busca"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : null}
      </div>

      {/* Resultados */}
      {showResults && (
        <div className="mt-2 rounded-2xl border border-border overflow-hidden divide-y divide-border/60 max-h-64 overflow-y-auto">
          {results.length === 0 && !loading ? (
            <div className="px-4 py-3 text-sm text-muted-foreground text-center">
              Nenhum resultado. Tente outro nome.
            </div>
          ) : (
            results.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => handleSelect(r)}
                className="w-full text-left px-4 py-3 hover:bg-primary/5 active:bg-primary/10 transition-colors focus-visible:outline-none"
              >
                <span className="block text-sm font-medium text-foreground">{r.label}</span>
                {r.sublabel && (
                  <span className="block text-xs text-muted-foreground mt-0.5">{r.sublabel}</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

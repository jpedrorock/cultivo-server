import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Camera, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";

// ── helpers ───────────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  HEALTHY:    { label: "Saudável",    cls: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
  STRESSED:   { label: "Estressada",  cls: "bg-amber-500/20   text-amber-600   dark:text-amber-400   border-amber-500/30"   },
  SICK:       { label: "Doente",      cls: "bg-red-500/20     text-red-600     dark:text-red-400     border-red-500/30"     },
  RECOVERING: { label: "Recuperando", cls: "bg-blue-500/20    text-blue-600    dark:text-blue-400    border-blue-500/30"    },
};

// ── componente ────────────────────────────────────────────────────────────────

export default function PhotoTimeline({ plantId }: { plantId: number }) {
  const { data: logs = [], isLoading } = trpc.plantHealth.list.useQuery({ plantId });

  // Filtrar só logs com foto, ordenados do mais antigo para o mais recente
  const photos = [...logs]
    .filter(l => l.photoUrl)
    .reverse(); // API retorna newest-first, queremos oldest-first

  const [selected, setSelected] = useState<number>(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);

  // Centralizar o thumb selecionado no strip
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const thumb = strip.children[selected] as HTMLElement;
    if (thumb) {
      thumb.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }, [selected]);

  // ── estados de carregamento / vazio ──

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground text-sm animate-pulse">
        Carregando fotos…
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-6">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
          <Camera className="w-8 h-8 text-muted-foreground" />
        </div>
        <p className="font-semibold text-foreground">Nenhuma foto registrada</p>
        <p className="text-sm text-muted-foreground max-w-xs">
          As fotos aparecem aqui conforme você registra a saúde da planta pelo QuickLog.
        </p>
      </div>
    );
  }

  const current = photos[selected];
  const statusStyle = STATUS_STYLE[current.healthStatus] ?? { label: current.healthStatus, cls: "bg-muted text-muted-foreground border-border" };

  const goPrev = () => setSelected(i => Math.max(0, i - 1));
  const goNext = () => setSelected(i => Math.min(photos.length - 1, i + 1));

  // ── render ──

  return (
    <div className="space-y-4 pt-2">

      {/* Contador */}
      <p className="text-xs text-muted-foreground text-center">
        {photos.length} {photos.length === 1 ? "foto registrada" : "fotos registradas"}
        {" · "}de {format(new Date(photos[0].logDate), "MMM yyyy", { locale: ptBR })}
        {photos.length > 1 && ` até ${format(new Date(photos[photos.length - 1].logDate), "MMM yyyy", { locale: ptBR })}`}
      </p>

      {/* ── Foto principal ───────────────────────────────────────────── */}
      <div className="relative rounded-2xl overflow-hidden bg-muted aspect-[3/4] max-h-[55vh] mx-auto max-w-sm">
        <img
          src={current.photoUrl!}
          alt={`Foto ${selected + 1}`}
          className="w-full h-full object-cover"
          loading="lazy"
        />

        {/* Overlay bottom — info */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-4 pb-4 pt-10">
          <div className="flex items-end justify-between gap-2">
            <div className="space-y-1">
              <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusStyle.cls}`}>
                {statusStyle.label}
              </span>
              <p className="text-white text-sm font-semibold">
                {format(new Date(current.logDate), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
              </p>
              {current.symptoms && (
                <p className="text-white/70 text-xs line-clamp-2">{current.symptoms}</p>
              )}
            </div>
            <button
              onClick={() => setLightboxOpen(true)}
              className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm shrink-0"
            >
              <ZoomIn className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>

        {/* Setas de navegação */}
        {selected > 0 && (
          <button
            onClick={goPrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
        {selected < photos.length - 1 && (
          <button
            onClick={goNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}

        {/* Dots de posição */}
        {photos.length > 1 && photos.length <= 12 && (
          <div className="absolute top-3 inset-x-0 flex justify-center gap-1">
            {photos.map((_, i) => (
              <button
                key={i}
                onClick={() => setSelected(i)}
                className={`rounded-full transition-all ${i === selected ? "w-4 h-1.5 bg-white" : "w-1.5 h-1.5 bg-white/40"}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Strip de thumbnails ──────────────────────────────────────── */}
      <div
        ref={stripRef}
        className="flex gap-2 overflow-x-auto pb-1 px-1 scrollbar-hide snap-x snap-mandatory"
        style={{ scrollbarWidth: "none" }}
      >
        {photos.map((log, i) => (
          <button
            key={log.id}
            onClick={() => setSelected(i)}
            className={`relative shrink-0 snap-center rounded-xl overflow-hidden transition-all duration-200 ${
              i === selected
                ? "ring-2 ring-primary ring-offset-2 ring-offset-background scale-105"
                : "opacity-60 hover:opacity-80"
            }`}
            style={{ width: 64, height: 80 }}
          >
            <img
              src={log.photoUrl!}
              alt={`Thumb ${i + 1}`}
              className="w-full h-full object-cover"
              loading="lazy"
            />
            {/* data label */}
            <div className="absolute inset-x-0 bottom-0 bg-black/50 px-1 py-0.5">
              <p className="text-white text-[9px] font-semibold text-center tabular-nums leading-tight">
                {format(new Date(log.logDate), "dd/MM", { locale: ptBR })}
              </p>
            </div>
            {/* status dot */}
            <div className={`absolute top-1 right-1 w-2 h-2 rounded-full ${
              log.healthStatus === "HEALTHY"    ? "bg-emerald-500" :
              log.healthStatus === "RECOVERING" ? "bg-blue-500" :
              log.healthStatus === "STRESSED"   ? "bg-amber-500" : "bg-red-500"
            }`} />
          </button>
        ))}
      </div>

      {/* ── Detalhes da foto selecionada ─────────────────────────────── */}
      {(current.notes || current.symptoms || current.treatment) && (
        <div className="bg-muted/50 rounded-xl p-4 space-y-2 text-sm">
          {current.symptoms && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Sintomas</p>
              <p className="text-foreground">{current.symptoms}</p>
            </div>
          )}
          {current.treatment && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Tratamento</p>
              <p className="text-foreground">{current.treatment}</p>
            </div>
          )}
          {current.notes && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Notas</p>
              <p className="text-foreground">{current.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Lightbox ────────────────────────────────────────────────── */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-screen-sm p-0 overflow-hidden bg-black border-0">
          <img
            src={current.photoUrl!}
            alt="Foto ampliada"
            className="w-full h-auto max-h-[90vh] object-contain"
          />
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent px-4 py-4">
            <p className="text-white font-semibold text-sm">
              {format(new Date(current.logDate), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </p>
            <p className="text-white/60 text-xs mt-0.5">{statusStyle.label}</p>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}

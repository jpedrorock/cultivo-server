import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Camera, Heart, ArrowRight, Loader2, CalendarDays, ImageOff, LayoutList } from "lucide-react";

interface Props {
  plantId: number;
}

type TimelineEvent =
  | { kind: "photo"; id: number; date: Date; photoUrl: string; description: string | null }
  | { kind: "health"; id: number; date: Date; status: string; symptoms: string | null; photoUrl: string | null }
  | { kind: "move"; id: number; date: Date; fromTentName: string | null; toTentName: string | null; reason: string | null };

const HEALTH_LABELS: Record<string, { label: string; color: string }> = {
  HEALTHY:    { label: "Saudável",    color: "text-emerald-400" },
  STRESSED:   { label: "Estressada", color: "text-yellow-400" },
  SICK:       { label: "Doente",     color: "text-red-400" },
  RECOVERING: { label: "Recuperando",color: "text-blue-400" },
};

type FilterKind = "all" | "photo" | "health" | "move";

export default function PlantTimeline({ plantId }: Props) {
  const { data: photos = [],  isLoading: lPhotos  } = trpc.plantPhotos.list.useQuery({ plantId });
  const { data: healthLogs = [], isLoading: lHealth } = trpc.plantHealth.list.useQuery({ plantId });
  const { data: tentHistory = [], isLoading: lHistory } = trpc.plants.getTentHistory.useQuery({ plantId });

  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKind>("all");

  const isLoading = lPhotos || lHealth || lHistory;

  // Build unified event list
  const events: TimelineEvent[] = [
    ...(photos as any[]).map((p): TimelineEvent => ({
      kind: "photo",
      id: p.id,
      date: new Date(p.photoDate),
      photoUrl: p.photoUrl,
      description: p.description ?? null,
    })),
    ...(healthLogs as any[]).map((h): TimelineEvent => ({
      kind: "health",
      id: h.id,
      date: new Date(h.logDate),
      status: h.healthStatus,
      symptoms: h.symptoms ?? null,
      photoUrl: h.photoUrl ?? null,
    })),
    ...(tentHistory as any[]).map((t): TimelineEvent => ({
      kind: "move",
      id: t.id,
      date: new Date(t.movedAt),
      fromTentName: t.fromTentName ?? null,
      toTentName: t.toTentName ?? null,
      reason: t.reason ?? null,
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  const filteredEvents = filter === "all" ? events : events.filter(e => e.kind === filter);

  // Counts per type for badge
  const counts = {
    photo:  events.filter(e => e.kind === "photo").length,
    health: events.filter(e => e.kind === "health").length,
    move:   events.filter(e => e.kind === "move").length,
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center py-12 gap-3 text-muted-foreground">
        <CalendarDays className="w-10 h-10 opacity-30" />
        <p className="text-sm">Nenhum evento ainda</p>
        <p className="text-xs opacity-60">Registros de saúde, fotos e transferências aparecerão aqui</p>
      </div>
    );
  }

  return (
    <>
      {/* Filter tabs */}
      {events.length > 0 && (
        <div className="flex gap-1.5 mb-4 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
          {([
            { key: "all",    label: "Todas",          icon: <LayoutList className="w-3 h-3" />, count: events.length },
            { key: "photo",  label: "Fotos",           icon: <Camera     className="w-3 h-3" />, count: counts.photo },
            { key: "health", label: "Saúde",           icon: <Heart      className="w-3 h-3" />, count: counts.health },
            { key: "move",   label: "Transferências",  icon: <ArrowRight className="w-3 h-3" />, count: counts.move },
          ] as { key: FilterKind; label: string; icon: React.ReactNode; count: number }[]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium shrink-0 transition-all ${
                filter === tab.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.count > 0 && (
                <span className={`text-xs px-1 rounded-full ${
                  filter === tab.key ? "bg-white/20" : "bg-muted-foreground/20"
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Empty filtered state */}
      {filteredEvents.length === 0 && events.length > 0 && (
        <div className="flex flex-col items-center py-8 gap-2 text-muted-foreground">
          <CalendarDays className="w-8 h-8 opacity-30" />
          <p className="text-sm">Nenhum evento deste tipo</p>
        </div>
      )}

      {/* Timeline */}
      <div className="relative ml-2 pl-5 border-l border-border/40 space-y-3">
        {filteredEvents.map((evt) => (
          <div key={`${evt.kind}-${evt.id}`} className="relative">
            {/* Dot */}
            <span className={`absolute -left-[21px] top-3.5 flex items-center justify-center w-4 h-4 rounded-full bg-card border border-border/60 z-10`}>
              {evt.kind === "photo"
                ? <Camera className="w-2.5 h-2.5 text-blue-400" />
                : evt.kind === "health"
                ? <Heart className="w-2.5 h-2.5 text-rose-400" />
                : <ArrowRight className="w-2.5 h-2.5 text-muted-foreground" />
              }
            </span>

            {/* ── Photo card ── */}
            {evt.kind === "photo" && (
              <button
                onClick={() => setLightboxUrl(evt.photoUrl)}
                className="w-full text-left rounded-2xl border border-border/40 bg-card overflow-hidden flex gap-3 active:scale-[0.98] transition-transform"
              >
                <div className="w-20 shrink-0 bg-muted/30">
                  <img
                    src={evt.photoUrl}
                    alt={evt.description || format(evt.date, "dd/MM/yyyy")}
                    className="w-full h-full object-cover aspect-square"
                    loading="lazy"
                  />
                </div>
                <div className="flex-1 py-3 pr-3 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Camera className="w-3 h-3 text-blue-400 shrink-0" />
                    <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Foto</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {format(evt.date, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                  </p>
                  {evt.description && (
                    <p className="text-sm text-foreground mt-1 line-clamp-2">{evt.description}</p>
                  )}
                </div>
              </button>
            )}

            {/* ── Health card ── */}
            {evt.kind === "health" && (() => {
              const info = HEALTH_LABELS[evt.status] ?? { label: evt.status, color: "text-muted-foreground" };
              return (
                <div className="rounded-2xl border border-border/40 bg-card overflow-hidden flex gap-3">
                  {evt.photoUrl ? (
                    <button
                      onClick={() => setLightboxUrl(evt.photoUrl!)}
                      className="w-20 shrink-0 bg-muted/30 active:scale-95 transition-transform"
                    >
                      <img
                        src={evt.photoUrl}
                        alt={info.label}
                        className="w-full h-full object-cover aspect-square"
                        loading="lazy"
                      />
                    </button>
                  ) : (
                    <div className="w-20 shrink-0 bg-muted/20 flex items-center justify-center aspect-square">
                      <ImageOff className="w-5 h-5 text-muted-foreground/30" />
                    </div>
                  )}
                  <div className="flex-1 py-3 pr-3 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Heart className="w-3 h-3 text-rose-400 shrink-0" />
                      <span className="text-xs font-semibold text-rose-400 uppercase tracking-wider">Saúde</span>
                    </div>
                    <p className={`text-sm font-bold ${info.color}`}>{info.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(evt.date, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                    </p>
                    {evt.symptoms && (
                      <p className="text-xs text-muted-foreground/70 mt-1 line-clamp-2">{evt.symptoms}</p>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* ── Move card ── */}
            {evt.kind === "move" && (
              <div className="rounded-2xl border border-border/40 bg-card px-4 py-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Transferência</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">{evt.fromTentName || "—"}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
                  <span className="font-semibold text-foreground">{evt.toTentName || "—"}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {format(evt.date, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </p>
                {evt.reason && (
                  <p className="text-xs text-muted-foreground/60 mt-1">{evt.reason}</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <img
            src={lightboxUrl}
            alt="Foto ampliada"
            className="max-h-full max-w-full object-contain rounded-xl"
            draggable={false}
          />
        </div>
      )}
    </>
  );
}

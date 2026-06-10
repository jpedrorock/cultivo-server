import { useEffect, useState, useCallback } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";

// ── helpers ──────────────────────────────────────────────────────────────────

function calculateVPD(t: number, rh: number) {
  return parseFloat((0.6108 * Math.exp((17.27 * t) / (t + 237.3)) * (1 - rh / 100)).toFixed(2));
}

const vpdColor  = (v: number) => v < 0.4 ? "#60a5fa" : v <= 0.8 ? "#4ade80" : v <= 1.2 ? "#a78bfa" : v <= 1.6 ? "#fbbf24" : "#f87171";
const tempColor = (v: number) => v < 18  ? "#60a5fa" : v <= 28  ? "#4ade80" : v <= 32  ? "#fbbf24" : "#f87171";
const rhColor   = (v: number) => v < 40  ? "#f87171" : v <= 70  ? "#2dd4bf" : v <= 80  ? "#fbbf24" : "#f87171";
const ppfdColor = (v: number) => v < 200 ? "#60a5fa" : v <= 600 ? "#4ade80" : v <= 900 ? "#fbbf24" : "#f87171";

function Sparkline({ values, color, w = 80, h = 28 }: { values: number[]; color: string; w?: number; h?: number }) {
  if (values.length < 2) return null;
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - ((v - min) / range) * h * 0.8 - h * 0.1).toFixed(1)}`);
  const [lx, ly] = pts[pts.length - 1].split(",").map(Number);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="opacity-60 shrink-0">
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="2.5" fill={color} />
    </svg>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function DisplayMode() {
  const { id } = useParams<{ id: string }>();
  const tentId = parseInt(id || "0");
  const [, setLocation] = useLocation();
  const [wakeLock, setWakeLock]   = useState<WakeLockSentinel | null>(null);
  const [now, setNow]             = useState(new Date());
  const [landscape, setLandscape] = useState(() => window.innerWidth > window.innerHeight);

  // Sensor é escrito pelo poller (8h) — 30s era desperdício. 5min é de sobra
  // pra um monitor sempre-ligado, e corta ~90% das chamadas.
  const { data: logs  } = trpc.dailyLogs.list.useQuery({ tentId, limit: 10 }, { refetchInterval: 5 * 60_000 });
  const { data: tent  } = trpc.tents.getById.useQuery({ id: tentId });
  const { data: cycle } = trpc.cycles.getByTent.useQuery({ tentId });

  // ── derived values ──
  const log   = logs?.[0];
  const temp  = log?.tempC ? parseFloat(String(log.tempC))  : null;
  const rh    = log?.rhPct ? parseFloat(String(log.rhPct))  : null;
  const vpd   = temp !== null && rh !== null ? calculateVPD(temp, rh) : null;
  const ppfd  = log?.ppfd  ? Number(log.ppfd) : null;
  const ppfdHistory = [...(logs ?? [])].reverse().map(l => l.ppfd ? Number(l.ppfd) : null).filter((v): v is number => v !== null);

  const cycleInfo = (() => {
    if (!cycle) return null;
    const days     = Math.floor((Date.now() - new Date(cycle.startDate).getTime()) / 86400000);
    const week     = Math.floor(days / 7) + 1;
    const isFlora  = !!cycle.floraStartDate;
    const totalEst = 16;
    const left     = Math.max(0, totalEst - week);
    return {
      week, totalEst, left,
      phase:      isFlora ? "Floração" : week <= 2 ? "Clonagem" : "Vega",
      phaseColor: isFlora ? "#a78bfa" : "#4ade80",
      pct:        Math.min((week / totalEst) * 100, 100),
    };
  })();

  // ── wake lock ──
  const requestWakeLock = useCallback(async () => {
    try { if ("wakeLock" in navigator) setWakeLock(await (navigator as any).wakeLock.request("screen")); } catch { /* silent */ }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { requestWakeLock(); return () => { wakeLock?.release(); }; }, []);
  useEffect(() => {
    const fn = () => { if (document.visibilityState === "visible") requestWakeLock(); };
    document.addEventListener("visibilitychange", fn);
    return () => document.removeEventListener("visibilitychange", fn);
  }, [requestWakeLock]);

  // ── clock + orientation ──
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const update = () => setLandscape(window.innerWidth > window.innerHeight);
    window.addEventListener("resize", update);
    screen.orientation?.addEventListener("change", update);
    return () => {
      window.removeEventListener("resize", update);
      screen.orientation?.removeEventListener("change", update);
    };
  }, []);

  const timeStr = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  // ── shared metric tile ──
  const MetricTile = ({ label, value, unit, color, sub }: { label: string; value: string; unit?: string; color: string; sub?: string }) => (
    <div className="flex flex-col items-center justify-center">
      <p className="text-white/35 font-semibold uppercase tracking-widest" style={{ fontSize: landscape ? "0.55rem" : "0.65rem" }}>{label}</p>
      <p className="font-black leading-none tabular-nums" style={{ color, fontSize: landscape ? "clamp(2.8rem, 11vh, 5rem)" : "clamp(4.5rem, 20vw, 8rem)" }}>
        {value}{unit && <span style={{ fontSize: "0.38em", opacity: 0.6 }}>{unit}</span>}
      </p>
      {sub && <p className="text-white/30 tabular-nums" style={{ fontSize: "0.6rem" }}>{sub}</p>}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black flex flex-col select-none overflow-hidden z-[200]">

      {/* ── header ── */}
      <div className={`flex items-center justify-between shrink-0 ${landscape ? "px-4 py-1.5" : "px-5 pt-safe pt-3 pb-1"}`}>
        <button onClick={() => setLocation(`/tent/${tentId}`)}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 text-white active:bg-white/20">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="text-center">
          <p className="text-white/40 font-semibold uppercase tracking-widest" style={{ fontSize: "0.6rem" }}>{tent?.name ?? "Estufa"}</p>
          <p className="text-white/60 font-bold tabular-nums" style={{ fontSize: landscape ? "0.85rem" : "1rem" }}>{timeStr}</p>
        </div>
        <div className="w-8" />
      </div>

      {log ? (
        landscape ? (
          /* ══════════════════════════════════════
             LANDSCAPE — dashboard horizontal
          ══════════════════════════════════════ */
          <div className="flex-1 flex flex-col px-4 pb-3 gap-2 overflow-hidden">

            {/* Row 1 — big 3 metrics */}
            <div className="flex-1 grid grid-cols-3 divide-x divide-white/10">
              <MetricTile label="Temperatura" value={temp !== null ? `${temp.toFixed(1)}°` : "—"} color={temp !== null ? tempColor(temp) : "#fff"} />
              <MetricTile label="Umidade"     value={rh   !== null ? `${rh.toFixed(0)}%`   : "—"} color={rh   !== null ? rhColor(rh)     : "#fff"} />
              <MetricTile label="VPD"         value={vpd  !== null ? String(vpd)            : "—"} unit={vpd !== null ? " kPa" : undefined} color={vpd !== null ? vpdColor(vpd) : "#fff"} />
            </div>

            {/* Row 2 — PPFD + cycle strip */}
            <div className="grid grid-cols-2 gap-3 shrink-0">

              {/* PPFD */}
              <div className="bg-white/5 rounded-xl px-4 py-2 flex items-center justify-between">
                <div>
                  <p className="text-white/35 text-xs font-semibold uppercase tracking-widest mb-0.5">PPFD</p>
                  <p className="font-black tabular-nums leading-none"
                    style={{ fontSize: "clamp(1.6rem, 6vh, 2.5rem)", color: ppfd !== null ? ppfdColor(ppfd) : "#ffffff30" }}>
                    {ppfd ?? "—"}
                    {ppfd !== null && <span className="ml-1 text-white/30 font-medium" style={{ fontSize: "0.3em" }}>μmol/m²/s</span>}
                  </p>
                </div>
                {ppfdHistory.length >= 2 && <Sparkline values={ppfdHistory} color={ppfd !== null ? ppfdColor(ppfd) : "#fff3"} />}
              </div>

              {/* Ciclo */}
              {cycleInfo ? (
                <div className="bg-white/5 rounded-xl px-4 py-2 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded-full uppercase"
                      style={{ background: cycleInfo.phaseColor + "20", color: cycleInfo.phaseColor }}>
                      {cycleInfo.phase}
                    </span>
                    <span className="text-white/40 text-xs">
                      Sem <b className="text-white">{cycleInfo.week}</b>/{cycleInfo.totalEst}
                      {" · "}~{cycleInfo.left} restantes
                    </span>
                  </div>
                  <div className="h-1 rounded-full bg-white/10 overflow-hidden mt-1">
                    <div className="h-full rounded-full" style={{ width: `${cycleInfo.pct}%`, background: cycleInfo.phaseColor }} />
                  </div>
                </div>
              ) : (
                <div className="bg-white/5 rounded-xl px-4 py-2 flex items-center justify-center">
                  <p className="text-white/20 text-xs">Sem ciclo ativo</p>
                </div>
              )}
            </div>

            {/* Last update */}
            <p className="text-white/15 text-xs text-center shrink-0">
              Atualizado: {log.logDate ? new Date(log.logDate).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
            </p>
          </div>

        ) : (
          /* ══════════════════════════════════════
             PORTRAIT — stacked big numbers
          ══════════════════════════════════════ */
          <div className="flex-1 flex flex-col justify-between px-6 pb-4 overflow-hidden">

            <div className="flex-1 flex flex-col items-center justify-center gap-1">
              <MetricTile label="Temperatura" value={temp !== null ? `${temp.toFixed(1)}°` : "—"} color={temp !== null ? tempColor(temp) : "#fff"} />
              <MetricTile label="Umidade"     value={rh   !== null ? `${rh.toFixed(0)}%`   : "—"} color={rh   !== null ? rhColor(rh)     : "#fff"} />
              {vpd !== null && (
                <MetricTile label="VPD" value={String(vpd)} unit=" kPa" color={vpdColor(vpd)} />
              )}
            </div>

            {/* PPFD */}
            <div className="flex items-center justify-between bg-white/5 rounded-2xl px-5 py-3 mb-2">
              <div>
                <p className="text-white/35 text-xs font-semibold uppercase tracking-widest mb-0.5">PPFD</p>
                <p className="font-black tabular-nums leading-none"
                  style={{ fontSize: "clamp(2rem, 9vw, 3.5rem)", color: ppfd !== null ? ppfdColor(ppfd) : "#ffffff30" }}>
                  {ppfd ?? "—"}
                  {ppfd !== null && <span className="ml-1 text-white/35 font-medium" style={{ fontSize: "0.3em" }}>μmol/m²/s</span>}
                </p>
              </div>
              {ppfdHistory.length >= 2 && <Sparkline values={ppfdHistory} color={ppfd !== null ? ppfdColor(ppfd) : "#fff3"} />}
            </div>

            {/* Ciclo */}
            {cycleInfo && (
              <div className="bg-white/5 rounded-2xl px-5 py-3 space-y-2 mb-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full uppercase"
                      style={{ background: cycleInfo.phaseColor + "22", color: cycleInfo.phaseColor }}>
                      {cycleInfo.phase}
                    </span>
                    <span className="text-white/50 text-xs">Sem <b className="text-white">{cycleInfo.week}</b> / ~{cycleInfo.totalEst}</span>
                  </div>
                  <span className="text-white/35 text-xs">~{cycleInfo.left} restantes</span>
                </div>
                <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${cycleInfo.pct}%`, background: cycleInfo.phaseColor }} />
                </div>
              </div>
            )}

            <p className="text-white/15 text-xs text-center">
              Atualizado: {log.logDate ? new Date(log.logDate).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
            </p>
          </div>
        )
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-white/30 text-xl">Sem registros ainda</p>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState, useCallback } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Wifi, WifiOff } from "lucide-react";
import { useLocation } from "wouter";

// VPD calculation (kPa)
function calculateVPD(tempC: number, rhPct: number): number {
  const svp = 0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3));
  return parseFloat((svp * (1 - rhPct / 100)).toFixed(2));
}

function getVPDColor(vpd: number): string {
  if (vpd < 0.4) return "#60a5fa"; // too low - blue
  if (vpd <= 0.8) return "#4ade80"; // ideal veg - green
  if (vpd <= 1.2) return "#a78bfa"; // ideal flower - purple
  if (vpd <= 1.6) return "#fbbf24"; // high - amber
  return "#f87171"; // too high - red
}

function getTempColor(temp: number): string {
  if (temp < 18) return "#60a5fa";
  if (temp <= 28) return "#4ade80";
  if (temp <= 32) return "#fbbf24";
  return "#f87171";
}

function getRHColor(rh: number): string {
  if (rh < 40) return "#f87171";
  if (rh <= 70) return "#4ade80";
  if (rh <= 80) return "#fbbf24";
  return "#f87171";
}

export default function DisplayMode() {
  const { id } = useParams<{ id: string }>();
  const tentId = parseInt(id || "0");
  const [, setLocation] = useLocation();
  const [wakeLock, setWakeLock] = useState<WakeLockSentinel | null>(null);
  const [now, setNow] = useState(new Date());

  const { data: logs } = trpc.dailyLogs.list.useQuery(
    { tentId, limit: 1 },
    { refetchInterval: 30000 } // auto-refresh every 30s
  );

  const { data: tent } = trpc.tents.getById.useQuery({ id: tentId });

  const latestLog = logs?.[0];
  const temp = latestLog?.tempC ? parseFloat(String(latestLog.tempC)) : null;
  const rh = latestLog?.rhPct ? parseFloat(String(latestLog.rhPct)) : null;
  const vpd = temp !== null && rh !== null ? calculateVPD(temp, rh) : null;

  // Wake Lock
  const requestWakeLock = useCallback(async () => {
    try {
      if ("wakeLock" in navigator) {
        const lock = await (navigator as any).wakeLock.request("screen");
        setWakeLock(lock);
      }
    } catch {
      // Wake lock not supported or permission denied - silent fail
    }
  }, []);

  useEffect(() => {
    requestWakeLock();
    return () => { wakeLock?.release(); };
  }, []);

  // Re-acquire wake lock when page becomes visible again
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") requestWakeLock();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [requestWakeLock]);

  // Clock
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const timeStr = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="fixed inset-0 bg-black flex flex-col select-none">
      {/* Header bar */}
      <div className="flex items-center justify-between px-6 pt-safe pt-4 pb-2">
        <button
          onClick={() => setLocation(`/tent/${tentId}`)}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 text-white"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="text-center">
          <p className="text-white/50 text-xs font-medium uppercase tracking-widest">
            {tent?.name ?? "Estufa"}
          </p>
          <p className="text-white/30 text-xs">{timeStr}</p>
        </div>
        <div className="w-10 h-10 flex items-center justify-center">
          {wakeLock ? (
            <Wifi className="w-4 h-4 text-white/30" />
          ) : (
            <WifiOff className="w-4 h-4 text-white/20" />
          )}
        </div>
      </div>

      {/* Main readings */}
      {latestLog ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-8 px-6">
          {/* Temperature */}
          <div className="text-center">
            <p className="text-white/40 text-sm font-semibold uppercase tracking-widest mb-1">Temperatura</p>
            <p className="font-black leading-none" style={{ fontSize: "clamp(5rem, 20vw, 9rem)", color: temp !== null ? getTempColor(temp) : "#ffffff" }}>
              {temp !== null ? `${temp.toFixed(1)}°` : "—"}
            </p>
          </div>

          {/* Humidity */}
          <div className="text-center">
            <p className="text-white/40 text-sm font-semibold uppercase tracking-widest mb-1">Umidade</p>
            <p className="font-black leading-none" style={{ fontSize: "clamp(5rem, 20vw, 9rem)", color: rh !== null ? getRHColor(rh) : "#ffffff" }}>
              {rh !== null ? `${rh.toFixed(0)}%` : "—"}
            </p>
          </div>

          {/* VPD */}
          {vpd !== null && (
            <div className="text-center">
              <p className="text-white/40 text-sm font-semibold uppercase tracking-widest mb-1">VPD</p>
              <p className="font-black leading-none" style={{ fontSize: "clamp(3.5rem, 14vw, 6rem)", color: getVPDColor(vpd) }}>
                {vpd} kPa
              </p>
            </div>
          )}

          {/* Last update */}
          <p className="text-white/20 text-xs text-center">
            Último registro: {latestLog.logDate ? new Date(latestLog.logDate).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
          </p>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-white/30 text-xl">Sem registros ainda</p>
        </div>
      )}
    </div>
  );
}

import { lazy, Suspense, useState } from "react";
import PlantTentHistoryTab from "@/components/PlantTentHistoryTab";
import PlantTimeline from "@/components/PlantTimeline";
import { Loader2, Camera, History, CalendarDays } from "lucide-react";

const PlantPhotosTab = lazy(() => import("@/components/PlantPhotosTab"));

interface PlantArchiveTabProps {
  plantId: number;
}

type ArchiveView = "timeline" | "gallery" | "history";

export default function PlantArchiveTab({ plantId }: PlantArchiveTabProps) {
  const [view, setView] = useState<ArchiveView>("timeline");

  const tabs: { id: ArchiveView; label: string; icon: React.ReactNode }[] = [
    { id: "timeline", label: "Timeline", icon: <CalendarDays className="w-3.5 h-3.5" /> },
    { id: "gallery",  label: "Fotos",    icon: <Camera className="w-3.5 h-3.5" /> },
    { id: "history",  label: "Estufas",  icon: <History className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="pt-1">
      {/* Sub-tabs */}
      <div className="flex gap-1 mb-5 p-1 rounded-xl bg-muted/30 border border-border/40">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setView(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
              view === tab.id
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Views */}
      {view === "timeline" && <PlantTimeline plantId={plantId} />}

      {view === "gallery" && (
        <Suspense fallback={<div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}>
          <PlantPhotosTab plantId={plantId} />
        </Suspense>
      )}

      {view === "history" && <PlantTentHistoryTab plantId={plantId} />}
    </div>
  );
}

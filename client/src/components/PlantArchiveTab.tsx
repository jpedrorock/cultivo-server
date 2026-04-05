import { lazy, Suspense, useState } from "react";
import PlantTentHistoryTab from "@/components/PlantTentHistoryTab";
import { Loader2, Camera, History } from "lucide-react";

const PlantPhotosGallery = lazy(() => import("@/components/PlantPhotosGallery"));

interface PlantArchiveTabProps {
  plantId: number;
  plantName: string;
}

type ArchiveView = "gallery" | "history";

export default function PlantArchiveTab({ plantId, plantName }: PlantArchiveTabProps) {
  const [view, setView] = useState<ArchiveView>("gallery");

  return (
    <div className="pt-1">
      <div className="flex gap-1 mb-5 p-1 rounded-xl bg-muted/30 border border-border/40">
        {[
          { id: "gallery" as const, label: "Fotos", icon: <Camera className="w-3.5 h-3.5" /> },
          { id: "history" as const, label: "Transferencias", icon: <History className="w-3.5 h-3.5" /> },
        ].map(tab => (
          <button key={tab.id} onClick={() => setView(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${view === tab.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      {view === "gallery" && (
        <Suspense fallback={<div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}>
          <PlantPhotosGallery plantId={plantId} plantName={plantName} />
        </Suspense>
      )}
      {view === "history" && <PlantTentHistoryTab plantId={plantId} />}
    </div>
  );
}

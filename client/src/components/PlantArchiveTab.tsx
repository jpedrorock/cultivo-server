import { lazy, Suspense } from "react";
import PlantTentHistoryTab from "@/components/PlantTentHistoryTab";
import { Camera, History } from "lucide-react";

// PhotoTimeline é pesado (lista longa de fotos) — carregado sob demanda
const PhotoTimeline = lazy(() => import("@/components/PhotoTimeline"));

function TimelineSkeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      <div className="h-20 rounded-xl bg-muted/60" />
      <div className="h-20 rounded-xl bg-muted/40" />
    </div>
  );
}

interface PlantArchiveTabProps {
  plantId: number;
}

export default function PlantArchiveTab({ plantId }: PlantArchiveTabProps) {
  return (
    <div className="space-y-6 pt-3">
      {/* Timeline de fotos */}
      <section>
        <h3 className="text-base font-semibold flex items-center gap-2 mb-3">
          <Camera className="w-4 h-4" />
          Timeline de Fotos
        </h3>
        <Suspense fallback={<TimelineSkeleton />}>
          <PhotoTimeline plantId={plantId} />
        </Suspense>
      </section>

      {/* Histórico de estufas */}
      <section>
        <PlantTentHistoryTab plantId={plantId} />
      </section>
    </div>
  );
}

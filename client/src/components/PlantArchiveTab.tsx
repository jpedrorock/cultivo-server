import { lazy, Suspense } from "react";
import PlantTentHistoryTab from "@/components/PlantTentHistoryTab";
import { Loader2 } from "lucide-react";

const PlantPhotosTab = lazy(() => import("@/components/PlantPhotosTab"));

interface PlantArchiveTabProps {
  plantId: number;
}

export default function PlantArchiveTab({ plantId }: PlantArchiveTabProps) {
  return (
    <div className="space-y-8 pt-1">
      {/* Galeria de fotos */}
      <Suspense fallback={<div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}>
        <PlantPhotosTab plantId={plantId} />
      </Suspense>

      {/* Divisor */}
      <div className="border-t border-border/40" />

      {/* Histórico de estufas */}
      <PlantTentHistoryTab plantId={plantId} />
    </div>
  );
}

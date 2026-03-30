import PhotoTimeline from "@/components/PhotoTimeline";
import PlantTentHistoryTab from "@/components/PlantTentHistoryTab";
import { Camera, History } from "lucide-react";

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
        <PhotoTimeline plantId={plantId} />
      </section>

      {/* Histórico de estufas */}
      <section>
        <PlantTentHistoryTab plantId={plantId} />
      </section>
    </div>
  );
}

import PlantTentHistoryTab from "@/components/PlantTentHistoryTab";

interface PlantArchiveTabProps {
  plantId: number;
}

export default function PlantArchiveTab({ plantId }: PlantArchiveTabProps) {
  return (
    <div className="pt-3">
      <PlantTentHistoryTab plantId={plantId} />
    </div>
  );
}

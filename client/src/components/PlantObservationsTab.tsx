import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Plus, FileText } from "lucide-react";
import { toast } from "sonner";

interface PlantObservationsTabProps {
  plantId: number;
}

export default function PlantObservationsTab({ plantId }: PlantObservationsTabProps) {
  const [newObservation, setNewObservation] = useState("");
  

  const { data: observations, refetch } = trpc.plantObservations.list.useQuery({ plantId });
  const createObservation = trpc.plantObservations.create.useMutation({
    onSuccess: () => {
      toast.success("Observação adicionada!");
      setNewObservation("");
      refetch();
    },
  });

  const handleSubmit = () => {
    if (!newObservation.trim()) return;
    createObservation.mutate({ plantId, content: newObservation });
  };

  return (
    <div className="space-y-6 pb-24">
      {/* Add New Observation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Nova Observação
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Digite sua observação sobre a planta..."
            value={newObservation}
            onChange={(e) => setNewObservation(e.target.value)}
            rows={4}
          />
          <Button onClick={handleSubmit} disabled={!newObservation.trim()}>
            Adicionar Observação
          </Button>
        </CardContent>
      </Card>

      {/* Observations List */}
      <div className="space-y-4">
        {observations && observations.length > 0 ? (
          observations.map((obs: any) => (
            <Card key={obs.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      {new Date(obs.observationDate).toLocaleString("pt-BR")}
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-foreground whitespace-pre-wrap">{obs.content}</p>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Nenhuma observação registrada ainda</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

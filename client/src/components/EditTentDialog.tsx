import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Tent {
  id: number;
  name: string;
  category: "MAINTENANCE" | "VEGA" | "FLORA" | "DRYING";
  width: number;
  depth: number;
  height: number;
  powerW: number | null;
  volume: string;
}

interface EditTentDialogProps {
  tent: Tent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function EditTentDialog({ tent, open, onOpenChange, onSuccess }: EditTentDialogProps) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<"MAINTENANCE" | "VEGA" | "FLORA" | "DRYING">("VEGA");
  const [width, setWidth] = useState("");
  const [depth, setDepth] = useState("");
  const [height, setHeight] = useState("");
  const [powerW, setPowerW] = useState("");

  const updateMutation = trpc.tents.update.useMutation({
    onSuccess: () => {
      toast.success("✅ Estufa atualizada com sucesso!");
      onSuccess();
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(`Erro ao atualizar estufa: ${error.message}`);
    },
  });

  // Pre-fill form when tent changes
  useEffect(() => {
    if (tent) {
      setName(tent.name);
      setCategory(tent.category);
      setWidth(tent.width.toString());
      setDepth(tent.depth.toString());
      setHeight(tent.height.toString());
      setPowerW(tent.powerW?.toString() || "");
    }
  }, [tent]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tent) return;

    // Validations
    const widthNum = parseInt(width);
    const depthNum = parseInt(depth);
    const heightNum = parseInt(height);
    const powerWNum = powerW ? parseInt(powerW) : undefined;

    if (!name.trim()) {
      toast.error("Nome da estufa é obrigatório");
      return;
    }

    if (isNaN(widthNum) || widthNum <= 0) {
      toast.error("Largura deve ser um número positivo");
      return;
    }

    if (isNaN(depthNum) || depthNum <= 0) {
      toast.error("Profundidade deve ser um número positivo");
      return;
    }

    if (isNaN(heightNum) || heightNum <= 0) {
      toast.error("Altura deve ser um número positivo");
      return;
    }

    if (powerW && (isNaN(powerWNum!) || powerWNum! <= 0)) {
      toast.error("Potência deve ser um número positivo");
      return;
    }

    updateMutation.mutate({
      id: tent.id,
      name: name.trim(),
      category,
      width: widthNum,
      depth: depthNum,
      height: heightNum,
      powerW: powerWNum,
    });
  };

  const getCategoryLabel = (cat: string) => {
    switch (cat) {
      case "MAINTENANCE":
        return "Manutenção";
      case "VEGA":
        return "Vegetação";
      case "FLORA":
        return "Floração";
      case "DRYING":
        return "Secagem";
      default:
        return cat;
    }
  };

  if (!tent) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Editar Estufa</DialogTitle>
          <DialogDescription>
            Atualize as informações da estufa. As dimensões serão usadas para calcular o volume automaticamente.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Nome da Estufa</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Estufa A"
                maxLength={50}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="category">Categoria</Label>
              <Select value={category} onValueChange={(value: any) => setCategory(value)}>
                <SelectTrigger id="category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MAINTENANCE">Manutenção</SelectItem>
                  <SelectItem value="VEGA">Vegetação</SelectItem>
                  <SelectItem value="FLORA">Floração</SelectItem>
                  <SelectItem value="DRYING">Secagem</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="width">Largura (cm)</Label>
                <Input
                  id="width"
                  type="text"
                  inputMode="numeric"
                  value={width}
                  onChange={(e) => setWidth(e.target.value)}
                  placeholder="120"
                  min="1"
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="depth">Profundidade (cm)</Label>
                <Input
                  id="depth"
                  type="text"
                  inputMode="numeric"
                  value={depth}
                  onChange={(e) => setDepth(e.target.value)}
                  placeholder="120"
                  min="1"
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="height">Altura (cm)</Label>
                <Input
                  id="height"
                  type="text"
                  inputMode="numeric"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  placeholder="200"
                  min="1"
                  required
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="powerW">Potência da Luz (W) - Opcional</Label>
              <Input
                id="powerW"
                type="text"
                inputMode="numeric"
                value={powerW}
                onChange={(e) => setPowerW(e.target.value)}
                placeholder="600"
                min="1"
              />
            </div>

            {width && depth && height && (
              <div className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
                <strong>Volume calculado:</strong> {((parseInt(width) * parseInt(depth) * parseInt(height)) / 1000).toFixed(3)} litros
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={updateMutation.isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar Alterações
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

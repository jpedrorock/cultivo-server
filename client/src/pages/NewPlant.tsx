import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AnimatedButton } from "@/components/AnimatedButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Sprout, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";
import { PageTransition } from "@/components/PageTransition";

export default function NewPlant() {
  const [, setLocation] = useLocation();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [strainId, setStrainId] = useState<number | undefined>();
  const [tentId, setTentId] = useState<number | undefined>();

  const [notes, setNotes] = useState("");

  const { data: strains, isLoading: loadingStrains } = trpc.strains.list.useQuery();
  const { data: tents, isLoading: loadingTents } = trpc.tents.list.useQuery();
  
  const createPlant = trpc.plants.create.useMutation({
    onSuccess: (data) => {
      toast.success("Planta criada com sucesso!");
      setLocation(`/plants/${data.id}`);
    },
    onError: (error) => {
      toast.error(`Erro ao criar planta: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }

    if (!strainId) {
      toast.error("Selecione uma strain");
      return;
    }

    if (!tentId) {
      toast.error("Selecione uma estufa");
      return;
    }

    createPlant.mutate({
      name: name.trim(),
      code: code.trim() || undefined,
      strainId,
      currentTentId: tentId,
      notes: notes.trim() || undefined,
    });
  };

  const isLoading = loadingStrains || loadingTents;

  return (
    <PageTransition>
        <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="container py-6">
          <div className="flex items-center gap-3">
            <Link href="/plants">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg">
              <Sprout className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">Nova Planta</h1>
              <p className="text-sm text-muted-foreground">Adicionar planta ao sistema</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container py-8">
        {isLoading ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Carregando...</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle>Informações da Planta</CardTitle>
              <CardDescription>
                Preencha os dados da nova planta. Campos marcados com * são obrigatórios.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Nome */}
                <div className="space-y-2">
                  <Label htmlFor="name">
                    Nome da Planta <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="name"
                    placeholder="Ex: Northern Lights #1"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>

                {/* Código */}
                <div className="space-y-2">
                  <Label htmlFor="code">Código (opcional)</Label>
                  <Input
                    id="code"
                    placeholder="Ex: NL-001"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Código de identificação único para rastreamento
                  </p>
                </div>

                {/* Strain */}
                <div className="space-y-2">
                  <Label htmlFor="strain">
                    Strain <span className="text-red-500">*</span>
                  </Label>
                  <select
                    id="strain"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={strainId || ""}
                    onChange={(e) => setStrainId(e.target.value ? Number(e.target.value) : undefined)}
                    required
                  >
                    <option value="">Selecione uma strain</option>
                    {strains?.map((strain) => (
                      <option key={strain.id} value={strain.id}>
                        {strain.name}
                      </option>
                    ))}
                  </select>
                  {strains && strains.length === 0 && (
                    <p className="text-xs text-yellow-600">
                      Nenhuma strain cadastrada. Cadastre uma strain primeiro.
                    </p>
                  )}
                </div>

                {/* Estufa Inicial */}
                <div className="space-y-2">
                  <Label htmlFor="tent">
                    Estufa Inicial <span className="text-red-500">*</span>
                  </Label>
                  <select
                    id="tent"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={tentId || ""}
                    onChange={(e) => setTentId(e.target.value ? Number(e.target.value) : undefined)}
                    required
                  >
                    <option value="">Selecione uma estufa</option>
                    {tents?.map((tent) => (
                      <option key={tent.id} value={tent.id}>
                        {tent.name}
                      </option>
                    ))}
                  </select>
                </div>



                {/* Notas */}
                <div className="space-y-2">
                  <Label htmlFor="notes">Notas (opcional)</Label>
                  <Textarea
                    id="notes"
                    placeholder="Observações iniciais sobre a planta..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={4}
                  />
                </div>

                {/* Botões */}
                <div className="flex gap-3 pt-4">
                  <AnimatedButton
                    type="submit"
                    disabled={createPlant.isPending}
                    className="flex-1"
                  >
                    {createPlant.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Criando...
                      </>
                    ) : (
                      <>
                        <Sprout className="w-4 h-4 mr-2" />
                        Criar Planta
                      </>
                    )}
                  </AnimatedButton>
                  <Link href="/plants">
                    <Button type="button" variant="outline">
                      Cancelar
                    </Button>
                  </Link>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
    </PageTransition>
  );
}

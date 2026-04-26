import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Cpu, Plus, Trash2, Copy, Check, Loader2, AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { PageTransition } from "@/components/PageTransition";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function Dispositivos() {
  const utils = trpc.useUtils();
  const { data: tokens = [], isLoading } = trpc.device.listTokens.useQuery();
  const { data: tents = [] } = trpc.tents.list.useQuery();

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTentId, setNewTentId] = useState<string>("");
  const [revealed, setRevealed] = useState<{
    token: string;
    tentId: number;
    tentName: string;
  } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);

  const serverUrl = typeof window !== "undefined" ? window.location.origin : "";

  const createToken = trpc.device.createToken.useMutation({
    onSuccess: ({ token }) => {
      const tentId = parseInt(newTentId, 10);
      if (isNaN(tentId)) return;
      const tent = tents.find((t) => t.id === tentId);
      setRevealed({
        token,
        tentId,
        tentName: tent?.name ?? `Estufa ${tentId}`,
      });
      setAddOpen(false);
      setNewName("");
      setNewTentId("");
      utils.device.listTokens.invalidate();
    },
    onError: (e) => toast.error(`Erro ao criar token: ${e.message}`),
  });

  const deleteToken = trpc.device.deleteToken.useMutation({
    onSuccess: () => {
      toast.success("Token removido");
      utils.device.listTokens.invalidate();
    },
    onError: (e) => toast.error(`Erro ao remover: ${e.message}`),
  });

  function handleCreate() {
    if (!newName.trim() || !newTentId) {
      toast.error("Informe o nome e a estufa");
      return;
    }
    createToken.mutate({ name: newName.trim(), tentId: parseInt(newTentId) });
  }

  async function copyValue(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      toast.success("Copiado!");
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("Falha ao copiar");
    }
  }

  return (
    <PageTransition>
      <div className="min-h-screen bg-background">
        <PageHeader backHref="/settings" title="Dispositivos ESP32" />

        <main className="container mx-auto px-4 py-6 pb-28 sm:pb-8 max-w-2xl space-y-6">
          <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Cpu className="w-4 h-4" />
              </div>
              <div className="text-sm text-muted-foreground">
                Tokens autorizam terminais ESP32 a ler e enviar dados de uma estufa específica
                via endpoints <code className="text-xs bg-muted px-1 rounded">/api/device/*</code>.
                Cada token fica vinculado a uma estufa.
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Server URL
                </p>
                <p className="text-sm font-mono truncate">{serverUrl}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyValue(serverUrl, "server")}
                className="gap-1 shrink-0"
              >
                {copied === "server" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied === "server" ? "Copiado" : "Copiar"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Cole este valor no campo <strong>Server URL</strong> do portal de setup do ESP32
              (rede WiFi <code className="text-xs bg-muted px-1 rounded">Cultivo-Setup-XXXX</code>).
            </p>
          </div>

          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Tokens ({tokens.length})
            </h2>
            <Button size="sm" onClick={() => setAddOpen(true)} disabled={tents.length === 0}>
              <Plus className="w-4 h-4 mr-1" /> Novo
            </Button>
          </div>

          {isLoading && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...
            </div>
          )}

          {!isLoading && tokens.length === 0 && (
            <div className="bg-card border border-border rounded-2xl p-8 text-center">
              <Cpu className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-4">
                Nenhum dispositivo cadastrado ainda.
              </p>
              <Button size="sm" onClick={() => setAddOpen(true)} disabled={tents.length === 0}>
                <Plus className="w-4 h-4 mr-1" /> Criar primeiro token
              </Button>
              {tents.length === 0 && (
                <p className="text-xs text-amber-600 mt-3 flex items-center justify-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Cadastre uma estufa antes.
                </p>
              )}
            </div>
          )}

          {!isLoading && tokens.length > 0 && (
            <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border">
              {tokens.map((t) => (
                <div key={t.id} className="flex items-center gap-3 px-4 py-3.5">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Cpu className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{t.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.tentName ?? `Estufa ${t.tentId}`}
                      <span className="ml-1 px-1.5 py-0.5 rounded bg-muted font-mono text-[10px]">
                        ID: {t.tentId}
                      </span>{" "}
                      · criado{" "}
                      {format(new Date(t.createdAt), "dd MMM yyyy", { locale: ptBR })}
                    </p>
                    <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
                      {t.token.slice(0, 12)}…{t.token.slice(-4)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setPendingDelete(t.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Dialog: criar token */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Novo dispositivo</DialogTitle>
            <DialogDescription>
              Gere um token para autorizar um ESP32 a ler dados de uma estufa.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="dev-name">Nome do dispositivo</Label>
              <Input
                id="dev-name"
                placeholder="ex: Terminal Estufa 1"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dev-tent">Estufa</Label>
              <Select value={newTentId} onValueChange={setNewTentId}>
                <SelectTrigger id="dev-tent">
                  <SelectValue placeholder="Selecione uma estufa" />
                </SelectTrigger>
                <SelectContent>
                  {tents.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={createToken.isPending}>
              {createToken.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Gerar token
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: revelar token recém-criado (só mostra uma vez) + guia de setup */}
      <Dialog open={!!revealed} onOpenChange={(o) => !o && setRevealed(null)}>
        <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Token gerado — configure seu ESP32</DialogTitle>
            <DialogDescription>
              O token completo só é exibido uma vez. Siga os passos abaixo pra parear o terminal.
            </DialogDescription>
          </DialogHeader>

          {revealed && (
            <div className="space-y-4 py-2">
              <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside">
                <li>Ligue o ESP32 — ele vai subir a rede <code className="text-xs bg-muted px-1 rounded">Cultivo-Setup-XXXX</code></li>
                <li>Conecte seu celular nessa rede</li>
                <li>Abra <code className="text-xs bg-muted px-1 rounded">http://192.168.4.1</code> no navegador</li>
                <li>Preencha os 3 valores abaixo + SSID/senha do seu WiFi</li>
              </ol>

              <div className="space-y-2.5">
                {[
                  { key: "server", label: "Server URL", value: serverUrl, mono: true },
                  { key: "token", label: "Device Token", value: revealed.token, mono: true, wrap: true },
                  { key: "tent", label: `Tent ID  (${revealed.tentName})`, value: String(revealed.tentId), mono: true },
                ].map((field) => (
                  <div key={field.key} className="border border-border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {field.label}
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1"
                        onClick={() => copyValue(field.value, field.key)}
                      >
                        {copied === field.key ? (
                          <Check className="w-3.5 h-3.5" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span className="text-xs">
                          {copied === field.key ? "Copiado" : "Copiar"}
                        </span>
                      </Button>
                    </div>
                    <p
                      className={`text-xs select-all ${field.mono ? "font-mono" : ""} ${
                        field.wrap ? "break-all" : "truncate"
                      }`}
                    >
                      {field.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setRevealed(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar exclusão */}
      <AlertDialog open={pendingDelete !== null} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover token?</AlertDialogTitle>
            <AlertDialogDescription>
              O dispositivo ESP32 com este token perderá acesso ao servidor imediatamente.
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingDelete !== null) deleteToken.mutate({ id: pendingDelete });
                setPendingDelete(null);
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageTransition>
  );
}

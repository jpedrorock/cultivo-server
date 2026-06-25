/**
 * DeleteAccountDialog — exclusão definitiva de conta (LGPD/GDPR/Apple 5.1.1)
 *
 * Fluxo:
 *  1. Mostra preview: "Vamos apagar X estufas, Y plantas, Z strains"
 *  2. User digita "EXCLUIR" pra confirmar (anti-tap)
 *  3. User digita a senha pra re-autenticar (anti-session-hijack)
 *  4. POST /api/auth/delete-account
 *  5. Apaga token local, navega pra /login
 *
 * Por que NÃO usar trpc.userManagement.deleteAccount?
 *  - O existente só remove o user da tabela users, não apaga estufas/plantas/etc
 *  - Não é compliant com Apple 5.1.1 (que exige delete COMPLETO de dados pessoais)
 *  - REST endpoint /api/auth/delete-account faz delete cascade correto via db-account-delete
 */

import { useState, useEffect } from "react";
import { Trash2, AlertTriangle, Loader2, Eye, EyeOff, Download } from "lucide-react";
import { toast } from "sonner";
import { useBackButton } from "@/lib/androidBackButton";
import { trpc } from "@/lib/trpc";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isNative, apiUrl } from "@/lib/platform";
import { haptics } from "@/lib/haptics";

interface DeletePreview {
  isLastInGroup: boolean;
  isGroupOwner: boolean;
  counts: { tents: number; plants: number; strains: number };
}

interface DeleteAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** User só usa senha se passwordHash existir (OAuth-only não precisa). */
  hasPassword: boolean;
  /** Callback após delete bem-sucedido. Geralmente faz logout + navigate. */
  onSuccess: () => Promise<void> | void;
}

export function DeleteAccountDialog({
  open,
  onOpenChange,
  hasPassword,
  onSuccess,
}: DeleteAccountDialogProps) {
  const [preview, setPreview] = useState<DeletePreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadingBackup, setDownloadingBackup] = useState(false);

  // Export de backup (reusa o backup.export já existente) — pra o usuário salvar
  // os dados antes de apagar tudo.
  const backupExport = trpc.backup.export.useQuery(undefined, { enabled: false });
  const downloadBackup = async () => {
    setDownloadingBackup(true);
    try {
      const result = await backupExport.refetch();
      if (!result.data) throw new Error("sem dados");
      const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `cultivo-backup-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("Backup baixado.");
    } catch (e: any) {
      toast.error(`Erro ao baixar backup: ${e?.message ?? e}`);
    } finally {
      setDownloadingBackup(false);
    }
  };

  // Android: back button fecha o dialog em vez de sair do app/voltar rota.
  // Intercepta ENQUANTO `open=true`. Quando dialog fecha (open=false),
  // handler é removido do stack automaticamente.
  useBackButton(open, () => {
    if (submitting) return true; // não permite voltar durante delete
    onOpenChange(false);
    return true;
  }, "delete-account-dialog");

  // Carrega preview ao abrir
  useEffect(() => {
    if (!open) {
      setPreview(null);
      setPassword("");
      setConfirmText("");
      setError(null);
      return;
    }
    setLoadingPreview(true);
    fetchPreview()
      .then((data) => setPreview(data))
      .catch(() => setPreview(null))
      .finally(() => setLoadingPreview(false));
  }, [open]);

  async function fetchPreview(): Promise<DeletePreview | null> {
    try {
      const { getToken } = await import("@/lib/authStorage");
      const headers: Record<string, string> = {};
      if (isNative()) {
        const token = await getToken();
        if (token) headers["Authorization"] = `Bearer ${token}`;
        headers["X-Client"] = "capacitor";
      }
      const res = await fetch(apiUrl("/api/auth/delete-preview"), {
        method: "GET",
        headers,
        credentials: isNative() ? "omit" : "include",
      });
      if (!res.ok) return null;
      const data = await res.json();
      return {
        isLastInGroup: data.isLastInGroup,
        isGroupOwner: data.isGroupOwner,
        counts: data.counts,
      };
    } catch {
      return null;
    }
  }

  const canSubmit =
    confirmText.trim().toUpperCase() === "EXCLUIR" && (!hasPassword || password.length > 0);

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setError(null);
    setSubmitting(true);
    await haptics.heavy();

    try {
      const { getToken, clearToken } = await import("@/lib/authStorage");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (isNative()) {
        const token = await getToken();
        if (token) headers["Authorization"] = `Bearer ${token}`;
        headers["X-Client"] = "capacitor";
      }

      const res = await fetch(apiUrl("/api/auth/delete-account"), {
        method: "POST",
        headers,
        credentials: isNative() ? "omit" : "include",
        body: JSON.stringify({
          password: hasPassword ? password : undefined,
          confirmText: confirmText.trim().toUpperCase(),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        await haptics.error();
        setError(data?.error ?? "Falha ao excluir conta.");
        setSubmitting(false);
        return;
      }

      // Sucesso — limpa estado local e dispara callback
      await clearToken();
      await haptics.success();
      toast.success("Conta excluída.");
      await onSuccess();
    } catch (err) {
      await haptics.error();
      setError("Erro de conexão. Tente novamente.");
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="w-12 h-12 rounded-2xl bg-destructive/10 ring-1 ring-destructive/20 flex items-center justify-center mb-3">
            <Trash2 className="w-6 h-6 text-destructive" />
          </div>
          <DialogTitle className="text-destructive">Excluir conta</DialogTitle>
          <DialogDescription>
            Esta ação é <strong>permanente</strong> e não pode ser desfeita. Seus dados
            serão removidos imediatamente do servidor.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2 space-y-4">
          {/* Preview de impacto */}
          {loadingPreview ? (
            <div className="flex items-center justify-center py-4 text-sm text-muted-foreground gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Carregando dados...
            </div>
          ) : preview ? (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 space-y-2">
              <p className="text-xs font-semibold text-destructive uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                O que será apagado
              </p>
              {preview.isLastInGroup ? (
                <ul className="text-sm text-foreground space-y-1 list-disc list-inside">
                  <li>
                    <strong>{preview.counts.tents}</strong> estufa
                    {preview.counts.tents !== 1 ? "s" : ""} e todos os logs/ciclos
                  </li>
                  <li>
                    <strong>{preview.counts.plants}</strong> planta
                    {preview.counts.plants !== 1 ? "s" : ""} (com fotos e histórico)
                  </li>
                  <li>
                    <strong>{preview.counts.strains}</strong> strain
                    {preview.counts.strains !== 1 ? "s" : ""} cadastrada
                    {preview.counts.strains !== 1 ? "s" : ""}
                  </li>
                  <li>Suas configurações, alertas, tarefas e presets</li>
                  <li>O grupo de cultivo inteiro (você é o último membro)</li>
                </ul>
              ) : (
                <ul className="text-sm text-foreground space-y-1 list-disc list-inside">
                  <li>Sua conta e dados pessoais</li>
                  <li>
                    O grupo de cultivo <strong>permanece</strong> ativo pros outros
                    membros
                  </li>
                  {preview.isGroupOwner && (
                    <li>A propriedade do grupo será transferida automaticamente</li>
                  )}
                </ul>
              )}
            </div>
          ) : null}

          {/* Salvar dados antes de apagar tudo (só quando é o último do grupo) */}
          {preview?.isLastInGroup && (
            <Button
              variant="outline"
              className="w-full"
              onClick={downloadBackup}
              disabled={downloadingBackup || submitting}
            >
              {downloadingBackup ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" />Gerando backup...</>
              ) : (
                <><Download className="w-4 h-4 mr-2" />Baixar backup antes de excluir</>
              )}
            </Button>
          )}

          {/* Confirm text */}
          <div>
            <label className="text-xs font-medium text-foreground block mb-1.5">
              Digite <strong className="text-destructive">EXCLUIR</strong> para confirmar
            </label>
            <Input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="EXCLUIR"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              className="font-mono"
              disabled={submitting}
            />
          </div>

          {/* Senha (só se tem passwordHash) */}
          {hasPassword && (
            <div>
              <label className="text-xs font-medium text-foreground block mb-1.5">
                Sua senha atual
              </label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  disabled={submitting}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "Esconder senha" : "Mostrar senha"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Excluindo...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4 mr-2" />
                Excluir definitivamente
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

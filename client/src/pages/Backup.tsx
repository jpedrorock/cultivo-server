import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, Download, Upload, Database, Shield, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function Backup() {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importConfirm, setImportConfirm] = useState(false);
  const [pendingFile, setPendingFile] = useState<any>(null);

  const exportBackup = trpc.backup.export.useQuery(undefined, {
    enabled: false,
  });

  const importBackup = trpc.backup.import.useMutation({
    onSuccess: () => {
      toast.success("Backup restaurado com sucesso!");
      // Recarregar a página para atualizar todos os dados
      setTimeout(() => window.location.reload(), 1500);
    },
    onError: (error) => {
      toast.error(`Erro ao importar backup: ${error.message}`);
      setIsImporting(false);
    },
  });

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const result = await exportBackup.refetch();
      if (result.data) {
        // Criar arquivo JSON para download
        const dataStr = JSON.stringify(result.data, null, 2);
        const dataBlob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(dataBlob);
        
        // Criar link de download
        const link = document.createElement("a");
        link.href = url;
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
        link.download = `app-cultivo-backup-${timestamp}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        toast.success("Backup exportado com sucesso!");
      }
    } catch (error: any) {
      toast.error(`Erro ao exportar backup: ${error.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      setIsImporting(true);
      try {
        const text = await file.text();
        const backupData = JSON.parse(text);
        
        // Validar estrutura básica
        if (!backupData.version || !backupData.data) {
          throw new Error("Arquivo de backup inválido");
        }
        
        // Guardar dados e abrir confirm dialog
        setPendingFile(backupData);
        setIsImporting(false);
        setImportConfirm(true);
        return;
      } catch (error: any) {
        toast.error(`Erro ao ler arquivo: ${error.message}`);
        setIsImporting(false);
      }
    };
    
    input.click();
  };

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Backup e Restauração</h1>
        <p className="text-muted-foreground">
          Faça backup dos seus dados ou restaure de um backup anterior
        </p>
      </div>

      {/* Aviso de Segurança */}
      <Card className="mb-6 border-amber-500/50 bg-amber-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-500">
            <Shield className="h-5 w-5" />
            Importante: Segurança dos Dados
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            • O backup contém <strong>todos os seus dados</strong>: estufas, plantas, ciclos, registros, strains, tarefas e receitas
          </p>
          <p>
            • Guarde os arquivos de backup em local seguro (nuvem, HD externo, etc.)
          </p>
          <p>
            • Recomendamos fazer backups regulares (semanalmente ou após mudanças importantes)
          </p>
          <p className="text-amber-600 dark:text-amber-500 font-semibold">
            ⚠️ Restaurar um backup irá SUBSTITUIR todos os dados atuais!
          </p>
        </CardContent>
      </Card>

      {/* Exportar Backup */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Exportar Backup
          </CardTitle>
          <CardDescription>
            Baixe um arquivo JSON com todos os seus dados atuais
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={handleExport}
            disabled={isExporting}
            className="w-full sm:w-auto"
          >
            {isExporting ? (
              <>
                <Database className="mr-2 h-4 w-4 animate-pulse" />
                Exportando...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Exportar Backup Agora
              </>
            )}
          </Button>
          <p className="text-sm text-muted-foreground mt-3">
            O arquivo será baixado automaticamente no formato JSON
          </p>
        </CardContent>
      </Card>

      {/* Importar Backup */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Importar Backup
          </CardTitle>
          <CardDescription>
            Restaure seus dados de um arquivo de backup anterior
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={handleImport}
            disabled={isImporting}
            variant="destructive"
            className="w-full sm:w-auto"
          >
            {isImporting ? (
              <>
                <Database className="mr-2 h-4 w-4 animate-pulse" />
                Importando...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Selecionar Arquivo de Backup
              </>
            )}
          </Button>
          <div className="flex items-start gap-2 mt-3 p-3 bg-destructive/10 rounded-md">
            <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
            <p className="text-sm text-destructive">
              <strong>Atenção:</strong> Esta ação irá substituir todos os dados atuais e não pode ser desfeita. 
              Recomendamos exportar um backup dos dados atuais antes de importar.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Import Confirm Dialog */}
      <Dialog open={importConfirm} onOpenChange={setImportConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Confirmar Importação de Backup
            </DialogTitle>
            <DialogDescription className="space-y-2">
              <span className="block font-semibold text-foreground">⚠️ ATENÇÃO: Esta ação é irreversível!</span>
              <span className="block">Importar este backup irá <strong>substituir todos os dados atuais</strong> do aplicativo — estufas, plantas, strains, tarefas, histórico e configurações.</span>
              <span className="block text-muted-foreground text-xs">Recomendamos exportar um backup dos dados atuais antes de continuar.</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => { setImportConfirm(false); setPendingFile(null); }}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!pendingFile) return;
                setImportConfirm(false);
                setIsImporting(true);
                try {
                  await importBackup.mutateAsync(pendingFile);
                } catch (e) {
                  // handled by onError
                }
                setPendingFile(null);
              }}
              disabled={importBackup.isPending}
            >
              {importBackup.isPending ? (
                <><Upload className="w-4 h-4 mr-2 animate-spin" />Importando...</>
              ) : (
                <><Upload className="w-4 h-4 mr-2" />Confirmar Importação</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { QrCode, Download } from "lucide-react";

interface PlantQrDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  plantId: number;
  plantName: string;
  plantCode?: string | null;
}

export default function PlantQrDialog({ open, onOpenChange, plantId, plantName, plantCode }: PlantQrDialogProps) {
  const qrUrl = `${window.location.origin}/scan/plant/${plantId}`;

  const handlePrint = () => {
    const win = window.open('', '_blank', 'width=400,height=500');
    if (!win) return;
    win.document.write(`
      <html><head><title>QR — ${plantName}</title>
      <style>body{margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;background:#fff}
      img{border:1px solid #eee;padding:12px;border-radius:12px}
      p{margin:6px 0;font-size:14px;color:#111}small{color:#999;font-size:11px}</style></head>
      <body>
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrUrl)}&bgcolor=ffffff&color=111111&margin=4" />
        <p><strong>${plantName}</strong></p>
        ${plantCode ? `<small>${plantCode}</small>` : ''}
        <script>window.onload=()=>{window.print();window.close()}</script>
      </body></html>
    `);
    win.document.close();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="w-4 h-4" />
            Etiqueta QR Code
          </DialogTitle>
          <DialogDescription>Escaneie para abrir {plantName} diretamente no app.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-2">
          <div className="rounded-2xl overflow-hidden border border-border p-3 bg-white">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrUrl)}&bgcolor=ffffff&color=111111&margin=4`}
              alt={`QR Code — ${plantName}`}
              width={180}
              height={180}
              className="block"
            />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-foreground">{plantName}</p>
            {plantCode && <p className="text-xs text-muted-foreground">{plantCode}</p>}
            <p className="text-[10px] text-muted-foreground/60 mt-1">/scan/plant/{plantId}</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="w-full gap-2" onClick={handlePrint}>
            <Download className="w-4 h-4" />
            Imprimir Etiqueta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

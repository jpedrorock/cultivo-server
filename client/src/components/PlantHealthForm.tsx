import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Loader2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { LazyImage } from "@/components/LazyImage";
import { PhotoPicker } from "@/components/PhotoPicker";
import { isNativeCameraAvailable } from "@/lib/nativeCamera";

export type HealthStatus = "healthy" | "attention" | "sick";

export interface PlantHealthRecord {
  status: string;
  symptoms: string;
  notes: string;
  photoUrl?: string;
  photoPreview?: string;
}

interface PlantHealthFormProps {
  /** Registro atual desta planta (parcial — pode ser undefined se ainda não tocou). */
  record: PlantHealthRecord | undefined;
  /** Atualiza um campo específico do registro. */
  onChange: (field: keyof PlantHealthRecord, value: string | undefined) => void;
  /** Handler do `<input type="file">` — sobe a foto (web/fallback). */
  onPhotoCapture: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Estado do upload em andamento (0–100). */
  uploadProgress: { isUploading: boolean; progress: number };
}

const STATUS_OPTIONS: Array<{
  value: HealthStatus;
  label: string;
  Icon: typeof CheckCircle2;
  /** Classes Tailwind quando o botão está selecionado */
  active: string;
}> = [
  {
    value: "healthy",
    label: "Saudável",
    Icon: CheckCircle2,
    active: "bg-green-500 text-white shadow-lg border-transparent",
  },
  {
    value: "attention",
    label: "Atenção",
    Icon: AlertTriangle,
    active: "bg-yellow-500 text-white shadow-lg border-transparent",
  },
  {
    value: "sick",
    label: "Doente",
    Icon: XCircle,
    active: "bg-red-500 text-white shadow-lg border-transparent",
  },
];

/**
 * Formulário de saúde de uma planta dentro do QuickLog: 3 status botões
 * grandes (Saudável/Atenção/Doente), upload de foto com preview, observações
 * gerais visíveis e sintomas colapsados num acordeão.
 *
 * 100% controlado: o pai mantém o `Map<plantId, record>` e passa o
 * registro atual + callback de update.
 */
export function PlantHealthForm({
  record,
  onChange,
  onPhotoCapture,
  uploadProgress,
}: PlantHealthFormProps) {
  const status = (record?.status || "healthy") as HealthStatus;
  const photo = record?.photoPreview || record?.photoUrl;

  return (
    <div className="space-y-4">
      {/* Status buttons */}
      <div className="flex flex-col gap-3">
        {STATUS_OPTIONS.map(({ value, label, Icon, active }) => {
          const selected = status === value;
          return (
            <button
              key={value}
              onClick={() => onChange("status", value)}
              className={`flex items-center gap-5 w-full px-6 rounded-2xl font-bold text-lg transition-all duration-300 border-2 min-h-[72px] ${
                selected
                  ? active
                  : "bg-card text-card-foreground border-border active:scale-[0.98]"
              }`}
            >
              <Icon className="w-7 h-7 shrink-0" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      {/* Foto — primeiro, destaque */}
      {photo ? (
        <div className="relative">
          <LazyImage
            src={photo}
            alt="Preview"
            aspectRatio="16/9"
            className="w-full h-48 rounded-xl"
          />
          {record?.photoUrl && (
            <div className="absolute top-2 left-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full">
              ✓ Enviada
            </div>
          )}
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              onChange("photoPreview", undefined);
              onChange("photoUrl", undefined);
            }}
            className="absolute top-2 right-2"
          >
            Remover
          </Button>
        </div>
      ) : uploadProgress.isUploading ? (
        <div className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-green-500 rounded-xl bg-green-500/10">
          <Loader2 className="h-8 w-8 text-green-500 animate-spin mb-2" />
          <span className="text-sm text-green-500 font-medium">Enviando foto...</span>
          <span className="text-xs text-green-500 mt-1">{uploadProgress.progress}%</span>
        </div>
      ) : isNativeCameraAvailable() ? (
        // Native: PhotoPicker abre action sheet (Câmera / Galeria)
        // Sintetiza um ChangeEvent fake pra reusar o mesmo onPhotoCapture
        // que o pai espera — minimiza mudança de API.
        <PhotoPicker
          onPick={(file) => {
            const dt = new DataTransfer();
            dt.items.add(file);
            const fakeEvent = {
              target: { files: dt.files, value: "" },
              currentTarget: { files: dt.files, value: "" },
            } as unknown as React.ChangeEvent<HTMLInputElement>;
            onPhotoCapture(fakeEvent);
          }}
        >
          <span className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-green-400 hover:bg-green-500/5 transition-colors">
            <Camera className="h-7 w-7 text-muted-foreground mb-1" />
            <span className="text-sm text-muted-foreground">Adicionar Foto</span>
          </span>
        </PhotoPicker>
      ) : (
        <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-green-400 hover:bg-green-500/5 transition-colors">
          <Camera className="h-7 w-7 text-muted-foreground mb-1" />
          <span className="text-sm text-muted-foreground">Adicionar Foto</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onPhotoCapture}
            className="hidden"
          />
        </label>
      )}

      {/* Observações — visível direto */}
      <Textarea
        value={record?.notes || ""}
        onChange={(e) => onChange("notes", e.target.value)}
        placeholder="Observações gerais..."
        className="min-h-[80px] border-2 border-input rounded-xl bg-card text-foreground shadow-sm"
      />

      {/* Sintomas — colapsado por padrão */}
      <Accordion type="multiple" defaultValue={[]} className="space-y-0">
        <AccordionItem value="symptoms" className="border border-border rounded-xl bg-card shadow-sm">
          <AccordionTrigger className="px-4 py-3 hover:no-underline">
            <span className="text-sm font-medium text-muted-foreground">Sintomas</span>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <Input
              value={record?.symptoms || ""}
              onChange={(e) => onChange("symptoms", e.target.value)}
              placeholder="Ex: Folhas amareladas, manchas..."
              className="h-12 border-2 border-input rounded-xl bg-card text-foreground shadow-sm"
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

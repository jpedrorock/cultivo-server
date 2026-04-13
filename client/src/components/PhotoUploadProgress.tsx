import React from "react";
import { Loader2, Check, RefreshCw, Settings2, CheckCircle2, Upload } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export type UploadStage = "converting" | "compressing" | "uploading" | "complete";

interface PhotoUploadProgressProps {
  stage: UploadStage;
  progress: number;
  originalSize?: string;
  compressedSize?: string;
  reduction?: number;
}

const stageLabels: Record<UploadStage, React.ReactNode> = {
  converting: <span className="flex items-center gap-1.5"><RefreshCw className="w-4 h-4"/>Convertendo HEIC para PNG</span>,
  compressing: <span className="flex items-center gap-1.5"><Settings2 className="w-4 h-4"/>Comprimindo imagem</span>,
  uploading: <span className="flex items-center gap-1.5"><Upload className="w-4 h-4"/>Enviando para servidor</span>,
  complete: <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-green-500"/>Upload concluído!</span>,
};

export function PhotoUploadProgress({
  stage,
  progress,
  originalSize,
  compressedSize,
  reduction,
}: PhotoUploadProgressProps) {
  const isComplete = stage === "complete";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90">
      <div className="bg-background border border-border rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          {isComplete ? (
            <div className="h-10 w-10 rounded-full bg-green-500 flex items-center justify-center">
              <Check className="h-6 w-6 text-white" />
            </div>
          ) : (
            <Loader2 className="h-10 w-10 text-green-500 animate-spin" />
          )}
          <div className="flex-1">
            <h3 className="font-semibold text-lg">{stageLabels[stage]}</h3>
            <p className="text-sm text-muted-foreground">{progress}% concluído</p>
          </div>
        </div>

        {/* Progress Bar */}
        <Progress value={progress} className="h-2 mb-4" />

        {/* File Size Info */}
        {originalSize && compressedSize && reduction !== undefined && (
          <div className="bg-muted rounded-lg p-3 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tamanho original:</span>
              <span className="font-medium">{originalSize}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tamanho comprimido:</span>
              <span className="font-medium text-green-600">{compressedSize}</span>
            </div>
            <div className="flex justify-between text-sm pt-2 border-t border-border">
              <span className="text-muted-foreground">Redução:</span>
              <span className="font-semibold text-green-600">-{reduction}%</span>
            </div>
          </div>
        )}

        {/* Stage Indicators */}
        <div className="flex justify-between mt-4 text-xs">
          <div className={`flex items-center gap-1 ${stage === "converting" || stage === "compressing" || stage === "uploading" || stage === "complete" ? "text-green-600" : "text-muted-foreground"}`}>
            {(stage === "compressing" || stage === "uploading" || stage === "complete") ? (
              <Check className="h-3 w-3" />
            ) : (
              <div className="h-3 w-3 rounded-full border-2 border-current" />
            )}
            <span>Converter</span>
          </div>
          <div className={`flex items-center gap-1 ${stage === "compressing" || stage === "uploading" || stage === "complete" ? "text-green-600" : "text-muted-foreground"}`}>
            {(stage === "uploading" || stage === "complete") ? (
              <Check className="h-3 w-3" />
            ) : (
              <div className="h-3 w-3 rounded-full border-2 border-current" />
            )}
            <span>Comprimir</span>
          </div>
          <div className={`flex items-center gap-1 ${stage === "uploading" || stage === "complete" ? "text-green-600" : "text-muted-foreground"}`}>
            {stage === "complete" ? (
              <Check className="h-3 w-3" />
            ) : (
              <div className="h-3 w-3 rounded-full border-2 border-current" />
            )}
            <span>Enviar</span>
          </div>
        </div>
      </div>
    </div>
  );
}

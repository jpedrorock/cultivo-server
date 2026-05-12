import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface UploadProgressProps {
  status: "idle" | "processing" | "uploading" | "success" | "error";
  progress?: number;
  message?: string;
}

export default function UploadProgress({
  status,
  progress: _progress = 0,
  message,
}: UploadProgressProps) {
  const [displayProgress, setDisplayProgress] = useState(0);

  // Smooth progress animation
  useEffect(() => {
    if (status === "processing") {
      // Simulate progress for image processing (0-50%)
      const interval = setInterval(() => {
        setDisplayProgress((prev) => {
          if (prev >= 50) return 50;
          return prev + 5;
        });
      }, 100);
      return () => clearInterval(interval);
    } else if (status === "uploading") {
      // Simulate progress for uploading (50-90%)
      const interval = setInterval(() => {
        setDisplayProgress((prev) => {
          if (prev >= 90) return 90;
          return prev + 5;
        });
      }, 100);
      return () => clearInterval(interval);
    } else if (status === "success") {
      // Complete to 100%
      setDisplayProgress(100);
    } else if (status === "idle") {
      setDisplayProgress(0);
    }
  }, [status]);

  if (status === "idle") return null;

  return (
    <div className="w-full space-y-2 p-4 bg-card border rounded-lg">
      {/* Status Icon and Message */}
      <div className="flex items-center gap-2">
        {status === "processing" && (
          <>
            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
            <span className="text-sm font-medium text-blue-700 dark:text-blue-400">
              {message || "Processando imagem..."}
            </span>
          </>
        )}
        {status === "uploading" && (
          <>
            <Loader2 className="h-4 w-4 animate-spin text-purple-500" />
            <span className="text-sm font-medium text-purple-700 dark:text-purple-400">
              {message || "Enviando para CDN..."}
            </span>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span className="text-sm font-medium text-green-700 dark:text-green-400">
              {message || "Upload concluído!"}
            </span>
          </>
        )}
        {status === "error" && (
          <>
            <AlertCircle className="h-4 w-4 text-red-500" />
            <span className="text-sm font-medium text-red-700 dark:text-red-400">
              {message || "Erro no upload"}
            </span>
          </>
        )}
      </div>

      {/* Progress Bar */}
      {(status === "processing" || status === "uploading" || status === "success") && (
        <div className="space-y-1">
          <Progress value={displayProgress} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{displayProgress}%</span>
            <span>
              {status === "processing" && "Otimizando..."}
              {status === "uploading" && "Enviando..."}
              {status === "success" && "Completo"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

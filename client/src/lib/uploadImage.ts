/**
 * uploadImage — utilitário de upload de imagem robusto
 *
 * Envia o arquivo BRUTO via multipart/form-data para POST /api/upload/image.
 * O servidor (sharp) cuida de converter HEIC, corrigir orientação EXIF e comprimir.
 * Funciona em Safari iOS com fotos da câmera, HEIC, JPEG, PNG, etc.
 *
 * @param file - Arquivo de imagem (qualquer formato, incluindo HEIC)
 * @param onProgress - Callback opcional com progresso 0-100
 * @returns URL pública da imagem no S3
 */
export async function uploadImage(
  file: File,
  onProgress?: (pct: number) => void
): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          if (data.url) {
            resolve(data.url);
          } else {
            reject(new Error(data.error || "Resposta inválida do servidor."));
          }
        } catch {
          reject(new Error("Erro ao processar resposta do servidor."));
        }
      } else {
        let errorMsg = "Erro ao enviar imagem.";
        try {
          const data = JSON.parse(xhr.responseText);
          errorMsg = data.error || errorMsg;
        } catch {
          // ignore
        }
        reject(new Error(errorMsg));
      }
    });

    xhr.addEventListener("error", () => {
      reject(new Error("Falha na conexão ao enviar imagem. Verifique sua internet."));
    });

    xhr.addEventListener("timeout", () => {
      reject(new Error("Tempo limite excedido ao enviar imagem."));
    });

    xhr.timeout = 60000; // 60 segundos
    xhr.open("POST", "/api/upload/image");
    xhr.send(formData);
  });
}

/**
 * uploadImage — upload robusto de imagem para o servidor
 *
 * Fluxo:
 * 1. Recebe o File bruto (qualquer formato, incluindo HEIC do iPhone)
 * 2. Converte para JPEG via canvas no browser (resolve HEIC + orientação EXIF)
 * 3. Envia o JPEG comprimido via multipart/form-data para POST /api/upload/image
 * 4. O servidor salva no S3 e retorna a URL pública
 *
 * Funciona em Safari iOS com fotos da câmera, HEIC, JPEG, PNG, etc.
 */

/**
 * Converte um File de imagem para um Blob JPEG comprimido via canvas.
 * Resolve problemas de HEIC e orientação EXIF no Safari iOS.
 */
async function convertToJpeg(file: File, maxDimension = 1920, quality = 0.82): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      // Calcular dimensões mantendo proporção
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas não disponível."));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Falha ao converter imagem para JPEG."));
          }
        },
        "image/jpeg",
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      // Se o canvas não conseguiu carregar (ex: HEIC não suportado pelo browser),
      // retorna o arquivo original sem processar
      file.arrayBuffer().then((buf) => {
        resolve(new Blob([buf], { type: file.type || "image/jpeg" }));
      }).catch(reject);
    };

    img.src = objectUrl;
  });
}

/**
 * Faz upload de uma imagem para o servidor via multipart/form-data.
 * Converte automaticamente para JPEG antes de enviar.
 *
 * @param file - Arquivo de imagem (qualquer formato, incluindo HEIC)
 * @param onProgress - Callback opcional com progresso 0-100
 * @returns URL pública da imagem no S3
 */
export async function uploadImage(
  file: File,
  onProgress?: (pct: number) => void
): Promise<string> {
  // Passo 1: Converter para JPEG via canvas (resolve HEIC + orientação EXIF)
  let uploadBlob: Blob;
  let uploadName: string;

  try {
    uploadBlob = await convertToJpeg(file);
    uploadName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  } catch {
    // Fallback: enviar o arquivo original sem processar
    uploadBlob = file;
    uploadName = file.name;
  }

  // Passo 2: Enviar via XHR com progresso
  const formData = new FormData();
  formData.append("file", uploadBlob, uploadName);

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
        let errorMsg = `Erro ao enviar imagem (${xhr.status}).`;
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

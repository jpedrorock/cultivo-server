/**
 * Geração de imagens via OpenAI DALL-E
 *
 * Substitui o serviço proprietário do Manus por uma API padrão.
 * Requer OPENAI_API_KEY no .env para funcionar.
 *
 * Exemplo de uso:
 *   const { url } = await generateImage({ prompt: "Uma planta saudável" });
 */
import { storagePut } from '../storageLocal';
import { ENV } from './env';

export type GenerateImageOptions = {
  prompt: string;
  originalImages?: Array<{
    url?: string;
    b64Json?: string;
    mimeType?: string;
  }>;
};

export type GenerateImageResponse = {
  url?: string;
};

export async function generateImage(
  options: GenerateImageOptions
): Promise<GenerateImageResponse> {
  if (!ENV.openaiApiKey) {
    throw new Error(
      'OPENAI_API_KEY não configurado. Configure no .env para usar geração de imagens.'
    );
  }

  const response = await fetch(`${ENV.openaiBaseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ENV.openaiApiKey}`,
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt: options.prompt,
      n: 1,
      size: '1024x1024',
      response_format: 'b64_json',
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `Geração de imagem falhou (${response.status} ${response.statusText})${detail ? `: ${detail}` : ''}`
    );
  }

  const result = (await response.json()) as {
    data: Array<{ b64_json: string }>;
  };

  const base64Data = result.data[0]?.b64_json;
  if (!base64Data) {
    throw new Error('Resposta da API não contém imagem');
  }

  const buffer = Buffer.from(base64Data, 'base64');

  const { url } = await storagePut(
    `generated/${Date.now()}.png`,
    buffer,
    'image/png'
  );

  return { url };
}

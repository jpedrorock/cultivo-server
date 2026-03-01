/**
 * Data API — Versão Servidor Independente
 *
 * Esta função era usada para chamar APIs externas via proxy do Manus.
 * Na versão servidor independente, você pode chamar APIs externas diretamente
 * usando fetch() com suas próprias chaves de API.
 *
 * Exemplo:
 *   const response = await fetch('https://api.exemplo.com/endpoint', {
 *     headers: { 'Authorization': `Bearer ${process.env.MINHA_API_KEY}` }
 *   });
 */

export type DataApiCallOptions = {
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  pathParams?: Record<string, unknown>;
  formData?: Record<string, unknown>;
};

/**
 * Stub para compatibilidade — não usado na versão servidor independente.
 * Substitua por chamadas fetch() diretas às APIs que precisar.
 */
export async function callDataApi(
  apiId: string,
  _options: DataApiCallOptions = {}
): Promise<unknown> {
  throw new Error(
    `callDataApi("${apiId}") não está disponível na versão servidor independente. ` +
    'Use fetch() diretamente com suas próprias chaves de API.'
  );
}

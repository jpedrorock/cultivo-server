/**
 * Variáveis de Ambiente — App Cultivo (Versão Servidor Independente)
 *
 * Não há dependências do Manus. Todas as configurações são via .env local.
 */

export const ENV = {
  // Aplicação
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  domain: process.env.DOMAIN ?? 'localhost:3000',

  // Banco de Dados
  databaseUrl: process.env.DATABASE_URL ?? '',

  // Autenticação JWT
  jwtSecret: process.env.JWT_SECRET ?? 'cultivo-secret-change-in-production-32chars',

  // LLM (OpenAI ou compatível — opcional, para funcionalidades de IA)
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  openaiBaseUrl: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
  llmModel: process.env.LLM_MODEL ?? 'gpt-4o-mini',

  // Armazenamento Local (pasta /uploads no servidor)
  // Não precisa de configuração adicional — usa o sistema de arquivos do servidor

  // Helpers
  isProduction: process.env.NODE_ENV === 'production',
  isDevelopment: process.env.NODE_ENV !== 'production',

  // Compatibilidade com código legado (não usados na versão servidor)
  forgeApiUrl: process.env.OPENAI_BASE_URL ?? '',
  forgeApiKey: process.env.OPENAI_API_KEY ?? '',
};

// Validar variáveis obrigatórias
if (!ENV.databaseUrl) {
  console.error('[ENV] DATABASE_URL é obrigatório. Configure no arquivo .env');
  process.exit(1);
}

if (!ENV.jwtSecret || ENV.jwtSecret.length < 32) {
  if (ENV.isProduction) {
    console.error('[ENV] JWT_SECRET deve ter pelo menos 32 caracteres em produção');
    process.exit(1);
  } else {
    console.warn('[ENV] JWT_SECRET curto — use uma chave mais longa em produção');
  }
}

if (!ENV.openaiApiKey && ENV.isProduction) {
  console.warn('[ENV] OPENAI_API_KEY não configurado — funcionalidades de IA estarão desabilitadas');
}

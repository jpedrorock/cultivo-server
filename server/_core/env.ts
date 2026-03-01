/**
 * Variáveis de Ambiente — App Cultivo (Versão Servidor Independente)
 *
 * Dependências externas removidas:
 * - Sem Manus OAuth / SDK
 * - Sem S3 / MinIO
 * - Sem LLM / IA / OpenAI
 *
 * O app usa apenas: banco de dados (SQLite ou MySQL) + JWT + disco local para fotos.
 */

export const ENV = {
  // Aplicação
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  domain: process.env.DOMAIN ?? 'localhost:3000',

  // Banco de Dados (SQLite local ou MySQL em produção)
  // SQLite: não precisa configurar — usa ./local.db automaticamente
  // MySQL: DATABASE_URL=mysql://user:senha@host:3306/cultivo
  databaseUrl: process.env.DATABASE_URL ?? '',

  // Autenticação JWT
  // Gere um segredo seguro: openssl rand -base64 32
  jwtSecret: process.env.JWT_SECRET ?? 'cultivo-secret-change-in-production-32chars',

  // Helpers
  isProduction: process.env.NODE_ENV === 'production',
  isDevelopment: process.env.NODE_ENV !== 'production',
};

// Validar variáveis obrigatórias em produção
if (ENV.isProduction) {
  if (!ENV.databaseUrl) {
    console.error('[ENV] DATABASE_URL é obrigatório em produção. Configure no arquivo .env');
    process.exit(1);
  }

  if (!ENV.jwtSecret || ENV.jwtSecret === 'cultivo-secret-change-in-production-32chars') {
    console.error('[ENV] JWT_SECRET deve ser alterado para um valor seguro em produção');
    process.exit(1);
  }
}

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
  domain: (process.env.DOMAIN ?? '').trim() || 'localhost:3000',

  // Banco de Dados (SQLite local ou MySQL em produção)
  // SQLite: não precisa configurar — usa ./local.db automaticamente
  // MySQL: DATABASE_URL=mysql://user:senha@host:3306/cultivo
  databaseUrl: process.env.DATABASE_URL ?? '',

  // Autenticação JWT
  // Gere um segredo seguro: openssl rand -base64 32
  jwtSecret: process.env.JWT_SECRET ?? 'cultivo-secret-change-in-production-32chars',

  // Google OAuth 2.0
  // Configure em https://console.cloud.google.com → APIs & Services → Credentials
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',

  // Sign in with Apple — OBRIGATÓRIO pra publicar na App Store enquanto existir
  // Google OAuth (Guideline 4.8). Configurar quando comprar Apple Developer ($99/ano).
  //
  // APPLE_CLIENT_ID: Service ID que você criar no Apple Developer
  //   - Tipicamente: cloud.evapro.cultivo.signin (Service ID, NÃO o bundle ID do app)
  //   - O bundle ID do app iOS também pode ser usado como audience pra fluxo NATIVO
  //
  // APPLE_TEAM_ID: 10 chars que aparece no canto superior direito da conta dev
  // APPLE_KEY_ID: 10 chars do .p8 gerado em "Keys"
  // APPLE_PRIVATE_KEY: conteúdo completo do .p8 (incluindo BEGIN/END PRIVATE KEY)
  //   - No .env coloca em uma linha só substituindo quebras de linha por \n literal
  //   - Ex: APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIGTAg...\n-----END PRIVATE KEY-----"
  //
  // O private key só é necessário pra revogar tokens via /auth/revoke (Guideline 5.1.1)
  // — pro fluxo de login básico, só APPLE_CLIENT_ID basta.
  appleClientId: process.env.APPLE_CLIENT_ID ?? '',
  appleTeamId: process.env.APPLE_TEAM_ID ?? '',
  appleKeyId: process.env.APPLE_KEY_ID ?? '',
  applePrivateKey: (process.env.APPLE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),

  // Chave de criptografia para API keys dos usuários (AES-256-GCM)
  // Gere com: openssl rand -base64 32
  encryptionKey: process.env.ENCRYPTION_KEY ?? '',

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

  if (!ENV.encryptionKey) {
    console.warn('[ENV] AVISO: ENCRYPTION_KEY não configurado — usando JWT_SECRET como fallback para criptografia.');
    console.warn('[ENV] Para máxima segurança, adicione ENCRYPTION_KEY=<openssl rand -base64 32> nas variáveis de ambiente.');
  }
}

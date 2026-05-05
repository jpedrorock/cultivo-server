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
  jwtSecret: process.env.JWT_SECRET ?? '',

  // Google OAuth 2.0
  // Configure em https://console.cloud.google.com → APIs & Services → Credentials
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',

  // Chave de criptografia para API keys dos usuários (AES-256-GCM)
  // Gere com: openssl rand -base64 32
  encryptionKey: process.env.ENCRYPTION_KEY ?? '',

  // Helpers
  isProduction: process.env.NODE_ENV === 'production',
  isDevelopment: process.env.NODE_ENV !== 'production',
};

// Strings de exemplo conhecidas que NÃO devem ser usadas como secret real.
// Mesmo em dev, aceitar essas strings é perigoso porque:
//  - quem clona o repo pré-conhece o secret
//  - JWTs forjados em dev podem ser tentados em prod (se DBs forem migrados)
//  - aiCrypto deriva chave do JWT_SECRET → API keys de dev expostas
const KNOWN_INSECURE_SECRETS = new Set([
  'cultivo-secret-change-in-production-32chars',
  'seu-segredo-super-secreto-minimo-32-caracteres',
  'change-me',
  'changeme',
]);

// Validar variáveis obrigatórias em produção
if (ENV.isProduction) {
  if (!ENV.databaseUrl) {
    console.error('[ENV] DATABASE_URL é obrigatório em produção. Configure no arquivo .env');
    process.exit(1);
  }

  if (!ENV.jwtSecret || KNOWN_INSECURE_SECRETS.has(ENV.jwtSecret) || ENV.jwtSecret.length < 32) {
    console.error('[ENV] JWT_SECRET ausente, fraco ou usando valor de exemplo. Gere com: openssl rand -base64 32');
    process.exit(1);
  }

  if (!ENV.encryptionKey) {
    console.warn('[ENV] AVISO: ENCRYPTION_KEY não configurado — usando JWT_SECRET como fallback para criptografia.');
    console.warn('[ENV] Para máxima segurança, adicione ENCRYPTION_KEY=<openssl rand -base64 32> nas variáveis de ambiente.');
  }
}

// Em dev: bloqueia secrets conhecidos. Se o usuário não setou nada, derivamos
// um secret estável a partir do hostname da máquina + um marcador. Isso evita
// que qualquer dev rodando o repo compartilhe o mesmo JWT_SECRET (que seria
// pré-conhecido por todo mundo que clonasse o projeto).
if (ENV.isDevelopment) {
  if (ENV.jwtSecret && KNOWN_INSECURE_SECRETS.has(ENV.jwtSecret)) {
    console.error('[ENV] JWT_SECRET está usando um valor de exemplo público. Gere um próprio com: openssl rand -base64 32');
    process.exit(1);
  }

  if (!ENV.jwtSecret) {
    // Deriva secret estável local — não compartilhado entre máquinas
    const os = require('os');
    const crypto = require('crypto');
    const seed = `${os.hostname()}|${os.userInfo().username}|cultivo-dev-jwt`;
    ENV.jwtSecret = crypto.createHash('sha256').update(seed).digest('base64');
    console.warn('[ENV] JWT_SECRET não configurado — usando secret derivado de hostname (apenas para dev).');
    console.warn('[ENV] Para CI ou múltiplas máquinas, configure JWT_SECRET=<openssl rand -base64 32>');
  }
}

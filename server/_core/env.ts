export const ENV = {
  // Aplicação
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  domain: process.env.DOMAIN ?? 'localhost:3000',

  // Banco de Dados
  databaseUrl: process.env.DATABASE_URL ?? 'mysql://user:password@localhost:3306/cultivo',

  // Autenticação JWT
  jwtSecret: process.env.JWT_SECRET ?? 'seu-segredo-super-secreto-minimo-32-caracteres',

  // S3 / MinIO
  s3Endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
  s3Bucket: process.env.S3_BUCKET ?? 'cultivo-fotos',
  s3AccessKey: process.env.S3_ACCESS_KEY ?? 'minioadmin',
  s3SecretKey: process.env.S3_SECRET_KEY ?? 'minioadmin',
  s3Region: process.env.S3_REGION ?? 'us-east-1',

  // Validações
  isProduction: process.env.NODE_ENV === 'production',
  isDevelopment: process.env.NODE_ENV === 'development',
};

// Validar variáveis obrigatórias
if (!ENV.databaseUrl) {
  console.error('[ENV] DATABASE_URL is required');
  process.exit(1);
}

if (!ENV.jwtSecret || ENV.jwtSecret.length < 32) {
  console.warn('[ENV] JWT_SECRET should be at least 32 characters long');
  if (ENV.isProduction) {
    console.error('[ENV] JWT_SECRET must be set in production');
    process.exit(1);
  }
}

if (!ENV.s3Endpoint || !ENV.s3AccessKey || !ENV.s3SecretKey) {
  console.warn('[ENV] S3/MinIO configuration is incomplete');
}

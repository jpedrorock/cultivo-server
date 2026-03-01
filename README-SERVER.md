# App Cultivo - Versão Servidor Independente

Esta é a versão refatorada do App Cultivo que funciona em qualquer servidor comum, sem dependências da plataforma Manus.

## Principais Mudanças

### 1. Autenticação
- **Antes**: Manus OAuth (dependência externa)
- **Agora**: JWT nativo com email/senha (open-source)
- Endpoints: `/api/auth/register`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`

### 2. Armazenamento de Arquivos
- **Antes**: S3 gerenciado pelo Manus
- **Agora**: MinIO (S3-compatible, self-hosted)
- Pode ser deployado no mesmo servidor da aplicação

### 3. Hospedagem
- **Antes**: Plataforma Manus
- **Agora**: Docker + Docker Compose + VPS comum

## Pré-requisitos

- Docker e Docker Compose instalados
- Node.js 22+ (para desenvolvimento local sem Docker)
- MySQL 8+ (ou use o container Docker)

## Instalação Rápida com Docker

### 1. Clone o repositório
```bash
git clone https://github.com/seu-usuario/cultivo-server.git
cd cultivo-server
```

### 2. Configure as variáveis de ambiente
```bash
cp .env.example .env
```

Edite o arquivo `.env` se necessário. Os valores padrão funcionam para desenvolvimento local.

### 3. Inicie os containers
```bash
docker-compose up -d
```

Isso iniciará:
- **Aplicação**: http://localhost:3000
- **MinIO Console**: http://localhost:9001 (usuário: minioadmin, senha: minioadmin)
- **MySQL**: localhost:3306

### 4. Crie o bucket no MinIO
1. Acesse http://localhost:9001
2. Faça login com `minioadmin` / `minioadmin`
3. Clique em "Create Bucket"
4. Digite o nome: `cultivo-fotos`
5. Clique em "Create"

### 5. Inicialize o banco de dados
```bash
docker-compose exec app npm run db:push
```

### 6. Acesse a aplicação
Abra http://localhost:3000 no seu navegador

## Primeiro Acesso

1. Clique em "Registrar" ou "Sign Up"
2. Digite um email e senha (mínimo 6 caracteres)
3. Você será automaticamente logado
4. Comece a usar o app!

## Instalação Local (sem Docker)

Se preferir rodar localmente sem Docker:

### 1. Instale as dependências
```bash
npm install
```

### 2. Configure o banco de dados
Crie um banco MySQL chamado `cultivo` e configure a variável `DATABASE_URL` no `.env`:
```
DATABASE_URL=mysql://user:password@localhost:3306/cultivo
```

### 3. Execute as migrações
```bash
npm run db:push
```

### 4. Inicie a aplicação
```bash
npm run dev
```

## Deployment em Produção

### Opção 1: VPS com Docker (Recomendado)

#### Passo 1: Provisionar VPS
- Escolha um provedor: DigitalOcean, Linode, Vultr, AWS, Azure, etc.
- Crie uma VM com Ubuntu 22.04 LTS
- SSH para a VM

#### Passo 2: Instalar Docker
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
```

#### Passo 3: Clonar o repositório
```bash
git clone https://github.com/seu-usuario/cultivo-server.git
cd cultivo-server
```

#### Passo 4: Configurar variáveis de ambiente
```bash
cp .env.example .env
```

Edite o `.env` com valores de produção:
```bash
# Banco de Dados
DATABASE_URL=mysql://cultivo_user:senha_segura@db:3306/cultivo

# Autenticação JWT
JWT_SECRET=gere-um-segredo-aleatorio-com-32-caracteres

# S3 / MinIO
S3_ENDPOINT=https://s3.seu-dominio.com
S3_BUCKET=cultivo-fotos
S3_ACCESS_KEY=sua-chave-acesso
S3_SECRET_KEY=sua-chave-secreta

# Aplicação
NODE_ENV=production
PORT=3000
DOMAIN=cultivo.seu-dominio.com
```

#### Passo 5: Iniciar com Docker Compose
```bash
docker-compose up -d
```

#### Passo 6: Configurar Nginx como Reverse Proxy
Crie `/etc/nginx/sites-available/cultivo`:
```nginx
server {
    listen 80;
    server_name cultivo.seu-dominio.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Habilite o site:
```bash
sudo ln -s /etc/nginx/sites-available/cultivo /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

#### Passo 7: Configurar SSL com Let's Encrypt
```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d cultivo.seu-dominio.com
```

### Opção 2: Railway ou Render (Mais Simples)

#### Railway
1. Faça push para o GitHub
2. Acesse https://railway.app
3. Clique em "New Project" → "Deploy from GitHub"
4. Selecione o repositório
5. Configure as variáveis de ambiente
6. Deploy automático!

#### Render
1. Faça push para o GitHub
2. Acesse https://render.com
3. Clique em "New +" → "Web Service"
4. Conecte seu GitHub
5. Configure as variáveis de ambiente
6. Deploy!

## Variáveis de Ambiente

| Variável | Descrição | Exemplo |
| --- | --- | --- |
| `DATABASE_URL` | String de conexão MySQL | `mysql://user:pass@host:3306/cultivo` |
| `JWT_SECRET` | Segredo para assinar tokens JWT | `seu-segredo-aleatorio-32-chars` |
| `S3_ENDPOINT` | Endpoint do MinIO | `http://localhost:9000` ou `https://s3.seu-dominio.com` |
| `S3_BUCKET` | Nome do bucket | `cultivo-fotos` |
| `S3_ACCESS_KEY` | Chave de acesso S3 | `minioadmin` |
| `S3_SECRET_KEY` | Chave secreta S3 | `minioadmin` |
| `S3_REGION` | Região S3 | `us-east-1` |
| `NODE_ENV` | Ambiente | `development` ou `production` |
| `PORT` | Porta da aplicação | `3000` |
| `DOMAIN` | Domínio da aplicação | `localhost:3000` ou `cultivo.seu-dominio.com` |

## Estrutura do Projeto

```
cultivo-server/
├── client/                 # Frontend React
│   ├── src/
│   │   ├── components/    # Componentes React
│   │   ├── pages/         # Páginas
│   │   └── App.tsx        # Componente raiz
├── server/                 # Backend Express
│   ├── _core/
│   │   ├── auth.ts        # Funções de autenticação JWT
│   │   ├── authRoutes.ts  # Rotas de autenticação
│   │   ├── storage.ts     # Integração com MinIO
│   │   ├── env.ts         # Variáveis de ambiente
│   │   └── index.ts       # Entrada do servidor
│   ├── db.ts              # Funções de banco de dados
│   ├── db-auth.ts         # Funções de autenticação no BD
│   └── routers/           # Rotas tRPC
├── drizzle/               # Schema do banco de dados
├── migrations/            # Migrações SQL
├── docker-compose.yml     # Configuração Docker
├── Dockerfile             # Build da aplicação
├── package.json           # Dependências
└── .env.example           # Variáveis de exemplo
```

## Troubleshooting

### Erro: "Cannot connect to database"
- Verifique se o container MySQL está rodando: `docker-compose ps`
- Verifique a variável `DATABASE_URL`
- Aguarde alguns segundos para o MySQL iniciar completamente

### Erro: "MinIO bucket not found"
- Acesse http://localhost:9001
- Crie o bucket `cultivo-fotos` manualmente
- Ou execute: `docker-compose exec minio mc mb minio/cultivo-fotos`

### Erro: "JWT_SECRET is not set"
- Configure a variável `JWT_SECRET` no `.env`
- Deve ter no mínimo 32 caracteres

### Aplicação lenta
- Verifique o uso de CPU/memória: `docker stats`
- Aumente os recursos do container se necessário
- Otimize as queries do banco de dados

## Desenvolvimento

### Scripts disponíveis
```bash
npm run dev          # Inicia servidor de desenvolvimento
npm run build        # Build de produção
npm run start        # Inicia servidor de produção
npm run db:push      # Aplica migrações do banco
npm run db:seed      # Popula dados de teste
npm run test         # Executa testes
npm run format       # Formata código com Prettier
```

### Estrutura de Autenticação

A autenticação agora usa JWT com cookies HTTP-only:

1. **Registro** (`POST /api/auth/register`)
   - Recebe: `email`, `password`, `name` (opcional)
   - Retorna: `user`, `token`
   - Seta cookie `auth_token`

2. **Login** (`POST /api/auth/login`)
   - Recebe: `email`, `password`
   - Retorna: `user`, `token`
   - Seta cookie `auth_token`

3. **Verificar Autenticação** (`GET /api/auth/me`)
   - Retorna: dados do usuário logado
   - Requer: cookie `auth_token` válido

4. **Logout** (`POST /api/auth/logout`)
   - Limpa o cookie `auth_token`

### Integração de Armazenamento

O MinIO é totalmente compatível com a API do AWS S3:

```typescript
import { uploadImage, getSignedDownloadUrl } from './server/_core/storage';

// Upload de imagem
const metadata = await uploadImage(buffer, 'minha-foto.jpg', {
  plantId: '123',
  tentId: '456',
});

// Gerar URL de download
const url = await getSignedDownloadUrl(metadata.key);
```

## Suporte e Contribuição

- **Issues**: Reporte bugs no GitHub
- **Discussões**: Compartilhe ideias e perguntas
- **Pull Requests**: Contribuições são bem-vindas!

## Licença

MIT

## Mudanças em Relação à Versão Manus

| Aspecto | Antes (Manus) | Agora (Servidor) |
| --- | --- | --- |
| Autenticação | Manus OAuth | JWT + Email/Senha |
| Armazenamento | S3 Manus | MinIO (self-hosted) |
| Hospedagem | Plataforma Manus | Docker + VPS |
| Banco de Dados | MySQL/TiDB | MySQL (compatível) |
| Dependências | Manus SDK | Open-source |
| Custo | Plano Manus | Apenas VPS (~$5-50/mês) |
| Controle | Limitado | Total |
| Portabilidade | Baixa | Alta |

## Próximos Passos

1. Faça o primeiro deploy em um VPS
2. Configure um domínio customizado
3. Configure SSL/HTTPS com Let's Encrypt
4. Implemente backups automáticos do banco de dados
5. Configure monitoramento e alertas

---

**Versão**: 2.0.0 (Servidor Independente)  
**Última atualização**: Fevereiro 2026  
**Status**: Pronto para Produção

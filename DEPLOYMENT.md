# Guia Completo de Deployment - App Cultivo Server

Este guia passo a passo te ajudará a fazer deploy do App Cultivo em um servidor comum.

## Índice

1. [Pré-requisitos](#pré-requisitos)
2. [Escolher um Provedor](#escolher-um-provedor)
3. [Setup Inicial do Servidor](#setup-inicial-do-servidor)
4. [Instalar Docker](#instalar-docker)
5. [Clonar e Configurar a Aplicação](#clonar-e-configurar-a-aplicação)
6. [Configurar Nginx como Reverse Proxy](#configurar-nginx-como-reverse-proxy)
7. [Configurar SSL/HTTPS](#configurar-sslhttps)
8. [Monitoramento e Manutenção](#monitoramento-e-manutenção)

---

## Pré-requisitos

- Domínio próprio (ex: cultivo.seu-dominio.com)
- Acesso SSH ao servidor
- Conhecimento básico de terminal/Linux
- Conta em um provedor de VPS

---

## Escolher um Provedor

### Recomendações (2026)

| Provedor | Preço | Performance | Suporte |
| --- | --- | --- | --- |
| **DigitalOcean** | $5-20/mês | Excelente | Ótimo |
| **Linode** | $5-20/mês | Excelente | Ótimo |
| **Vultr** | $2.50-10/mês | Muito Bom | Bom |
| **AWS EC2** | $5-50/mês | Excelente | Ótimo |
| **Azure** | $5-50/mês | Excelente | Ótimo |
| **Hetzner** | €3-10/mês | Excelente | Bom |

**Recomendação para iniciantes**: DigitalOcean ou Linode (interface simples, documentação excelente)

### Especificações Mínimas

- **CPU**: 1 vCore
- **RAM**: 1-2 GB
- **Disco**: 20-30 GB SSD
- **Banda**: 1 TB/mês

---

## Setup Inicial do Servidor

### 1. Criar a VM

**DigitalOcean**:
1. Clique em "Create" → "Droplets"
2. Escolha "Ubuntu 22.04 LTS"
3. Escolha plano $5/mês (1GB RAM, 1 vCore, 25GB SSD)
4. Selecione a região mais próxima
5. Clique em "Create Droplet"

**Linode**:
1. Clique em "Create" → "Linode"
2. Escolha "Ubuntu 22.04 LTS"
3. Escolha plano Nanode 1GB ($5/mês)
4. Selecione a região mais próxima
5. Clique em "Create"

### 2. Conectar via SSH

```bash
# Substitua IP_DO_SERVIDOR pelo IP da sua VM
ssh root@IP_DO_SERVIDOR

# Na primeira vez, você será pedido para confirmar a conexão
# Digite 'yes' e pressione Enter
```

### 3. Atualizar o Sistema

```bash
apt update
apt upgrade -y
apt install -y curl wget git nano htop
```

### 4. Criar Usuário Não-Root (Recomendado)

```bash
# Criar usuário
adduser cultivo

# Adicionar ao grupo sudo
usermod -aG sudo cultivo

# Trocar para o novo usuário
su - cultivo
```

### 5. Configurar Firewall

```bash
# Ativar firewall
sudo ufw enable

# Permitir SSH (importante!)
sudo ufw allow 22/tcp

# Permitir HTTP e HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Verificar status
sudo ufw status
```

---

## Instalar Docker

### 1. Instalar Docker Engine

```bash
# Remover versões antigas
sudo apt-get remove docker docker-engine docker.io containerd runc

# Instalar dependências
sudo apt-get install -y \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg \
    lsb-release

# Adicionar chave GPG do Docker
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

# Adicionar repositório
echo \
  "deb [arch=amd64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Instalar Docker
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Verificar instalação
docker --version
```

### 2. Instalar Docker Compose

```bash
# Baixar Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose

# Dar permissão de execução
sudo chmod +x /usr/local/bin/docker-compose

# Verificar instalação
docker-compose --version
```

### 3. Adicionar Usuário ao Grupo Docker

```bash
# Adicionar usuário ao grupo docker
sudo usermod -aG docker $USER

# Aplicar mudanças (logout e login novamente)
newgrp docker
```

---

## Clonar e Configurar a Aplicação

### 1. Clonar o Repositório

```bash
# Clonar
git clone https://github.com/seu-usuario/cultivo-server.git
cd cultivo-server

# Se o repositório for privado, configure SSH keys primeiro
```

### 2. Configurar Variáveis de Ambiente

```bash
# Copiar arquivo de exemplo
cp .env.production.example .env

# Editar com seus valores
nano .env
```

**Valores importantes a configurar**:

```bash
# Banco de Dados
DATABASE_URL=mysql://cultivo_user:SENHA_FORTE_AQUI@db:3306/cultivo
MYSQL_ROOT_PASSWORD=ROOT_SENHA_FORTE_AQUI
MYSQL_USER=cultivo_user
MYSQL_PASSWORD=SENHA_FORTE_AQUI

# JWT
JWT_SECRET=GERE_COM_openssl_rand_-base64_32

# S3/MinIO
S3_ENDPOINT=https://s3.seu-dominio.com
S3_ACCESS_KEY=CHAVE_ACESSO
S3_SECRET_KEY=CHAVE_SECRETA

# MinIO
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=SENHA_FORTE_AQUI

# Aplicação
DOMAIN=cultivo.seu-dominio.com
```

**Para gerar JWT_SECRET seguro**:
```bash
openssl rand -base64 32
```

### 3. Iniciar a Aplicação

```bash
# Usar docker-compose de produção
docker-compose -f docker-compose.prod.yml up -d

# Verificar se os containers estão rodando
docker-compose -f docker-compose.prod.yml ps

# Ver logs
docker-compose -f docker-compose.prod.yml logs -f app
```

### 4. Inicializar Banco de Dados

```bash
# Aplicar migrações
docker-compose -f docker-compose.prod.yml exec app npm run db:push

# Seed com dados iniciais (opcional)
docker-compose -f docker-compose.prod.yml exec app npm run db:seed
```

### 5. Criar Bucket no MinIO

```bash
# Acessar container MinIO
docker-compose -f docker-compose.prod.yml exec minio bash

# Instalar cliente MinIO
curl https://dl.min.io/client/mc/release/linux-amd64/mc \
  --create-dirs \
  -o /usr/local/bin/mc

chmod +x /usr/local/bin/mc

# Configurar alias
mc alias set minio http://localhost:9000 minioadmin minioadmin

# Criar bucket
mc mb minio/cultivo-fotos

# Sair do container
exit
```

---

## Configurar Nginx como Reverse Proxy

### 1. Instalar Nginx

```bash
sudo apt-get install -y nginx
```

### 2. Criar Configuração do Site

```bash
# Criar arquivo de configuração
sudo nano /etc/nginx/sites-available/cultivo
```

**Conteúdo** (substitua `cultivo.seu-dominio.com`):

```nginx
upstream cultivo_app {
    server localhost:3000;
}

server {
    listen 80;
    listen [::]:80;
    server_name cultivo.seu-dominio.com;
    
    # Redirecionar HTTP para HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name cultivo.seu-dominio.com;

    # Certificados SSL (configurar depois com Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/cultivo.seu-dominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/cultivo.seu-dominio.com/privkey.pem;

    # Configurações SSL
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Compressão
    gzip on;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss;

    # Proxy para a aplicação
    location / {
        proxy_pass http://cultivo_app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Logs
    access_log /var/log/nginx/cultivo_access.log;
    error_log /var/log/nginx/cultivo_error.log;
}
```

### 3. Habilitar o Site

```bash
# Criar link simbólico
sudo ln -s /etc/nginx/sites-available/cultivo /etc/nginx/sites-enabled/

# Testar configuração
sudo nginx -t

# Reiniciar Nginx
sudo systemctl restart nginx
```

---

## Configurar SSL/HTTPS

### 1. Instalar Certbot

```bash
sudo apt-get install -y certbot python3-certbot-nginx
```

### 2. Gerar Certificado

```bash
# Gerar certificado (substitua seu domínio)
sudo certbot certonly --nginx -d cultivo.seu-dominio.com

# Seguir as instruções na tela
# Escolha opção 2 (Standalone) se Nginx não estiver rodando
```

### 3. Configurar Renovação Automática

```bash
# Testar renovação
sudo certbot renew --dry-run

# Habilitar renovação automática
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

---

## Monitoramento e Manutenção

### 1. Verificar Status

```bash
# Status dos containers
docker-compose -f docker-compose.prod.yml ps

# Logs da aplicação
docker-compose -f docker-compose.prod.yml logs -f app

# Uso de recursos
docker stats

# Espaço em disco
df -h
```

### 2. Backup do Banco de Dados

```bash
# Backup manual
docker-compose -f docker-compose.prod.yml exec db mysqldump -u cultivo_user -p cultivo > backup-$(date +%Y%m%d-%H%M%S).sql

# Restaurar backup
docker-compose -f docker-compose.prod.yml exec -T db mysql -u cultivo_user -p cultivo < backup-20260228-120000.sql
```

### 3. Atualizar a Aplicação

```bash
# Parar containers
docker-compose -f docker-compose.prod.yml down

# Atualizar código
git pull origin main

# Reconstruir e iniciar
docker-compose -f docker-compose.prod.yml up -d --build

# Aplicar migrações se necessário
docker-compose -f docker-compose.prod.yml exec app npm run db:push
```

### 4. Monitoramento com Cron

```bash
# Editar crontab
crontab -e

# Adicionar verificação diária de saúde
0 2 * * * docker-compose -f /home/cultivo/cultivo-server/docker-compose.prod.yml exec app curl -f http://localhost:3000/api/auth/me || echo "App health check failed" | mail -s "Cultivo Alert" seu-email@dominio.com
```

---

## Troubleshooting

### Problema: "Connection refused"
```bash
# Verificar se containers estão rodando
docker-compose -f docker-compose.prod.yml ps

# Verificar logs
docker-compose -f docker-compose.prod.yml logs app
```

### Problema: "Database connection error"
```bash
# Aguardar MySQL iniciar
sleep 30

# Aplicar migrações
docker-compose -f docker-compose.prod.yml exec app npm run db:push
```

### Problema: "SSL certificate not found"
```bash
# Regenerar certificado
sudo certbot certonly --nginx -d cultivo.seu-dominio.com --force-renewal
```

### Problema: "Out of memory"
```bash
# Aumentar swap
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

---

## Checklist Final

- [ ] Servidor criado e acessível via SSH
- [ ] Docker e Docker Compose instalados
- [ ] Código clonado e configurado
- [ ] Variáveis de ambiente definidas
- [ ] Containers iniciados com sucesso
- [ ] Banco de dados migrado
- [ ] Nginx configurado como reverse proxy
- [ ] SSL/HTTPS funcionando
- [ ] Domínio apontando para o servidor
- [ ] Backup automático configurado
- [ ] Monitoramento ativo

---

## Suporte

- **Documentação Docker**: https://docs.docker.com
- **Documentação Nginx**: https://nginx.org/en/docs/
- **Documentação Let's Encrypt**: https://letsencrypt.org/docs/
- **GitHub Issues**: https://github.com/seu-usuario/cultivo-server/issues

---

**Parabéns! Seu App Cultivo está pronto para produção! 🚀**

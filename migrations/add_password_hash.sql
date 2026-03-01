-- Adicionar coluna passwordHash à tabela users
-- Esta migração é necessária para o novo sistema de autenticação JWT

ALTER TABLE `users` 
ADD COLUMN `passwordHash` VARCHAR(255) NOT NULL DEFAULT '' AFTER `id`,
MODIFY COLUMN `email` VARCHAR(320) NOT NULL UNIQUE,
MODIFY COLUMN `openId` VARCHAR(64) UNIQUE NULL;

-- Atualizar índices
CREATE UNIQUE INDEX `email_idx` ON `users`(`email`);

-- Migração: Adicionar suporte à área "Aguardando Secagem"
-- Execute este script no banco de dados MySQL em produção
-- Data: 2026-03-03

-- 1. Adicionar novos campos na tabela plants
ALTER TABLE `plants`
  MODIFY COLUMN `status` ENUM('ACTIVE', 'AWAITING_DRYING', 'HARVESTED', 'DEAD', 'DISCARDED') NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN `harvestQueueAt` TIMESTAMP NULL AFTER `status`,
  ADD COLUMN `harvestQueueNotes` TEXT NULL AFTER `harvestQueueAt`;

-- Verificação
SELECT 'Migração concluída com sucesso!' AS resultado;

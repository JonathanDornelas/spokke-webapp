-- O áudio de atividade deixa de vencer: fica enquanto alguma atividade do
-- professor o usa, e sai quando a última delas é apagada (server/tts/limpeza.ts).
--
-- Antes de tirar a coluna, saem as linhas VENCIDAS: o arquivo delas já foi
-- apagado pela regra de ciclo de vida do bucket, e sem a coluna elas passariam
-- a contar como áudio pronto, apontando para um objeto que não existe. A
-- entrada do Player enfileira de novo o que faltar.
DELETE FROM "MediaAsset" WHERE "expiresAt" < NOW();

-- DropIndex
DROP INDEX IF EXISTS "MediaAsset_expiresAt_idx";

-- AlterTable
ALTER TABLE "MediaAsset" DROP COLUMN "expiresAt";

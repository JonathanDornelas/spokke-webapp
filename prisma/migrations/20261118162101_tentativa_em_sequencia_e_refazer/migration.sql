-- AlterTable
ALTER TABLE "Attempt" ADD COLUMN     "avanco" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "substituiId" TEXT,
ADD COLUMN     "vez" INTEGER NOT NULL DEFAULT 1;

-- O avanço das tentativas que já existiam. Com o padrão 0, quem estava no meio
-- de uma atividade voltaria à questão 1 no próximo clique.
--
-- Pela metade: a posição da última questão RESPONDIDA, na ordem do roteiro (a
-- mesma `order` com que o Player numera as questões). Pular não deixava rastro,
-- então quem tinha pulado a seguinte volta para ela — e pula de novo.
UPDATE "Attempt" AS a
SET "avanco" = r.posicao
FROM (
  SELECT ai."attemptId", MAX(i.posicao) AS posicao
  FROM "AttemptItem" ai
  JOIN (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY "activityVersionId" ORDER BY "order", id) AS posicao
    FROM "Item"
  ) i ON i.id = ai."itemId"
  GROUP BY ai."attemptId"
) r
WHERE r."attemptId" = a.id;

-- Entregue: o caminho inteiro ficou para trás.
UPDATE "Attempt" AS a
SET "avanco" = (
  SELECT COUNT(*)
  FROM "Item" i
  JOIN "Publication" p ON p."activityVersionId" = i."activityVersionId"
  WHERE p.id = a."publicationId"
)
WHERE a."finishedAt" IS NOT NULL;

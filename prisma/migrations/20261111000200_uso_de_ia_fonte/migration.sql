-- De onde a geração por IA partiu (prompt, imagem ou vídeo) e quantos segundos de fala o vídeo
-- mandou: é o que separa, na conta dos preços, ler um arquivo de escrever as propostas
-- (docs/adr-003-ia-gemini.md "Imagem e vídeo"). Aditiva: as linhas que já existem são do prompt.
ALTER TABLE "AiUsage" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'prompt';
ALTER TABLE "AiUsage" ADD COLUMN "mediaSeconds" INTEGER;

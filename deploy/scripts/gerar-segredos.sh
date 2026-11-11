#!/usr/bin/env bash
# Gera os segredos INTERNOS de produção e os grava nos .env — docs/deploy.md 2.9.
#
#   bash /srv/spokke/spokke-service/deploy/scripts/gerar-segredos.sh
#
# São quatro, e cada um precisa ser IGUAL em dois lugares — é por isso que isto
# existe, em vez de copiar à mão:
#
#   senha do banco   env/infra.env (POSTGRES_PASSWORD) e .env (DATABASE_URL, DATABASE_URL_DOCKER)
#   senha do MinIO   env/infra.env e .env (STORAGE_SECRET_ACCESS_KEY)
#   Better Auth      .env (BETTER_AUTH_SECRET)
#   token do áudio   .env (AUDIOTEXT_TOKEN) e audiotext-service/.env (AUDIOTEXT_API_TOKEN)
#
# Só preenche o que ainda está "TROCAR", e só se TODOS os sete pontos ainda
# estiverem assim: rodar de novo depois do banco criado trocaria a senha no .env
# sem trocar a do Postgres (que vale desde a primeira subida). Os segredos não
# são impressos — ficam nos arquivos, com permissão 600.
set -euo pipefail

RAIZ="${RAIZ:-/srv/spokke}"
INFRA="$RAIZ/env/infra.env"
APP="$RAIZ/spokke-service/.env"
AUDIO="$RAIZ/audiotext-service/.env"

for arquivo in "$INFRA" "$APP" "$AUDIO"; do
	if [ ! -f "$arquivo" ]; then
		echo "Falta $arquivo — copie o modelo de deploy/env/ antes (docs/deploy.md 2.8)."
		exit 1
	fi
done

pendentes=0
total=0
confere() {
	total=$((total + 1))
	if grep -q "$2" "$1"; then pendentes=$((pendentes + 1)); fi
}
confere "$INFRA" '^POSTGRES_PASSWORD="TROCAR"'
confere "$INFRA" '^STORAGE_SECRET_ACCESS_KEY="TROCAR"'
confere "$APP" '^STORAGE_SECRET_ACCESS_KEY="TROCAR"'
confere "$APP" '^BETTER_AUTH_SECRET="TROCAR"'
confere "$APP" '^AUDIOTEXT_TOKEN="TROCAR"'
confere "$APP" 'spokke:TROCAR@'
confere "$AUDIO" '^AUDIOTEXT_API_TOKEN="TROCAR"'

if [ "$pendentes" -eq 0 ]; then
	echo "Os segredos internos já foram gerados. Nada a fazer."
	exit 0
fi
if [ "$pendentes" -ne "$total" ]; then
	echo "Só parte dos segredos está como TROCAR ($pendentes de $total)."
	echo "Para não gerar valores que não batem entre os arquivos, nada foi mudado."
	echo "Confira à mão: grep -n TROCAR $INFRA $APP $AUDIO"
	exit 1
fi

# Hexadecimal: só letras e números, nada que precise de escape numa URL ou no sed.
banco="$(openssl rand -hex 24)"
minio="$(openssl rand -hex 24)"
auth="$(openssl rand -hex 32)"
audio="$(openssl rand -hex 32)"

sed -i "s|^POSTGRES_PASSWORD=\"TROCAR\"|POSTGRES_PASSWORD=\"$banco\"|" "$INFRA"
sed -i "s|^STORAGE_SECRET_ACCESS_KEY=\"TROCAR\"|STORAGE_SECRET_ACCESS_KEY=\"$minio\"|" "$INFRA"
sed -i "s|^STORAGE_SECRET_ACCESS_KEY=\"TROCAR\"|STORAGE_SECRET_ACCESS_KEY=\"$minio\"|" "$APP"
sed -i "s|^BETTER_AUTH_SECRET=\"TROCAR\"|BETTER_AUTH_SECRET=\"$auth\"|" "$APP"
sed -i "s|^AUDIOTEXT_TOKEN=\"TROCAR\"|AUDIOTEXT_TOKEN=\"$audio\"|" "$APP"
sed -i "s|spokke:TROCAR@|spokke:$banco@|g" "$APP"
sed -i "s|^AUDIOTEXT_API_TOKEN=\"TROCAR\"|AUDIOTEXT_API_TOKEN=\"$audio\"|" "$AUDIO"
chmod 600 "$INFRA" "$APP" "$AUDIO"

echo "Gerados e gravados: senha do banco, senha do MinIO, segredo do Better Auth, token do áudio."
echo
echo "Ainda falta preencher à mão (contas da véspera):"
grep -nE '^[A-Z_]+=.*TROCAR' "$INFRA" "$APP" "$AUDIO" "$RAIZ/spokke-service/deploy/caddy/.env" 2>/dev/null ||
	echo "  nada — tudo preenchido."

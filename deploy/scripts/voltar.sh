#!/usr/bin/env bash
# Põe no ar a imagem anterior da aplicação — docs/deploy.md "Se algo der errado".
#
#   bash /srv/spokke/spokke-service/deploy/scripts/voltar.sh
#
# Só a APLICAÇÃO volta. O banco fica como está: se a versão nova aplicou uma
# migration que a anterior não entende, voltar não resolve — aí o caminho é
# corrigir para a frente, ou restaurar o backup (docs/deploy.md "Backup").
set -euo pipefail

cd "$(dirname "$0")/../.."
COMPOSE=(docker compose -f docker-compose.yml -f deploy/compose/app.yml)

if ! docker image inspect spokke-service:anterior >/dev/null 2>&1; then
	echo "Não há imagem anterior guardada (spokke-service:anterior)."
	exit 1
fi

docker tag spokke-service:anterior spokke-service:local
"${COMPOSE[@]}" up -d --no-deps --force-recreate worker
"${COMPOSE[@]}" up -d --no-deps --force-recreate web
echo "Voltou. Confira: docker ps --filter name=spokke-web"

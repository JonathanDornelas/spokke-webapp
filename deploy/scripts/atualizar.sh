#!/usr/bin/env bash
# Atualiza a aplicação (web + worker) com o que está no `main` — docs/deploy.md
# "Atualizar uma versão". Rodar no servidor, de qualquer pasta:
#
#   bash /srv/spokke/spokke-service/deploy/scripts/atualizar.sh
#
# A ordem é a de docs/operacao.md: migration → worker → web. O worker vem antes
# porque tipo de job que ele não conhece vai para `failed`, e o web novo pode
# enfileirar um tipo novo no primeiro minuto.
#
# A imagem que estava no ar é guardada como `spokke-service:anterior` antes do
# build — é ela que `voltar.sh` põe de volta. O banco não volta: migration é só
# para a frente, então volte só para uma versão que entenda o banco atual.
set -euo pipefail

cd "$(dirname "$0")/../.."
COMPOSE=(docker compose -f docker-compose.yml -f deploy/compose/app.yml)

echo "== código"
git pull --ff-only
git log --oneline -1

echo "== imagem"
if docker image inspect spokke-service:local >/dev/null 2>&1; then
	docker tag spokke-service:local spokke-service:anterior
fi
"${COMPOSE[@]}" build

echo "== migrations"
"${COMPOSE[@]}" run --rm --no-deps web ./node_modules/.bin/prisma migrate deploy

echo "== worker, depois web"
"${COMPOSE[@]}" up -d --no-deps worker
"${COMPOSE[@]}" up -d --no-deps web

echo "== esperando o web responder"
estado="?"
for _ in $(seq 1 45); do
	estado="$(docker inspect -f '{{.State.Health.Status}}' spokke-web 2>/dev/null || echo '?')"
	[ "$estado" = "healthy" ] && break
	sleep 2
done
echo "web: $estado"
if [ "$estado" != "healthy" ]; then
	echo "O web não ficou saudável. Veja: docker logs --tail 100 spokke-web"
	echo "Para voltar à versão anterior: bash deploy/scripts/voltar.sh"
	exit 1
fi

docker image prune -f >/dev/null
echo "ok"

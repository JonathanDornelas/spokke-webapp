#!/usr/bin/env bash
# Backup do banco — docs/deploy.md "Backup". Feito para o cron, uma vez por dia:
#
#   15 6 * * * REMOTO=r2:spokke-backups bash /srv/spokke/spokke-service/deploy/scripts/backup-postgres.sh >> /srv/spokke/backups/backup.log 2>&1
#
# `pg_dump -Fc` de dentro do container (o usuário e o banco vêm do ambiente
# dele), num arquivo por dia em /srv/spokke/backups, apagando os mais velhos que
# MANTER_DIAS. Com REMOTO (um destino do rclone, como `r2:spokke-backups`), o
# arquivo também sai do servidor: um backup que mora na mesma máquina não
# sobrevive à perda da máquina.
#
# O banco é o único dado que não se recria. O áudio das atividades (`tts/`) é
# identificado pelo conteúdo e a entrada do Player o gera de novo; a voz dos
# alunos (`fala/`) vive 7 dias de propósito.
set -euo pipefail

DESTINO="${DESTINO:-/srv/spokke/backups}"
MANTER_DIAS="${MANTER_DIAS:-14}"
REMOTO="${REMOTO:-}"

mkdir -p "$DESTINO"
arquivo="$DESTINO/spokke-$(date -u +%Y%m%d-%H%M%S).dump"
trap 'rm -f "$arquivo.parcial"' ERR

docker exec spokke-postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' >"$arquivo.parcial"
mv "$arquivo.parcial" "$arquivo"

find "$DESTINO" -name 'spokke-*.dump' -mtime "+$MANTER_DIAS" -delete

if [ -n "$REMOTO" ]; then
	rclone copy "$arquivo" "$REMOTO" --quiet
fi

echo "$(date -u +%FT%TZ) ok $(du -h "$arquivo" | cut -f1) $arquivo${REMOTO:+ → $REMOTO}"

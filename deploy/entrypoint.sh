#!/bin/sh
set -eu
umask 077
: "${DATA_DIR:=/data}"
case "$DATA_DIR" in
  /|/app|/app/*|/etc|/etc/*|/usr|/usr/*|/root|/root/*) echo 'Use a dedicated data volume outside application and system directories.' >&2; exit 1 ;;
  /*) ;;
  *) echo 'DATA_DIR must be absolute in the container.' >&2; exit 1 ;;
esac
mkdir -p "$DATA_DIR"
if [ "$(id -u)" = 0 ]; then
  chown node:node "$DATA_DIR"
  chmod 700 "$DATA_DIR"
  for suffix in '' '-wal' '-shm'; do
    filename="$DATA_DIR/cash-diet.sqlite$suffix"
    if [ -f "$filename" ]; then chown node:node "$filename"; chmod 600 "$filename"; fi
  done
  exec gosu node:node "$@"
fi
exec "$@"

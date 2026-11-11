#!/bin/sh
# Solo para el entorno Linux del agente: reinicia la API matando el proceso que ocupa el puerto.
for pid in /proc/[0-9]*; do
  p=${pid#/proc/}
  if tr '\0' ' ' < "/proc/$p/cmdline" 2>/dev/null | grep -q "backend/src/index.ts"; then
    kill "$p" 2>/dev/null && echo "kill $p"
  fi
done
sleep 2
cd "$(dirname "$0")/.." || exit 1
nohup npx tsx backend/src/index.ts > /tmp/api.log 2>&1 &
sleep 6
tail -3 /tmp/api.log

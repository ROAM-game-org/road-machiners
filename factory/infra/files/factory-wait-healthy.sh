#!/bin/bash
# Waits until a container's health check passes.
# Usage: factory-wait-healthy.sh <container> <seconds>
# A passing unhealthy or starting status does not fail it. It exits 1 only when the window ends before the status is healthy.
set -euo pipefail
container=${1:?container}
window=${2:?seconds}
# Docker changes the status only after a check, at most every 30 s, so a 5 s poll adds at most 5 s.
interval=5
waited=0
status=
while :; do
  status=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container")
  if [ "$status" = healthy ]; then
    exit 0
  fi
  [ "$waited" -lt "$window" ] || break
  sleep "$interval"
  waited=$((waited + interval))
done
echo "$container is not healthy after ${window}s, last status: $status" >&2
exit 1

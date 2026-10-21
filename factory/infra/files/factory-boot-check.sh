#!/bin/bash
# Runs after every boot, planned or not. roam-factory-boot-check.service starts it as root.
# It lifts the pause of a planned reboot, then waits until every factory service works and one tick has passed.
# Checks that still fail at the limit go to $home/boot-failed, which Hermes's incident watch prints.
set -euo pipefail

root=${1:?factory root}
user=${2:?factory user}
check_minutes=${3:?check minutes}
public_url=${4:?public url}
home=$root/home
failed=$home/boot-failed
NOTE="planned reboot"
CHECK_SECONDS=10

log() { echo "$(date -u +%FT%TZ) $*"; }

factory() {
  sudo -u "$user" -H bash -c 'cd "$0/code/factory" && npm run -s factory -- "$@"' "$root" "$@"
}

lift_reboot_pause() {
  [ -f "$home/paused" ] || return 0
  if jq -e --arg note "$NOTE" '.kind == "factory" and .note == $note' "$home/paused" > /dev/null; then
    factory resume
    log "lifted the planned reboot pause"
  fi
}

# A unit counts once installed, as the dashboard restart hook does.
check_units() {
  for unit in roam-factory-dashboard.service roam-factory-errors.service roam-factory-tick.timer roam-factory-update.timer; do
    if systemctl is-enabled --quiet "$unit" && ! systemctl is-active --quiet "$unit"; then echo "$unit is not active"; fi
  done
}

check_containers() {
  for name in factory-hermes factory-caddy factory-tunnel; do
    if [ "$(docker inspect -f '{{.State.Running}}' "$name" 2> /dev/null)" != true ]; then echo "container $name is not running"; fi
  done
}

check_public() {
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$public_url/factory/" || true)
  if [ "$code" != 200 ]; then echo "$public_url/factory/ answers $code, not 200"; fi
}

# The monotonic exit time resets at boot, so a nonzero one means a tick ended since this boot.
check_tick() {
  local result ended
  result=$(systemctl show roam-factory-tick.service -p Result --value)
  ended=$(systemctl show roam-factory-tick.service -p ExecMainExitTimestampMonotonic --value)
  if [ "$ended" = 0 ] || [ "$result" != success ]; then echo "no tick has finished with success since boot, last result $result"; fi
}

problems() {
  check_units
  check_containers
  check_public
  check_tick
}

lift_reboot_pause
found=""
for _ in $(seq $((check_minutes * 60 / CHECK_SECONDS))); do
  found=$(problems)
  [ -n "$found" ] || break
  sleep "$CHECK_SECONDS"
done

if [ -n "$found" ]; then
  printf 'boot check at %s:\n%s\n' "$(date -u +%FT%TZ)" "$found" > "$failed"
  chown "$user:$user" "$failed"
  log "failed: $(echo "$found" | paste -sd ';' -)"
  exit 1
fi
rm -f "$failed"
log "every service works"

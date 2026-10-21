#!/bin/bash
# Runs after every boot, planned or not. roam-factory-boot-check.service starts it as root.
# It lifts the pause of a planned reboot, then waits until every factory service works and one tick has passed.
# Checks that still fail at the limit go to $home/boot-failed, which Hermes's incident watch prints.
set -euo pipefail

root=${1:?factory root}
user=${2:?factory user}
check_seconds=${3:?check seconds}
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
    factory resume || return 1
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
  if ! result=$(systemctl show roam-factory-tick.service -p Result --value) || ! ended=$(systemctl show roam-factory-tick.service -p ExecMainExitTimestampMonotonic --value); then
    echo "cannot read roam-factory-tick.service"
    return
  fi
  if [ "$ended" = 0 ] || [ "$result" != success ]; then echo "no tick has finished with success since boot, last result $result"; fi
}

problems() {
  check_units
  check_containers
  check_public
  check_tick
}

report_failure() {
  printf 'boot check at %s:\n%s\n' "$(date -u +%FT%TZ)" "$1" > "$failed"
  chown "$user:$user" "$failed"
  log "failed: $(echo "$1" | paste -sd ';' -)"
  exit 1
}

trap 'report_failure "the boot check script failed at line $LINENO"' ERR

lift_error=""
if ! lifted=$(lift_reboot_pause 2>&1); then lift_error="could not lift the planned reboot pause: $lifted"; fi
[ -z "$lifted" ] || echo "$lifted"

# The limit is clock time, since one round of checks can take as long as the curl limit.
deadline=$((SECONDS + check_seconds))
found=$(problems)
while [ -n "$found" ] && [ "$SECONDS" -lt "$deadline" ]; do
  sleep "$CHECK_SECONDS"
  found=$(problems)
done

found=$(printf '%s\n%s' "$lift_error" "$found" | sed '/^$/d')
[ -z "$found" ] || report_failure "$found"
rm -f "$failed"
log "every service works"

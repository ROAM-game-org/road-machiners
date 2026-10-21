#!/bin/bash
# Planned reboot. roam-factory-reboot.timer runs it as root on FACTORY_REBOOT_CALENDAR.
# It pauses the factory, waits until no job runs and the factory user has no login session, and reboots.
# After the drain limit it reboots anyway, and each cut job resumes once by itself.
# factory-boot-check.sh lifts the pause after the boot.
set -euo pipefail

root=${1:?factory root}
user=${2:?factory user}
drain_minutes=${3:?drain minutes}
home=$root/home
state=$home/state/state.json
NOTE="planned reboot"

log() { echo "$(date -u +%FT%TZ) $*"; }

factory() {
  sudo -u "$user" -H bash -c 'cd "$0/code/factory" && npm run -s factory -- "$@"' "$root" "$@"
}

running_jobs() {
  jq -r '[.jobs[] | "\(.stage) #\(.issue)"] | join(", ")' "$state"
}

# Hermes's factory-host commands and claude-run jobs live in the user's slice. It exists only while one runs.
user_busy() {
  systemctl is-active --quiet "user-$(id -u "$user").slice"
}

if [ -f "$home/paused" ]; then
  log "skipped: the factory is already paused: $(cat "$home/paused")"
  exit 0
fi
if grub-editenv list | grep -q '^next_entry='; then
  log "skipped: GRUB has a one-time boot entry, so the reboot may not come back to this system: $(grub-editenv list)"
  exit 0
fi

factory pause "$NOTE"
log "paused, draining for at most $drain_minutes minutes"
for _ in $(seq "$drain_minutes"); do
  if [ -z "$(running_jobs)" ] && ! user_busy; then break; fi
  sleep 60
done

cut=$(running_jobs)
if [ -n "$cut" ]; then log "cutting running jobs: $cut"; fi
if user_busy; then log "cutting a factory user session: $(ps -u "$user" -o pid=,args= | head -20)"; fi
log "rebooting"
systemctl reboot

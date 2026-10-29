#!/usr/bin/env bash
set -euo pipefail

branch="${1:?usage: scripts/land-dev.sh <branch>}"
root=$(git rev-parse --show-toplevel)
repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
land_branch="land/${branch//\//-}"
poll_seconds=30
job_limit_minutes=40
polls=$((job_limit_minutes * 60 / poll_seconds + 10))
attempts=3

mkdir -p "$root/tmp"
work=$(mktemp -d "$root/tmp/land-dev-XXXXXX")
land_pushed=0
cleanup() {
  if [ -d "$work/.git" ] || [ -f "$work/.git" ]; then git -C "$root" worktree remove --force "$work"; else rm -rf "$work"; fi
  if [ "$land_pushed" = 1 ]; then git -C "$root" push --quiet origin --delete "$land_branch"; fi
}
trap cleanup EXIT

git -C "$root" fetch --quiet origin
git -C "$root" worktree add --quiet --detach "$work" "$branch"

suite_result() {
  local sha="$1" run status conclusion
  run=$(gh api -X POST "repos/$repo/actions/workflows/game-suite.yml/dispatches" -f ref=main -f "inputs[sha]=$sha" -F return_run_details=true --jq .workflow_run_id)
  echo "suite run https://github.com/$repo/actions/runs/$run for $sha" >&2
  for _ in $(seq 1 "$polls"); do
    sleep "$poll_seconds"
    status=$(gh api "repos/$repo/actions/runs/$run" --jq .status)
    if [ "$status" = completed ]; then
      conclusion=$(gh api "repos/$repo/actions/runs/$run" --jq .conclusion)
      echo "$conclusion"
      return
    fi
  done
  echo "the suite run $run did not finish in $((polls * poll_seconds / 60)) minutes" >&2
  echo timed_out
}

for attempt in $(seq 1 "$attempts"); do
  git -C "$work" fetch --quiet origin
  if ! git -C "$work" merge --quiet --no-edit origin/dev; then
    echo "merging dev into $branch conflicts. Resolve it on $branch and run this again." >&2
    exit 1
  fi
  sha=$(git -C "$work" rev-parse HEAD)
  git -C "$work" push --quiet --force origin "$sha:refs/heads/$land_branch"
  land_pushed=1
  result=$(suite_result "$sha")
  if [ "$result" != success ]; then
    echo "the full suite ended $result on $sha, so dev stays as it is" >&2
    exit 1
  fi
  if git -C "$work" push --quiet origin "$sha:refs/heads/dev"; then
    echo "landed $branch on dev at $sha"
    exit 0
  fi
  echo "dev moved during attempt $attempt, merging it in again" >&2
done
echo "dev kept moving for $attempts attempts, so $branch is not landed" >&2
exit 1

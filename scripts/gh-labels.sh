#!/usr/bin/env bash
# Replaces GitHub repo labels with the KubeIslands label set.
# Usage: ./scripts/gh-labels.sh [owner/repo]
set -euo pipefail

REPO="${1:-martincollado/kubeislands}"

echo "Replacing labels on $REPO ..."

# Remove default labels
gh label list -R "$REPO" --json name -q '.[].name' | while read -r label; do
  gh label delete "$label" -R "$REPO" --yes 2>/dev/null || true
done

# Create our label set: name|color|description
while IFS='|' read -r name color desc; do
  gh label create "$name" --color "$color" --description "$desc" -R "$REPO" 2>/dev/null || \
  gh label edit  "$name" --color "$color" --description "$desc" -R "$REPO"
done << 'LABELS'
area/engine|0e8a16|Go engine
area/frontend|1d76db|React + R3F
area/helm|6f42c1|Helm chart / deploy
area/ci|fbca04|GitHub Actions
area/docs|c5def5|Documentation
type/bug|d73a4a|Something is broken
type/feature|a2eeef|New capability
type/proposal|0075ca|Design discussion
type/security|ee0701|Security-sensitive
good first issue|7057ff|Low-barrier entry point
help wanted|008672|Looking for help
priority/high|b60205|Drop everything
priority/medium|fbca04|Planned
priority/low|c2e0c6|Backlog
status/blocked|e99695|Waiting on something
status/needs-triage|ededed|Not yet classified
breaking|e11d48|Requires migration
dependencies|0075ca|Dependency update
LABELS

echo "Done."

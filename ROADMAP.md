# Roadmap

## What works today (v0.1)

- 3D world with hex-grid namespace layout
- Live cluster binding via `client-go` informers (Nodes, Namespaces, Pods, Deployments, ReplicaSets, Services, ConfigMaps, Secrets, Jobs, CronJobs)
- Hub-concentric layout algorithm — connected namespaces placed adjacent
- HUD: cluster name, node count, pod health, event log, minimap
- NamespaceCard — per-namespace resource breakdown on click
- Resource towers (pods, services, configmaps, secrets, jobs, cronjobs) per island
- Bridges between namespaces (from HTTPRoute / Gateway API)
- Mock mode — fully browser-local, no engine needed
- Helm chart with ClusterRole / Role switchable RBAC
- Multi-arch distroless containers

## Partial / in progress

- **Gateway API HTTPRoute visualization** — bridges render but route details not shown
- **Pod-to-Deployment attribution** — works via ReplicaSet mapping; edge cases with standalone pods

## Planned

- [ ] Prometheus / metrics-server overlays per namespace (CPU, memory heatmap on islands)
- [ ] Historical replay — 24 h timeline scrubber to rewind cluster state
- [ ] Multi-cluster view — switch between contexts, side-by-side worlds
- [ ] Keyboard-driven navigation for accessibility
- [ ] StatefulSet visualization (distinct from Deployment)
- [ ] Node topology view — pods mapped to physical nodes
- [ ] Alert integration — fire-effect on namespaces with active Alertmanager alerts

## Out of scope (for now)

- Write operations (scale, restart, delete) — intentional; this is a viewer
- Windows native support (Docker/WSL works)

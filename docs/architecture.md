# Architecture

## Overview

KubeIslands is split into two processes that communicate over WebSocket:

| Component | Language | Role |
|---|---|---|
| **Engine** | Go | Watches K8s API, maintains world state, broadcasts diffs |
| **Frontend** | React + Three.js/R3F | Receives state, renders 3D scene |

```
┌─────────────────────────────────────────────────────────────┐
│                     Kubernetes cluster                      │
│   apiserver ──► informers (client-go)                       │
└──────────────────────┬──────────────────────────────────────┘
                       │ watch events
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                      Go engine                              │
│                                                             │
│   k8s.Watcher                                               │
│     ├── watchNamespaces()    ├── watchNodes()               │
│     ├── watchPods()          ├── watchReplicaSets()         │
│     ├── watchDeployments()   ├── watchServices()            │
│     ├── watchConfigMaps()    ├── watchSecrets()             │
│     ├── watchJobs()          ├── watchCronJobs()            │
│     └── watchHTTPRoutes()                                   │
│              │                                              │
│              ▼                                              │
│   world.State  (mutex-protected)                            │
│     namespaces, pods, deployments, services,                │
│     configmaps, secrets, jobs, cronjobs, nodes, bridges     │
│              │                                              │
│              ▼                                              │
│   layout.ComputeHubCentric()   (BFS hex grid)               │
│              │                                              │
│              ▼                                              │
│   ws.Hub  ──► broadcast snapshot + diffs at 10 Hz          │
└──────────────────────┬──────────────────────────────────────┘
                       │ WebSocket  /ws/world
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                     Browser                                 │
│                                                             │
│   WorldSocket  ──► Dispatcher  ──► Zustand store            │
│                                         │                   │
│                                         ▼                   │
│                                   React + R3F scene         │
│                                   (Three.js WebGL)          │
└─────────────────────────────────────────────────────────────┘
```

## Wire Protocol

The engine sends two message types over the WebSocket connection:

### `snapshot` — full state on connect

```json
{
  "type": "snapshot",
  "namespaces": [...],
  "deployments": [...],
  "pods": [...],
  "bridges": [...],
  "services": [...],
  "configMaps": [...],
  "secrets": [...],
  "jobs": [...],
  "cronJobs": [...],
  "nodes": [...],
  "clusterName": "my-cluster"
}
```

### `diff` — incremental ops at 10 Hz

```json
{
  "type": "diff",
  "ops": [
    { "op": "add",    "path": "pods",         "value": { "id": "...", "health": "ready", ... } },
    { "op": "patch",  "path": "pods/abc-123",  "patch": { "health": "failed" } },
    { "op": "remove", "path": "pods/abc-123"  }
  ]
}
```

Op types: `add`, `patch`, `remove`. Paths: `namespaces`, `deployments`, `pods`, `bridges`, `services`, `configMaps`, `secrets`, `jobs`, `cronJobs`, `nodes`.

### `event` — log entries

```json
{ "type": "event", "verb": "added", "target": "namespace-id", "message": "pod xyz scheduled" }
```

### `ping` — keepalive every 15 s

```json
{ "type": "ping" }
```

## Layout Algorithm

Namespaces are placed on a hex grid using a hub-concentric BFS algorithm:

1. Build a graph where edges are bridges (HTTPRoutes between namespaces).
2. Pick the highest-degree namespace as the hub (center).
3. BFS outward — each level occupies a concentric hex ring.
4. Disconnected namespaces fill remaining ring slots.

This minimises bridge crossings for typical microservice topologies where a gateway or API namespace connects to many others.

## RBAC Matrix

The engine requires read-only access:

| API Group | Resources | Verbs |
|---|---|---|
| `""` (core) | namespaces, nodes, pods, services, configmaps, secrets, endpoints | get, list, watch |
| `apps` | deployments, replicasets, statefulsets, daemonsets | get, list, watch |
| `batch` | jobs, cronjobs | get, list, watch |
| `networking.k8s.io` | ingresses | get, list, watch |
| `gateway.networking.k8s.io` | httproutes | get, list, watch |
| `metrics.k8s.io` | pods, nodes | get, list |

The Helm chart defaults to `ClusterRole` (whole cluster). Set `rbac.clusterScoped: false` for a namespace-scoped `Role` that only watches the release namespace.

## Scaling Notes

- Tested against clusters with ~200 namespaces, ~2000 pods, ~500 services.
- Diff algorithm is O(n) per resource type per tick — suitable for clusters up to ~5000 total objects.
- WebSocket fanout is per-connection; each browser tab gets its own goroutine + channel.
- The 10 Hz tick rate is configurable via `--hz` flag on the engine.

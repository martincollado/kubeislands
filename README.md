<h1 align="center">KubeIslands</h1>

<p align="center">
  <b>See your Kubernetes cluster as a living 3D world.</b><br>
  Namespaces are islands. Deployments are structures. HTTPRoutes are bridges. Pods are drones.
</p>

<p align="center">
  <a href="https://github.com/martincollado/kubeislands/actions/workflows/ci.yml"><img src="https://github.com/martincollado/kubeislands/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/martincollado/kubeislands/releases/latest"><img src="https://img.shields.io/github/v/release/martincollado/kubeislands?include_prereleases&sort=semver" alt="Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-Apache_2.0-blue.svg" alt="License: Apache 2.0"></a>
  <a href="https://github.com/martincollado/kubeislands/pkgs/container/kubeislands-engine"><img src="https://img.shields.io/badge/ghcr.io-kubeislands--engine-blue" alt="GHCR"></a>
  <a href="https://artifacthub.io/packages/helm/kubeislands/kubeislands"><img src="https://img.shields.io/endpoint?url=https://artifacthub.io/badge/repository/kubeislands" alt="ArtifactHub"></a>
</p>

---

## What is this?

KubeIslands turns a live Kubernetes cluster into a **3D real-time strategy game view**. Every namespace becomes an island with its own skyline of workloads. Pod health, ingress traffic, deployments, services, secrets — all rendered as physical objects on a dark-ocean world.

Built for **situational awareness on large clusters** where `kubectl get pods -A` scrolls past 500 rows. KubeIslands gives you **spatial memory**: the payments namespace is "that island in the south with the red pod," not row 247.

> **Status: v0.1 — beta.** Safe against production clusters (read-only RBAC, zero writes). Breaking changes possible on 0.x minor bumps.

## Features

- **Live cluster binding** — `client-go` informers watch Nodes, Namespaces, Pods, Deployments, ReplicaSets, Services, ConfigMaps, Secrets, Jobs, CronJobs, and HTTPRoutes
- **Graph-aware layout** — hub-concentric hex algorithm places connected namespaces adjacent, minimising bridge crossings
- **Real-time diffs at 10 Hz** — Go engine broadcasts snapshot + minimal diffs over WebSocket; the browser only redraws what changed
- **Mock mode** — runs fully in-browser on seed data when no engine is reachable; great for demos and UI development
- **Read-only RBAC** — `get`, `list`, `watch` only; chart supports both `ClusterRole` and namespace-scoped `Role`
- **Distroless containers** — engine runs as UID 65532 on `gcr.io/distroless/static:nonroot`, frontend on unprivileged nginx
- **Multi-arch images** — `linux/amd64` + `linux/arm64`

## Gallery

> Screenshots coming soon — see [`docs/images/README.md`](docs/images/README.md) for capture instructions.

## Quickstart

### Helm (recommended)

```bash
helm repo add kubeislands https://martincollado.github.io/kubeislands
helm repo update
helm install kubeislands kubeislands/kubeislands \
  --namespace kubeislands --create-namespace \
  --set ingress.enabled=true \
  --set ingress.host=kubeislands.your.domain
```

Open `https://kubeislands.your.domain`.

### Port-forward (no ingress)

```bash
helm install kubeislands kubeislands/kubeislands \
  --namespace kubeislands --create-namespace
kubectl -n kubeislands port-forward svc/kubeislands-frontend 8080:8080
open http://localhost:8080
```

### Local dev — mock mode (no cluster)

```bash
pnpm install
pnpm dev
# http://localhost:5173 — 5 seed islands, no engine needed
```

### Local dev — live cluster

```bash
# Terminal 1: engine (uses current kubeconfig context)
cd engine && go run ./cmd/kube-engine

# Terminal 2: frontend
echo "VITE_ENGINE_URL=http://localhost:8081" > .env.local
pnpm dev
```

## Architecture

```
┌─────────────────────────┐   watch    ┌──────────────────────────┐
│   Kubernetes API server │ ─────────▶ │       Go engine          │
│   (your cluster)        │            │  client-go informers     │
└─────────────────────────┘            │  world state + layout    │
                                       │  WebSocket fanout 10 Hz  │
                                       └────────────┬─────────────┘
                                                    │ ws/world
                                                    │ snapshot + diffs
                                                    ▼
                                       ┌──────────────────────────┐
                                       │   Browser (React + R3F)  │
                                       │   Zustand store          │
                                       │   Three.js scene         │
                                       └──────────────────────────┘
```

Full protocol spec and component diagram: [`docs/architecture.md`](docs/architecture.md)

## Status & Roadmap

See [`ROADMAP.md`](ROADMAP.md). Key items:

- [ ] Gateway API HTTPRoute visualization (partial)
- [ ] Prometheus metric overlays per namespace
- [ ] Historical replay (24 h timeline scrubber)
- [ ] Multi-cluster view
- [ ] Keyboard-driven navigation

## Contributing

Issues and PRs welcome. Read [`CONTRIBUTING.md`](CONTRIBUTING.md) first, then look for `good first issue`.

- **Bug?** Open an issue — include cluster type (kind/EKS/GKE/etc) and reproduction steps.
- **Feature?** Open a `type/proposal` issue before coding — we align on design first.
- **Question?** Use [Discussions](https://github.com/martincollado/kubeislands/discussions).

## Security

See [`SECURITY.md`](SECURITY.md). For vulnerabilities email `info@martincollado.dev` — do not open a public issue.

## License

[Apache-2.0](LICENSE) © 2026 Martin Collado

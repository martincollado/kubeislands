# Contributing to KubeIslands

Thanks for your interest! This guide covers everything you need to submit a quality PR.

## Dev Environment Setup

**Requirements:**
- Go 1.26+
- Node.js 22+ with pnpm
- A Kubernetes cluster (kind, minikube, or real) — optional, mock mode works without one

```bash
# Clone and install frontend deps
git clone https://github.com/martincollado/kubeislands.git
cd kubeislands
pnpm install

# Run frontend in mock mode (no cluster needed)
pnpm dev
# → http://localhost:5173
```

## Running Against a Real Cluster

```bash
# Terminal 1 — engine (uses your current kubeconfig context)
cd engine
go run ./cmd/kube-engine

# Terminal 2 — frontend
echo "VITE_ENGINE_URL=http://localhost:8081" > .env.local
pnpm dev
```

For a disposable cluster: `kind create cluster --name kubeislands-dev`

## Running Tests

```bash
# Go unit tests (layout algorithm)
go test -race ./engine/...

# Frontend lint + type-check
pnpm lint
pnpm tsc -b --noEmit
```

## PR Expectations

1. **One change per PR.** Bug fix, feature, or refactor — not all three.
2. **Conventional commits** — use `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`.
3. **DCO sign-off required** — add `-s` to every commit:
   ```bash
   git commit -s -m "feat: add prometheus metric overlays"
   ```
4. **No CLA.** DCO sign-off is all we need.
5. **Tests** — add or update tests for changed behavior.
6. **Screenshots** for any UI changes.
7. **Update CHANGELOG.md** under `[Unreleased]`.

## Code Style

- Go: `gofmt -s`, `go vet`, passes `golangci-lint run`
- TypeScript: passes `pnpm lint` (ESLint + typescript-eslint)
- No new dependencies without discussion in an issue first

## Issue Labels

- `good first issue` — great starting points
- `help wanted` — maintainer asking for community help
- `type/proposal` — discuss before coding
- `area/engine`, `area/frontend`, `area/helm` — component scope

## Questions?

Open a [Discussion](https://github.com/martincollado/kubeislands/discussions) — issues are for bugs and proposals, not questions.

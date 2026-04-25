# KubeIslands Helm Chart

Deploys the KubeIslands frontend and engine into a Kubernetes cluster.

## Prerequisites

- Kubernetes 1.25+
- Helm 3.10+

## Install

```bash
helm repo add kubeislands https://martincollado.github.io/kubeislands
helm repo update
helm install kubeislands kubeislands/kubeislands \
  --namespace kubeislands --create-namespace
```

## Access

Port-forward if no ingress is configured:

```bash
kubectl -n kubeislands port-forward svc/kubeislands-frontend 8080:8080
open http://localhost:8080
```

## Configuration

| Parameter | Description | Default |
|---|---|---|
| `frontend.image.tag` | Frontend image tag | `latest` |
| `engine.image.tag` | Engine image tag | `latest` |
| `ingress.enabled` | Enable ingress | `false` |
| `ingress.host` | Ingress hostname | `kubeislands.example.com` |
| `rbac.clusterScoped` | ClusterRole (true) or Role (false) | `true` |
| `networkPolicy.enabled` | Restrict pod traffic | `false` |

Full values reference: [`values.yaml`](values.yaml)

## RBAC

By default the chart creates a `ClusterRole` so the engine can watch resources across all namespaces. To restrict to the release namespace only:

```bash
helm install kubeislands kubeislands/kubeislands \
  --set rbac.clusterScoped=false \
  --namespace kubeislands --create-namespace
```

## Source

[github.com/martincollado/kubeislands](https://github.com/martincollado/kubeislands)

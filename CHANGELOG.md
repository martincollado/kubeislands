# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] — 2026-04-25

### Added
- 3D world view with hub-concentric hex-grid namespace layout
- Go engine with `client-go` informers for Nodes, Namespaces, Pods, Deployments,
  ReplicaSets, Services, ConfigMaps, Secrets, Jobs, CronJobs, and HTTPRoutes
- ReplicaSet → Deployment UID mapping for accurate pod attribution
- Real-time WebSocket protocol: full snapshot on connect + minimal diffs at 10 Hz
- HUD: cluster name, live node count, pod health bar, event log, minimap, FPS counter
- NamespaceCard: per-namespace resource breakdown (click any island)
- Resource towers per island (pods, services, configmaps, secrets, jobs, cronjobs)
- Bridge rendering between namespaces via Gateway API HTTPRoutes
- Browser-only mock mode with seed data (no engine required)
- Helm chart with ClusterRole / Role switchable RBAC
- Multi-arch container images (`linux/amd64`, `linux/arm64`)
- Distroless engine image, unprivileged nginx frontend
- `/healthz` endpoint returns version + commit JSON

### Fixed
- `PodSucceeded` phase previously shown as pending — now treated as healthy
- Pod–Deployment link broken when pod owner was a ReplicaSet UID instead of Deployment name
- Hardcoded cluster name / node count in HUD replaced with live data from engine
- Engine Dockerfile Go version mismatch (1.22 → 1.26)

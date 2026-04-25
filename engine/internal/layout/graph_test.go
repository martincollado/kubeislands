package layout

import (
	"fmt"
	"testing"
)

func TestComputeLayout(t *testing.T) {
	ids := []string{
		"traefik", "argo", "fab-staging", "home", "monitoring-vm",
		"ceph", "cnpg", "cert-manager", "default", "external-secrets",
		"kube-node-lease", "kube-public", "kube-system", "metallb-system", "sentry",
	}
	edges := []Edge{
		{A: "traefik", B: "argo"},
		{A: "traefik", B: "fab-staging"},
		{A: "traefik", B: "home"},
		{A: "traefik", B: "monitoring-vm"},
		{A: "traefik", B: "sentry"},
	}
	placements := ComputeLayout(ids, edges)
	for _, id := range ids {
		p := placements[id]
		fmt.Printf("  %-20s = [%.2f, %.2f]\n", id, p[0], p[1])
	}
	if len(placements) != len(ids) {
		t.Fatalf("expected %d placements, got %d", len(ids), len(placements))
	}
	// All ring-1 neighbors + singletons should NOT be at (0,0)
	for _, id := range ids {
		if id == "traefik" {
			continue
		}
		p := placements[id]
		if p[0] == 0 && p[1] == 0 {
			t.Errorf("%s placed at origin (should only happen for hub)", id)
		}
	}
}

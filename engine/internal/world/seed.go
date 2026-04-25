package world

import (
	"time"

	"github.com/martincollado/kubeislands-engine/internal/proto"
)

var seedNamespaces = []proto.Namespace{
	{ID: "core",          Name: "CORE",          Center: [2]float64{0, 0},     Radius: 8, Hue: "#00FFD1", Ingress: true},
	{ID: "web",           Name: "WEB",           Center: [2]float64{20, 0},    Radius: 8, Hue: "#3EF3FF", Ingress: true},
	{ID: "data",          Name: "DATA",          Center: [2]float64{-18, 6},   Radius: 6, Hue: "#FFB800", Ingress: false},
	{ID: "payments",      Name: "PAYMENTS",      Center: [2]float64{18, 18},   Radius: 8, Hue: "#FF3355", Ingress: false},
	{ID: "observability", Name: "OBSERVABILITY", Center: [2]float64{-4, 20},   Radius: 6, Hue: "#8BE8FF", Ingress: false},
}

var seedDeployments = []proto.Deployment{
	{ID: "core-dep0",          NamespaceID: "core",          Name: "api-gateway",  Replicas: 4},
	{ID: "web-dep0",           NamespaceID: "web",           Name: "frontend",     Replicas: 5},
	{ID: "web-dep1",           NamespaceID: "web",           Name: "cdn-proxy",    Replicas: 3},
	{ID: "data-dep0",          NamespaceID: "data",          Name: "postgres",     Replicas: 3},
	{ID: "payments-dep0",      NamespaceID: "payments",      Name: "payment-svc",  Replicas: 4},
	{ID: "payments-dep1",      NamespaceID: "payments",      Name: "fraud-detect", Replicas: 3},
	{ID: "observability-dep0", NamespaceID: "observability", Name: "prometheus",   Replicas: 2},
}

var seedServices = []proto.Service{
	{ID: "core/api-gateway", Name: "api-gateway", Namespace: "core", Kind: "Service", ClusterIP: "10.0.0.1", Type: "ClusterIP", Ports: []string{"80/TCP", "443/TCP"}},
	{ID: "core/grpc-internal", Name: "grpc-internal", Namespace: "core", Kind: "Service", ClusterIP: "10.0.0.2", Type: "ClusterIP", Ports: []string{"9090/TCP"}},
	{ID: "web/frontend", Name: "frontend", Namespace: "web", Kind: "Service", ClusterIP: "10.0.1.1", Type: "LoadBalancer", Ports: []string{"80/TCP", "443/TCP"}},
	{ID: "web/cdn-proxy", Name: "cdn-proxy", Namespace: "web", Kind: "Service", ClusterIP: "10.0.1.2", Type: "ClusterIP", Ports: []string{"8080/TCP"}},
	{ID: "data/postgres", Name: "postgres", Namespace: "data", Kind: "Service", ClusterIP: "10.0.2.1", Type: "ClusterIP", Ports: []string{"5432/TCP"}},
	{ID: "payments/payment-svc", Name: "payment-svc", Namespace: "payments", Kind: "Service", ClusterIP: "10.0.3.1", Type: "ClusterIP", Ports: []string{"8080/TCP"}},
	{ID: "observability/prometheus", Name: "prometheus", Namespace: "observability", Kind: "Service", ClusterIP: "10.0.4.1", Type: "ClusterIP", Ports: []string{"9090/TCP"}},
}

var seedConfigMaps = []proto.ConfigMap{
	{ID: "core/app-config", Name: "app-config", Namespace: "core", Kind: "ConfigMap", DataKeys: []string{"LOG_LEVEL", "MAX_CONNECTIONS", "TIMEOUT_MS"}},
	{ID: "core/feature-flags", Name: "feature-flags", Namespace: "core", Kind: "ConfigMap", DataKeys: []string{"enable_dark_mode", "enable_beta_api", "maintenance_mode"}},
	{ID: "web/frontend-config", Name: "frontend-config", Namespace: "web", Kind: "ConfigMap", DataKeys: []string{"API_BASE_URL", "CDN_ORIGIN", "GA_TRACKING_ID"}},
	{ID: "web/nginx-conf", Name: "nginx-conf", Namespace: "web", Kind: "ConfigMap", DataKeys: []string{"nginx.conf"}},
	{ID: "data/postgres-init", Name: "postgres-init", Namespace: "data", Kind: "ConfigMap", DataKeys: []string{"init.sql", "schema.sql"}},
	{ID: "observability/prometheus-rules", Name: "prometheus-rules", Namespace: "observability", Kind: "ConfigMap", DataKeys: []string{"alert_rules.yml", "recording_rules.yml"}},
}

var seedBridges = []proto.Bridge{
	{A: "core", B: "web",           Traffic: 0.72, ErrorRate: 0.01},
	{A: "core", B: "data",          Traffic: 0.45, ErrorRate: 0.02},
	{A: "core", B: "payments",      Traffic: 0.60, ErrorRate: 0.03},
	{A: "web",  B: "payments",      Traffic: 0.38, ErrorRate: 0.01},
	{A: "core", B: "observability", Traffic: 0.25, ErrorRate: 0.00},
}

func seedHealth(depIdx, podIdx int) proto.Health {
	val := (depIdx*7 + podIdx*13) % 100
	if val < 85 {
		return proto.HealthReady
	}
	if val < 95 {
		return proto.HealthPending
	}
	return proto.HealthFailed
}

func buildSeedPods() []proto.Pod {
	now := time.Now().UnixMilli()
	var pods []proto.Pod
	for di, dep := range seedDeployments {
		for pi := 0; pi < dep.Replicas; pi++ {
			pods = append(pods, proto.Pod{
				ID:           dep.ID + "-pod" + itoa(pi),
				DeploymentID: dep.ID,
				NamespaceID:  dep.NamespaceID,
				Slot:         pi,
				Health:       seedHealth(di, pi),
				CreatedAt:    now - int64(di*3600+pi*300)*1000,
			})
		}
	}
	return pods
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	digits := []byte{}
	for n > 0 {
		digits = append([]byte{byte('0' + n%10)}, digits...)
		n /= 10
	}
	return string(digits)
}

// K8s watcher — connects to a real cluster and syncs world state.
// Requires KUBECONFIG or in-cluster service account.
// When no cluster is reachable, falls back gracefully (seed data only).
package k8s

import (
	"context"
	"fmt"
	"log"
	"math"
	"os"
	"path/filepath"
	"sync"
	"time"

	appsv1 "k8s.io/api/apps/v1"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/watch"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"

	"github.com/martincollado/kubeislands-engine/internal/proto"
	"github.com/martincollado/kubeislands-engine/internal/world"
)

var nsPalette = []string{
	"#00FFD1", // cyan
	"#3EF3FF", // ice blue
	"#FFB800", // amber
	"#FF3355", // red
	"#8BE8FF", // sky
	"#7C5CBF", // purple
	"#4CAF50", // green
	"#E91E8C", // magenta
	"#FF6B35", // orange
	"#00BFA5", // teal
	"#9C27B0", // violet
	"#2196F3", // blue
	"#CDDC39", // lime
	"#FF5722", // deep orange
	"#607D8B", // slate
}

func nsHue(name string) string {
	var h uint32
	for _, c := range name {
		h = h*31 + uint32(c)
	}
	return nsPalette[h%uint32(len(nsPalette))]
}

var httpRouteGVR = schema.GroupVersionResource{
	Group:    "gateway.networking.k8s.io",
	Version:  "v1",
	Resource: "httproutes",
}

// Watcher watches K8s resources and applies changes to world.State.
type Watcher struct {
	client    *kubernetes.Clientset
	dynamic   dynamic.Interface
	state     *world.State
	rsToDepID sync.Map // replicaSetUID (string) → deploymentID "ns/name" (string)
}

// New creates a Watcher. Returns nil if no cluster is reachable.
func New(state *world.State) *Watcher {
	cfg, err := loadConfig()
	if err != nil {
		log.Printf("k8s: no cluster config (%v) — running with seed data only", err)
		return nil
	}
	cs, err := kubernetes.NewForConfig(cfg)
	if err != nil {
		log.Printf("k8s: client init failed (%v) — running with seed data only", err)
		return nil
	}
	// Quick connectivity check
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if _, err = cs.CoreV1().Namespaces().List(ctx, metav1.ListOptions{Limit: 1}); err != nil {
		log.Printf("k8s: cluster unreachable (%v) — running with seed data only", err)
		return nil
	}
	log.Println("k8s: connected to cluster")
	dynClient, err := dynamic.NewForConfig(cfg)
	if err != nil {
		log.Printf("k8s: dynamic client failed: %v", err)
		// not fatal, bridges just won't work
	}
	return &Watcher{client: cs, dynamic: dynClient, state: state}
}

// Start launches informer goroutines. Blocks until ctx is cancelled.
func (w *Watcher) Start(ctx context.Context) {
	// Set cluster name from current kubeconfig context
	if name := getContextName(); name != "" {
		w.state.SetClusterName(name)
	}
	// Pre-seed RS→Deployment map before pod watch starts (avoids race on initial burst)
	w.seedReplicaSetMap(ctx)

	go w.watchNamespaces(ctx)
	go w.watchNodes(ctx)
	go w.watchPods(ctx)
	go w.watchDeployments(ctx)
	go w.watchReplicaSets(ctx)
	go w.watchServices(ctx)
	go w.watchConfigMaps(ctx)
	go w.watchSecrets(ctx)
	go w.watchJobs(ctx)
	go w.watchCronJobs(ctx)
	go w.watchHTTPRoutes(ctx)
	<-ctx.Done()
}

// seedReplicaSetMap does an initial LIST of all ReplicaSets to populate the
// rsToDepID map before any pod ADDED events arrive.
func (w *Watcher) seedReplicaSetMap(ctx context.Context) {
	rsList, err := w.client.AppsV1().ReplicaSets("").List(ctx, metav1.ListOptions{})
	if err != nil {
		log.Printf("k8s: RS seed list failed: %v", err)
		return
	}
	for _, rs := range rsList.Items {
		for _, owner := range rs.OwnerReferences {
			if owner.Kind == "Deployment" {
				depID := fmt.Sprintf("%s/%s", rs.Namespace, owner.Name)
				w.rsToDepID.Store(string(rs.UID), depID)
			}
		}
	}
	log.Printf("k8s: seeded %d RS→Deployment mappings", len(rsList.Items))
}

func (w *Watcher) watchHTTPRoutes(ctx context.Context) {
	if w.dynamic == nil {
		return
	}
	for {
		watcher, err := w.dynamic.Resource(httpRouteGVR).Namespace("").Watch(ctx, metav1.ListOptions{})
		if err != nil {
			// HTTPRoute CRD might not be installed — not an error, just skip
			log.Printf("k8s httproute watch: %v (gateway-api not installed?)", err)
			time.Sleep(30 * time.Second)
			continue
		}
		for event := range watcher.ResultChan() {
			obj, ok := event.Object.(*unstructured.Unstructured)
			if !ok {
				continue
			}
			routeNs := obj.GetNamespace()
			spec, _, _ := unstructured.NestedMap(obj.Object, "spec")
			if spec == nil {
				continue
			}

			// parentRefs → gateway namespace
			parentRefs, _, _ := unstructured.NestedSlice(obj.Object, "spec", "parentRefs")
			gatewayNs := routeNs // default: same namespace
			for _, pr := range parentRefs {
				prMap, ok := pr.(map[string]interface{})
				if !ok {
					continue
				}
				if ns, ok := prMap["namespace"].(string); ok && ns != "" {
					gatewayNs = ns
				}
			}

			// backendRefs per rule
			rules, _, _ := unstructured.NestedSlice(obj.Object, "spec", "rules")
			var totalWeight int64 = 1
			backendNs := routeNs
			for _, r := range rules {
				rMap, ok := r.(map[string]interface{})
				if !ok {
					continue
				}
				backendRefs, _, _ := unstructured.NestedSlice(rMap, "backendRefs")
				for _, br := range backendRefs {
					brMap, ok := br.(map[string]interface{})
					if !ok {
						continue
					}
					if ns, ok := brMap["namespace"].(string); ok && ns != "" {
						backendNs = ns
					}
					if bw, ok := brMap["weight"].(int64); ok {
						totalWeight += bw
					}
				}
			}

			traffic := math.Min(float64(totalWeight)/100.0, 1.0)
			if traffic < 0.1 {
				traffic = 0.35
			}

			switch event.Type {
			case watch.Added, watch.Modified:
				// Bridge: gateway → route namespace (ingress traffic)
				if gatewayNs != routeNs {
					w.state.UpsertBridge(proto.Bridge{
						A: gatewayNs, B: routeNs,
						Traffic: traffic, ErrorRate: 0.01,
					})
				}
				// Bridge: route namespace → backend namespace (cross-ns routing)
				if backendNs != routeNs {
					w.state.UpsertBridge(proto.Bridge{
						A: routeNs, B: backendNs,
						Traffic: traffic * 0.7, ErrorRate: 0.01,
					})
				}
			}
		}
		select {
		case <-ctx.Done():
			return
		default:
			time.Sleep(5 * time.Second)
		}
	}
}

func (w *Watcher) watchNamespaces(ctx context.Context) {
	for {
		watcher, err := w.client.CoreV1().Namespaces().Watch(ctx, metav1.ListOptions{})
		if err != nil {
			log.Printf("k8s ns watch error: %v", err)
			time.Sleep(5 * time.Second)
			continue
		}
		for event := range watcher.ResultChan() {
			ns, ok := event.Object.(*corev1.Namespace)
			if !ok {
				continue
			}
			switch event.Type {
			case watch.Added:
				w.state.UpsertNamespace(k8sNSToProto(ns))
			case watch.Modified:
				w.state.UpsertNamespace(k8sNSToProto(ns))
			case watch.Deleted:
				w.state.DeleteNamespace(ns.Name)
			}
		}
		select {
		case <-ctx.Done():
			return
		default:
			time.Sleep(2 * time.Second) // reconnect delay
		}
	}
}

func (w *Watcher) watchPods(ctx context.Context) {
	for {
		watcher, err := w.client.CoreV1().Pods("").Watch(ctx, metav1.ListOptions{})
		if err != nil {
			log.Printf("k8s pod watch error: %v", err)
			time.Sleep(5 * time.Second)
			continue
		}
		for event := range watcher.ResultChan() {
			pod, ok := event.Object.(*corev1.Pod)
			if !ok {
				continue
			}
			switch event.Type {
			case watch.Added, watch.Modified:
				w.state.UpsertPod(w.k8sPodToProto(pod))
			case watch.Deleted:
				w.state.DeletePod(string(pod.UID))
			}
		}
		select {
		case <-ctx.Done():
			return
		default:
			time.Sleep(2 * time.Second)
		}
	}
}

func (w *Watcher) watchDeployments(ctx context.Context) {
	for {
		watcher, err := w.client.AppsV1().Deployments("").Watch(ctx, metav1.ListOptions{})
		if err != nil {
			log.Printf("k8s deploy watch error: %v", err)
			time.Sleep(5 * time.Second)
			continue
		}
		for event := range watcher.ResultChan() {
			dep, ok := event.Object.(*appsv1.Deployment)
			if !ok {
				continue
			}
			switch event.Type {
			case watch.Added, watch.Modified:
				w.state.UpsertDeployment(k8sDepToProto(dep))
			case watch.Deleted:
				w.state.DeleteDeployment(fmt.Sprintf("%s/%s", dep.Namespace, dep.Name))
			}
		}
		select {
		case <-ctx.Done():
			return
		default:
			time.Sleep(2 * time.Second)
		}
	}
}

func k8sNSToProto(ns *corev1.Namespace) proto.Namespace {
	return proto.Namespace{
		ID:      ns.Name,
		Name:    ns.Name,
		Center:  [2]float64{0, 0}, // layout engine assigns later
		Radius:  6,
		Hue:     nsHue(ns.Name),
		Ingress: false,
	}
}

func (w *Watcher) k8sPodToProto(pod *corev1.Pod) proto.Pod {
	health := proto.HealthPending
	switch pod.Status.Phase {
	case corev1.PodRunning, corev1.PodSucceeded:
		health = proto.HealthReady
	case corev1.PodFailed, corev1.PodUnknown:
		health = proto.HealthFailed
	}
	// CrashLoopBackOff check overrides phase
	for _, cs := range pod.Status.ContainerStatuses {
		if cs.State.Waiting != nil && cs.State.Waiting.Reason == "CrashLoopBackOff" {
			health = proto.HealthFailed
		}
	}
	// Resolve pod → deployment via ReplicaSet owner reference map
	depID := ""
	for _, ref := range pod.OwnerReferences {
		if ref.Kind == "ReplicaSet" {
			rsUID := string(ref.UID)
			if v, ok := w.rsToDepID.Load(rsUID); ok {
				depID = v.(string)
			} else {
				depID = rsUID // fallback: RS UID until map is populated
			}
		}
	}
	return proto.Pod{
		ID:           string(pod.UID),
		DeploymentID: depID,
		NamespaceID:  pod.Namespace,
		Slot:         0,
		Health:       health,
		CreatedAt:    pod.CreationTimestamp.UnixMilli(),
	}
}

func k8sDepToProto(dep *appsv1.Deployment) proto.Deployment {
	replicas := 1
	if dep.Spec.Replicas != nil {
		replicas = int(*dep.Spec.Replicas)
	}
	return proto.Deployment{
		ID:          fmt.Sprintf("%s/%s", dep.Namespace, dep.Name),
		NamespaceID: dep.Namespace,
		Name:        dep.Name,
		Replicas:    replicas,
	}
}

func (w *Watcher) watchServices(ctx context.Context) {
	for {
		watcher, err := w.client.CoreV1().Services("").Watch(ctx, metav1.ListOptions{})
		if err != nil {
			log.Printf("k8s svc watch error: %v", err)
			time.Sleep(5 * time.Second)
			continue
		}
		for event := range watcher.ResultChan() {
			svc, ok := event.Object.(*corev1.Service)
			if !ok {
				continue
			}
			switch event.Type {
			case watch.Added, watch.Modified:
				w.state.UpsertService(k8sSvcToProto(svc))
			case watch.Deleted:
				w.state.DeleteService(fmt.Sprintf("%s/%s", svc.Namespace, svc.Name))
			}
		}
		select {
		case <-ctx.Done():
			return
		default:
			time.Sleep(2 * time.Second)
		}
	}
}

func (w *Watcher) watchConfigMaps(ctx context.Context) {
	for {
		watcher, err := w.client.CoreV1().ConfigMaps("").Watch(ctx, metav1.ListOptions{})
		if err != nil {
			log.Printf("k8s cm watch error: %v", err)
			time.Sleep(5 * time.Second)
			continue
		}
		for event := range watcher.ResultChan() {
			cm, ok := event.Object.(*corev1.ConfigMap)
			if !ok {
				continue
			}
			switch event.Type {
			case watch.Added, watch.Modified:
				w.state.UpsertConfigMap(k8sCMToProto(cm))
			case watch.Deleted:
				w.state.DeleteConfigMap(fmt.Sprintf("%s/%s", cm.Namespace, cm.Name))
			}
		}
		select {
		case <-ctx.Done():
			return
		default:
			time.Sleep(2 * time.Second)
		}
	}
}

func (w *Watcher) watchSecrets(ctx context.Context) {
	for {
		watcher, err := w.client.CoreV1().Secrets("").Watch(ctx, metav1.ListOptions{})
		if err != nil {
			log.Printf("k8s secret watch error: %v", err)
			time.Sleep(5 * time.Second)
			continue
		}
		for event := range watcher.ResultChan() {
			sec, ok := event.Object.(*corev1.Secret)
			if !ok {
				continue
			}
			// Skip service account token secrets — too noisy and contain credentials
			if sec.Type == corev1.SecretTypeServiceAccountToken {
				continue
			}
			id := fmt.Sprintf("%s/%s", sec.Namespace, sec.Name)
			switch event.Type {
			case watch.Added, watch.Modified:
				w.state.UpsertSecret(k8sSecretToProto(sec))
			case watch.Deleted:
				w.state.DeleteSecret(id)
			}
		}
		select {
		case <-ctx.Done():
			return
		default:
			time.Sleep(2 * time.Second)
		}
	}
}

func (w *Watcher) watchJobs(ctx context.Context) {
	for {
		watcher, err := w.client.BatchV1().Jobs("").Watch(ctx, metav1.ListOptions{})
		if err != nil {
			log.Printf("k8s job watch error: %v", err)
			time.Sleep(5 * time.Second)
			continue
		}
		for event := range watcher.ResultChan() {
			job, ok := event.Object.(*batchv1.Job)
			if !ok {
				continue
			}
			switch event.Type {
			case watch.Added, watch.Modified:
				w.state.UpsertJob(k8sJobToProto(job))
			case watch.Deleted:
				w.state.DeleteJob(fmt.Sprintf("%s/%s", job.Namespace, job.Name))
			}
		}
		select {
		case <-ctx.Done():
			return
		default:
			time.Sleep(2 * time.Second)
		}
	}
}

func (w *Watcher) watchCronJobs(ctx context.Context) {
	for {
		watcher, err := w.client.BatchV1().CronJobs("").Watch(ctx, metav1.ListOptions{})
		if err != nil {
			log.Printf("k8s cronjob watch error: %v", err)
			time.Sleep(5 * time.Second)
			continue
		}
		for event := range watcher.ResultChan() {
			cj, ok := event.Object.(*batchv1.CronJob)
			if !ok {
				continue
			}
			switch event.Type {
			case watch.Added, watch.Modified:
				w.state.UpsertCronJob(k8sCronJobToProto(cj))
			case watch.Deleted:
				w.state.DeleteCronJob(fmt.Sprintf("%s/%s", cj.Namespace, cj.Name))
			}
		}
		select {
		case <-ctx.Done():
			return
		default:
			time.Sleep(2 * time.Second)
		}
	}
}

func k8sSvcToProto(svc *corev1.Service) proto.Service {
	ports := make([]string, 0, len(svc.Spec.Ports))
	for _, p := range svc.Spec.Ports {
		ports = append(ports, fmt.Sprintf("%d/%s", p.Port, string(p.Protocol)))
	}
	return proto.Service{
		ID:        fmt.Sprintf("%s/%s", svc.Namespace, svc.Name),
		Name:      svc.Name,
		Namespace: svc.Namespace,
		Kind:      "Service",
		ClusterIP: svc.Spec.ClusterIP,
		Type:      string(svc.Spec.Type),
		Ports:     ports,
	}
}

func k8sCMToProto(cm *corev1.ConfigMap) proto.ConfigMap {
	keys := make([]string, 0, len(cm.Data))
	for k := range cm.Data {
		keys = append(keys, k)
	}
	return proto.ConfigMap{
		ID:        fmt.Sprintf("%s/%s", cm.Namespace, cm.Name),
		Name:      cm.Name,
		Namespace: cm.Namespace,
		Kind:      "ConfigMap",
		DataKeys:  keys,
	}
}

func k8sSecretToProto(sec *corev1.Secret) proto.Secret {
	return proto.Secret{
		ID:        fmt.Sprintf("%s/%s", sec.Namespace, sec.Name),
		Name:      sec.Name,
		Namespace: sec.Namespace,
		Kind:      "Secret",
		Type:      string(sec.Type),
	}
}

func k8sJobToProto(job *batchv1.Job) proto.Job {
	status := "running"
	for _, cond := range job.Status.Conditions {
		if cond.Type == batchv1.JobComplete && cond.Status == corev1.ConditionTrue {
			status = "succeeded"
			break
		}
		if cond.Type == batchv1.JobFailed && cond.Status == corev1.ConditionTrue {
			status = "failed"
			break
		}
	}
	return proto.Job{
		ID:          fmt.Sprintf("%s/%s", job.Namespace, job.Name),
		Name:        job.Name,
		Namespace:   job.Namespace,
		Kind:        "Job",
		Status:      status,
		Completions: int(job.Status.Succeeded),
	}
}

func k8sCronJobToProto(cj *batchv1.CronJob) proto.CronJob {
	var lastRun int64
	if cj.Status.LastScheduleTime != nil {
		lastRun = cj.Status.LastScheduleTime.UnixMilli()
	}
	return proto.CronJob{
		ID:        fmt.Sprintf("%s/%s", cj.Namespace, cj.Name),
		Name:      cj.Name,
		Namespace: cj.Namespace,
		Kind:      "CronJob",
		Schedule:  cj.Spec.Schedule,
		LastRun:   lastRun,
	}
}

func (w *Watcher) watchReplicaSets(ctx context.Context) {
	for {
		watcher, err := w.client.AppsV1().ReplicaSets("").Watch(ctx, metav1.ListOptions{})
		if err != nil {
			log.Printf("k8s rs watch error: %v", err)
			time.Sleep(5 * time.Second)
			continue
		}
		for event := range watcher.ResultChan() {
			rs, ok := event.Object.(*appsv1.ReplicaSet)
			if !ok {
				continue
			}
			for _, owner := range rs.OwnerReferences {
				if owner.Kind == "Deployment" {
					depID := fmt.Sprintf("%s/%s", rs.Namespace, owner.Name)
					w.rsToDepID.Store(string(rs.UID), depID)
				}
			}
		}
		select {
		case <-ctx.Done():
			return
		default:
			time.Sleep(2 * time.Second)
		}
	}
}

func (w *Watcher) watchNodes(ctx context.Context) {
	for {
		watcher, err := w.client.CoreV1().Nodes().Watch(ctx, metav1.ListOptions{})
		if err != nil {
			log.Printf("k8s node watch error: %v", err)
			time.Sleep(5 * time.Second)
			continue
		}
		for event := range watcher.ResultChan() {
			node, ok := event.Object.(*corev1.Node)
			if !ok {
				continue
			}
			switch event.Type {
			case watch.Added, watch.Modified:
				w.state.UpsertNode(k8sNodeToProto(node))
			case watch.Deleted:
				w.state.DeleteNode(node.Name)
			}
		}
		select {
		case <-ctx.Done():
			return
		default:
			time.Sleep(2 * time.Second)
		}
	}
}

func k8sNodeToProto(node *corev1.Node) proto.Node {
	ready := false
	for _, cond := range node.Status.Conditions {
		if cond.Type == corev1.NodeReady && cond.Status == corev1.ConditionTrue {
			ready = true
		}
	}
	var roles []string
	for label := range node.Labels {
		switch label {
		case "node-role.kubernetes.io/master", "node-role.kubernetes.io/control-plane":
			roles = append(roles, "master")
		case "node-role.kubernetes.io/worker":
			roles = append(roles, "worker")
		}
	}
	return proto.Node{Name: node.Name, Ready: ready, Roles: roles}
}

func loadConfig() (*rest.Config, error) {
	// Try in-cluster first
	if cfg, err := rest.InClusterConfig(); err == nil {
		return cfg, nil
	}
	// Fall back to KUBECONFIG
	kc := os.Getenv("KUBECONFIG")
	if kc == "" {
		home, _ := os.UserHomeDir()
		kc = filepath.Join(home, ".kube", "config")
	}
	return clientcmd.BuildConfigFromFlags("", kc)
}

func getContextName() string {
	kc := os.Getenv("KUBECONFIG")
	if kc == "" {
		home, _ := os.UserHomeDir()
		kc = filepath.Join(home, ".kube", "config")
	}
	rawConfig, err := clientcmd.LoadFromFile(kc)
	if err != nil {
		return ""
	}
	return rawConfig.CurrentContext
}

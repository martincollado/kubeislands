// World state — authoritative in-memory game state.
// All mutations are protected by mu; callers must not hold mu while
// calling Snapshot() or Diff() to avoid cross-deadlock.
package world

import (
	"fmt"
	"log"
	"math"
	"math/rand"
	"sort"
	"sync"
	"time"

	"github.com/martincollado/kubeislands-engine/internal/layout"
	"github.com/martincollado/kubeislands-engine/internal/proto"
)

// State is the authoritative world model.
type State struct {
	mu sync.RWMutex

	namespaces  map[string]proto.Namespace
	nsOrder     []string // insertion order for stable serialization
	deployments map[string]proto.Deployment
	pods        map[string]proto.Pod
	bridges     map[string]proto.Bridge
	bridgeKeys  []string
	services    map[string]proto.Service
	configMaps  map[string]proto.ConfigMap
	secrets     map[string]proto.Secret
	jobs        map[string]proto.Job
	cronJobs    map[string]proto.CronJob
	nodes       map[string]proto.Node
	clusterName string

	nextNsSlot int
	nextEID    int
	dynCounter int

	// Debounced layout recompute (graph-aware hex placement).
	layoutTimer *time.Timer

	// Snapshot at last diff — used by DiffSince
	prev *proto.WorldState

	// Events queued since last tick
	eventQ []proto.ClusterEvent

	// Timers (seconds)
	tEvent     float64
	tPod       float64
	tDelete    float64
	tBridge    float64
	tNsSpawn   float64
	tNsDespawn float64
}

// New builds a State from seed data.
func New() *State {
	s := &State{
		namespaces:  make(map[string]proto.Namespace),
		deployments: make(map[string]proto.Deployment),
		pods:        make(map[string]proto.Pod),
		bridges:     make(map[string]proto.Bridge),
		services:    make(map[string]proto.Service),
		configMaps:  make(map[string]proto.ConfigMap),
		secrets:     make(map[string]proto.Secret),
		jobs:        make(map[string]proto.Job),
		cronJobs:    make(map[string]proto.CronJob),
		nodes:       make(map[string]proto.Node),
		nextNsSlot:  len(seedNamespaces),
		nextEID:     100,
	}
	for _, ns := range seedNamespaces {
		s.namespaces[ns.ID] = ns
		s.nsOrder = append(s.nsOrder, ns.ID)
	}
	for _, dep := range seedDeployments {
		s.deployments[dep.ID] = dep
	}
	for _, pod := range buildSeedPods() {
		s.pods[pod.ID] = pod
	}
	for _, br := range seedBridges {
		key := brKey(br.A, br.B)
		s.bridges[key] = br
		s.bridgeKeys = append(s.bridgeKeys, key)
	}
	for _, svc := range seedServices {
		s.services[svc.ID] = svc
	}
	for _, cm := range seedConfigMaps {
		s.configMaps[cm.ID] = cm
	}
	s.resetTimers()
	s.prev = s.snapshot()
	return s
}

// ClearSeed removes all seed namespaces and their associated resources.
// Call this once when a real K8s cluster is connected, so live data takes over.
func (s *State) ClearSeed() {
	s.mu.Lock()
	defer s.mu.Unlock()
	seedIDs := map[string]bool{"core": true, "web": true, "data": true, "payments": true, "observability": true}
	for id := range seedIDs {
		delete(s.namespaces, id)
	}
	newOrder := s.nsOrder[:0]
	for _, id := range s.nsOrder {
		if !seedIDs[id] {
			newOrder = append(newOrder, id)
		}
	}
	s.nsOrder = newOrder
	for id, dep := range s.deployments {
		if seedIDs[dep.NamespaceID] {
			delete(s.deployments, id)
		}
	}
	for id, pod := range s.pods {
		if seedIDs[pod.NamespaceID] {
			delete(s.pods, id)
		}
	}
	for key, br := range s.bridges {
		if seedIDs[br.A] || seedIDs[br.B] {
			delete(s.bridges, key)
		}
	}
	// Rebuild bridgeKeys
	s.bridgeKeys = s.bridgeKeys[:0]
	for k := range s.bridges {
		s.bridgeKeys = append(s.bridgeKeys, k)
	}
	for id, svc := range s.services {
		if seedIDs[svc.Namespace] {
			delete(s.services, id)
		}
	}
	for id, cm := range s.configMaps {
		if seedIDs[cm.Namespace] {
			delete(s.configMaps, id)
		}
	}
	log.Println("world: seed data cleared — using live cluster state")
}

// ScheduleRelayout debounces a graph-aware layout recompute. Safe to call
// while holding s.mu (time.AfterFunc is non-blocking; the callback acquires
// the lock itself when it fires).
func (s *State) ScheduleRelayout() {
	if s.layoutTimer != nil {
		s.layoutTimer.Stop()
	}
	s.layoutTimer = time.AfterFunc(2*time.Second, s.RecalculateLayout)
}

// RecalculateLayout runs the hub-concentric hex layout over current
// namespaces + bridges and updates every ns.Center. The diff pipeline picks
// up Center changes automatically and broadcasts them to the frontend.
func (s *State) RecalculateLayout() {
	s.mu.Lock()
	defer s.mu.Unlock()

	ids := make([]string, 0, len(s.namespaces))
	for id := range s.namespaces {
		ids = append(ids, id)
	}
	sort.Strings(ids)

	edges := make([]layout.Edge, 0, len(s.bridges))
	for _, br := range s.bridges {
		edges = append(edges, layout.Edge{A: br.A, B: br.B})
	}

	placements := layout.ComputeLayout(ids, edges)

	moved := 0
	for id, c := range placements {
		ns, ok := s.namespaces[id]
		if !ok {
			continue
		}
		if ns.Center != c {
			ns.Center = c
			s.namespaces[id] = ns
			moved++
		}
	}
	if moved > 0 {
		log.Printf("layout: recalculated — %d/%d namespaces repositioned (%d bridges)",
			moved, len(ids), len(s.bridges))
	}
}

func (s *State) resetTimers() {
	s.tEvent = 1.2 + rand.Float64()*1.6
	s.tPod = 5 + rand.Float64()*4
	s.tDelete = 8 + rand.Float64()*6
	s.tBridge = 12 + rand.Float64()*6
	s.tNsSpawn = 30 + rand.Float64()*20
	s.tNsDespawn = 60 + rand.Float64()*30
}

// Tick advances the simulation by dt seconds.
// Returns any events that were emitted this tick.
func (s *State) Tick(dt float64) []proto.ClusterEvent {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.tEvent -= dt
	s.tPod -= dt
	s.tDelete -= dt
	s.tBridge -= dt
	s.tNsSpawn -= dt
	s.tNsDespawn -= dt

	if s.tEvent <= 0 {
		s.emitMockEvent(proto.EventVerb(""))
		s.tEvent = 1.2 + rand.Float64()*1.6
	}
	if s.tPod <= 0 {
		if rand.Float64() < 0.3 {
			s.createRandomPod()
		}
		s.tPod = 5 + rand.Float64()*4
	}
	if s.tDelete <= 0 {
		if rand.Float64() < 0.15 && len(s.pods) > 10 {
			s.deleteRandomPod()
		}
		s.tDelete = 8 + rand.Float64()*6
	}
	if s.tBridge <= 0 {
		if rand.Float64() < 0.1 && len(s.bridges) > 0 {
			s.spikeBridge()
		}
		s.tBridge = 12 + rand.Float64()*6
	}
	if s.tNsSpawn <= 0 {
		if s.activeNsCount() < 9 {
			s.spawnDynNs()
		}
		s.tNsSpawn = 35 + rand.Float64()*25
	}
	if s.tNsDespawn <= 0 {
		s.despawnDynNs()
		s.tNsDespawn = 45 + rand.Float64()*30
	}

	// Drift bridge traffic
	for key, br := range s.bridges {
		br.Traffic = clamp(br.Traffic+rand.Float64()*0.04-0.02, 0.05, 0.99)
		s.bridges[key] = br
	}

	evts := s.eventQ
	s.eventQ = nil
	return evts
}

// Snapshot returns a deep copy of current world state.
func (s *State) Snapshot() proto.WorldState {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return *s.snapshot()
}

// DiffSince computes diff ops since the last call to DiffSince.
// Should be called once per tick after Tick().
func (s *State) DiffSince() []proto.Op {
	s.mu.Lock()
	defer s.mu.Unlock()
	cur := s.snapshot()
	ops := diff(s.prev, cur)
	s.prev = cur
	return ops
}

// ── internal helpers ────────────────────────────────────────────────────────

func (s *State) snapshot() *proto.WorldState {
	ws := &proto.WorldState{}
	for _, id := range s.nsOrder {
		if ns, ok := s.namespaces[id]; ok {
			ws.Namespaces = append(ws.Namespaces, ns)
		}
	}
	for _, dep := range s.deployments {
		ws.Deployments = append(ws.Deployments, dep)
	}
	for _, pod := range s.pods {
		ws.Pods = append(ws.Pods, pod)
	}
	for _, key := range s.bridgeKeys {
		if br, ok := s.bridges[key]; ok {
			ws.Bridges = append(ws.Bridges, br)
		}
	}
	for _, svc := range s.services {
		ws.Services = append(ws.Services, svc)
	}
	for _, cm := range s.configMaps {
		ws.ConfigMaps = append(ws.ConfigMaps, cm)
	}
	for _, sec := range s.secrets {
		ws.Secrets = append(ws.Secrets, sec)
	}
	for _, job := range s.jobs {
		ws.Jobs = append(ws.Jobs, job)
	}
	for _, cj := range s.cronJobs {
		ws.CronJobs = append(ws.CronJobs, cj)
	}
	for _, node := range s.nodes {
		ws.Nodes = append(ws.Nodes, node)
	}
	ws.ClusterName = s.clusterName
	return ws
}

func (s *State) nextEventID() string {
	id := fmt.Sprintf("e%d", s.nextEID)
	s.nextEID++
	return id
}

func (s *State) pushEvent(verb proto.EventVerb, ns, msg string) {
	s.eventQ = append(s.eventQ, proto.ClusterEvent{
		ID:        s.nextEventID(),
		T:         time.Now().UnixMilli(),
		Verb:      verb,
		Namespace: ns,
		Message:   msg,
	})
}

var verbWeights = []struct {
	v proto.EventVerb
	w int
}{
	{proto.VerbAdded, 35},
	{proto.VerbModified, 40},
	{proto.VerbDeleted, 10},
	{proto.VerbWarn, 10},
	{proto.VerbError, 5},
}

var mockMessages = map[proto.EventVerb][]func(ns string) string{
	proto.VerbAdded: {
		func(ns string) string { return "pod " + ns + "-" + randUID() + " scheduled" },
		func(ns string) string { return "svc " + ns + "-api endpoints updated" },
		func(ns string) string { return "configmap " + ns + "-config-v" + itoa(1+rand.Intn(9)) + " applied" },
	},
	proto.VerbModified: {
		func(ns string) string {
			return fmt.Sprintf("deployment %s scaled %d → %d", ns, 2+rand.Intn(3), 3+rand.Intn(4))
		},
		func(ns string) string { return "hpa " + ns + "-web adjusted replicas" },
		func(ns string) string { return "pod " + ns + "-" + randUID() + " restarted (cpu throttled)" },
	},
	proto.VerbDeleted: {
		func(ns string) string { return "pod " + ns + "-" + randUID() + " terminated (complete)" },
		func(ns string) string { return "job " + ns + "-batch-" + randUID() + " finished" },
	},
	proto.VerbWarn: {
		func(_ string) string { return fmt.Sprintf("node-%d memory 87%% threshold", 1+rand.Intn(8)) },
		func(ns string) string { return "pod " + ns + "-" + randUID() + " restart count 3" },
	},
	proto.VerbError: {
		func(ns string) string { return "pod " + ns + "-" + randUID() + " CrashLoopBackOff" },
		func(ns string) string { return "readiness probe failed " + ns + "-" + randUID() },
		func(ns string) string { return "OOMKilled " + ns + "-" + randUID() },
	},
}

func pickVerb() proto.EventVerb {
	total := 0
	for _, vw := range verbWeights {
		total += vw.w
	}
	r := rand.Intn(total)
	for _, vw := range verbWeights {
		r -= vw.w
		if r < 0 {
			return vw.v
		}
	}
	return proto.VerbAdded
}

func (s *State) emitMockEvent(verb proto.EventVerb) {
	if len(s.nsOrder) == 0 {
		return
	}
	nsID := s.nsOrder[rand.Intn(len(s.nsOrder))]
	if verb == "" {
		verb = pickVerb()
	}
	msgs := mockMessages[verb]
	msg := msgs[rand.Intn(len(msgs))](nsID)
	s.pushEvent(verb, nsID, msg)
}

func (s *State) createRandomPod() {
	deps := make([]proto.Deployment, 0, len(s.deployments))
	for _, d := range s.deployments {
		deps = append(deps, d)
	}
	if len(deps) == 0 {
		return
	}
	dep := deps[rand.Intn(len(deps))]
	slot := 0
	for _, p := range s.pods {
		if p.DeploymentID == dep.ID && p.Slot >= slot {
			slot = p.Slot + 1
		}
	}
	id := dep.ID + "-pod" + randUID()
	pod := proto.Pod{
		ID: id, DeploymentID: dep.ID,
		NamespaceID: dep.NamespaceID,
		Slot:        slot,
		Health:      proto.HealthPending,
		CreatedAt:   time.Now().UnixMilli(),
	}
	s.pods[id] = pod
}

func (s *State) deleteRandomPod() {
	ids := make([]string, 0, len(s.pods))
	for id := range s.pods {
		ids = append(ids, id)
	}
	victim := ids[rand.Intn(len(ids))]
	delete(s.pods, victim)
}

func (s *State) spikeBridge() {
	if len(s.bridgeKeys) == 0 {
		return
	}
	key := s.bridgeKeys[rand.Intn(len(s.bridgeKeys))]
	br := s.bridges[key]
	br.ErrorRate = 0.08
	s.bridges[key] = br
	// Reset after 4s in a goroutine — safe since bridge updates are idempotent
	go func() {
		time.Sleep(4 * time.Second)
		s.mu.Lock()
		if b, ok := s.bridges[key]; ok {
			b.ErrorRate = 0.01
			s.bridges[key] = b
		}
		s.mu.Unlock()
	}()
}

var nsTemplates = []struct {
	name    string
	hue     string
	ingress bool
}{
	{"STAGING", "#3EF3FF", false},
	{"CACHE", "#FFB800", false},
	{"MONITORING", "#8BE8FF", false},
	{"WORKERS", "#00FFD1", false},
	{"BATCH", "#FFB800", false},
	{"ML-SERVING", "#8BE8FF", true},
	{"SEARCH", "#3EF3FF", false},
	{"AUTH", "#FF3355", false},
}

func (s *State) activeNsCount() int {
	return len(s.nsOrder)
}

func (s *State) spawnDynNs() {
	tpl := nsTemplates[s.dynCounter%len(nsTemplates)]
	s.dynCounter++
	id := fmt.Sprintf("dyn-%s-%d", lowercase(tpl.name), s.dynCounter)
	x, z := layout.SlotToCenter(s.nextNsSlot)
	s.nextNsSlot++

	ns := proto.Namespace{ID: id, Name: tpl.name, Center: [2]float64{x, z}, Radius: 6, Hue: tpl.hue, Ingress: tpl.ingress}
	s.namespaces[id] = ns
	s.nsOrder = append(s.nsOrder, id)

	// Seed one deployment + pods
	depID := id + "-dep0"
	replicas := 2 + rand.Intn(3)
	s.deployments[depID] = proto.Deployment{ID: depID, NamespaceID: id, Name: lowercase(tpl.name) + "-svc", Replicas: replicas}
	for i := 0; i < replicas; i++ {
		podID := depID + "-pod" + itoa(i)
		h := proto.HealthReady
		if i == 0 {
			h = proto.HealthPending
		}
		s.pods[podID] = proto.Pod{ID: podID, DeploymentID: depID, NamespaceID: id, Slot: i, Health: h, CreatedAt: time.Now().UnixMilli()}
	}

	// Auto-bridge to 1-2 nearest namespaces
	type ndist struct {
		ns proto.Namespace
		d  float64
	}
	var dists []ndist
	for _, existing := range s.namespaces {
		if existing.ID == id {
			continue
		}
		dx := existing.Center[0] - x
		dz := existing.Center[1] - z
		dists = append(dists, ndist{existing, math.Hypot(dx, dz)})
	}
	// simple partial sort for top 2
	for i := 0; i < len(dists)-1; i++ {
		for j := i + 1; j < len(dists); j++ {
			if dists[j].d < dists[i].d {
				dists[i], dists[j] = dists[j], dists[i]
			}
		}
	}
	count := 1
	if rand.Float64() < 0.5 {
		count = 2
	}
	for i := 0; i < count && i < len(dists); i++ {
		key := brKey(dists[i].ns.ID, id)
		s.bridges[key] = proto.Bridge{
			A:         dists[i].ns.ID,
			B:         id,
			Traffic:   0.2 + rand.Float64()*0.5,
			ErrorRate: 0.01,
		}
		s.bridgeKeys = append(s.bridgeKeys, key)
	}

	s.pushEvent(proto.VerbAdded, id, "namespace "+tpl.name+" provisioned")
}

func (s *State) despawnDynNs() {
	var dynIDs []string
	for _, id := range s.nsOrder {
		if len(id) > 4 && id[:4] == "dyn-" {
			dynIDs = append(dynIDs, id)
		}
	}
	if len(dynIDs) == 0 {
		return
	}
	id := dynIDs[rand.Intn(len(dynIDs))]
	ns := s.namespaces[id]
	s.pushEvent(proto.VerbDeleted, id, "namespace "+ns.Name+" decommissioned")

	// Remove from state
	delete(s.namespaces, id)
	newOrder := s.nsOrder[:0]
	for _, oid := range s.nsOrder {
		if oid != id {
			newOrder = append(newOrder, oid)
		}
	}
	s.nsOrder = newOrder

	// Remove deployments + pods belonging to this ns
	for depID, dep := range s.deployments {
		if dep.NamespaceID == id {
			delete(s.deployments, depID)
		}
	}
	for podID, pod := range s.pods {
		if pod.NamespaceID == id {
			delete(s.pods, podID)
		}
	}
	for svcID, svc := range s.services {
		if svc.Namespace == id {
			delete(s.services, svcID)
		}
	}
	for cmID, cm := range s.configMaps {
		if cm.Namespace == id {
			delete(s.configMaps, cmID)
		}
	}
	for secID, sec := range s.secrets {
		if sec.Namespace == id {
			delete(s.secrets, secID)
		}
	}
	for jobID, job := range s.jobs {
		if job.Namespace == id {
			delete(s.jobs, jobID)
		}
	}
	for cjID, cj := range s.cronJobs {
		if cj.Namespace == id {
			delete(s.cronJobs, cjID)
		}
	}

	// Remove bridges
	newKeys := s.bridgeKeys[:0]
	for _, key := range s.bridgeKeys {
		br := s.bridges[key]
		if br.A == id || br.B == id {
			delete(s.bridges, key)
		} else {
			newKeys = append(newKeys, key)
		}
	}
	s.bridgeKeys = newKeys
}

func brKey(a, b string) string {
	if a < b {
		return a + ":" + b
	}
	return b + ":" + a
}

func randUID() string {
	const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, 5)
	for i := range b {
		b[i] = chars[rand.Intn(len(chars))]
	}
	return string(b)
}

func lowercase(s string) string {
	b := make([]byte, len(s))
	for i, c := range s {
		if c >= 'A' && c <= 'Z' {
			b[i] = byte(c + 32)
		} else {
			b[i] = byte(c)
		}
	}
	return string(b)
}

func clamp(v, lo, hi float64) float64 {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

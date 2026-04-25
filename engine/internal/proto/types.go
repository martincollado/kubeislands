// Wire types — mirror web/src/data/seed.ts and web/src/state/store.ts
package proto

// Health of a pod
type Health string

const (
	HealthReady   Health = "ready"
	HealthPending Health = "pending"
	HealthFailed  Health = "failed"
)

// Namespace is one island in the world
type Namespace struct {
	ID      string   `json:"id"`
	Name    string   `json:"name"`
	Center  [2]float64 `json:"center"` // [x, z]
	Radius  int      `json:"radius"`  // 6 or 8
	Hue     string   `json:"hue"`
	Ingress bool     `json:"ingress"`
}

// Deployment is a set of replicas inside a namespace
type Deployment struct {
	ID          string `json:"id"`
	NamespaceID string `json:"namespaceId"`
	Name        string `json:"name"`
	Replicas    int    `json:"replicas"`
}

// Pod is one running workload instance
type Pod struct {
	ID           string `json:"id"`
	DeploymentID string `json:"deploymentId"`
	NamespaceID  string `json:"namespaceId"`
	Slot         int    `json:"slot"`
	Health       Health `json:"health"`
	CreatedAt    int64  `json:"createdAt"` // ms since unix epoch
}

// Bridge connects two namespaces
type Bridge struct {
	A         string  `json:"a"`
	B         string  `json:"b"`
	Traffic   float64 `json:"traffic"`   // 0..1
	ErrorRate float64 `json:"errorRate"` // 0..1
}

// Service is a K8s Service resource
type Service struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	Namespace string   `json:"namespace"`
	Kind      string   `json:"kind"`
	ClusterIP string   `json:"clusterIP"`
	Type      string   `json:"type"`
	Ports     []string `json:"ports"`
}

// ConfigMap is a K8s ConfigMap resource
type ConfigMap struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	Namespace string   `json:"namespace"`
	Kind      string   `json:"kind"`
	DataKeys  []string `json:"dataKeys"`
}

// Secret is a K8s Secret resource (service-account-token secrets are skipped)
type Secret struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	Kind      string `json:"kind"`
	Type      string `json:"type"`
}

// Job is a K8s batch/v1 Job resource
type Job struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Namespace   string `json:"namespace"`
	Kind        string `json:"kind"`
	Status      string `json:"status"`      // "running" | "succeeded" | "failed"
	Completions int    `json:"completions"` // succeeded pod count
}

// CronJob is a K8s batch/v1 CronJob resource
type CronJob struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	Kind      string `json:"kind"`
	Schedule  string `json:"schedule"`
	LastRun   int64  `json:"lastRun"` // unix ms; 0 if never run
}

// Node represents a Kubernetes node
type Node struct {
	Name  string   `json:"name"`
	Ready bool     `json:"ready"`
	Roles []string `json:"roles,omitempty"`
}

// EventVerb is the type of a cluster event
type EventVerb string

const (
	VerbAdded    EventVerb = "ADDED"
	VerbModified EventVerb = "MODIFIED"
	VerbDeleted  EventVerb = "DELETED"
	VerbWarn     EventVerb = "WARN"
	VerbError    EventVerb = "ERROR"
)

// ClusterEvent is a log entry broadcast to the HUD
type ClusterEvent struct {
	ID        string    `json:"id"`
	T         int64     `json:"t"`
	Verb      EventVerb `json:"verb"`
	Namespace string    `json:"namespace"`
	Target    string    `json:"target,omitempty"`
	Message   string    `json:"message"`
}

// WorldState is the full snapshot of the world
type WorldState struct {
	Namespaces  []Namespace  `json:"namespaces"`
	Deployments []Deployment `json:"deployments"`
	Pods        []Pod        `json:"pods"`
	Bridges     []Bridge     `json:"bridges"`
	Services    []Service    `json:"services"`
	ConfigMaps  []ConfigMap  `json:"configMaps"`
	Secrets     []Secret     `json:"secrets"`
	Jobs        []Job        `json:"jobs"`
	CronJobs    []CronJob    `json:"cronJobs"`
	Nodes       []Node       `json:"nodes"`
	ClusterName string       `json:"clusterName,omitempty"`
}

// Op kinds
type OpKind string

const (
	OpAdd    OpKind = "add"
	OpRemove OpKind = "remove"
	OpPatch  OpKind = "patch"
)

// Op is one atomic diff operation
type Op struct {
	Op    OpKind `json:"op"`
	Path  string `json:"path"`
	Value any    `json:"value,omitempty"`
	Patch any    `json:"patch,omitempty"`
}

// MsgKind identifies the server→client message type
type MsgKind string

const (
	MsgSnapshot MsgKind = "snapshot"
	MsgDiff     MsgKind = "diff"
	MsgEvent    MsgKind = "event"
	MsgPing     MsgKind = "ping"
	MsgError    MsgKind = "error"
)

// ServerMsg is any message the engine sends to a client
type ServerMsg struct {
	Kind  MsgKind       `json:"kind"`
	T     int64         `json:"t"`
	State *WorldState   `json:"state,omitempty"`
	Ops   []Op          `json:"ops,omitempty"`
	Event *ClusterEvent `json:"event,omitempty"`
	Code  string        `json:"code,omitempty"`
	Msg   string        `json:"msg,omitempty"`
}

package world

import (
	"reflect"

	"github.com/martincollado/kubeislands-engine/internal/proto"
)

// diff computes the minimal Op slice to transform prev → cur.
func diff(prev, cur *proto.WorldState) []proto.Op {
	var ops []proto.Op

	ops = append(ops, diffNamespaces(prev.Namespaces, cur.Namespaces)...)
	ops = append(ops, diffDeployments(prev.Deployments, cur.Deployments)...)
	ops = append(ops, diffPods(prev.Pods, cur.Pods)...)
	ops = append(ops, diffBridges(prev.Bridges, cur.Bridges)...)
	ops = append(ops, diffServices(prev.Services, cur.Services)...)
	ops = append(ops, diffConfigMaps(prev.ConfigMaps, cur.ConfigMaps)...)
	ops = append(ops, diffSecrets(prev.Secrets, cur.Secrets)...)
	ops = append(ops, diffJobs(prev.Jobs, cur.Jobs)...)
	ops = append(ops, diffCronJobs(prev.CronJobs, cur.CronJobs)...)
	ops = append(ops, diffNodes(prev.Nodes, cur.Nodes)...)

	return ops
}

func diffNamespaces(prev, cur []proto.Namespace) []proto.Op {
	pm := make(map[string]proto.Namespace, len(prev))
	for _, v := range prev {
		pm[v.ID] = v
	}
	cm := make(map[string]proto.Namespace, len(cur))
	for _, v := range cur {
		cm[v.ID] = v
	}
	var ops []proto.Op
	for id, cv := range cm {
		if pv, ok := pm[id]; !ok {
			ops = append(ops, proto.Op{Op: proto.OpAdd, Path: "namespaces", Value: cv})
		} else if !reflect.DeepEqual(pv, cv) {
			ops = append(ops, proto.Op{Op: proto.OpPatch, Path: "namespaces/" + id, Patch: partialNS(pv, cv)})
		}
	}
	for id := range pm {
		if _, ok := cm[id]; !ok {
			ops = append(ops, proto.Op{Op: proto.OpRemove, Path: "namespaces/" + id})
		}
	}
	return ops
}

func diffDeployments(prev, cur []proto.Deployment) []proto.Op {
	pm := make(map[string]proto.Deployment, len(prev))
	for _, v := range prev {
		pm[v.ID] = v
	}
	var ops []proto.Op
	for _, cv := range cur {
		if pv, ok := pm[cv.ID]; !ok {
			ops = append(ops, proto.Op{Op: proto.OpAdd, Path: "deployments", Value: cv})
		} else if !reflect.DeepEqual(pv, cv) {
			ops = append(ops, proto.Op{Op: proto.OpPatch, Path: "deployments/" + cv.ID, Patch: cv})
		}
	}
	cm := make(map[string]bool, len(cur))
	for _, v := range cur {
		cm[v.ID] = true
	}
	for id := range pm {
		if !cm[id] {
			ops = append(ops, proto.Op{Op: proto.OpRemove, Path: "deployments/" + id})
		}
	}
	return ops
}

func diffPods(prev, cur []proto.Pod) []proto.Op {
	pm := make(map[string]proto.Pod, len(prev))
	for _, v := range prev {
		pm[v.ID] = v
	}
	var ops []proto.Op
	for _, cv := range cur {
		if pv, ok := pm[cv.ID]; !ok {
			ops = append(ops, proto.Op{Op: proto.OpAdd, Path: "pods", Value: cv})
		} else if pv.Health != cv.Health {
			ops = append(ops, proto.Op{Op: proto.OpPatch, Path: "pods/" + cv.ID, Patch: map[string]any{"health": cv.Health}})
		}
	}
	cm := make(map[string]bool, len(cur))
	for _, v := range cur {
		cm[v.ID] = true
	}
	for id := range pm {
		if !cm[id] {
			ops = append(ops, proto.Op{Op: proto.OpRemove, Path: "pods/" + id})
		}
	}
	return ops
}

func diffBridges(prev, cur []proto.Bridge) []proto.Op {
	type bkey = struct{ A, B string }
	key := func(br proto.Bridge) bkey { return bkey{br.A, br.B} }
	pm := make(map[bkey]proto.Bridge, len(prev))
	for _, v := range prev {
		pm[key(v)] = v
	}
	var ops []proto.Op
	for _, cv := range cur {
		k := key(cv)
		if _, ok := pm[k]; !ok {
			ops = append(ops, proto.Op{Op: proto.OpAdd, Path: "bridges", Value: cv})
		} else if pm[k].Traffic != cv.Traffic || pm[k].ErrorRate != cv.ErrorRate {
			ops = append(ops, proto.Op{Op: proto.OpPatch,
				Path:  "bridges/" + cv.A + ":" + cv.B,
				Patch: map[string]any{"traffic": cv.Traffic, "errorRate": cv.ErrorRate},
			})
		}
	}
	cm := make(map[bkey]bool, len(cur))
	for _, v := range cur {
		cm[key(v)] = true
	}
	for k, pv := range pm {
		if !cm[k] {
			ops = append(ops, proto.Op{Op: proto.OpRemove, Path: "bridges/" + pv.A + ":" + pv.B})
		}
	}
	return ops
}

func partialNS(prev, cur proto.Namespace) map[string]any {
	p := map[string]any{}
	if prev.Center != cur.Center {
		p["center"] = cur.Center
	}
	if prev.Name != cur.Name {
		p["name"] = cur.Name
	}
	if prev.Hue != cur.Hue {
		p["hue"] = cur.Hue
	}
	if prev.Ingress != cur.Ingress {
		p["ingress"] = cur.Ingress
	}
	return p
}

func diffServices(prev, cur []proto.Service) []proto.Op {
	pm := make(map[string]proto.Service, len(prev))
	for _, v := range prev {
		pm[v.ID] = v
	}
	var ops []proto.Op
	for _, cv := range cur {
		if pv, ok := pm[cv.ID]; !ok {
			ops = append(ops, proto.Op{Op: proto.OpAdd, Path: "services", Value: cv})
		} else if !reflect.DeepEqual(pv, cv) {
			ops = append(ops, proto.Op{Op: proto.OpPatch, Path: "services/" + cv.ID, Patch: cv})
		}
	}
	cm := make(map[string]bool, len(cur))
	for _, v := range cur {
		cm[v.ID] = true
	}
	for id := range pm {
		if !cm[id] {
			ops = append(ops, proto.Op{Op: proto.OpRemove, Path: "services/" + id})
		}
	}
	return ops
}

func diffConfigMaps(prev, cur []proto.ConfigMap) []proto.Op {
	pm := make(map[string]proto.ConfigMap, len(prev))
	for _, v := range prev {
		pm[v.ID] = v
	}
	var ops []proto.Op
	for _, cv := range cur {
		if pv, ok := pm[cv.ID]; !ok {
			ops = append(ops, proto.Op{Op: proto.OpAdd, Path: "configMaps", Value: cv})
		} else if !reflect.DeepEqual(pv, cv) {
			ops = append(ops, proto.Op{Op: proto.OpPatch, Path: "configMaps/" + cv.ID, Patch: cv})
		}
	}
	cm := make(map[string]bool, len(cur))
	for _, v := range cur {
		cm[v.ID] = true
	}
	for id := range pm {
		if !cm[id] {
			ops = append(ops, proto.Op{Op: proto.OpRemove, Path: "configMaps/" + id})
		}
	}
	return ops
}

func diffSecrets(prev, cur []proto.Secret) []proto.Op {
	pm := make(map[string]proto.Secret, len(prev))
	for _, v := range prev {
		pm[v.ID] = v
	}
	var ops []proto.Op
	for _, cv := range cur {
		if pv, ok := pm[cv.ID]; !ok {
			ops = append(ops, proto.Op{Op: proto.OpAdd, Path: "secrets", Value: cv})
		} else if !reflect.DeepEqual(pv, cv) {
			ops = append(ops, proto.Op{Op: proto.OpPatch, Path: "secrets/" + cv.ID, Patch: cv})
		}
	}
	cm := make(map[string]bool, len(cur))
	for _, v := range cur {
		cm[v.ID] = true
	}
	for id := range pm {
		if !cm[id] {
			ops = append(ops, proto.Op{Op: proto.OpRemove, Path: "secrets/" + id})
		}
	}
	return ops
}

func diffJobs(prev, cur []proto.Job) []proto.Op {
	pm := make(map[string]proto.Job, len(prev))
	for _, v := range prev {
		pm[v.ID] = v
	}
	var ops []proto.Op
	for _, cv := range cur {
		if pv, ok := pm[cv.ID]; !ok {
			ops = append(ops, proto.Op{Op: proto.OpAdd, Path: "jobs", Value: cv})
		} else if pv.Status != cv.Status || pv.Completions != cv.Completions {
			ops = append(ops, proto.Op{Op: proto.OpPatch, Path: "jobs/" + cv.ID,
				Patch: map[string]any{"status": cv.Status, "completions": cv.Completions}})
		}
	}
	cm := make(map[string]bool, len(cur))
	for _, v := range cur {
		cm[v.ID] = true
	}
	for id := range pm {
		if !cm[id] {
			ops = append(ops, proto.Op{Op: proto.OpRemove, Path: "jobs/" + id})
		}
	}
	return ops
}

func diffCronJobs(prev, cur []proto.CronJob) []proto.Op {
	pm := make(map[string]proto.CronJob, len(prev))
	for _, v := range prev {
		pm[v.ID] = v
	}
	var ops []proto.Op
	for _, cv := range cur {
		if pv, ok := pm[cv.ID]; !ok {
			ops = append(ops, proto.Op{Op: proto.OpAdd, Path: "cronJobs", Value: cv})
		} else if pv.LastRun != cv.LastRun {
			ops = append(ops, proto.Op{Op: proto.OpPatch, Path: "cronJobs/" + cv.ID,
				Patch: map[string]any{"lastRun": cv.LastRun}})
		}
	}
	cm := make(map[string]bool, len(cur))
	for _, v := range cur {
		cm[v.ID] = true
	}
	for id := range pm {
		if !cm[id] {
			ops = append(ops, proto.Op{Op: proto.OpRemove, Path: "cronJobs/" + id})
		}
	}
	return ops
}

func diffNodes(prev, cur []proto.Node) []proto.Op {
	pm := make(map[string]proto.Node, len(prev))
	for _, v := range prev {
		pm[v.Name] = v
	}
	var ops []proto.Op
	for _, cv := range cur {
		if pv, ok := pm[cv.Name]; !ok {
			ops = append(ops, proto.Op{Op: proto.OpAdd, Path: "nodes", Value: cv})
		} else if pv.Ready != cv.Ready {
			ops = append(ops, proto.Op{Op: proto.OpPatch, Path: "nodes/" + cv.Name,
				Patch: map[string]any{"ready": cv.Ready}})
		}
	}
	cm := make(map[string]bool, len(cur))
	for _, v := range cur {
		cm[v.Name] = true
	}
	for name := range pm {
		if !cm[name] {
			ops = append(ops, proto.Op{Op: proto.OpRemove, Path: "nodes/" + name})
		}
	}
	return ops
}

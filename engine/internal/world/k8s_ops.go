// K8s-driven mutations — called by the watcher when real cluster events arrive.
// These replace the simulated seed data with real cluster state.
package world

import (
	"log"

	"github.com/martincollado/kubeislands-engine/internal/layout"
	"github.com/martincollado/kubeislands-engine/internal/proto"
)

// UpsertNamespace adds or updates a namespace from K8s.
func (s *State) UpsertNamespace(ns proto.Namespace) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.namespaces[ns.ID]; !exists {
		// Temporary layout slot — graph layout will overwrite within 2s.
		x, z := layout.SlotToCenter(s.nextNsSlot)
		s.nextNsSlot++
		ns.Center = [2]float64{x, z}
		s.nsOrder = append(s.nsOrder, ns.ID)
		s.pushEvent(proto.VerbAdded, ns.ID, "namespace "+ns.Name+" provisioned")
		s.ScheduleRelayout()
	}
	s.namespaces[ns.ID] = ns
}

// DeleteNamespace removes a namespace and its owned resources.
func (s *State) DeleteNamespace(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	ns, ok := s.namespaces[id]
	if !ok {
		return
	}
	s.pushEvent(proto.VerbDeleted, id, "namespace "+ns.Name+" removed")
	delete(s.namespaces, id)
	newOrder := s.nsOrder[:0]
	for _, oid := range s.nsOrder {
		if oid != id {
			newOrder = append(newOrder, oid)
		}
	}
	s.nsOrder = newOrder
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
	s.ScheduleRelayout()
}

// UpsertDeployment adds or updates a deployment from K8s.
func (s *State) UpsertDeployment(dep proto.Deployment) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.deployments[dep.ID] = dep
}

// DeleteDeployment removes a deployment.
func (s *State) DeleteDeployment(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.deployments, id)
}

// UpsertPod adds or updates a pod from K8s.
func (s *State) UpsertPod(pod proto.Pod) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.pods[pod.ID]; !exists {
		s.pushEvent(proto.VerbAdded, pod.NamespaceID, "pod "+pod.ID+" scheduled")
	} else if s.pods[pod.ID].Health != pod.Health {
		switch pod.Health {
		case proto.HealthFailed:
			s.pushEvent(proto.VerbError, pod.NamespaceID, "pod "+pod.ID+" CrashLoopBackOff")
		case proto.HealthReady:
			s.pushEvent(proto.VerbModified, pod.NamespaceID, "pod "+pod.ID+" ready")
		}
	}
	s.pods[pod.ID] = pod
}

// DeletePod removes a pod.
func (s *State) DeletePod(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if pod, ok := s.pods[id]; ok {
		s.pushEvent(proto.VerbDeleted, pod.NamespaceID, "pod "+id+" terminated")
		delete(s.pods, id)
	}
}

// UpsertService adds or updates a service from K8s.
func (s *State) UpsertService(svc proto.Service) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.services[svc.ID]; !exists {
		s.pushEvent(proto.VerbAdded, svc.Namespace, "svc "+svc.Name+" created")
	}
	s.services[svc.ID] = svc
}

// DeleteService removes a service.
func (s *State) DeleteService(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if svc, ok := s.services[id]; ok {
		s.pushEvent(proto.VerbDeleted, svc.Namespace, "svc "+svc.Name+" deleted")
		delete(s.services, id)
	}
}

// UpsertConfigMap adds or updates a ConfigMap from K8s.
func (s *State) UpsertConfigMap(cm proto.ConfigMap) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.configMaps[cm.ID]; !exists {
		s.pushEvent(proto.VerbAdded, cm.Namespace, "configmap "+cm.Name+" applied")
	}
	s.configMaps[cm.ID] = cm
}

// DeleteConfigMap removes a ConfigMap.
func (s *State) DeleteConfigMap(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.configMaps, id)
}

// UpsertSecret adds or updates a Secret from K8s.
func (s *State) UpsertSecret(sec proto.Secret) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.secrets[sec.ID] = sec
}

// DeleteSecret removes a Secret.
func (s *State) DeleteSecret(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.secrets, id)
}

// UpsertJob adds or updates a Job from K8s.
func (s *State) UpsertJob(job proto.Job) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.jobs[job.ID]; !exists {
		s.pushEvent(proto.VerbAdded, job.Namespace, "job "+job.Name+" started")
	} else if prev := s.jobs[job.ID]; prev.Status != job.Status {
		switch job.Status {
		case "succeeded":
			s.pushEvent(proto.VerbModified, job.Namespace, "job "+job.Name+" succeeded")
		case "failed":
			s.pushEvent(proto.VerbError, job.Namespace, "job "+job.Name+" failed")
		}
	}
	s.jobs[job.ID] = job
}

// DeleteJob removes a Job.
func (s *State) DeleteJob(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if job, ok := s.jobs[id]; ok {
		s.pushEvent(proto.VerbDeleted, job.Namespace, "job "+job.Name+" finished")
		delete(s.jobs, id)
	}
}

// UpsertCronJob adds or updates a CronJob from K8s.
func (s *State) UpsertCronJob(cj proto.CronJob) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.cronJobs[cj.ID]; !exists {
		s.pushEvent(proto.VerbAdded, cj.Namespace, "cronjob "+cj.Name+" registered ("+cj.Schedule+")")
	}
	s.cronJobs[cj.ID] = cj
}

// DeleteCronJob removes a CronJob.
func (s *State) DeleteCronJob(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.cronJobs, id)
}

// SetClusterName records the kubeconfig context name.
func (s *State) SetClusterName(name string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.clusterName = name
	log.Printf("k8s: cluster context = %q", name)
}

// UpsertNode adds or updates a node from K8s.
func (s *State) UpsertNode(node proto.Node) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.nodes[node.Name] = node
}

// DeleteNode removes a node.
func (s *State) DeleteNode(name string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.nodes, name)
}

// UpsertBridge adds or updates a bridge from K8s (e.g. HTTPRoute).
func (s *State) UpsertBridge(br proto.Bridge) {
	s.mu.Lock()
	defer s.mu.Unlock()
	key := brKey(br.A, br.B)
	if _, exists := s.bridges[key]; !exists {
		s.bridgeKeys = append(s.bridgeKeys, key)
		s.ScheduleRelayout()
	}
	s.bridges[key] = br
}

// DeleteBridge removes a bridge by its two endpoint namespace IDs.
func (s *State) DeleteBridge(a, b string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	key := brKey(a, b)
	if _, exists := s.bridges[key]; !exists {
		return
	}
	delete(s.bridges, key)
	newKeys := s.bridgeKeys[:0]
	for _, k := range s.bridgeKeys {
		if k != key {
			newKeys = append(newKeys, k)
		}
	}
	s.bridgeKeys = newKeys
	s.ScheduleRelayout()
}

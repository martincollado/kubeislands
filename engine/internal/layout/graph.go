// Hub-concentric graph layout.
//
// Given a graph G = (namespaces, bridges), place namespaces on a hex grid so
// that connected nodes are close and bridges don't cross. Strategy:
//
//   1. Find connected components.
//   2. Biggest component → hub-concentric at origin. Hub = highest-degree node,
//      neighbors on ring 1, their neighbors on ring 2, etc. Within a ring, each
//      node goes to the slot whose angle best matches its BFS parent's angle,
//      which keeps children near parents and reduces edge crossings.
//   3. Other components → placed as sub-clusters on an outer arc.
//   4. Singletons (no bridges) → packed into rings outside the main cluster.
//
// Deterministic: same input → same output (sorted IDs, stable tie-breaks).
package layout

import (
	"math"
	"sort"
)

type Edge struct{ A, B string }

type Placement struct {
	ID   string
	X, Z float64
}

// hexUnit is the axial scale factor. Distance between adjacent flat-top hexes
// = hexUnit * sqrt(3). We want neighbors ~22 units apart (matches the legacy
// ringGap so cameras, islands and bridges look the same as before).
const hexUnit = 12.7 // 12.7 * sqrt(3) ≈ 22.0

// axialToWorld converts flat-top axial hex coords (q, r) to world (x, z).
func axialToWorld(q, r int) (float64, float64) {
	fq := float64(q)
	fr := float64(r)
	x := hexUnit * 1.5 * fq
	z := hexUnit * (math.Sqrt(3)/2*fq + math.Sqrt(3)*fr)
	return x, z
}

// hexRingCoords returns the axial coords of every slot on ring `ring` around
// origin. Ring 0 = [(0,0)]; ring N has 6N slots.
func hexRingCoords(ring int) [][2]int {
	if ring == 0 {
		return [][2]int{{0, 0}}
	}
	coords := make([][2]int, 0, 6*ring)
	q, r := ring, 0
	dirs := [6][2]int{{-1, 1}, {-1, 0}, {0, -1}, {1, -1}, {1, 0}, {0, 1}}
	for _, d := range dirs {
		for i := 0; i < ring; i++ {
			coords = append(coords, [2]int{q, r})
			q += d[0]
			r += d[1]
		}
	}
	return coords
}

// ComputeLayout returns a map nsID → (x, z) world position.
// nodeIDs must include every namespace to place; edges are undirected bridges.
func ComputeLayout(nodeIDs []string, edges []Edge) map[string][2]float64 {
	result := map[string][2]float64{}
	if len(nodeIDs) == 0 {
		return result
	}

	// Sort for determinism.
	ids := append([]string(nil), nodeIDs...)
	sort.Strings(ids)

	// Build adjacency.
	adj := make(map[string]map[string]struct{}, len(ids))
	for _, id := range ids {
		adj[id] = map[string]struct{}{}
	}
	for _, e := range edges {
		if _, ok := adj[e.A]; !ok {
			continue
		}
		if _, ok := adj[e.B]; !ok {
			continue
		}
		if e.A == e.B {
			continue
		}
		adj[e.A][e.B] = struct{}{}
		adj[e.B][e.A] = struct{}{}
	}

	// Connected components via BFS.
	visited := map[string]bool{}
	var components [][]string
	for _, id := range ids {
		if visited[id] {
			continue
		}
		var comp []string
		queue := []string{id}
		visited[id] = true
		for len(queue) > 0 {
			cur := queue[0]
			queue = queue[1:]
			comp = append(comp, cur)
			nbs := sortedKeys(adj[cur])
			for _, nb := range nbs {
				if !visited[nb] {
					visited[nb] = true
					queue = append(queue, nb)
				}
			}
		}
		components = append(components, comp)
	}

	// Split into connected (size>1) and singletons.
	var connected [][]string
	var singletons []string
	for _, c := range components {
		if len(c) > 1 {
			connected = append(connected, c)
		} else {
			singletons = append(singletons, c[0])
		}
	}

	// Largest connected component first; tie-break by first ID.
	sort.SliceStable(connected, func(i, j int) bool {
		if len(connected[i]) != len(connected[j]) {
			return len(connected[i]) > len(connected[j])
		}
		return connected[i][0] < connected[j][0]
	})
	sort.Strings(singletons)

	// Track used axial slots (relative to origin) to avoid overlaps.
	used := map[[2]int]bool{}
	occupyAxial := func(q, r int, id string) {
		used[[2]int{q, r}] = true
		x, z := axialToWorld(q, r)
		result[id] = [2]float64{x, z}
	}

	// 1. Place main cluster at origin.
	mainMaxRing := 0
	if len(connected) > 0 {
		mainMaxRing = placeHubConcentric(connected[0], adj, 0, 0, occupyAxial)
	}

	// 2. Place other connected components around the main cluster on an outer
	//    band. Each sub-cluster gets its own local origin; we don't snap them
	//    onto the main grid, we just space them around it.
	if len(connected) > 1 {
		subR := float64(mainMaxRing+3) * hexUnit
		n := len(connected) - 1
		for i := 1; i < len(connected); i++ {
			angle := 2 * math.Pi * float64(i-1) / float64(n)
			cx := subR * math.Cos(angle)
			cz := subR * math.Sin(angle)
			placeHubConcentricFree(connected[i], adj, cx, cz, func(_, _ int, id string, x, z float64) {
				result[id] = [2]float64{x, z}
			})
		}
	}

	// 3. Singletons: fill rings on the main grid starting right after the main
	//    cluster, skipping slots already used. This packs isolated namespaces
	//    tight against the connected cluster instead of leaving empty bands.
	if len(singletons) > 0 {
		ring := mainMaxRing + 1
		if ring < 1 {
			ring = 1
		}
		idx := 0
		for idx < len(singletons) {
			for _, c := range hexRingCoords(ring) {
				if idx >= len(singletons) {
					break
				}
				if used[[2]int{c[0], c[1]}] {
					continue
				}
				occupyAxial(c[0], c[1], singletons[idx])
				idx++
			}
			ring++
			if ring > 100 {
				break // safety
			}
		}
	}

	return result
}

// placeHubConcentric places a connected component on the main hex grid, writing
// axial slot placements via `occupy`. Returns the max ring used.
func placeHubConcentric(
	comp []string,
	adj map[string]map[string]struct{},
	_, _ float64, // origin offset in world coords — unused for main cluster (0,0)
	occupy func(q, r int, id string),
) int {
	compSet := map[string]bool{}
	for _, id := range comp {
		compSet[id] = true
	}
	// Degree within component.
	degree := map[string]int{}
	for _, id := range comp {
		for nb := range adj[id] {
			if compSet[nb] {
				degree[id]++
			}
		}
	}
	// Hub = max degree, tie-break alphabetical.
	ids := append([]string(nil), comp...)
	sort.SliceStable(ids, func(i, j int) bool {
		if degree[ids[i]] != degree[ids[j]] {
			return degree[ids[i]] > degree[ids[j]]
		}
		return ids[i] < ids[j]
	})
	hub := ids[0]

	// BFS from hub.
	dist := map[string]int{hub: 0}
	parent := map[string]string{}
	queue := []string{hub}
	for len(queue) > 0 {
		cur := queue[0]
		queue = queue[1:]
		nbs := sortedKeys(adj[cur])
		for _, nb := range nbs {
			if !compSet[nb] {
				continue
			}
			if _, seen := dist[nb]; !seen {
				dist[nb] = dist[cur] + 1
				parent[nb] = cur
				queue = append(queue, nb)
			}
		}
	}

	// Place hub.
	occupy(0, 0, hub)
	axialOf := map[string][2]int{hub: {0, 0}}

	// Group by ring.
	byRing := map[int][]string{}
	maxRing := 0
	for id, d := range dist {
		byRing[d] = append(byRing[d], id)
		if d > maxRing {
			maxRing = d
		}
	}

	for r := 1; r <= maxRing; r++ {
		nodes := append([]string(nil), byRing[r]...)
		sort.Strings(nodes)
		slots := hexRingCoords(r)

		// Compute parent angle for each node (desired direction).
		type scored struct {
			id    string
			angle float64
		}
		scoredNodes := make([]scored, 0, len(nodes))
		for _, n := range nodes {
			p := parent[n]
			pa := axialOf[p]
			px, pz := axialToWorld(pa[0], pa[1])
			scoredNodes = append(scoredNodes, scored{n, math.Atan2(pz, px)})
		}
		sort.SliceStable(scoredNodes, func(i, j int) bool {
			if scoredNodes[i].angle != scoredNodes[j].angle {
				return scoredNodes[i].angle < scoredNodes[j].angle
			}
			return scoredNodes[i].id < scoredNodes[j].id
		})

		// Compute angle of each slot.
		type slotA struct {
			axial [2]int
			angle float64
		}
		slotAngles := make([]slotA, 0, len(slots))
		for _, c := range slots {
			sx, sz := axialToWorld(c[0], c[1])
			slotAngles = append(slotAngles, slotA{c, math.Atan2(sz, sx)})
		}

		// Greedy: for each node (sorted by desired angle), pick the closest
		// free slot by angle distance.
		usedSlot := make([]bool, len(slotAngles))
		for _, sn := range scoredNodes {
			best := -1
			bestDiff := math.Inf(1)
			for i, s := range slotAngles {
				if usedSlot[i] {
					continue
				}
				diff := math.Abs(wrapAngle(sn.angle - s.angle))
				if diff < bestDiff {
					bestDiff = diff
					best = i
				}
			}
			if best < 0 {
				continue
			}
			usedSlot[best] = true
			ax := slotAngles[best].axial
			occupy(ax[0], ax[1], sn.id)
			axialOf[sn.id] = ax
		}
	}

	return maxRing
}

// placeHubConcentricFree is like placeHubConcentric but places in free world
// space (not snapped to the shared main grid). Used for secondary clusters.
func placeHubConcentricFree(
	comp []string,
	adj map[string]map[string]struct{},
	cx, cz float64,
	occupy func(q, r int, id string, x, z float64),
) {
	placeHubConcentric(comp, adj, cx, cz, func(q, r int, id string) {
		x, z := axialToWorld(q, r)
		occupy(q, r, id, cx+x, cz+z)
	})
}

// wrapAngle returns a in (-pi, pi].
func wrapAngle(a float64) float64 {
	for a > math.Pi {
		a -= 2 * math.Pi
	}
	for a <= -math.Pi {
		a += 2 * math.Pi
	}
	return a
}

func sortedKeys(m map[string]struct{}) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

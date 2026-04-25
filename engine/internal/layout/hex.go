// Hex-ring packing — port of web/src/world/layout.ts
package layout

import "math"

const (
	ringGap   = 22.0
	baseAngle = math.Pi / 6
)

// SlotToCenter returns the (x, z) world center for a slot index 0, 1, 2…
func SlotToCenter(slot int) (x, z float64) {
	if slot == 0 {
		return 0, 0
	}
	ring := 1
	cumulative := 1
	for cumulative+6*ring <= slot {
		cumulative += 6 * ring
		ring++
	}
	posInRing := slot - cumulative
	totalInRing := 6 * ring
	angle := baseAngle + float64(posInRing)/float64(totalInRing)*math.Pi*2
	radius := float64(ring) * ringGap
	x = math.Round(math.Cos(angle)*radius*10) / 10
	z = math.Round(math.Sin(angle)*radius*10) / 10
	return
}

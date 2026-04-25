
/**
 * RTS commander camera — StarCraft-style, hand-rolled, no OrbitControls.
 *
 * Controls:
 *   WASD           pan the lookAt target in camera-relative XZ
 *   Q / E          yaw
 *   wheel          dolly distance [14, 80] with auto-tilt
 *   right-drag X   yaw
 *   right-drag Y   pitch override [-55°, -20°]
 *   middle-drag    pan
 *   click (ground) set lookAt target
 *   1-5            focus on namespace preset
 *   Space          snap to default
 *   T              toggle cinematic auto-orbit
 *   edge-scroll    half-speed pan at viewport border (20px)
 */

import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '@/state/store'

const PAN_SPEED   = 48    // was 22 — snappier WASD, RTS-like
const YAW_SPEED   = 1.8   // was 1.1
const MIN_DIST    = 10
const MAX_DIST    = 140
const EDGE_PX     = 24    // slightly larger hot-zone
const EDGE_SPEED  = 1.0   // edge-pan matches keyboard speed (was 0.5)
const WHEEL_SPEED = 0.065 // was 0.04
const SMOOTH_POS  = 22    // was 12 — tighter follow, less floaty
const SMOOTH_ZOOM = 10    // was 6

function easeOut3(k: number) { return 1 - Math.pow(1 - k, 3) }

interface Tween {
  active: boolean
  t: number
  dur: number
  from: { tx: number; tz: number; td: number; ty: number; tp: number }
  to:   { tx: number; tz: number; td: number; ty: number; tp: number }
}

export function RTSCamera() {
  const { camera, gl } = useThree()
  const setCam    = useStore(s => s.setCam)
  const setHovNs  = useStore(s => s.setHoveredNs)
  const setSelNs  = useStore(s => s.setSelectedNs)

  // Local mutable rig (not in Zustand — updated every frame, no re-render needed)
  const rig = useRef({
    tx: 0, tz: 0,
    // Input target — updated instantly by WASD; actual tx/tz eases toward this
    inputTx: 0, inputTz: 0,
    distance: 42,
    targetDistance: 42,
    yaw: Math.PI * 0.25,
    pitch: -0.75,
    cinematic: false,
  })

  const tween = useRef<Tween>({
    active: false, t: 0, dur: 0.6,
    from: { tx:0, tz:0, td:42, ty: Math.PI*0.25, tp:-0.75 },
    to:   { tx:0, tz:0, td:42, ty: Math.PI*0.25, tp:-0.75 },
  })

  const keys   = useRef(new Set<string>())
  const mouse  = useRef({ x: 0, y: 0, sx: -1, sy: -1 })
  const rmbDown = useRef(false)
  const mmbDown = useRef(false)
  const lastMouse = useRef({ x: 0, y: 0 })
  const prevCam = useRef({ tx: 0, tz: 0, dist: 42 })

  // Ground plane raycaster
  const raycaster = useRef(new THREE.Raycaster())
  const groundPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0))
  const hitPt = useRef(new THREE.Vector3())

  function tweenTo(tx: number, tz: number, td: number, ty: number, tp: number) {
    const r = rig.current
    tween.current = {
      active: true, t: 0, dur: 0.6,
      from: { tx: r.tx, tz: r.tz, td: r.targetDistance, ty: r.yaw, tp: r.pitch },
      to:   { tx, tz, td, ty, tp },
    }
    r.targetDistance = td
    r.inputTx = tx
    r.inputTz = tz
  }

  function nsAt(x: number, z: number) {
    const ns = useStore.getState().namespaces
    let best: typeof ns[0] | null = null
    let bd = Infinity
    for (const n of ns) {
      const dx = x - n.center[0], dz = z - n.center[1]
      const d = Math.hypot(dx, dz)
      if (d < n.radius * 0.92 && d < bd) { bd = d; best = n }
    }
    return best
  }

  useEffect(() => {
    const canvas = gl.domElement

    function onKeyDown(e: KeyboardEvent) {
      keys.current.add(e.code)
      if (e.code === 'Space') {
        tweenTo(0, 0, 42, Math.PI * 0.25, -0.75)
        e.preventDefault()
      }
      if (e.code === 'KeyT') {
        rig.current.cinematic = !rig.current.cinematic
      }
      if (/^Digit[1-5]$/.test(e.code)) {
        const idx = parseInt(e.code.slice(5), 10) - 1
        const ns  = useStore.getState().namespaces[idx]
        if (ns) {
          tweenTo(ns.center[0], ns.center[1], 22, Math.PI * 0.25, -0.55)
          setSelNs(ns.id)
        }
      }
    }
    function onKeyUp(e: KeyboardEvent) { keys.current.delete(e.code) }

    function onMouseDown(e: MouseEvent) {
      lastMouse.current = { x: e.clientX, y: e.clientY }
      if (e.button === 2) rmbDown.current = true
      if (e.button === 1) { mmbDown.current = true; e.preventDefault() }
    }
    function onMouseUp(e: MouseEvent) {
      if (e.button === 2) rmbDown.current = false
      if (e.button === 1) mmbDown.current = false
    }
    function onMouseMove(e: MouseEvent) {
      const dx = e.clientX - lastMouse.current.x
      const dy = e.clientY - lastMouse.current.y
      lastMouse.current = { x: e.clientX, y: e.clientY }
      mouse.current.sx = e.clientX
      mouse.current.sy = e.clientY
      mouse.current.x  = (e.clientX / window.innerWidth)  * 2 - 1
      mouse.current.y  = -(e.clientY / window.innerHeight) * 2 + 1

      if (rmbDown.current) {
        rig.current.yaw   -= dx * 0.0055
        rig.current.pitch  = Math.max(-1.35, Math.min(-0.3, rig.current.pitch - dy * 0.0035))
      } else if (mmbDown.current) {
        const s = rig.current.distance * 0.0018
        const r = rig.current
        r.inputTx -= (Math.cos(r.yaw) * dx - Math.sin(r.yaw) * dy) * s
        r.inputTz += (Math.sin(r.yaw) * dx + Math.cos(r.yaw) * dy) * s
      }
    }
    function onWheel(e: WheelEvent) {
      e.preventDefault()
      // Distance-proportional zoom: fast when far, fine when close.
      const factor = rig.current.targetDistance * 0.02 + 0.2
      rig.current.targetDistance = Math.max(MIN_DIST, Math.min(MAX_DIST,
        rig.current.targetDistance + e.deltaY * WHEEL_SPEED * factor))
    }
    function onClick(e: MouseEvent) {
      raycaster.current.setFromCamera(
        new THREE.Vector2(mouse.current.x, mouse.current.y),
        camera
      )
      if (raycaster.current.ray.intersectPlane(groundPlane.current, hitPt.current)) {
        const ns = nsAt(hitPt.current.x, hitPt.current.z)
        if (ns) {
          tweenTo(ns.center[0], ns.center[1], Math.min(rig.current.distance, 22), rig.current.yaw, rig.current.pitch)
          setSelNs(ns.id)
        } else {
          tweenTo(hitPt.current.x, hitPt.current.z, rig.current.distance, rig.current.yaw, rig.current.pitch)
          setSelNs(null)
        }
      }
    }
    function onDblClick() {
      raycaster.current.setFromCamera(
        new THREE.Vector2(mouse.current.x, mouse.current.y),
        camera
      )
      if (raycaster.current.ray.intersectPlane(groundPlane.current, hitPt.current)) {
        const ns = nsAt(hitPt.current.x, hitPt.current.z)
        if (ns) tweenTo(ns.center[0], ns.center[1], 22, Math.PI * 0.25, -0.55)
      }
    }
    function onContextMenu(e: MouseEvent) { e.preventDefault() }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    canvas.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('mousemove', onMouseMove)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('click', onClick)
    canvas.addEventListener('dblclick', onDblClick)
    canvas.addEventListener('contextmenu', onContextMenu)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('click', onClick)
      canvas.removeEventListener('dblclick', onDblClick)
      canvas.removeEventListener('contextmenu', onContextMenu)
    }
  }, [camera, gl, setSelNs])

  useFrame((_, dt) => {
    const r  = rig.current
    const tw = tween.current
    const k  = keys.current
    const m  = mouse.current

    const clampedDt = Math.min(dt, 0.05)
    // Scale pan speed with distance: zoom out = faster pan, zoom in = finer control
    const panSpeed = PAN_SPEED * clampedDt * (r.distance / 42)

    // Camera-relative forward and right vectors on XZ plane
    const forward = new THREE.Vector3(Math.sin(r.yaw), 0, Math.cos(r.yaw))
    const right   = new THREE.Vector3(forward.z, 0, -forward.x)

    if (k.has('KeyW')) { r.inputTx -= forward.x * panSpeed; r.inputTz -= forward.z * panSpeed }
    if (k.has('KeyS')) { r.inputTx += forward.x * panSpeed; r.inputTz += forward.z * panSpeed }
    if (k.has('KeyA')) { r.inputTx -= right.x   * panSpeed; r.inputTz -= right.z   * panSpeed }
    if (k.has('KeyD')) { r.inputTx += right.x   * panSpeed; r.inputTz += right.z   * panSpeed }
    if (k.has('KeyQ')) r.yaw += YAW_SPEED * clampedDt
    if (k.has('KeyE')) r.yaw -= YAW_SPEED * clampedDt

    // Edge scroll — ramped intensity: closer to edge = faster (StarCraft feel).
    if (m.sx >= 0 && m.sy >= 0 && !rmbDown.current && !mmbDown.current) {
      const W = window.innerWidth, H = window.innerHeight
      const ramp = (d: number) => {
        const t = Math.max(0, 1 - d / EDGE_PX)
        return t * t * EDGE_SPEED // quadratic ease: gentle start, accelerates at edge
      }
      const es = panSpeed
      const leftF   = ramp(m.sx)
      const rightF  = ramp(W - m.sx)
      const topF    = ramp(m.sy)
      const bottomF = ramp(H - m.sy)
      if (leftF  > 0) { r.inputTx -= right.x   * es * leftF;   r.inputTz -= right.z   * es * leftF   }
      if (rightF > 0) { r.inputTx += right.x   * es * rightF;  r.inputTz += right.z   * es * rightF  }
      if (topF   > 0) { r.inputTx -= forward.x * es * topF;    r.inputTz -= forward.z * es * topF    }
      if (bottomF> 0) { r.inputTx += forward.x * es * bottomF; r.inputTz += forward.z * es * bottomF }
    }

    // Soft world boundary — scales with ring 3 radius (~66 units)
    r.inputTx = Math.max(-120, Math.min(120, r.inputTx))
    r.inputTz = Math.max(-120, Math.min(120, r.inputTz))

    // Smooth actual target toward input target (exponential ease)
    const smooth = 1 - Math.exp(-clampedDt * SMOOTH_POS)
    r.tx += (r.inputTx - r.tx) * smooth
    r.tz += (r.inputTz - r.tz) * smooth

    // Smooth zoom
    r.distance += (r.targetDistance - r.distance) * Math.min(1, clampedDt * SMOOTH_ZOOM)

    // Auto-tilt with distance: close = -25° (-0.44), far = -55° (-0.96)
    const distNorm = (r.distance - MIN_DIST) / (MAX_DIST - MIN_DIST)
    const autoPitch = -0.44 - distNorm * 0.52
    if (!rmbDown.current) {
      r.pitch += (autoPitch - r.pitch) * clampedDt * 2
    }

    // Cinematic drift
    if (r.cinematic) r.yaw += 0.03 * clampedDt

    // Tween (overrides smoothing while active)
    if (tw.active) {
      tw.t += clampedDt
      const e = easeOut3(Math.min(1, tw.t / tw.dur))
      r.tx       = tw.from.tx + (tw.to.tx - tw.from.tx) * e
      r.tz       = tw.from.tz + (tw.to.tz - tw.from.tz) * e
      r.distance = tw.from.td + (tw.to.td - tw.from.td) * e
      r.yaw      = tw.from.ty + (tw.to.ty - tw.from.ty) * e
      r.pitch    = tw.from.tp + (tw.to.tp - tw.from.tp) * e
      r.inputTx  = r.tx
      r.inputTz  = r.tz
      if (tw.t >= tw.dur) tw.active = false
    }

    // Apply to Three.js camera
    const d = r.distance, y = r.yaw, p = r.pitch
    camera.position.set(
      r.tx + d * Math.cos(p) * Math.sin(y),
      d * Math.sin(-p),
      r.tz + d * Math.cos(p) * Math.cos(y),
    )
    camera.lookAt(r.tx, 1.2, r.tz)

    // Raycast hover
    raycaster.current.setFromCamera(new THREE.Vector2(m.x, m.y), camera)
    if (raycaster.current.ray.intersectPlane(groundPlane.current, hitPt.current)) {
      const ns = nsAt(hitPt.current.x, hitPt.current.z)
      setHovNs(ns ? ns.id : null)
    }

    // Sync to Zustand only when cam moved enough (avoids 60fps minimap re-renders)
    const prev = prevCam.current
    if (
      Math.abs(r.tx - prev.tx) > 0.08 ||
      Math.abs(r.tz - prev.tz) > 0.08 ||
      Math.abs(r.distance - prev.dist) > 0.4
    ) {
      setCam({ targetX: r.tx, targetZ: r.tz, distance: r.distance, yaw: r.yaw, pitch: r.pitch })
      prev.tx = r.tx; prev.tz = r.tz; prev.dist = r.distance
    }
  })

  return null
}

import { memo, useEffect, useMemo, useRef, type RefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei/core/RoundedBox'
import { Environment } from '@react-three/drei/core/Environment'
import { Lightformer } from '@react-three/drei/core/Lightformer'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { CubicBezierCurve3, CurvePath, Group, LineCurve3, MathUtils, OrthographicCamera, Shape, Vector3 } from 'three'

gsap.registerPlugin(useGSAP)

type SceneProps = { active: boolean; reduced: boolean; onReady: () => void; onFailure: () => void }
type FileKind = 'document' | 'photo' | 'video'
const playShape = new Shape().moveTo(-.12, -.16).lineTo(.17, 0).lineTo(-.12, .16).closePath()
const mountainShape = new Shape().moveTo(-.55, -.38).lineTo(-.12, .22).lineTo(.13, -.08).lineTo(.36, .16).lineTo(.56, -.38).closePath()

function FileObject({ kind, dark = false }: { kind: FileKind; dark?: boolean }) {
  return <group>
    <RoundedBox args={[1.48, 1.87, .105]} radius={.11} smoothness={2} bevelSegments={2}>
      <meshStandardMaterial color={dark ? '#4c6294' : '#cbd4ea'} metalness={.22} roughness={.43} />
    </RoundedBox>
    <RoundedBox args={[1.31, 1.5, .024]} radius={.055} position={[0, .065, .065]} smoothness={2} bevelSegments={2}>
      <meshStandardMaterial color={kind === 'document' ? '#e7ebf5' : '#1a2d5a'} roughness={.65} />
    </RoundedBox>
    {kind === 'document' ? <group position={[0, 0, .087]}>
      <mesh position={[-.35, .5, 0]}><planeGeometry args={[.27, .12]} /><meshBasicMaterial color="#6480c0" /></mesh>
      {[.21, .04, -.13, -.3, -.47].map((y, index) => <mesh key={y} position={[index === 4 ? -.16 : 0, y, 0]}><planeGeometry args={[index === 4 ? .66 : .98, .035]} /><meshBasicMaterial color="#9cabcf" /></mesh>)}
    </group> : kind === 'photo' ? <group position={[0, .03, .087]}>
      <mesh position={[.29, .4, 0]}><circleGeometry args={[.15, 24]} /><meshBasicMaterial color="#cbdbff" /></mesh>
      <mesh position={[0, -.06, .01]}><shapeGeometry args={[mountainShape]} /><meshBasicMaterial color="#7b91c4" /></mesh>
      <mesh position={[-.12, -.28, .02]} scale={[1.2, .56, 1]}><shapeGeometry args={[mountainShape]} /><meshBasicMaterial color="#566c9f" /></mesh>
    </group> : <group position={[0, .08, .09]}>
      <mesh><torusGeometry args={[.38, .016, 6, 48]} /><meshBasicMaterial color="#9bafdc" /></mesh>
      <mesh position={[.025, 0, .01]}><shapeGeometry args={[playShape]} /><meshBasicMaterial color="#d5e2ff" /></mesh>
      <mesh position={[0, -.52, 0]}><planeGeometry args={[.93, .025]} /><meshBasicMaterial color="#7189c1" /></mesh>
      <mesh position={[-.25, -.52, .01]}><circleGeometry args={[.055, 12]} /><meshBasicMaterial color="#c4d3f5" /></mesh>
    </group>}
    <mesh position={[-.44, -.82, .065]}><planeGeometry args={[.4, .025]} /><meshBasicMaterial color={dark ? '#9fb4e5' : '#818ead'} /></mesh>
    <mesh position={[.55, -.81, .065]}><circleGeometry args={[.035, 12]} /><meshBasicMaterial color={dark ? '#c9d7f7' : '#768aba'} /></mesh>
  </group>
}

function LockObject() {
  const shackle = useMemo(() => {
    const path = new CurvePath<Vector3>()
    path.add(new LineCurve3(new Vector3(-.64, .05, 0), new Vector3(-.64, .93, 0)))
    path.add(new CubicBezierCurve3(new Vector3(-.64, .93, 0), new Vector3(-.64, 1.83, 0), new Vector3(.64, 1.83, 0), new Vector3(.64, .93, 0)))
    path.add(new LineCurve3(new Vector3(.64, .93, 0), new Vector3(.64, .05, 0)))
    return path
  }, [])
  return <group rotation={[.05, -.24, -.06]}>
    <mesh><tubeGeometry args={[shackle, 56, .155, 12, false]} /><meshStandardMaterial color="#d1d8e9" metalness={.96} roughness={.19} /></mesh>
    <RoundedBox args={[2.06, 1.57, .72]} radius={.23} smoothness={3} bevelSegments={2} position={[0, -.46, .025]}>
      <meshStandardMaterial color="#abb8d6" metalness={.88} roughness={.25} />
    </RoundedBox>
    <RoundedBox args={[1.82, 1.33, .025]} radius={.16} smoothness={2} bevelSegments={2} position={[0, -.46, .393]}>
      <meshStandardMaterial color="#b9c4de" metalness={.86} roughness={.3} />
    </RoundedBox>
    <mesh position={[0, -.37, .412]}><torusGeometry args={[.153, .019, 8, 32]} /><meshStandardMaterial color="#d8e1f7" metalness={.9} roughness={.24} /></mesh>
    <mesh position={[0, -.37, .417]}><circleGeometry args={[.134, 32]} /><meshBasicMaterial color="#16264b" /></mesh>
    <RoundedBox args={[.095, .23, .018]} radius={.025} smoothness={2} position={[0, -.54, .419]}><meshBasicMaterial color="#16264b" /></RoundedBox>
    {[-.18, -.06, .06, .18].map(x => <mesh key={x} position={[x, -.94, .413]}><planeGeometry args={[.055, .018]} /><meshBasicMaterial color="#73809f" /></mesh>)}
  </group>
}

// EnvironmentPortal captures again whenever its children change identity, even with frames={1}.
// Isolate the genuinely static studio so readiness/visibility updates cannot recapture it.
const StudioLighting = memo(function StudioLighting({ compact }: { compact: boolean }) {
  return <Environment frames={1} resolution={compact ? 64 : 128}>
    <Lightformer form="rect" intensity={3} position={[-3, 3, 4]} scale={[3, 5, 1]} target={[0, 0, 0]} />
    <Lightformer form="rect" intensity={2} color="#97b6ff" position={[4, 0, 2]} scale={[2, 5, 1]} target={[0, 0, 0]} />
    <Lightformer form="rect" intensity={1.5} position={[0, 4, -3]} scale={[5, 2, 1]} target={[0, 0, 0]} />
  </Environment>
})

const SceneContent = memo(function SceneContent({ active, reduced, onReady, host }: Omit<SceneProps, 'onFailure'> & { host: RefObject<HTMLDivElement | null> }) {
  const tilt = useRef<Group>(null)
  const assemble = useRef<Group>(null)
  const intro = useRef<gsap.core.Timeline | null>(null)
  const target = useRef({ x: 0, y: 0 })
  const announced = useRef(false)
  const { camera, size, invalidate, gl } = useThree()
  const compact = size.width < 600
  useEffect(() => {
    const orthographic = camera as OrthographicCamera
    orthographic.zoom = Math.min(size.width / (compact ? 5.65 : 10.8), size.height / 3.7)
    orthographic.updateProjectionMatrix()
    invalidate()
  }, [camera, size, compact, invalidate])
  useGSAP(() => {
    const root = assemble.current
    if (!root || reduced) { invalidate(); return }
    const start = Number(host.current?.closest('.lp-hero')?.getAttribute('data-entrance-start')) || performance.now()
    const elapsed = (performance.now() - start) / 1000
    if (elapsed > 1.8) { invalidate(); return }
    const timeline = gsap.timeline({ delay: Math.max(0, .52 - elapsed), defaults: { duration: 1.05, ease: 'power3.out' }, onUpdate: invalidate })
    intro.current = timeline
    root.children.forEach((object, index) => {
      const { x, y, z } = object.position
      timeline.fromTo(object.position, { x: x * .46, y: y - .6, z: z - 1.1 }, { x, y, z }, index * .045)
      timeline.fromTo(object.scale, { x: .65, y: .65, z: .65 }, { x: 1, y: 1, z: 1 }, index * .045)
    })
    return () => { intro.current = null }
  }, { dependencies: [reduced, compact], revertOnUpdate: true })
  useEffect(() => {
    if (active) { intro.current?.resume(); invalidate() } else intro.current?.pause()
  }, [active, invalidate, compact, reduced])
  useEffect(() => {
    const element = host.current
    if (!element || reduced || !active || !matchMedia('(hover: hover) and (pointer: fine)').matches) {
      target.current.x = 0; target.current.y = 0
      if (tilt.current) tilt.current.rotation.set(0, 0, 0)
      invalidate()
      return
    }
    const move = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect()
      target.current.x = MathUtils.clamp((event.clientY - rect.top) / rect.height - .5, -.5, .5) * .13
      target.current.y = MathUtils.clamp((event.clientX - rect.left) / rect.width - .5, -.5, .5) * .22
      invalidate()
    }
    const leave = () => { target.current.x = 0; target.current.y = 0; invalidate() }
    element.addEventListener('pointermove', move, { passive: true })
    element.addEventListener('pointerleave', leave)
    return () => { element.removeEventListener('pointermove', move); element.removeEventListener('pointerleave', leave) }
  }, [host, active, reduced, invalidate])
  useFrame((_, delta) => {
    if (!announced.current) { announced.current = true; onReady() }
    const group = tilt.current
    if (!group || reduced) return
    const dx = target.current.x - group.rotation.x
    const dy = target.current.y - group.rotation.y
    if (Math.abs(dx) + Math.abs(dy) > .0002) {
      group.rotation.x = MathUtils.damp(group.rotation.x, target.current.x, 6, Math.min(delta, .05))
      group.rotation.y = MathUtils.damp(group.rotation.y, target.current.y, 6, Math.min(delta, .05))
      invalidate()
    }
  })
  useEffect(() => {
    const element = gl.domElement
    const lost = (event: Event) => { event.preventDefault(); host.current?.dispatchEvent(new Event('vault-context-lost')) }
    element.addEventListener('webglcontextlost', lost)
    return () => element.removeEventListener('webglcontextlost', lost)
  }, [gl, host])
  return <>
    <ambientLight intensity={.45} />
    <directionalLight position={[3, 5, 6]} intensity={2.2} color="#edf2ff" />
    <directionalLight position={[-4, 1, 2]} intensity={1.8} color="#90acee" />
    <StudioLighting compact={compact} />
    <group position={[0, -.12, 0]}><group ref={tilt}><group key={compact ? 'compact' : 'wide'} ref={assemble}>
      {!compact ? <group position={[-3.95, -.23, -.9]} rotation={[.12, .38, .23]}><FileObject kind="photo" dark /></group> : null}
      <group position={[compact ? -1.65 : -2.27, .08, -.35]} rotation={[.02, .28, .14]}><FileObject kind="document" /></group>
      {!compact ? <group position={[3.95, .09, -.8]} rotation={[-.1, -.35, -.2]}><FileObject kind="document" dark /></group> : null}
      <group position={[compact ? 1.65 : 2.25, -.03, -.15]} rotation={[-.08, -.3, -.16]}><FileObject kind="video" /></group>
      <group position={[0, 0, .85]}><LockObject /></group>
    </group></group></group>
  </>
})

const VaultScene = memo(function VaultScene({ active, reduced, onReady, onFailure }: SceneProps) {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = host.current
    element?.addEventListener('vault-context-lost', onFailure)
    return () => element?.removeEventListener('vault-context-lost', onFailure)
  }, [onFailure])
  return <div ref={host} className="lp-vault-renderer">
    <Canvas orthographic camera={{ position: [0, 0, 12], zoom: 80, near: .1, far: 40 }} dpr={reduced ? 1 : [1, 1.5]} frameloop={active ? 'demand' : 'never'} gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }} fallback={<span className="sr-only">Minh họa tĩnh</span>}>
      <SceneContent active={active} reduced={reduced} onReady={onReady} host={host} />
    </Canvas>
  </div>
})

export default VaultScene

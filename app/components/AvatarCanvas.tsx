'use client'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useGLTF, Environment, Preload } from '@react-three/drei'
import { Suspense, useRef, useEffect, Component, ReactNode } from 'react'
import * as THREE from 'three'
import { KTX2Loader } from 'three-stdlib'

interface AvatarModelProps {
  jawOpen: React.RefObject<number>
}

function AvatarModel({ jawOpen }: AvatarModelProps) {
  const { gl } = useThree()
  const { scene } = useGLTF('/avatar/apex-avatar.glb', false, true, (loader) => {
    const ktx2 = new KTX2Loader().setTranscoderPath('/').detectSupport(gl)
    loader.setKTX2Loader(ktx2)
  })

  const morphMeshRef = useRef<THREE.Mesh | null>(null)
  useEffect(() => {
    // Log bounding box to calibrate camera
    const box = new THREE.Box3().setFromObject(scene)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    console.log('[AvatarCanvas] bounding box center:', center, 'size:', size)

    let found = false
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (mesh.isMesh && mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
        if ('jawOpen' in mesh.morphTargetDictionary) {
          morphMeshRef.current = mesh
          found = true
        }
      }
    })
    if (!found) console.warn('[AvatarCanvas] no mesh with jawOpen morph target found')
  }, [scene])

  useFrame(() => {
    const mesh = morphMeshRef.current
    if (!mesh?.morphTargetDictionary || !mesh?.morphTargetInfluences) return
    const idx = mesh.morphTargetDictionary['jawOpen']
    if (idx === undefined) return
    mesh.morphTargetInfluences[idx] = THREE.MathUtils.lerp(
      mesh.morphTargetInfluences[idx],
      jawOpen.current ?? 0,
      0.25
    )
  })

  return <primitive object={scene} />
}

// Fallback shown while GLTF loads — transparent, so the placeholder behind shows through
function LoadingFallback() {
  return null
}

class AvatarErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null }
  static getDerivedStateFromError(e: Error) { return { error: e.message } }
  render() {
    if (this.state.error) {
      console.error('[AvatarCanvas] error boundary caught:', this.state.error)
      return null
    }
    return this.props.children
  }
}

interface AvatarCanvasProps {
  jawOpen: React.RefObject<number>
  onReady?: () => void
}

export function AvatarCanvas({ jawOpen, onReady }: AvatarCanvasProps) {
  // Signal ready on mount — don't wait for Three.js onCreated which can
  // fire before or after context loss in React StrictMode dev double-mount
  useEffect(() => {
    const id = setTimeout(() => onReady?.(), 100)
    return () => clearTimeout(id)
  }, [onReady])

  return (
    <Canvas
      camera={{ position: [0, 0.2, 3.8], fov: 32 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      style={{ width: '100%', height: '100%', display: 'block', background: '#1a1a2e' }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener('webglcontextlost', (e) => e.preventDefault(), false)
      }}
    >
      <ambientLight intensity={0.9} />
      <directionalLight position={[0.5, 1, 1]} intensity={1.2} />
      <AvatarErrorBoundary>
        <Suspense fallback={<LoadingFallback />}>
          <Environment preset="studio" />
          <AvatarModel jawOpen={jawOpen} />
          <Preload all />
        </Suspense>
      </AvatarErrorBoundary>
    </Canvas>
  )
}

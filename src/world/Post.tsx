
/**
 * Post-processing pipeline.
 * Order: SMAA → Bloom → ChromaticAberration → Vignette.
 * ACES Filmic tone mapping is set on the renderer in Scene.tsx.
 * All values reactive to Zustand tweaks.
 */

import { EffectComposer, Bloom, ChromaticAberration, Vignette, SMAA } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import { Vector2 } from 'three'
import { useStore } from '@/state/store'

export function Post() {
  const tweaks = useStore(s => s.tweaks)

  return (
    <EffectComposer multisampling={0}>
      <SMAA />
      <Bloom
        intensity={tweaks.bloomIntensity}
        luminanceThreshold={tweaks.bloomThreshold}
        luminanceSmoothing={tweaks.bloomSmoothing}
        mipmapBlur
      />
      <ChromaticAberration
        blendFunction={BlendFunction.NORMAL}
        offset={new Vector2(tweaks.chromaticAberration, tweaks.chromaticAberration)}
        radialModulation={false}
        modulationOffset={0.5}
      />
      <Vignette
        offset={0.35}
        darkness={tweaks.vignetteDarkness}
        blendFunction={BlendFunction.NORMAL}
      />
    </EffectComposer>
  )
}

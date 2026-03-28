import { useMemo, useEffect, useRef } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { EffectComposer, Bloom, SMAA, N8AO, Vignette, HueSaturation, BrightnessContrast } from '@react-three/postprocessing'
import * as THREE from 'three'
import type { ParsedZone } from '../../lib/ffxi-dat'
import SpawnMarkers from './SpawnMarkers'
import SpawnSkybeams from './SpawnSkybeams'
import type { ZoneSpawnDto } from '../../types/api'

interface ThreeZoneViewerProps {
  zoneData: ParsedZone
  fogDensity?: number  // 0 = off, 0-1 = near/far multiplier (higher = thicker)
  timeOfDay?: number   // 0-24 hour clock (e.g. 6=dawn, 12=noon, 18=dusk, 0=midnight)
  cameraMode?: 'orbit' | 'fly'
  onFlySpeedChange?: (speed: number) => void
  spawns?: ZoneSpawnDto[]
  showSpawns?: boolean
  showSkybeams?: boolean
  onSpawnHover?: (spawn: ZoneSpawnDto | null, screenPos?: { x: number; y: number }) => void
  flyToTarget?: { x: number; y: number; z: number } | null
  /** Debug: strip all textures and render vertex colors only */
  debugVertexColors?: boolean
}

/** Returns sky colors, fog color, and exposure multiplier for a given hour (0-24) */
function getTimeOfDayParams(hour: number) {
  // Normalize to 0-24
  const h = ((hour % 24) + 24) % 24

  // Key times: 5=dawn start, 7=sunrise, 12=noon, 17=sunset start, 19=dusk end, 0=midnight
  // Interpolate between color stops
  const stops = [
    { t: 0,  sky: [0.05, 0.05, 0.12], horizon: [0.08, 0.08, 0.15], zenith: [0.02, 0.02, 0.08], fog: '#1a1a2e', exposure: 0.25 },
    { t: 5,  sky: [0.08, 0.07, 0.18], horizon: [0.25, 0.15, 0.25], zenith: [0.04, 0.04, 0.12], fog: '#2a1a30', exposure: 0.4 },
    { t: 6,  sky: [0.35, 0.25, 0.35], horizon: [0.85, 0.45, 0.30], zenith: [0.15, 0.12, 0.30], fog: '#c8886a', exposure: 0.75 },
    { t: 7,  sky: [0.50, 0.55, 0.70], horizon: [0.90, 0.70, 0.50], zenith: [0.25, 0.30, 0.55], fog: '#d4a878', exposure: 0.95 },
    { t: 10, sky: [0.45, 0.58, 0.78], horizon: [0.72, 0.78, 0.85], zenith: [0.28, 0.38, 0.62], fog: '#b8c8d8', exposure: 1.1 },
    { t: 14, sky: [0.45, 0.58, 0.78], horizon: [0.72, 0.78, 0.85], zenith: [0.28, 0.38, 0.62], fog: '#b8c8d8', exposure: 1.1 },
    { t: 17, sky: [0.55, 0.45, 0.50], horizon: [0.90, 0.55, 0.30], zenith: [0.30, 0.25, 0.45], fog: '#d09060', exposure: 0.95 },
    { t: 18, sky: [0.40, 0.25, 0.40], horizon: [0.80, 0.35, 0.25], zenith: [0.18, 0.12, 0.32], fog: '#a06048', exposure: 0.6 },
    { t: 19, sky: [0.12, 0.10, 0.22], horizon: [0.30, 0.18, 0.25], zenith: [0.06, 0.05, 0.15], fog: '#2a1a30', exposure: 0.4 },
    { t: 21, sky: [0.05, 0.05, 0.12], horizon: [0.08, 0.08, 0.15], zenith: [0.02, 0.02, 0.08], fog: '#1a1a2e', exposure: 0.25 },
    { t: 24, sky: [0.05, 0.05, 0.12], horizon: [0.08, 0.08, 0.15], zenith: [0.02, 0.02, 0.08], fog: '#1a1a2e', exposure: 0.25 },
  ]

  // Find surrounding stops and interpolate
  let lo = stops[0], hi = stops[1]
  for (let i = 0; i < stops.length - 1; i++) {
    if (h >= stops[i].t && h <= stops[i + 1].t) {
      lo = stops[i]
      hi = stops[i + 1]
      break
    }
  }
  const range = hi.t - lo.t || 1
  const f = (h - lo.t) / range

  const lerp = (a: number, b: number) => a + (b - a) * f
  const lerpArr = (a: number[], b: number[]) => a.map((v, i) => lerp(v, b[i]))

  return {
    sky: lerpArr(lo.sky, hi.sky) as [number, number, number],
    horizon: lerpArr(lo.horizon, hi.horizon) as [number, number, number],
    zenith: lerpArr(lo.zenith, hi.zenith) as [number, number, number],
    fogColor: lo.fog === hi.fog ? lo.fog : (() => {
      const lc = new THREE.Color(lo.fog), hc = new THREE.Color(hi.fog)
      return '#' + lc.lerp(hc, f).getHexString()
    })(),
    exposure: lerp(lo.exposure, hi.exposure),
    nightFactor: h >= 19 || h <= 5 ? 1.0 : h >= 18 ? (h - 18) : h <= 6 ? (6 - h) : 0.0,
  }
}

/** Patches a zone material's shader with:
 *  1. Height-based fog attenuation (thickest below fogHeightBase, fades over fogHeightRange)
 *  2. Dark-transparent discard: discards pixels that are BOTH nearly transparent AND nearly black.
 *     This removes black backgrounds from foliage/plant sprites without creating holes in ground
 *     textures (which have colored RGB even at low alpha). */
function patchZoneShader(
  material: THREE.Material,
  uniforms: { fogHeightBase: { value: number }; fogHeightRange: { value: number } }
) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.fogHeightBase = uniforms.fogHeightBase
    shader.uniforms.fogHeightRange = uniforms.fogHeightRange

    shader.vertexShader = shader.vertexShader.replace(
      '#include <fog_pars_vertex>',
      `#include <fog_pars_vertex>
      varying float vWorldY;`
    )
    shader.vertexShader = shader.vertexShader.replace(
      '#include <fog_vertex>',
      `#include <fog_vertex>
      #ifdef USE_INSTANCING
        vec4 hfWorldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
      #else
        vec4 hfWorldPos = modelMatrix * vec4(position, 1.0);
      #endif
      vWorldY = hfWorldPos.y;`
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <fog_pars_fragment>',
      `#include <fog_pars_fragment>
      varying float vWorldY;
      uniform float fogHeightBase;
      uniform float fogHeightRange;`
    )
    // Fix DXT3 alpha artifacts: ground/wall tiles can have near-zero alpha in
    // DXT3 data despite having colored pixels.  Before THREE's alphatest_fragment
    // runs, boost alpha to 1.0 for any pixel with visible color (luminance > 0.05).
    // Black transparent pixels (foliage sprite backgrounds) keep their low alpha
    // and get discarded by the normal alphaTest.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <alphatest_fragment>',
      `float _lum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
      if (_lum > 0.05) gl_FragColor.a = 1.0;
      #include <alphatest_fragment>`
    )
    // Force fully opaque output for surviving fragments
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <premultiplied_alpha_fragment>',
      `#include <premultiplied_alpha_fragment>
      gl_FragColor.a = 1.0;`
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <fog_fragment>',
      `#ifdef USE_FOG
        #ifdef FOG_EXP2
          float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
        #else
          float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
        #endif
        float heightAtten = 1.0 - smoothstep(fogHeightBase, fogHeightBase + fogHeightRange, vWorldY);
        fogFactor *= max(heightAtten, 0.06);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, clamp(fogFactor, 0.0, 1.0));
      #endif`
    )
  }
  material.customProgramCacheKey = () => 'zone-shader'
}

/** Texture name patterns that indicate water surfaces */
const WATER_NAME_RE = /water|sea|umi|wtr|river|wave|pool|lake|aqua|suimen|suime|mizu|ike|kawa|taki/i

function isWaterMesh(prefab: { textureName?: string; blending: number }): boolean {
  return WATER_NAME_RE.test(prefab.textureName ?? '')
}

/** Texture name category prefixes for FFXI's built-in sky/weather/effect system.
 *  These meshes are cloud layers, sky gradients, stars, moon geometry, and
 *  environmental effects (crystals, mist, rainbows, teleport FX, lens flares)
 *  that either conflict with our procedural sky or require special blend modes
 *  (additive/alpha) that we don't replicate — rendering them opaque produces
 *  wrong colors (e.g. blue surfaces in Ru'Aun Gardens). */
const SKY_WEATHER_RE = /^(aura|fine|suny|wind|star|moon|effect|lf\d+)\s/i

function isSkyWeatherMesh(prefab: { textureName?: string }): boolean {
  return SKY_WEATHER_RE.test(prefab.textureName ?? '')
}



const WATER_VERT = /* glsl */ `
  attribute vec3 color;

  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vViewDir;
  varying vec3 vWorldNormal;
  varying vec3 vColor;

  void main() {
    vUv = uv;
    vColor = color;

    #ifdef USE_INSTANCING
      vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
      vWorldNormal = normalize(mat3(modelMatrix * instanceMatrix) * normal);
      vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    #else
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldNormal = normalize(mat3(modelMatrix) * normal);
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    #endif

    vWorldPos = worldPos.xyz;
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * mvPosition;
  }
`

const WATER_FRAG = /* glsl */ `
  uniform sampler2D map;
  uniform float time;

  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vViewDir;
  varying vec3 vWorldNormal;
  varying vec3 vColor;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  void main() {
    // Dual-layer animated UVs for wave motion
    vec2 uv1 = vUv + vec2(time * 0.03, time * 0.02);
    vec2 uv2 = vUv * 1.3 + vec2(-time * 0.02, time * 0.035);
    vec4 tex = mix(texture2D(map, uv1), texture2D(map, uv2), 0.5);

    // Apply vertex color (baked lighting)
    vec3 color = tex.rgb * vColor;

    // Ripple specular highlights
    float ripple = noise(vWorldPos.xz * 0.5 + time * 0.8);
    color += vec3(0.04) * smoothstep(0.55, 0.8, ripple);

    // Fresnel: transparent looking down, opaque at grazing angles
    float fresnel = pow(1.0 - max(dot(normalize(vViewDir), normalize(vWorldNormal)), 0.0), 3.0);
    float alpha = mix(0.3, 0.8, fresnel) * tex.a;

    // Discard fully transparent fragments (texture alpha edges)
    if (alpha < 0.01) discard;

    gl_FragColor = vec4(color, alpha);
  }
`

function createWaterMaterial(
  texture: THREE.DataTexture | null,
): THREE.ShaderMaterial {
  const uniforms: Record<string, { value: unknown }> = {
    time: { value: 0 },
  }
  if (texture) {
    uniforms.map = { value: texture }
  }

  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  })
}

/** Updates water material time uniforms each frame */
function WaterAnimator({ materials }: { materials: THREE.ShaderMaterial[] }) {
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    for (const mat of materials) {
      mat.uniforms.time.value = t
    }
  })
  return null
}

/** Updates sky material uniforms + exposure + fog color every frame from the timeOfDay ref */
function SkyAnimator({ skyMaterial, timeOfDayRef }: { skyMaterial: THREE.ShaderMaterial; timeOfDayRef: React.RefObject<number> }) {
  const { gl, scene } = useThree()
  useFrame(() => {
    const tod = timeOfDayRef.current
    const params = getTimeOfDayParams(tod)

    // Sky uniforms
    const u = skyMaterial.uniforms
    u.skyColor.value.set(...params.sky)
    u.horizonColor.value.set(...params.horizon)
    u.zenithColor.value.set(...params.zenith)
    u.nightFactor.value = params.nightFactor
    const sunAngle = ((tod - 6) / 12) * Math.PI
    u.sunDir.value.set(Math.cos(sunAngle), Math.sin(sunAngle), -0.3).normalize()

    // Exposure
    gl.toneMappingExposure = params.exposure

    // Fog color
    if (scene.fog) {
      (scene.fog as THREE.FogExp2).color.set(params.fogColor)
    }
  })
  return null
}

export default function ThreeZoneViewer({ zoneData, fogDensity = 0, timeOfDay = 12, cameraMode = 'orbit', onFlySpeedChange, spawns, showSpawns, showSkybeams, onSpawnHover, flyToTarget, debugVertexColors = false }: ThreeZoneViewerProps) {
  const hoveringSpawn = useRef(false)

  // Shared uniform refs for height fog — values updated once bounding box is known
  const fogUniforms = useRef({
    fogHeightBase: { value: 0 },
    fogHeightRange: { value: 100 },
  })

  // TimeOfDay ref — updated here in React DOM land (guaranteed to re-render),
  // then read by SkyAnimator's useFrame inside the R3F reconciler
  const timeOfDayRef = useRef(timeOfDay)
  timeOfDayRef.current = timeOfDay

  // Sky material — created once, uniforms updated every frame by SkyAnimator
  const skyMaterial = useMemo(() => {
    const initParams = getTimeOfDayParams(12)
    return new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        skyColor: { value: new THREE.Vector3(...initParams.sky) },
        horizonColor: { value: new THREE.Vector3(...initParams.horizon) },
        zenithColor: { value: new THREE.Vector3(...initParams.zenith) },
        nightFactor: { value: initParams.nightFactor },
        sunDir: { value: new THREE.Vector3(0, 1, -0.3).normalize() },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPos.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 skyColor;
        uniform vec3 horizonColor;
        uniform vec3 zenithColor;
        uniform float nightFactor;
        uniform vec3 sunDir;

        varying vec3 vWorldPosition;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                     mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        float fbm(vec2 p) {
          float v = 0.0;
          v += 0.5 * noise(p); p *= 2.01;
          v += 0.25 * noise(p); p *= 2.02;
          v += 0.125 * noise(p);
          return v;
        }

        void main() {
          vec3 dir = normalize(vWorldPosition);
          float y = dir.y;

          vec3 groundColor = zenithColor * 0.3;

          vec3 color;
          if (y < 0.0) {
            float t = smoothstep(-0.4, 0.0, y);
            color = mix(groundColor, horizonColor, t);
          } else {
            float t = smoothstep(0.0, 0.4, y);
            float t2 = smoothstep(0.4, 1.0, y);
            color = mix(horizonColor, skyColor, t);
            color = mix(color, zenithColor, t2);

            // Cloud wisps (fade out at night)
            if (y > 0.05) {
              vec2 uv = dir.xz / (y + 0.1) * 0.3;
              float clouds = fbm(uv * 3.0);
              clouds = smoothstep(0.35, 0.65, clouds);
              float cloudFade = smoothstep(0.05, 0.25, y) * (1.0 - smoothstep(0.6, 0.9, y));
              vec3 cloudColor = mix(vec3(0.9, 0.92, 0.95), horizonColor * 1.2, nightFactor);
              color = mix(color, cloudColor, clouds * cloudFade * 0.5 * (1.0 - nightFactor * 0.6));
            }

            // Stars at night — spherical coords, point-like falloff
            if (nightFactor > 0.0 && y > 0.1) {
              float phi = atan(dir.x, dir.z);
              float theta = asin(clamp(dir.y, -1.0, 1.0));
              // Two layers at different densities
              for (int layer = 0; layer < 2; layer++) {
                float scale = layer == 0 ? 80.0 : 140.0;
                float threshold = layer == 0 ? 0.985 : 0.99;
                vec2 sv = vec2(phi, theta) * scale + float(layer) * vec2(37.0, 13.0);
                vec2 cell = floor(sv);
                vec2 f = fract(sv) - 0.5;
                float h = hash(cell);
                if (h > threshold) {
                  // Point-like: bright only near cell center
                  float d = length(f);
                  float point = smoothstep(0.25, 0.0, d);
                  float brightness = 0.4 + 0.6 * hash(cell + vec2(7.0, 13.0));
                  color += vec3(point * brightness * nightFactor * 0.6 * smoothstep(0.1, 0.35, y));
                }
              }
            }

            // Sun/moon glow
            float sunDot = max(dot(dir, sunDir), 0.0);
            if (sunDir.y > -0.1) {
              float sunGlow = pow(sunDot, 64.0) * 0.8;
              float sunHalo = pow(sunDot, 8.0) * 0.15;
              vec3 sunColor = mix(vec3(1.0, 0.95, 0.8), vec3(1.0, 0.5, 0.2), smoothstep(0.1, -0.05, sunDir.y));
              color += sunColor * (sunGlow + sunHalo) * (1.0 - nightFactor);
            }
            if (nightFactor > 0.3) {
              float moonDot = max(dot(dir, -sunDir), 0.0);
              float moonGlow = pow(moonDot, 128.0) * 0.6;
              float moonHalo = pow(moonDot, 16.0) * 0.08;
              color += vec3(0.7, 0.75, 0.9) * (moonGlow + moonHalo) * nightFactor;
            }
          }

          gl_FragColor = vec4(color, 1.0);
        }
      `,
    })
  }, [])

  const { instancedMeshes, waterMaterials, totalInstances, disposeAll } = useMemo(() => {
    const geometries: THREE.BufferGeometry[] = []
    const materials: THREE.Material[] = []
    const waterMaterials: THREE.ShaderMaterial[] = []

    // ── Build geometry + materials per prefab (keyed by original index) ──
    const uniqueTextureNames = new Set<string>()
    const waterNames: string[] = []
    const skippedNames: string[] = []

    // Use Maps keyed by original prefab index to keep alignment with instances
    const geoMap = new Map<number, THREE.BufferGeometry>()
    const matMap = new Map<number, THREE.Material>()

    for (let prefabIdx = 0; prefabIdx < zoneData.prefabs.length; prefabIdx++) {
      const prefab = zoneData.prefabs[prefabIdx]

      // Skip FFXI's built-in sky/weather meshes — we use our own procedural sky
      if (isSkyWeatherMesh(prefab)) {
        if (prefab.textureName) skippedNames.push(prefab.textureName)
        continue
      }

      const geometry = new THREE.BufferGeometry()

      geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(prefab.vertices), 3))
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(prefab.normals), 3))

      const rgbColors: number[] = []
      for (let i = 0; i < prefab.colors.length; i += 4) {
        rgbColors.push(prefab.colors[i], prefab.colors[i + 1], prefab.colors[i + 2])
      }
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(rgbColors), 3))

      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(prefab.uvs), 2))

      let maxIndex = 0
      for (let i = 0; i < prefab.indices.length; i++) {
        if (prefab.indices[i] > maxIndex) maxIndex = prefab.indices[i]
      }
      if (maxIndex > 65535) {
        geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(prefab.indices), 1))
      } else {
        geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(prefab.indices), 1))
      }

      geometry.computeBoundingBox()
      geometries.push(geometry)
      geoMap.set(prefabIdx, geometry)

      // Build texture (shared between water and standard paths)
      const tex = debugVertexColors ? null : zoneData.textures[prefab.materialIndex]
      let texture: THREE.DataTexture | null = null
      if (tex) {
        texture = new THREE.DataTexture(new Uint8Array(tex.rgba), tex.width, tex.height, THREE.RGBAFormat)
        texture.wrapS = THREE.RepeatWrapping
        texture.wrapT = THREE.RepeatWrapping
        texture.needsUpdate = true
        texture.magFilter = THREE.LinearFilter
        texture.minFilter = THREE.LinearMipmapLinearFilter
        texture.generateMipmaps = true
        texture.flipY = false
      }

      if (prefab.textureName) uniqueTextureNames.add(prefab.textureName)

      if (isWaterMesh(prefab)) {
        if (prefab.textureName) waterNames.push(prefab.textureName)
        const waterMat = createWaterMaterial(texture)
        waterMaterials.push(waterMat)
        materials.push(waterMat)
        matMap.set(prefabIdx, waterMat)
      } else {
        // Unlit material — FFXI bakes all lighting into vertex colors.
        // blending>0 meshes use alphaTest for cutout (trees, foliage with flag set).
        // patchZoneShader boosts alpha for colored pixels before the test, so ground
        // tiles with low DXT3 alpha survive while black foliage backgrounds discard.
        const useAlpha = prefab.blending > 0
        const mat = new THREE.MeshBasicMaterial({
          ...(texture && { map: texture }),
          vertexColors: true,
          side: THREE.DoubleSide,
          ...(useAlpha && {
            alphaTest: 0.1,
            // Pull alpha-cutout overlays (foliage, detail decals) slightly toward camera
            // to prevent z-fighting with the ground surface beneath them
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1,
          }),
        })
        patchZoneShader(mat, fogUniforms.current)
        materials.push(mat)
        matMap.set(prefabIdx, mat)
      }
    }

    // Log texture/sky info
    console.log('[ZoneViewer] Unique texture names:', Array.from(uniqueTextureNames).sort())
    if (skippedNames.length > 0) {
      console.log('[ZoneViewer] Skipped sky/weather meshes:', skippedNames)
    }
    if (waterNames.length > 0) {
      console.log('[ZoneViewer] Water meshes detected:', waterNames)
    } else {
      console.log('[ZoneViewer] No water meshes detected from texture names')
    }

    // ── Group instances by prefab → create InstancedMesh objects ──
    const groups = new Map<number, THREE.Matrix4[]>()
    for (const inst of zoneData.instances) {
      // Skip instances that reference sky/weather prefabs
      if (!geoMap.has(inst.meshIndex)) continue
      let arr = groups.get(inst.meshIndex)
      if (!arr) {
        arr = []
        groups.set(inst.meshIndex, arr)
      }
      const matrix = new THREE.Matrix4()
      matrix.fromArray(inst.transform)
      arr.push(matrix)
    }

    const instancedMeshes: THREE.InstancedMesh[] = []
    for (const [meshIdx, matrices] of groups) {
      const geo = geoMap.get(meshIdx)
      const mat = matMap.get(meshIdx)
      if (!geo || !mat) continue

      const mesh = new THREE.InstancedMesh(geo, mat, matrices.length)
      mesh.frustumCulled = false
      for (let i = 0; i < matrices.length; i++) {
        mesh.setMatrixAt(i, matrices[i])
      }
      mesh.instanceMatrix.needsUpdate = true
      instancedMeshes.push(mesh)
    }

    console.log(`[ZoneViewer] ${instancedMeshes.length} instanced draw calls (from ${zoneData.instances.length} instances)`)

    const disposeAll = () => {
      geometries.forEach(g => g.dispose())
      materials.forEach(m => {
        if ('map' in m && (m as THREE.MeshBasicMaterial).map) {
          (m as THREE.MeshBasicMaterial).map!.dispose()
        }
        m.dispose()
      })
      instancedMeshes.forEach(m => m.dispose())
    }

    return { instancedMeshes, waterMaterials, totalInstances: zoneData.instances.length, disposeAll }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoneData, debugVertexColors])

  const { center, size, farPlane } = useMemo(() => {
    const bbox = new THREE.Box3()
    for (const inst of zoneData.instances) {
      const prefab = zoneData.prefabs[inst.meshIndex]
      if (!prefab) continue
      // Transform translations — flip Y to match the Math.PI rotation
      const x = inst.transform[12], y = -inst.transform[13], z = -inst.transform[14]
      bbox.expandByPoint(new THREE.Vector3(x, y, z))
    }

    const center = new THREE.Vector3()
    const sizeVec = new THREE.Vector3()
    bbox.getCenter(center)
    bbox.getSize(sizeVec)
    const diagonalSize = Math.sqrt(sizeVec.x ** 2 + sizeVec.y ** 2 + sizeVec.z ** 2) || 100
    const size = diagonalSize
    const farPlane = Math.max(10000, diagonalSize * 3)

    // Height fog params — fog is thickest in the lower portion of the zone
    const verticalSize = sizeVec.y || 100
    fogUniforms.current.fogHeightBase.value = center.y - verticalSize * 0.3
    fogUniforms.current.fogHeightRange.value = verticalSize * 0.7

    return { center, size, farPlane }
  }, [zoneData])

  useEffect(() => {
    return () => { disposeAll() }
  }, [disposeAll])

  if (zoneData.prefabs.length === 0 || zoneData.instances.length === 0) {
    return null
  }

  const cx = center.x, cy = center.y, cz = center.z

  return (
    <Canvas
      camera={{ position: [cx, cy + size * 0.15, cz + size * 0.4], fov: 60, near: 1, far: farPlane }}
      gl={{ antialias: false, logarithmicDepthBuffer: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
      className="w-full h-full"
    >
      {/* SkyAnimator runs every frame — updates sky uniforms, exposure, and fog color from timeOfDayRef */}
      <SkyAnimator skyMaterial={skyMaterial} timeOfDayRef={timeOfDayRef} />

      {waterMaterials.length > 0 && <WaterAnimator materials={waterMaterials} />}

      {fogDensity > 0 ? (
        <>
          <SkyDome size={farPlane * 0.9} material={skyMaterial} />
          <FogController size={size} density={fogDensity} />
        </>
      ) : (
        <BackgroundUpdater timeOfDayRef={timeOfDayRef} />
      )}

      {cameraMode === 'orbit' ? (
        <SmartOrbitControls defaultTarget={center} size={size} />
      ) : (
        <FlyCamera center={center} size={size} onSpeedChange={onFlySpeedChange} hoveringSpawnRef={hoveringSpawn} />
      )}

      <CameraFlyTo target={flyToTarget ?? null} />

      {/* FFXI uses inverted Y — flip with Math.PI rotation like entity viewer.
          Instanced rendering: one InstancedMesh per prefab group, created imperatively. */}
      <group rotation={[Math.PI, 0, 0]}>
        {instancedMeshes.map((mesh, i) => (
          <primitive key={i} object={mesh} />
        ))}
        <SpawnMarkers spawns={spawns ?? []} visible={showSpawns ?? false} onHover={(spawn, pos) => {
          hoveringSpawn.current = spawn !== null
          onSpawnHover?.(spawn, pos)
        }} />
        {showSkybeams && spawns && spawns.length > 0 && (
          <SpawnSkybeams spawns={spawns} />
        )}
      </group>

      {/* Post-processing — SMAA replaces MSAA (antialias: false above).
          Skip SSAO for large zones (2000+ instances) to stay interactive. */}
      {totalInstances < 2000 ? (
        <EffectComposer multisampling={0}>
          <SMAA />
          <N8AO aoRadius={totalInstances < 500 ? 2 : 1} intensity={1.5} distanceFalloff={0.5} halfRes />
          <Bloom luminanceThreshold={0.8} luminanceSmoothing={0.4} intensity={0.3} mipmapBlur />
          <HueSaturation saturation={0.2} />
          <BrightnessContrast contrast={0.08} />
          <Vignette offset={0.3} darkness={0.4} />
        </EffectComposer>
      ) : (
        <EffectComposer multisampling={0}>
          <SMAA />
          <Bloom luminanceThreshold={0.8} luminanceSmoothing={0.4} intensity={0.3} mipmapBlur />
          <HueSaturation saturation={0.2} />
          <BrightnessContrast contrast={0.08} />
          <Vignette offset={0.3} darkness={0.4} />
        </EffectComposer>
      )}
    </Canvas>
  )
}

/** Updates background color every frame when atmosphere is off */
/** Updates background color every frame when atmosphere is off */
function BackgroundUpdater({ timeOfDayRef }: { timeOfDayRef: React.RefObject<number> }) {
  const { scene } = useThree()
  useEffect(() => {
    scene.background = new THREE.Color()
    return () => { scene.background = null }
  }, [scene])
  useFrame(() => {
    if (scene.background instanceof THREE.Color) {
      const params = getTimeOfDayParams(timeOfDayRef.current)
      scene.background.setRGB(params.sky[0] * 0.3, params.sky[1] * 0.3, params.sky[2] * 0.3)
    }
  })
  return null
}

/** Sky dome mesh — just tracks the camera. Uniforms updated by SkyAnimator. */
function SkyDome({ size, material }: { size: number; material: THREE.ShaderMaterial }) {
  const meshRef = useRef<THREE.Mesh>(null)
  useFrame(({ camera }) => {
    if (meshRef.current) meshRef.current.position.copy(camera.position)
  })
  return (
    <mesh ref={meshRef} renderOrder={-1}>
      <sphereGeometry args={[size, 32, 32]} />
      <primitive object={material} attach="material" />
    </mesh>
  )
}

/** Applies exponential fog — density only, color updated by SkyAnimator */
function FogController({ size, density }: { size: number; density: number }) {
  const { scene } = useThree()
  useEffect(() => {
    const fogDensity = (density * 1.8) / size
    scene.fog = new THREE.FogExp2('#b8c8d8', fogDensity)
    return () => { scene.fog = null }
  }, [scene, size, density])
  return null
}

/** OrbitControls that targets where the camera is looking, not a fixed point */
function SmartOrbitControls({ size }: { defaultTarget: THREE.Vector3; size: number }) {
  const { camera } = useThree()

  const target = useMemo(() => {
    // Cast a ray from the camera forward to find a reasonable orbit point
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
    // Place the target a short distance in front of the camera
    const dist = Math.min(size * 0.5, 200)
    return camera.position.clone().add(dir.multiplyScalar(dist))
  }, [camera, size])

  return <OrbitControls target={target} maxDistance={size * 5} />
}

/** Smoothly animates the camera to look at a target position from a nearby offset */
function CameraFlyTo({ target }: { target: { x: number; y: number; z: number } | null }) {
  const { camera } = useThree()
  const animating = useRef(false)
  const startPos = useRef(new THREE.Vector3())
  const endPos = useRef(new THREE.Vector3())
  const endLook = useRef(new THREE.Vector3())
  const progress = useRef(0)

  useEffect(() => {
    if (!target) return
    // Exit pointer lock so the fly camera doesn't fight with the animation
    if (document.pointerLockElement) document.exitPointerLock()
    // The scene group has rotation=[Math.PI, 0, 0] which inverts both Y and Z.
    // Convert spawn local coords to world space for the camera.
    const worldTarget = new THREE.Vector3(target.x, -target.y, -target.z)
    // Position camera slightly above and offset so the spawn is centered in view
    const dir = new THREE.Vector3().subVectors(camera.position, worldTarget)
    dir.y = 0
    if (dir.lengthSq() < 0.01) dir.set(0, 0, 1) // fallback if camera is directly above
    dir.normalize().multiplyScalar(25)
    startPos.current.copy(camera.position)
    endPos.current.copy(worldTarget).add(dir).setY(worldTarget.y + 15)
    endLook.current.copy(worldTarget)
    progress.current = 0
    animating.current = true
  }, [target, camera])

  useFrame((_, delta) => {
    if (!animating.current) return
    progress.current = Math.min(1, progress.current + delta * 1.5)
    // Smooth ease-out
    const t = 1 - Math.pow(1 - progress.current, 3)
    camera.position.lerpVectors(startPos.current, endPos.current, t)
    camera.lookAt(endLook.current)
    if (progress.current >= 1) animating.current = false
  })

  return null
}

function FlyCamera({ center, size, onSpeedChange, hoveringSpawnRef }: { center: THREE.Vector3; size: number; onSpeedChange?: (speed: number) => void; hoveringSpawnRef: React.RefObject<boolean> }) {
  const { camera, gl } = useThree()
  const moveState = useRef({ forward: false, backward: false, left: false, right: false, up: false, down: false })
  const speed = useRef(size * 0.003)
  const locked = useRef(false)
  const initialized = useRef(false)

  useEffect(() => {
    // Only set position on first mount (zone load), not on mode switch
    if (!initialized.current) {
      camera.position.set(center.x, center.y + size * 0.15, center.z + size * 0.4)
      camera.lookAt(center)
      initialized.current = true
    }
    onSpeedChange?.(speed.current)

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyW') moveState.current.forward = true
      if (e.code === 'KeyS') moveState.current.backward = true
      if (e.code === 'KeyA') moveState.current.left = true
      if (e.code === 'KeyD') moveState.current.right = true
      if (e.code === 'Space' || e.code === 'KeyE') moveState.current.up = true
      if (e.code === 'ShiftLeft' || e.code === 'KeyQ') moveState.current.down = true
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'KeyW') moveState.current.forward = false
      if (e.code === 'KeyS') moveState.current.backward = false
      if (e.code === 'KeyA') moveState.current.left = false
      if (e.code === 'KeyD') moveState.current.right = false
      if (e.code === 'Space' || e.code === 'KeyE') moveState.current.up = false
      if (e.code === 'ShiftLeft' || e.code === 'KeyQ') moveState.current.down = false
    }
    const onWheel = (e: WheelEvent) => {
      speed.current = Math.max(0.05, speed.current * (e.deltaY > 0 ? 1.25 : 0.8))
      onSpeedChange?.(speed.current)
    }
    const onClick = () => {
      if (hoveringSpawnRef.current) return
      gl.domElement.requestPointerLock()
    }
    const onPointerLockChange = () => {
      locked.current = !!document.pointerLockElement
    }
    const onMouseMove = (e: MouseEvent) => {
      if (!locked.current) return
      const euler = new THREE.Euler(0, 0, 0, 'YXZ')
      euler.setFromQuaternion(camera.quaternion)
      euler.y -= e.movementX * 0.002
      euler.x -= e.movementY * 0.002
      euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.x))
      camera.quaternion.setFromEuler(euler)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    gl.domElement.addEventListener('wheel', onWheel)
    gl.domElement.addEventListener('click', onClick)
    document.addEventListener('pointerlockchange', onPointerLockChange)
    document.addEventListener('mousemove', onMouseMove)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      gl.domElement.removeEventListener('wheel', onWheel)
      gl.domElement.removeEventListener('click', onClick)
      document.removeEventListener('pointerlockchange', onPointerLockChange)
      document.removeEventListener('mousemove', onMouseMove)
      if (document.pointerLockElement) document.exitPointerLock()
    }
  }, [camera, gl, center, size, onSpeedChange])

  useFrame(() => {
    if (!locked.current) return
    const dir = new THREE.Vector3()
    const s = speed.current
    if (moveState.current.forward) dir.z -= s
    if (moveState.current.backward) dir.z += s
    if (moveState.current.left) dir.x -= s
    if (moveState.current.right) dir.x += s
    if (moveState.current.up) dir.y += s
    if (moveState.current.down) dir.y -= s
    dir.applyQuaternion(camera.quaternion)
    camera.position.add(dir)
  })

  return null
}

<script lang="ts">
import { onDestroy, onMount } from 'svelte'
import * as _3 from 'three'
import background from '@/lib/assets/empty-sekai.png'
import { browser } from '$app/env'
import { on } from 'svelte/events'
import { Fragment } from '@/lib/fragment'
import { animate } from 'animejs'
import { clientHeight, clientWidth } from '@/lib/util'

interface Props {
  count: number
  onpointermove?: (event: PointerEvent) => void
  onmouseenter?: (id: number, frag: Fragment) => void | boolean
  onmouseleave?: (id: number, frag: Fragment) => void | boolean
  onclick?: (id: number, frag: Fragment) => void | boolean
  transient?: (listener: () => void) => void
}

const { count, onpointermove, onmouseenter, onmouseleave, onclick, transient }: Props = $props()

onMount(() => {
  transient?.(() => {
    const frag = Fragment.make(aspectRatio)
    frag.orbit = (3 * Math.PI) / 2
    frag.offsetH = 5
    frag.offsetV = 0
    frag.spinSpeed = 0.001
    transientFragment = frag
    group.add(frag.object)

    animate(frag, {
      offsetH: -100,
      spinSpeed: 0.0001,
      duration: 30000,
      onComplete() {
        group.remove(frag.object)
        transientFragment = null
        frag.dispose()
      },
    })
  })
})

let mouseover: _3.Mesh | null = null

const raycaster = new _3.Raycaster()
let isTouch: boolean = true
const pointer: _3.Vector2 = new _3.Vector2()

let renderTarget: HTMLCanvasElement
let backgroundEl: HTMLImageElement

let scene: _3.Scene
let camera: _3.PerspectiveCamera
let renderer: _3.WebGLRenderer
let group: _3.Object3D

let hemisphereLight: _3.HemisphereLight
let directionalLight: _3.DirectionalLight
let pointLight: _3.PointLight

let transientFragment: Fragment | null = null
let fragments: Fragment[] = []
let meshMap: Map<_3.Mesh, number> = new Map()

const CAMERA_X = 0
const CAMERA_Y = 1.5
const CAMERA_Z = -55

let aspectRatio = { current: 1.0 }
let viewportHeight = $state(512)
let viewportWidth = $state(512)

const updatePointer = (event: PointerEvent) => {
  isTouch = event.pointerType === 'touch'
  pointer.x = (event.pageX / clientWidth()) * 2 - 1
  pointer.y = -(event.pageY / clientHeight()) * 2 + 1

  if (backgroundEl) {
    if (isTouch) backgroundEl.style.translate = ''
    else backgroundEl.style.translate = `${-50 + pointer.x * 0.1}% ${-50 - pointer.y * 0.1}%`
  }

  updateIntersection()
}

onMount(() => {
  on(window, 'pointermove', (e) => {
    updatePointer(e)
    onpointermove?.(e)
  })

  on(window, 'pointerdown', (e) => {
    updatePointer(e)
    onpointermove?.(e)
  })

  on(window, 'pointerup', (e) => {
    updatePointer(e)
    onpointermove?.(e)
  })

  viewportHeight = clientHeight()
  viewportWidth = clientWidth()
  on(window, 'resize', () => {
    viewportHeight = clientHeight()
    viewportWidth = clientWidth()
  })
})

onMount(() => {
  scene = new _3.Scene()
  scene.fog = new _3.Fog(0xf9f9fb, 1, 100)

  hemisphereLight = new _3.HemisphereLight(0xf9f9fb, 0x6e7482, 2.0)
  scene.add(hemisphereLight)

  directionalLight = new _3.DirectionalLight(0xffffff, 4.0)
  directionalLight.castShadow = true
  directionalLight.position.set(2, 1, 1)
  directionalLight.target.position.set(0, 0, 0)
  scene.add(directionalLight)
  scene.add(directionalLight.target)

  pointLight = new _3.PointLight(0xffffff, 50.0)
  pointLight.castShadow = true
  pointLight.position.set(CAMERA_X, CAMERA_Y, CAMERA_Z)
  scene.add(pointLight)

  group = new _3.Object3D()
  scene.add(group)

  camera = new _3.PerspectiveCamera(/*fov=*/ 105, /*aspect=*/ 1.0, /*near=*/ 0.01, /*far=*/ 200)
  renderer = new _3.WebGLRenderer({ canvas: renderTarget, antialias: true, alpha: true })
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = _3.VSMShadowMap

  camera.position.set(CAMERA_X, CAMERA_Y, CAMERA_Z)
  camera.lookAt(0, 0, 0)

  renderer.setAnimationLoop(frame)
})

function clearScene() {
  group.clear()
  for (const frag of fragments) frag.dispose()
  fragments = []
  meshMap.clear()
}

onDestroy(() => {
  if (!browser) return
  console.log('Disposing Three.js resources')
  clearScene()
  hemisphereLight.dispose()
  directionalLight.dispose()
  pointLight.dispose()
  renderer.dispose()
})

function updateIntersection() {
  let newIntersect: _3.Mesh | undefined = undefined

  raycaster.setFromCamera(pointer, camera)
  const intersects = raycaster.intersectObjects(group.children, true)

  newIntersect = intersects
    .map((i) => i.object)
    .find((obj) => obj instanceof _3.Mesh && obj.material instanceof _3.MeshPhysicalMaterial) as
    _3.Mesh | undefined

  if (newIntersect !== mouseover) {
    if (mouseover) {
      const fragIndex = meshMap.get(mouseover)
      if (fragIndex != null) {
        const frag = fragments[fragIndex]
        if (onmouseleave?.(fragIndex, frag) !== false) frag.unhover()
      }
      mouseover = null
      renderTarget.style.cursor = 'default'
    }
    if (newIntersect) {
      renderTarget.style.cursor = 'pointer'
      mouseover = newIntersect
      const fragIndex = meshMap.get(mouseover)
      if (fragIndex != null) {
        const frag = fragments[fragIndex]
        if (onmouseenter?.(fragIndex, frag) !== false) frag.hover()
      }
    }
  }
}

function frame(now: DOMHighResTimeStamp) {
  for (let ix = 0; ix < fragments.length; ix++) {
    const fragment = fragments[ix]
    fragment.advance(now)
  }

  if (transientFragment) {
    transientFragment.update(now)
  }

  let x = isTouch ? 0 : pointer.x
  let y = isTouch ? 0 : pointer.y

  camera.position.set(CAMERA_X - x * 0.05 * aspectRatio.current, CAMERA_Y + y * 0.05, CAMERA_Z)
  pointLight.position.set(CAMERA_X - x * 2.5 * aspectRatio.current, CAMERA_Y + y * 2.5, CAMERA_Z)

  updateIntersection()
  renderer.render(scene, camera)
}

// Depends: innerWidth, innerHeight
$effect(() => {
  aspectRatio.current = viewportWidth / viewportHeight

  console.log(
    'Updating viewport to',
    viewportWidth,
    'x',
    viewportHeight,
    'with aspect ratio',
    aspectRatio.current,
  )

  camera.aspect = aspectRatio.current
  camera.updateProjectionMatrix()

  renderer.setSize(viewportWidth, viewportHeight)
  renderer.setPixelRatio(window.devicePixelRatio ?? 1)
  renderer.render(scene, camera)
})

// Depends: count
$effect(() => {
  console.log('Updating fragments to count =', count)

  while (fragments.length > count) {
    const frag = fragments.pop()
    if (!frag) break
    frag.dispose()
    group.remove(frag.object)
    meshMap.delete(frag.mesh)
  }

  while (fragments.length < count) {
    const frag = Fragment.make(aspectRatio)
    fragments.push(frag)
    group.add(frag.object)
    meshMap.set(frag.mesh, fragments.length - 1)
  }
})

function handleClick() {
  if (!mouseover) return

  const fragIndex = meshMap.get(mouseover)
  if (fragIndex == null) return

  const frag = fragments[fragIndex]
  if (onclick?.(fragIndex, frag) !== false) frag.poke()
}
</script>

<div class="relative h-lvh w-lvw overflow-hidden">
  <img
    bind:this={backgroundEl}
    src={background}
    alt="Background"
    class="fixed top-[50%] left-[50%] -z-10 aspect-auto h-10 min-h-[101dvh] min-w-[101dvw] translate-x-[-50%] translate-y-[-50%] object-cover"
  />
  <canvas bind:this={renderTarget} class="h-0 w-0" onclick={(_e) => handleClick()}></canvas>
</div>

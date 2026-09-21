// ---------------------------------------------------------------------------
// fx.js — the night-time set dressing that sells US-167 as a real place.
//
// graphics.js owns the material pass and the post chain; this module owns the
// effects that live IN the world:
//
//   * volumetric light shafts, ground light pools and lens halos under every
//     streetlamp and lot pole,
//   * working headlights and tail lights on whatever the player is driving,
//   * wet asphalt — damp everywhere, standing water in the dips — with a planar
//     mirror pass so lamps, neon and headlights reflect in the road.
//
// Every material here is tagged `gtbRealized`, otherwise realize()'s final
// sweep would swap these shaders out for plain MeshStandardMaterials.
// ---------------------------------------------------------------------------

import * as THREE from "three";

const shared = { uTime: { value: 0 } };

/** Advance the shared animation clock (beam dust drift). */
export function updateFx(dt) {
  shared.uTime.value += dt;
}

// --------------------------------------------------------------- beams
// Open unit cone, apex at the origin, opening down -Y to a unit-radius base at
// y = -1. Lamps scale it; headlights rotate it to point forward.
const coneGeo = new THREE.ConeGeometry(1, 1, 28, 6, true).translate(0, -0.5, 0);
const poolGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

const BEAM_VERT = /* glsl */ `
  varying float vAlong;
  varying vec3 vNormalW;
  varying vec3 vToEye;
  varying float vWorldY;
  void main() {
    vAlong = -position.y;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldY = wp.y;
    // the cones are scaled non-uniformly, so use the proper normal matrix
    vNormalW = normalize(transpose(inverse(mat3(modelMatrix))) * normal);
    vToEye = cameraPosition - wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const BEAM_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity, uTime, uGround, uFar;
  varying float vAlong;
  varying vec3 vNormalW;
  varying vec3 vToEye;
  varying float vWorldY;
  void main() {
    float dist = length(vToEye);
    vec3 V = vToEye / dist;
    // Brightest where the eye looks through the most lit haze, fading to
    // nothing at the silhouette, so the cone never shows a hard edge.
    float body = pow(abs(dot(normalize(vNormalW), V)), 1.5);
    float along = smoothstep(0.0, 0.08, vAlong) * pow(max(0.0, 1.0 - vAlong), 1.6);
    // fade out before the cone meets the ground instead of clipping into it
    float ground = smoothstep(0.0, uGround, vWorldY);
    float far = 1.0 - smoothstep(uFar * 0.45, uFar, dist);
    float dust = 0.85 + 0.15 * sin(vAlong * 11.0 - uTime * 0.9 + vWorldY * 2.3);
    gl_FragColor = vec4(uColor * body * along * ground * far * dust * uIntensity, 1.0);
  }
`;

function beamMaterial(color, intensity, ground, far) {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uIntensity: { value: intensity },
      uGround: { value: ground },
      uFar: { value: far },
      uTime: shared.uTime,
    },
    vertexShader: BEAM_VERT,
    fragmentShader: BEAM_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
  m.userData.gtbRealized = true;
  return m;
}

// Light pooled on the ground under a lamp. Up close the recycled PointLight
// from main.js's light pool does this properly, so the decal stays faint there
// and only carries the lamps that are too far away to get a real light.
const POOL_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const POOL_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    float r = length(vUv * 2.0 - 1.0);
    float a = pow(max(0.0, 1.0 - r), 2.4);
    float dist = length(cameraPosition - vWorld);
    float k = mix(0.3, 1.0, smoothstep(30.0, 70.0, dist)) * (1.0 - smoothstep(110.0, 170.0, dist));
    gl_FragColor = vec4(uColor * a * uIntensity * k, 1.0);
  }
`;

function poolMaterial(color, intensity) {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uIntensity: { value: intensity },
    },
    vertexShader: POOL_VERT,
    fragmentShader: POOL_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  m.userData.gtbRealized = true;
  return m;
}

let haloTex = null;
function haloTexture() {
  if (haloTex) return haloTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.08, "rgba(255,255,255,0.85)");
  g.addColorStop(0.3, "rgba(255,255,255,0.2)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  haloTex = new THREE.CanvasTexture(c);
  haloTex.colorSpace = THREE.SRGBColorSpace;
  return haloTex;
}

/** Additive lens halo. `strength` > 1 pushes it into HDR so bloom picks it up. */
function haloSprite(color, size, strength) {
  const m = new THREE.SpriteMaterial({
    map: haloTexture(),
    color: new THREE.Color(color).multiplyScalar(strength),
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  m.userData.gtbRealized = true;
  const s = new THREE.Sprite(m);
  s.scale.setScalar(size);
  return s;
}

// --------------------------------------------------------------- lamps
/**
 * Dress one entry of main.js's `litSpots`: a light shaft down to the ground,
 * a pool of light where it lands and a halo at the bulb. `pole: true` also
 * builds the pole and lamp head, for lot lights that had no geometry at all.
 */
/**
 * Render layer for the wet-road mirror (TASK-012). The mirror camera renders this
 * layer ONLY, so a full second pass over the world became a pass over the handful
 * of bright things a wet road actually shows: lamp glows, beams, headlights, tail
 * lights. Everything else still draws normally in the main pass — enabling this
 * layer does not remove an object from layer 0.
 *
 * Reflect something else with `reflect(obj)`. Lit geometry is deliberately left
 * out: nothing on this layer needs a light, so the mirror pass carries no lights.
 */
export const MIRROR_LAYER = 1;
export function reflect(obj, on = true) {
  obj.traverse((o) => (on ? o.layers.enable(MIRROR_LAYER) : o.layers.disable(MIRROR_LAYER)));
  return obj;
}

export function addLamp(scene, spot) {
  const { x, y, z } = spot;
  const color = spot.warm != null ? spot.warm : 0xffd9a0;
  const reach = spot.range || 24;
  const g = new THREE.Group();
  g.position.set(x, 0, z);

  const spread = y * 0.62;
  const shaft = new THREE.Mesh(coneGeo, beamMaterial(color, 0.3, 1.4, 150));
  shaft.position.y = y - 0.15;
  shaft.scale.set(spread, y, spread);

  const pool = new THREE.Mesh(poolGeo, poolMaterial(color, 0.55));
  pool.position.y = 0.07;
  pool.scale.setScalar(Math.min(reach, spread * 2.6));

  const glow = haloSprite(color, 1.2 + y * 0.28, 1.6);
  glow.position.y = y - 0.3;

  for (const o of [shaft, pool]) {
    o.castShadow = false;
    o.receiveShadow = false;
  }
  g.add(shaft, pool, glow);
  // Everything that only exists because the lamp is LIT, so main.js can switch it
  // off in daylight (daycycle.js) and leave the pole standing.
  g.userData.glows = [shaft, pool, glow];
  // the beam and the halo reflect; the light pool does not — it lies flat on the
  // road, and a reflection of it is a second pool at the same place
  reflect(shaft);
  reflect(glow);

  if (spot.pole) {
    // left untagged on purpose: realize() gives it the chrome/steel surface
    const steel = new THREE.MeshStandardMaterial({ name: "steel pole", color: 0x3a3d40 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, y + 0.4, 10), steel);
    pole.position.y = (y + 0.4) / 2;
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.28, 0.62), steel);
    head.position.y = y + 0.3;
    pole.castShadow = head.castShadow = true;
    const lensMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(6) });
    lensMat.userData.gtbRealized = true;
    const lens = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.46).rotateX(Math.PI / 2), lensMat);
    lens.position.y = y + 0.15;
    g.add(pole, head, lens);
    g.userData.glows.push(lens);
    reflect(lens);
  }

  scene.add(g);
  return g;
}

// --------------------------------------------------------------- headlights
function measure(obj) {
  // measure un-rotated, so front/back are the model's own +z / -z
  const rot = obj.rotation.clone();
  obj.rotation.set(0, 0, 0);
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  obj.rotation.copy(rot);
  obj.updateMatrixWorld(true);
  const p = obj.position;
  return {
    front: box.max.z - p.z,
    back: box.min.z - p.z,
    half: (box.max.x - box.min.x) / 2,
    low: box.min.y - p.y,
    high: box.max.y - p.y,
  };
}

/**
 * Two real SpotLights plus beams, lens flares and tail lights, riding on the
 * player's current vehicle. The lights stay in the scene permanently at zero
 * intensity when unused: adding or hiding a light changes the light count,
 * which recompiles every lit shader in the scene mid-game.
 */
export function createHeadlights(scene) {
  const rig = new THREE.Group();
  scene.add(rig);
  const warm = 0xfff0d8;

  const lamps = [-1, 1].map((sx) => {
    const light = new THREE.SpotLight(warm, 0, 70, 0.46, 0.6, 1.3);
    const target = new THREE.Object3D();
    light.target = target;
    const beam = new THREE.Mesh(coneGeo, beamMaterial(warm, 0, 0.35, 120));
    // point the cone's -Y opening along the car's +Z, dipped slightly
    beam.rotation.x = -Math.PI / 2 + 0.1;
    beam.scale.set(2.6, 16, 2.6);
    beam.visible = false;
    const lens = haloSprite(warm, 1.1, 2.4);
    const tail = haloSprite(0xff2a1a, 0.7, 1.6);
    rig.add(light, target, beam, lens, tail);
    for (const o of [beam, lens, tail]) reflect(o);
    return { sx, light, target, beam, lens, tail };
  });

  let current = null;
  let dims = null;
  let level = 0;
  let brake = 0;
  let lastSpeed = 0;

  return {
    update(dt, veh) {
      if (veh && veh !== current) {
        current = veh;
        dims = veh.fxDims || (veh.fxDims = measure(veh.obj));
        lastSpeed = veh.speed;
      }
      // switch on quickly getting in, fade out after getting out
      level = THREE.MathUtils.damp(level, veh ? 1 : 0, veh ? 6 : 2.5, dt);
      if (!current) return;

      rig.position.copy(current.obj.position);
      rig.quaternion.copy(current.obj.quaternion);

      const speed = veh ? veh.speed : 0;
      const decel = (Math.abs(lastSpeed) - Math.abs(speed)) / Math.max(dt, 1e-3);
      lastSpeed = speed;
      brake = THREE.MathUtils.damp(brake, veh && decel > 4 ? 1 : 0, 10, dt);

      const y = dims.low + (dims.high - dims.low) * 0.4;
      const on = level > 0.01;
      for (const L of lamps) {
        const lx = L.sx * dims.half * 0.62;
        L.light.position.set(lx, y, dims.front - 0.1);
        L.target.position.set(lx * 1.4, -2.2, dims.front + 18);
        L.light.intensity = 420 * level;
        L.beam.position.set(lx, y, dims.front);
        L.beam.visible = on;
        L.beam.material.uniforms.uIntensity.value = 0.22 * level;
        L.lens.position.set(lx, y, dims.front + 0.12);
        L.lens.visible = on;
        L.lens.material.opacity = level;
        L.tail.position.set(L.sx * dims.half * 0.7, y + 0.1, dims.back - 0.1);
        L.tail.visible = on;
        L.tail.material.opacity = level * (0.45 + 0.55 * brake);
        L.tail.scale.setScalar(0.6 + 0.5 * brake);
      }
    },
  };
}

// --------------------------------------------------------------- wet roads
const WET_PARS = /* glsl */ `
  uniform sampler2D uReflect;
  uniform mat4 uReflectMat;
  uniform float uReflectOn, uWetness, uReflectStrength, uWetFade;
  varying vec3 vWetWorld;
  float gtbWetHash(vec2 p) {
    p = fract(p * vec2(233.34, 851.73));
    p += dot(p, p + 23.45);
    return fract(p.x * p.y);
  }
  float gtbWetNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = gtbWetHash(i);
    float b = gtbWetHash(i + vec2(1.0, 0.0));
    float c = gtbWetHash(i + vec2(0.0, 1.0));
    float d = gtbWetHash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  // Standing water in world space, so puddles line up across the road, the
  // aprons and the lots instead of restarting at every mesh's UVs.
  // Wide smoothstep so the rim feathers from damp into standing water; a
  // narrow one gave hard black blotches that read as oil spills.
  float gtbPuddles(vec2 p) {
    float n = gtbWetNoise(p * 0.09) * 0.66
            + gtbWetNoise(p * 0.27 + 17.0) * 0.27
            + gtbWetNoise(p * 1.3 + 3.0) * 0.07;
    return smoothstep(0.5, 0.68, n);
  }
`;

// after roughnessmap_fragment: diffuseColor and roughnessFactor both exist
const WET_SURFACE = /* glsl */ `
  // uWetFade fades the whole wet look out with camera height (see
  // MAX_EYE_HEIGHT below) — a road's roughness drops to 0.03 for standing
  // water, and from the dev-mode map editor's near-vertical, far-zoomed-out
  // camera that mirror-smooth surface catches the moon as a blown-out white
  // highlight band across the whole visible road at once. Not reachable from
  // any normal gameplay camera, only the free-fly one, so fading it out by
  // height (rather than retuning the specular response) leaves ground-level
  // wet asphalt untouched.
  float gtbPuddle = gtbPuddles(vWetWorld.xz) * uWetFade;
  float gtbWet = max(uWetness * uWetFade, gtbPuddle);
  // water fills the pores: the surface goes darker and far glossier
  diffuseColor.rgb *= mix(1.0, 0.55, gtbWet);
  roughnessFactor = mix(roughnessFactor * mix(1.0, 0.5, uWetness * uWetFade), 0.03, gtbPuddle);
`;

// a puddle's surface is flat water, whatever the aggregate under it does
const WET_NORMAL = /* glsl */ `
  normal = normalize(mix(normal, normalize(vNormal), gtbPuddle * 0.9));
`;

const WET_REFLECT = /* glsl */ `
  if (uReflectOn > 0.5) {
    vec4 gtbClip = uReflectMat * vec4(vWetWorld, 1.0);
    // ripple the mirror by however far the surface normal leans off flat
    vec2 gtbUv = gtbClip.xy / gtbClip.w + (normal.xy - normalize(vNormal).xy) * 0.06;
    vec3 gtbRefl = texture2D(uReflect, gtbUv).rgb;
    float gtbNdV = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
    float gtbFres = 0.12 + 0.88 * pow(1.0 - gtbNdV, 3.0);
    outgoingLight += gtbRefl * gtbFres * mix(0.25, 1.0, gtbPuddle) * gtbWet * uReflectStrength;
  }
`;

/**
 * Wet asphalt with planar reflections. Every material generated by
 * `surface("asphalt")` (tagged `userData.surfaceKind`) gets the wet shader;
 * when the tier allows it, the scene is also re-rendered from a camera
 * mirrored under the road into a half-float target the shader samples.
 */
export function createWetRoads(renderer, scene, camera) {
  const PLANE_Y = 0.03;           // road 0.02, aprons 0.02, lots 0.015–0.04
  const CLIP_BIAS = 0.003;
  const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType });
  rt.texture.generateMipmaps = false;

  const uniforms = {
    uReflect: { value: rt.texture },
    uReflectMat: { value: new THREE.Matrix4() },
    uReflectOn: { value: 0 },
    uWetness: { value: 0.6 },
    uReflectStrength: { value: 1.0 },
    uWetFade: { value: 1 },
  };

  const vcam = new THREE.PerspectiveCamera();
  vcam.layers.set(MIRROR_LAYER);          // see MIRROR_LAYER: the bright things only
  const meshes = [];
  const patched = new Set();
  let scale = 0;
  let interval = 1;      // re-render the mirror every Nth frame
  let frame = 0;

  function patch(mat) {
    if (patched.has(mat)) return;
    patched.add(mat);
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vWetWorld;")
        .replace("#include <project_vertex>",
          "#include <project_vertex>\nvWetWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\n" + WET_PARS)
        .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n" + WET_SURFACE)
        .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\n" + WET_NORMAL)
        .replace("#include <opaque_fragment>", WET_REFLECT + "\n#include <opaque_fragment>");
    };
    mat.customProgramCacheKey = () => "gtb-wet-road";
    // most of these already compiled during the idle ticks behind the menu
    mat.needsUpdate = true;
  }

  // Mirror `camera` in the road plane. Same construction as three's Reflector:
  // a reflected camera, a projective texture matrix, and an oblique near plane
  // so nothing under the road leaks into the reflection.
  const n = new THREE.Vector3(0, 1, 0);
  const onPlane = new THREE.Vector3();
  const eye = new THREE.Vector3();
  const view = new THREE.Vector3();
  const look = new THREE.Vector3();
  const target = new THREE.Vector3();
  const rot = new THREE.Matrix4();
  const plane = new THREE.Plane();
  const clip = new THREE.Vector4();
  const q = new THREE.Vector4();

  const MAX_EYE_HEIGHT = 50;   // see below

  function mirror() {
    eye.setFromMatrixPosition(camera.matrixWorld);
    onPlane.set(eye.x, PLANE_Y, eye.z);
    view.subVectors(onPlane, eye);
    if (view.dot(n) > 0) return false;               // camera under the road
    // The reflected camera sits at -eye.y below the plane. Normal gameplay
    // (chase cam, cinematics) never puts the real camera this high, but the
    // dev-mode map editor's free-fly camera does (up to ~340 m, near-vertical
    // pitch) — at that height the reflected camera is so far underground its
    // far plane (130 m, "the mist swallows anything further") never reaches
    // any real geometry, so it renders nothing but background sky, which then
    // gets composited onto every asphalt surface in the world at once: a
    // flat white/gray "sheet" over every road and lot, reported repeatedly as
    // a graphics bug. A puddle reflection isn't meaningful from a satellite
    // view anyway, so just skip it above chase-cam height.
    if (eye.y > MAX_EYE_HEIGHT) return false;
    view.reflect(n).negate().add(onPlane);

    rot.extractRotation(camera.matrixWorld);
    look.set(0, 0, -1).applyMatrix4(rot).add(eye);
    target.subVectors(onPlane, look).reflect(n).negate().add(onPlane);

    vcam.position.copy(view);
    vcam.up.set(0, 1, 0).applyMatrix4(rot).reflect(n);
    vcam.lookAt(target);
    vcam.near = camera.near;
    vcam.far = Math.min(camera.far, 130);   // the mist swallows anything further
    vcam.updateMatrixWorld();
    vcam.projectionMatrix.copy(camera.projectionMatrix);

    uniforms.uReflectMat.value
      .set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      .multiply(vcam.projectionMatrix)
      .multiply(vcam.matrixWorldInverse);

    plane.setFromNormalAndCoplanarPoint(n, onPlane).applyMatrix4(vcam.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const e = vcam.projectionMatrix.elements;
    q.x = (Math.sign(clip.x) + e[8]) / e[0];
    q.y = (Math.sign(clip.y) + e[9]) / e[5];
    q.z = -1.0;
    q.w = (1.0 + e[10]) / e[14];
    clip.multiplyScalar(2.0 / clip.dot(q));
    e[2] = clip.x;
    e[6] = clip.y;
    e[10] = clip.z + 1.0 - CLIP_BIAS;
    e[14] = clip.w;
    return true;
  }

  function resize() {
    if (scale <= 0) return;
    rt.setSize(Math.max(2, Math.round(innerWidth * scale)), Math.max(2, Math.round(innerHeight * scale)));
  }

  return {
    uniforms,
    MIRROR_LAYER,
    /** Also show `obj` in the road reflection (see MIRROR_LAYER). */
    reflect,
    /** Find and patch every asphalt surface under `root`. */
    collect(root) {
      root.traverse((o) => {
        if (!o.isMesh || Array.isArray(o.material)) return;
        if (!o.material || o.material.userData.surfaceKind !== "asphalt") return;
        patch(o.material);
        meshes.push(o);
      });
      return meshes.length;
    },
    /** Reflection buffer size as a fraction of the canvas; 0 turns the mirror off. */
    setQuality(frac, every) {
      scale = frac || 0;
      interval = Math.max(1, every || 1);
      uniforms.uReflectOn.value = scale > 0 ? 1 : 0;
      resize();
    },
    resize,
    render() {
      // The WET_SURFACE roughness/puddle effect runs unconditionally in every
      // patched material's shader, independent of the mirror texture below —
      // so its height fade has to update even when reflections are off for
      // this graphics tier (`scale <= 0`) or this isn't a re-render frame.
      camera.updateMatrixWorld();
      eye.setFromMatrixPosition(camera.matrixWorld);
      uniforms.uWetFade.value = 1 - THREE.MathUtils.smoothstep(eye.y, MAX_EYE_HEIGHT, MAX_EYE_HEIGHT + 80);
      if (scale <= 0 || !meshes.length) return;
      // A skipped frame keeps the previous image AND its matrix, so the pair
      // stays consistent; in rippled puddles one frame of lag is invisible.
      if (++frame % interval !== 0) return;
      if (!mirror()) {
        uniforms.uReflectOn.value = 0;
        return;
      }
      uniforms.uReflectOn.value = 1;
      // the road can't sample the target it is being drawn into
      for (const m of meshes) m.visible = false;
      const prevTarget = renderer.getRenderTarget();
      const prevShadows = renderer.shadowMap.autoUpdate;
      renderer.shadowMap.autoUpdate = false;   // reuse this frame's shadow map
      renderer.setRenderTarget(rt);
      renderer.clear();
      renderer.render(scene, vcam);
      renderer.setRenderTarget(prevTarget);
      renderer.shadowMap.autoUpdate = prevShadows;
      for (const m of meshes) m.visible = true;
    },
  };
}

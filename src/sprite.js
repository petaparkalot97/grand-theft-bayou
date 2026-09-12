import * as THREE from "three";

const loader = new THREE.TextureLoader();

// A radial falloff for the contact shadow — a hard-edged disc reads as a decal.
let _blobTex = null;
function blobTexture() {
  if (_blobTex) return _blobTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.45, "rgba(255,255,255,0.72)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  _blobTex = new THREE.CanvasTexture(c);
  _blobTex.colorSpace = THREE.SRGBColorSpace;
  return _blobTex;
}

export function loadAtlas(name) {
  return Promise.all([
    fetch(`./assets/sprites/${name}.json`).then((r) => r.json()),
    new Promise((res, rej) => loader.load(`./assets/sprites/${name}.png`, res, undefined, rej)),
  ]).then(([manifest, tex]) => {
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    return { manifest, tex };
  });
}

/**
 * A camera-facing animated sprite driven by a horizontal-strip atlas.
 * worldHeight = how tall the sprite should be in metres.
 */
export class AnimatedSprite extends THREE.Object3D {
  constructor({ manifest, tex }, worldHeight = 2) {
    super();
    this.manifest = manifest;
    this.count = manifest.count;
    const [fw, fh] = manifest.frameSize;
    this.aspect = fw / fh;

    this.texture = tex.clone();
    this.texture.needsUpdate = true;
    this.texture.repeat.set(1 / this.count, 1);

    // Lit, not unlit: a billboard that ignores the scene's lighting is the
    // single most obvious "this is a game sprite" tell. A little emissive from
    // its own albedo keeps it from going pitch black on the night side.
    this.material = new THREE.MeshStandardMaterial({
      map: this.texture,
      emissive: 0xffffff,
      emissiveMap: this.texture,
      emissiveIntensity: 0.22,
      roughness: 0.92,
      metalness: 0,
      envMapIntensity: 0.85,
      transparent: true,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      depthWrite: true,
    });
    this.material.userData.gtbRealized = true;   // keep the pixel art crisp

    const h = worldHeight;
    const w = h * this.aspect;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.material);
    this.mesh.position.y = h / 2;
    this.mesh.renderOrder = 1;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    // Cut-out shadows: the default depth material ignores the alpha channel, so
    // an alpha-tested billboard would otherwise cast a solid rectangle.
    this.mesh.customDepthMaterial = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      map: this.texture,
      alphaTest: 0.5,
    });
    this.add(this.mesh);

    // soft contact shadow under the feet — the real shadow map handles the
    // rest, this just grounds the billboard when the moon is near-overhead
    this.blob = new THREE.Mesh(
      new THREE.CircleGeometry(w * 0.38, 24),
      new THREE.MeshBasicMaterial({
        map: blobTexture(), color: 0x000000, transparent: true,
        opacity: 0.28, depthWrite: false,
      })
    );
    this.blob.material.userData.gtbRealized = true;
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.position.y = 0.03;
    this.add(this.blob);

    this.anim = null;
    this.frames = [];
    this.time = 0;
    this.fps = 8;
    this.loop = true;
    this.finished = false;
    this.flip = 1;
    this.play(Object.keys(manifest.anims)[0]);
  }

  play(anim, { fps = 8, loop = true, force = false } = {}) {
    if (this.anim === anim && !force) return;
    if (!this.manifest.anims[anim]) return;
    this.anim = anim;
    this.frames = this.manifest.anims[anim];
    this.fps = fps;
    this.loop = loop;
    this.time = 0;
    this.finished = false;
    this._apply(0);
  }

  _apply(i) {
    const col = this.frames[i];
    this.texture.offset.x = col / this.count;
  }

  setFlip(dir) {
    // dir < 0 -> face left
    this.flip = dir < 0 ? -1 : 1;
  }

  setTint(hex) {
    this.material.color.setHex(hex);
  }

  update(dt, camera) {
    this.time += dt;
    const total = this.frames.length;
    let i = Math.floor(this.time * this.fps);
    if (i >= total) {
      if (this.loop) i %= total;
      else { i = total - 1; this.finished = true; }
    }
    this._apply(i);

    // face camera on Y only, keep upright, apply horizontal flip
    if (camera) {
      const dx = camera.position.x - this.position.x;
      const dz = camera.position.z - this.position.z;
      this.mesh.rotation.y = Math.atan2(dx, dz);
    }
    this.mesh.scale.x = this.flip;
  }
}

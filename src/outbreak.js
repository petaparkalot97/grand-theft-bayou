import * as THREE from "three";
import { roundedBox } from "./geo.js";

/**
 * 8-12 storytelling beats for the Chatboro/Strip zombie outbreak.
 * 
 * @param {object} ctx Context from main.js (same as safehouses: scene, addBlocker, etc. plus optionally makeBarrel/makePallet)
 */
export function createOutbreak(ctx) {
  const { scene, addBlocker, makeBarrel, makePallet, } = ctx;
  const props = [];

  // Materials
  const M = {
    blood: new THREE.MeshStandardMaterial({ color: 0x660000, roughness: 0.2, transparent: true, opacity: 0.85, depthWrite: false }),
    charred: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 }),
    concrete: new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 1.0 }),
    leather: new THREE.MeshStandardMaterial({ color: 0x4a3b2c, roughness: 0.8 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 })
  };

  // Helper to add a group and register it
  function addBeat(x, z, buildFn) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    buildFn(g);
    scene.add(g);
  }

  // 1. Dropped luggage near BurgerPiz Left (-30, 120)
  addBeat(-20, 120, (g) => {
    for (let i = 0; i < 3; i++) {
      const bag = new THREE.Mesh(roundedBox(0.6, 0.4, 0.8, 0.1), M.leather);
      bag.position.set(Math.random() * 2 - 1, 0.2, Math.random() * 2 - 1);
      bag.rotation.y = Math.random() * Math.PI;
      bag.castShadow = true;
      g.add(bag);
    }
    // Blood splatter decal on the ground
    const splatter = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), M.blood);
    splatter.rotation.x = -Math.PI / 2;
    splatter.position.y = 0.03;
    splatter.rotation.z = 0.5;
    g.add(splatter);
    
    addBlocker(-20, 120, 1.5);
  });

  // 2. Barricaded Gas Station Pumps Right (18, 108) -> slightly closer to road at (12, 108)
  addBeat(12, 108, (g) => {
    // We assume makeBarrel and makePallet might be available, otherwise fallback
    if (makeBarrel) {
      makeBarrel(12, 107);
      makeBarrel(11, 109);
    }
    if (makePallet) {
      // standing pallet
      const pal = new THREE.Group();
      pal.position.set(0, 0, 0);
      makePallet(13, 108, 0.5); 
    }
    const div = new THREE.Mesh(roundedBox(2, 1, 0.5, 0.05), M.concrete);
    div.position.set(0, 0.5, 1);
    div.rotation.y = 0.3;
    div.castShadow = true;
    g.add(div);
    
    addBlocker(12, 108, 2);
  });

  // 3. Burned out vehicle near 6twelve Left (-30, 95) -> at (-22, 95)
  addBeat(-22, 95, (g) => {
    // Charred wreck made of boxes
    const chassis = new THREE.Mesh(roundedBox(2.2, 0.8, 4.8, 0.1), M.charred);
    chassis.position.set(0, 0.4, 0);
    chassis.rotation.z = 0.1; // collapsed suspension
    chassis.castShadow = true;
    
    const cabin = new THREE.Mesh(roundedBox(2, 0.7, 2.4, 0.1), M.charred);
    cabin.position.set(0, 1.1, -0.4);
    cabin.rotation.z = 0.1;
    cabin.castShadow = true;
    
    g.add(chassis, cabin);
    
    // Fire barrel next to it for lighting
    if (makeFireBarrel) //-20, 96);
    
    addBlocker(-22, 95, 3);
  });

  // 4. Warning Sign near Popeyes Right (18, 84) -> at (12, 84)
  addBeat(12, 84, (g) => {
    // Create a canvas texture for the sign
    const canvas = document.createElement("canvas");
    canvas.width = 512; canvas.height = 256;
    const ctx2d = canvas.getContext("2d");
    ctx2d.fillStyle = "#ffffff";
    ctx2d.fillRect(0, 0, 512, 256);
    ctx2d.fillStyle = "#990000";
    ctx2d.font = "bold 80px Arial";
    ctx2d.textAlign = "center";
    ctx2d.textBaseline = "middle";
    ctx2d.fillText("KEEP OUT", 256, 80);
    ctx2d.fillText("DEAD INSIDE", 256, 170);
    
    const tex = new THREE.CanvasTexture(canvas);
    const signMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
    
    const board = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 0.05), signMat);
    board.position.set(0, 1.5, 0);
    board.rotation.y = -0.4;
    board.castShadow = true;
    
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.5, 0.1), M.wood);
    post.position.set(0, 0.75, -0.05);
    post.rotation.y = -0.4;
    post.castShadow = true;
    
    g.add(board, post);
    addBlocker(12, 84, 1);
  });

  // 5. Quarantine Checkpoint (Concrete dividers) near empty lot (-22, 68)
  addBeat(-22, 68, (g) => {
    for (let i = 0; i < 3; i++) {
      const div = new THREE.Mesh(roundedBox(2.5, 1, 0.6, 0.05), M.concrete);
      div.position.set(i * 2.6 - 2.6, 0.5, Math.abs(i - 1) * 0.4);
      div.rotation.y = (Math.random() - 0.5) * 0.2;
      div.castShadow = true;
      g.add(div);
    }
    addBlocker(-22, 68, 4);
  });

  // 6. Overturned Trash / Scavenged area near BurgerPiz Right (12, 56)
  addBeat(12, 56, (g) => {
    if (makeBarrel) {
      makeBarrel(12, 56);
      makeBarrel(13.5, 55);
    }
    const rubbish = new THREE.Mesh(roundedBox(1.5, 0.3, 1.5, 0.1), M.leather); // substitute for trash bags
    rubbish.position.set(1, 0.15, 1);
    rubbish.castShadow = true;
    g.add(rubbish);
    
    const splatter = new THREE.Mesh(new THREE.PlaneGeometry(2, 4), M.blood);
    splatter.rotation.x = -Math.PI / 2;
    splatter.position.y = 0.03;
    splatter.rotation.z = -0.3;
    g.add(splatter);
    
    addBlocker(12, 56, 2);
  });

  // 7. Crashed Delivery Van on its side (-20, 35)
  addBeat(-20, 35, (g) => {
    const body = new THREE.Mesh(roundedBox(2.2, 2.5, 5.5, 0.2), new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.6 }));
    body.position.set(0, 1.1, 0);
    body.rotation.z = Math.PI / 2; // tipped over
    body.rotation.y = 0.5;
    body.castShadow = true;
    
    g.add(body);
    addBlocker(-20, 35, 3.5);
  });

  // 8. Final blood trail into the bayou (-12, 10)
  addBeat(-12, 10, (g) => {
    for (let i = 0; i < 5; i++) {
      const drop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), M.blood);
      drop.rotation.x = -Math.PI / 2;
      drop.position.set(i * -1.5, 0.03, i * -0.5);
      g.add(drop);
    }
    // no blocker needed for a flat blood trail
  });

  return {};
}

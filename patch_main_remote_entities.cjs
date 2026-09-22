const fs = require('fs');
let code = fs.readFileSync('src/main.js', 'utf8');

const remoteEntitiesCode = `
const networkEntities = new Map();
function applyNetworkSnapshot(snapshot) {
  for (const data of snapshot.players || []) {
    if (data.id === multiplayer?.playerId) continue;
    let view = remotePlayers.get(data.id);
    if (!view) {
      view = createPlayerCharacter(data.character || "peta", { makePeta: () => makeCastMember(makeHoodrat, "keseme", { height: 1.74 }), makeHoodrat });
      view.position.set(data.x, data.y, data.z); scene.add(view); remotePlayers.set(data.id, view);
      if (view.arms) {
        view.userData.weaponRig = new RemoteWeaponRig(view);
      }
    }
    view.userData.netTarget = {
      x: data.x, y: data.y, z: data.z, yaw: data.yaw || 0,
      state: data.state, vehicle: Boolean(data.vehicle),
      weapon: data.weapon, aiming: Boolean(data.aiming), firing: Boolean(data.firing)
    };
  }
  const live = new Set((snapshot.players || []).map((p) => p.id));
  for (const [id, view] of remotePlayers) if (!live.has(id)) { scene.remove(view); remotePlayers.delete(id); }

  const liveEntities = new Set();
  for (const data of snapshot.entities || []) {
    liveEntities.add(data.id);
    let ent = networkEntities.get(data.id);
    if (!ent) {
      if (data.type === "vehicle") {
        // Find existing vehicle or create dummy
        const existing = vehicles.find(v => v.netId === data.id);
        if (existing) {
          ent = existing;
        } else {
          // If we are host, we shouldn't be receiving new entities we don't know about, except when joining
          if (multiplayer?.playerId === multiplayer?.room?.hostId && !data.clientOwned) continue;
          
          ent = { netId: data.id, type: "vehicle", obj: new THREE.Group() };
          scene.add(ent.obj);
          vehicles.push(ent);
          
          // load visual
          import("./vehicles.js").then(({ VEHICLE_DEFS }) => {
            const defName = Object.keys(VEHICLE_DEFS).find(k => k === data.model) || "fallback";
            const file = VEHICLE_DEFS[defName].file;
            const tex = VEHICLE_DEFS[defName].texture;
            // We can't easily call loadVehicle from here if it's not exported, wait, it's not exported from vehicles.js!
            // It's in main.js. Let's just use it.
          });
          // Actually loadVehicle is defined in main.js, we can just call it
          if (typeof loadVehicle === "function") {
             const defName = data.model || "fallback";
             // find file/tex from VEHICLE_DEFS in main.js? VEHICLE_DEFS is imported!
             const def = VEHICLE_DEFS[defName] || VEHICLE_DEFS.fallback;
             loadVehicle(def.file, def.texture || "blue.png").then(v => {
               if (ent.obj) ent.obj.add(v.obj);
             });
          }
        }
      } else if (data.type === "npc") {
         const existing = enemies.find(e => e.netId === data.id);
         if (existing) ent = existing;
         else {
           if (multiplayer?.playerId === multiplayer?.room?.hostId) continue;
           ent = makeHoodrat();
           ent.netId = data.id;
           scene.add(ent);
           enemies.push(ent);
         }
      }
      if (ent) networkEntities.set(data.id, ent);
    }
    
    // Sync state
    if (ent && multiplayer?.playerId !== multiplayer?.room?.hostId) { // Only sync if we are not host
      if (data.type === "vehicle" && ent.owner !== multiplayer?.playerId) {
         ent.obj.position.set(data.x, data.y, data.z);
         if (data.yaw !== undefined) ent.heading = data.yaw;
         if (data.yaw !== undefined && ent.obj.rotation) ent.obj.rotation.y = data.yaw;
         ent.health = data.health;
         if (data.destroyed && !ent.exploded) {
            explodeCar(ent);
         }
         ent.owner = data.owner;
      } else if (data.type === "npc") {
         ent.position.set(data.x, data.y, data.z);
         if (data.yaw !== undefined) ent._yaw = data.yaw;
         ent.health = data.health;
         if (data.anim) ent.play(data.anim, { loop: true });
         if (data.dead && !ent.dead) {
            ent.dead = true;
            ent.play("death", { loop: false, force: true });
         }
      }
    }
  }

  for (const [id, ent] of networkEntities) {
    if (!liveEntities.has(id)) {
       if (ent.type === "vehicle") {
         scene.remove(ent.obj);
         const idx = vehicles.indexOf(ent);
         if (idx >= 0) vehicles.splice(idx, 1);
       } else if (ent.type === "npc" || ent.isEnemy) {
         scene.remove(ent);
         const idx = enemies.indexOf(ent);
         if (idx >= 0) enemies.splice(idx, 1);
       }
       networkEntities.delete(id);
    }
  }
}
`;

code = code.replace(
  /function applyNetworkSnapshot\(snapshot\) \{[\s\S]*?for \(const \[id, view\] of remotePlayers\) if \(!live\.has\(id\)\) \{ scene\.remove\(view\); remotePlayers\.delete\(id\); \}\n\s*\}/,
  remoteEntitiesCode
);

fs.writeFileSync('src/main.js', code);

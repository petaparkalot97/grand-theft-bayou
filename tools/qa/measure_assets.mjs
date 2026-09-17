export default async function run(page) {
  const log = { results: [] };
  const r = await inPage(page, `
    const scene = __game.scene;
    const fbxLoader = new THREE.FBXLoader();
    const gltfLoader = new THREE.GLTFLoader();
    return new Promise((resolve) => {
      let out = {};
      let remaining = 3;
      function checkDone() {
        if (--remaining === 0) resolve(out);
      }
      fbxLoader.load('./assets/models/office/Content/meshes/chair.FBX', (obj) => {
        const box = new THREE.Box3().setFromObject(obj);
        out.chair = box;
        checkDone();
      }, undefined, (e) => { out.chair = e.message; checkDone(); });
      
      fbxLoader.load('./assets/models/fences/Fence Pack/Fence.fbx', (obj) => {
        const box = new THREE.Box3().setFromObject(obj);
        out.fence = box;
        checkDone();
      }, undefined, (e) => { out.fence = e.message; checkDone(); });

      gltfLoader.load('./assets/models/weapons/gangster_rifle/scene.gltf', (gltf) => {
        const box = new THREE.Box3().setFromObject(gltf.scene);
        out.rifle = box;
        checkDone();
      }, undefined, (e) => { out.rifle = e.message; checkDone(); });
    });
  `);
  console.log("Measurements:", r);
  return log;
}

async function inPage(page, body) {
  await page.addScriptTag({
    content: `try { 
      (async function(){ 
        try {
          const r = await (${body})();
          document.body.dataset.r = JSON.stringify(r); 
        } catch(e) {
          document.body.dataset.r = JSON.stringify({ error: String(e && e.stack || e) });
        }
      })();
    }
    catch (e) { document.body.dataset.r = JSON.stringify({ error: String(e && e.stack || e) }); }`,
  });
  
  // Wait for dataset.r to be populated
  await page.waitForFunction(() => document.body.dataset.r !== undefined);
  return JSON.parse(await page.evaluate(() => document.body.dataset.r || "null"));
}

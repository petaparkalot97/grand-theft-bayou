// ---------------------------------------------------------------------------
// pauseMenu.js — GTA San Andreas / V style Pause Menu with full interactive map.
//
// Triggered when pressing ESC during gameplay. Features:
//   1. Fullscreen interactive map with pan & zoom (click/drag, scroll wheel).
//   2. Displays player position, heading, district regions, roads, water, and POIs.
//   3. Landmark pins with labels (Popeyes, Gas Stations, Churches, Hospital, Shops, Casino).
//   4. Left-click on the map to set a custom GPS Waypoint (updates minimap radar!).
//   5. GTA-style header tabs: [ MAP ] | [ STATS ] | [ WEAPONS ] | [ RESUME ].
//   6. Stats tab: Live player metrics, kills, cash, heat, district, current weapon.
// ---------------------------------------------------------------------------

import { WEAPONS, RARITY } from "./weapons.js";

const LANDMARK_PINS = [
  { name: "Popeyes #1 (US-167 Strip)", x: 18, z: 84, icon: "🍗", category: "Food & Dining", region: "Chatboro" },
  { name: "Popeyes #2 (OrleaRouge)", x: 18, z: 230, icon: "🍗", category: "Food & Dining", region: "OrleaRouge" },
  { name: "6twelve Convenience Store", x: -18, z: -54, icon: "🏪", category: "Shops", region: "Tusouxroe" },
  { name: "Tony's Pizza Lot", x: -18, z: 52, icon: "🍕", category: "Food & Dining", region: "Chatboro" },
  { name: "General Store & Supply", x: 18, z: -74, icon: "🛒", category: "Shops", region: "Tusouxroe" },
  { name: "Bayou Tacos", x: -18, z: -94, icon: "🌮", category: "Food & Dining", region: "Tusouxroe" },
  { name: "Town Gas Station", x: 18, z: 12, icon: "⛽", category: "Services", region: "Chatboro" },
  { name: "Parish Hwy 9 Rest Stop", x: -280, z: 140, icon: "⛽", category: "Services", region: "West Parish" },
  { name: "Bayou Noir Baptist Church", x: -340, z: 210, icon: "⛪", category: "Landmark", region: "Bayou Noir" },
  { name: "St. Jude of the Levee", x: 340, z: -80, icon: "⛪", category: "Landmark", region: "Lafourchette" },
  { name: "Saturday Market Square", x: 330, z: -86, icon: "🎪", category: "Shops", region: "Lafourchette" },
  { name: "Harborlight Hospital (Orlea)", x: -46, z: 240, icon: "🏥", category: "Civic", region: "OrleaRouge" },
  { name: "Ember Fire Station (Orlea)", x: 74, z: 260, icon: "🚒", category: "Civic", region: "OrleaRouge" },
  { name: "Sageworks Offices (Orlea)", x: -46, z: 300, icon: "🏢", category: "Commercial", region: "OrleaRouge" },
  { name: "Cloudline Tower (North)", x: -6, z: -400, icon: "🏙️", category: "Landmark", region: "Tusouxroe North" },
  { name: "Harborlight Hospital (North)", x: -65, z: -238, icon: "🏥", category: "Civic", region: "Tusouxroe North" },
  { name: "Riverfront Casino Boat", x: 114, z: 370, icon: "🎰", category: "Entertainment", region: "OrleaRouge" },
  // The Crown Strip — the casino-and-nightlife row on North Ave 2 (tusouxroeNorth.js)
  { name: "Pelican Crown Casino", x: -40, z: -350, icon: "🎰", category: "Casinos", region: "Crown Strip" },
  { name: "Bayou Gold Casino", x: -84, z: -350, icon: "🎰", category: "Casinos", region: "Crown Strip" },
  { name: "Moonlight Casino", x: -176, z: -350, icon: "🎰", category: "Casinos", region: "Crown Strip" },
  { name: "Gator's Fortune", x: -84, z: -290, icon: "🎰", category: "Casinos", region: "Crown Strip" },
  { name: "The Velvet Magnolia", x: -176, z: -290, icon: "🎰", category: "Casinos", region: "Crown Strip" },
  { name: "Neon Bayou", x: 26, z: -343, icon: "🪩", category: "Nightclubs", region: "Crown Strip" },
  { name: "Club Sapphire", x: 78, z: -343, icon: "🪩", category: "Nightclubs", region: "Crown Strip" },
  { name: "Midnight Special", x: 78, z: -297, icon: "🪩", category: "Nightclubs", region: "Crown Strip" },
  { name: "Honeysuckle", x: -40, z: -299, icon: "🍸", category: "Bars", region: "Crown Strip" },
  { name: "The Brass Alligator", x: 26, z: -299, icon: "🍸", category: "Bars", region: "Crown Strip" },
  { name: "Causeway Overpass Camp", x: 0, z: 165, icon: "⛺", category: "Outskirts", region: "Causeway" },
  // the four state districts, rebuilt as towns (TASK-084): oysterbay.js, portcalypso.js, reddust.js, lakeshore.js
  { name: "Port Calypso Container Quay", x: 860, z: -940, icon: "⚓", category: "Docks", region: "Port Calypso" },
  { name: "Port Authority Tower", x: 846, z: -866, icon: "🏢", category: "Commercial", region: "Port Calypso" },
  { name: "Port Calypso Lighthouse", x: 1110, z: -952, icon: "🚨", category: "Landmark", region: "Port Calypso" },
  { name: "Port Fire Station", x: 880, z: -579, icon: "🚒", category: "Civic", region: "Port Calypso" },
  { name: "Cypress Summit Radio Tower", x: -1020, z: -950, icon: "📡", category: "Landmark", region: "Cypress Hills" },
  { name: "Red Dust Main Street", x: -650, z: -600, icon: "🤠", category: "Shops", region: "Cypress Hills" },
  { name: "Cypress Quarry", x: -975, z: -768, icon: "⛏️", category: "Outdoors", region: "Cypress Hills" },
  { name: "Red Dust Chapel", x: -780, z: -726, icon: "⛪", category: "Landmark", region: "Cypress Hills" },
  { name: "Swamp Tour Landing", x: -700, z: 538, icon: "🚤", category: "Swamp", region: "Lakeshore Marsh" },
  { name: "Heron Walk Boardwalks", x: -690, z: 900, icon: "🏚️", category: "Swamp", region: "Lakeshore Marsh" },
  { name: "Oyster Bay Medical", x: 555, z: 501, icon: "🏥", category: "Civic", region: "Oyster Bay" },
  { name: "Oyster Bay Harbor", x: 720, z: 915, icon: "⚓", category: "Docks", region: "Oyster Bay" },
  { name: "Our Lady of the Bay", x: 760, z: 470, icon: "⛪", category: "Landmark", region: "Oyster Bay" },
  { name: "Bayou Arsenal", x: 730, z: 585, icon: "🔫", category: "Shops", region: "Oyster Bay" },
];

export function createPauseMenu({ MAP, state, getPlayerPos, minimap, arsenal, kills = {} }) {
  let activeTab = "MAP";
  let isOpen = false;

  // Pan & Zoom state for full map
  let panX = 0, panY = 0;       // map offset in world units from map center
  let mapZoom = 1.0;            // zoom multiplier (0.5x to 3.0x)
  let isDragging = false;
  let dragStartX = 0, dragStartY = 0;
  let hoveredLandmark = null;
  let customWaypoint = null;

  // DOM Container
  const overlay = document.createElement("div");
  overlay.id = "pauseMenuOverlay";
  overlay.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(8,12,16,0.94);" +
    "display:none;flex-direction:column;font-family:system-ui,sans-serif;color:#f4f1ea;user-select:none;";

  // Header Bar
  const header = document.createElement("div");
  header.style.cssText = "height:64px;background:rgba(16,22,28,0.95);border-bottom:2px solid #3a4a58;" +
    "display:flex;align-items:center;justify-content:space-between;padding:0 24px;";

  const title = document.createElement("div");
  title.style.cssText = "font:900 22px/1 'Impact',system-ui,sans-serif;letter-spacing:.12em;color:#ffc83b;" +
    "text-shadow:0 2px 8px rgba(0,0,0,0.8);";
  title.textContent = "GRAND THEFT BAYOU";

  const nav = document.createElement("div");
  nav.style.cssText = "display:flex;gap:12px;";

  const tabs = ["MAP", "STATS", "WEAPONS", "RESUME"];
  const tabBtns = {};

  tabs.forEach((tab) => {
    const btn = document.createElement("button");
    btn.style.cssText = "background:transparent;border:none;color:#a0b0c0;font:800 14px/1 system-ui,sans-serif;" +
      "padding:10px 18px;border-radius:6px;cursor:pointer;letter-spacing:.08em;transition:all .2s;";
    btn.textContent = tab;
    btn.onclick = () => {
      if (tab === "RESUME") {
        close();
      } else {
        switchTab(tab);
      }
    };
    nav.appendChild(btn);
    tabBtns[tab] = btn;
  });

  header.appendChild(title);
  header.appendChild(nav);
  overlay.appendChild(header);

  // Content Container
  const content = document.createElement("div");
  content.style.cssText = "flex:1;position:relative;overflow:hidden;display:flex;";
  overlay.appendChild(content);

  // --- MAP VIEW PANELS ---
  const mapContainer = document.createElement("div");
  mapContainer.style.cssText = "flex:1;position:relative;height:100%;cursor:grab;";
  const mapCanvas = document.createElement("canvas");
  mapCanvas.style.cssText = "width:100%;height:100%;display:block;";
  mapContainer.appendChild(mapCanvas);

  // Sidebar Legend / Landmark Inspector
  const sidebar = document.createElement("div");
  sidebar.style.cssText = "width:320px;background:rgba(14,20,26,0.92);border-left:1px solid #2a3a48;" +
    "padding:20px;display:flex;flex-direction:column;gap:16px;overflow-y:auto;";
  
  sidebar.innerHTML = `
    <div style="font:800 16px/1 system-ui;color:#ffc83b;letter-spacing:.06em;border-bottom:1px solid #3a4a58;padding-bottom:8px;">
      LANDMARKS & POIS
    </div>
    <div id="landmarkInfoBox" style="background:rgba(255,255,255,0.05);padding:12px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);">
      <div style="font-weight:700;color:#4fc3f7;margin-bottom:4px;" id="infoTitle">Click any icon to inspect</div>
      <div style="font-size:13px;color:#a0b0c0;" id="infoDesc">Click anywhere on the map to set a GPS Waypoint.</div>
    </div>
    <div style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:8px;" id="landmarkList"></div>
  `;

  content.appendChild(mapContainer);
  content.appendChild(sidebar);

  // --- STATS VIEW PANEL ---
  const statsPanel = document.createElement("div");
  statsPanel.style.cssText = "flex:1;padding:40px;display:none;flex-direction:column;gap:24px;max-width:800px;margin:0 auto;overflow-y:auto;";
  content.appendChild(statsPanel);

  // --- WEAPONS VIEW PANEL ---
  const weaponsPanel = document.createElement("div");
  weaponsPanel.style.cssText = "flex:1;padding:40px;display:none;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:20px;overflow-y:auto;";
  content.appendChild(weaponsPanel);

  // Footer Bar
  const footer = document.createElement("div");
  footer.style.cssText = "height:42px;background:rgba(12,16,20,0.98);border-top:1px solid #2a3540;" +
    "display:flex;align-items:center;justify-content:space-between;padding:0 24px;font:700 12px/1 system-ui,sans-serif;color:#8090a0;";
  footer.innerHTML = `
    <div>[LMB DRAG] Pan Map &nbsp;·&nbsp; [SCROLL] Zoom &nbsp;·&nbsp; [LMB CLICK] Set GPS Waypoint</div>
    <div>Press <span style="color:#ffc83b;">ESC</span> to Resume</div>
  `;
  overlay.appendChild(footer);
  document.body.appendChild(overlay);

  // Populate Landmark List Sidebar
  const landmarkList = sidebar.querySelector("#landmarkList");
  LANDMARK_PINS.forEach((pin) => {
    const item = document.createElement("div");
    item.style.cssText = "display:flex;align-items:center;gap:10px;padding:8px 10px;background:rgba(255,255,255,0.03);" +
      "border-radius:6px;cursor:pointer;transition:background .2s;";
    item.innerHTML = `
      <span style="font-size:18px;">${pin.icon}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;font-size:13px;color:#f4f1ea;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${pin.name}</div>
        <div style="font-size:11px;color:#708090;">${pin.region} · ${pin.category}</div>
      </div>
    `;
    item.onmouseenter = () => { item.style.background = "rgba(79,195,247,0.15)"; };
    item.onmouseleave = () => { item.style.background = "rgba(255,255,255,0.03)"; };
    item.onclick = () => {
      panX = pin.x;
      panY = pin.z;
      inspectLandmark(pin);
      renderMap();
    };
    landmarkList.appendChild(item);
  });

  function inspectLandmark(pin) {
    const titleEl = sidebar.querySelector("#infoTitle");
    const descEl = sidebar.querySelector("#infoDesc");
    if (pin) {
      titleEl.textContent = `${pin.icon} ${pin.name}`;
      descEl.innerHTML = `Region: <b>${pin.region}</b><br>Type: <b>${pin.category}</b><br>Location: (${Math.round(pin.x)}, ${Math.round(pin.z)})`;
    } else {
      titleEl.textContent = "Click any icon to inspect";
      descEl.textContent = "Click anywhere on the map to set a GPS Waypoint.";
    }
  }

  function switchTab(tab) {
    activeTab = tab;
    Object.keys(tabBtns).forEach((k) => {
      if (k === tab) {
        tabBtns[k].style.background = "#ffc83b";
        tabBtns[k].style.color = "#0a0e12";
      } else {
        tabBtns[k].style.background = "transparent";
        tabBtns[k].style.color = "#a0b0c0";
      }
    });

    mapContainer.style.display = tab === "MAP" ? "block" : "none";
    sidebar.style.display = tab === "MAP" ? "flex" : "none";
    statsPanel.style.display = tab === "STATS" ? "flex" : "none";
    weaponsPanel.style.display = tab === "WEAPONS" ? "grid" : "none";

    if (tab === "MAP") {
      resizeMap();
      renderMap();
    } else if (tab === "STATS") {
      renderStats();
    } else if (tab === "WEAPONS") {
      renderWeapons();
    }
  }

  function resizeMap() {
    const rect = mapContainer.getBoundingClientRect();
    mapCanvas.width = rect.width * (window.devicePixelRatio || 1);
    mapCanvas.height = rect.height * (window.devicePixelRatio || 1);
  }

  function renderMap() {
    if (activeTab !== "MAP" || !isOpen) return;
    const ctx = mapCanvas.getContext("2d");
    const W = mapCanvas.width, H = mapCanvas.height;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // Center of map view
    const cx = W / 2, cy = H / 2;
    // Map bounds in world coordinates
    const mapW = MAP.maxX - MAP.minX;
    const mapH = MAP.maxZ - MAP.minZ;
    const mapCenterX = (MAP.minX + MAP.maxX) / 2;
    const mapCenterZ = (MAP.minZ + MAP.maxZ) / 2;

    // Scale world meters to canvas pixels
    const baseScale = Math.min(W / mapW, H / mapH) * 0.85 * mapZoom;

    // Transform helper: World (x, z) -> Canvas (px, py)
    const toCanvas = (wx, wz) => {
      const px = cx + (wx - mapCenterX - panX) * baseScale;
      const py = cy + (wz - mapCenterZ - panY) * baseScale;
      return [px, py];
    };

    // Transform helper: Canvas (px, py) -> World (wx, wz)
    const toWorld = (px, py) => {
      const wx = mapCenterX + panX + (px - cx) / baseScale;
      const wz = mapCenterZ + panY + (py - cy) / baseScale;
      return [wx, wz];
    };

    // Draw Background Grid / Water
    ctx.fillStyle = "#121a22";
    ctx.fillRect(0, 0, W, H);

    // Draw Map Bounds
    const [bMinX, bMinZ] = toCanvas(MAP.minX, MAP.minZ);
    const [bMaxX, bMaxZ] = toCanvas(MAP.maxX, MAP.maxZ);
    ctx.fillStyle = "#1e2a36";
    ctx.fillRect(bMinX, bMinZ, bMaxX - bMinX, bMaxZ - bMinZ);
    ctx.strokeStyle = "#3a4d60";
    ctx.lineWidth = 2 * dpr;
    ctx.strokeRect(bMinX, bMinZ, bMaxX - bMinX, bMaxZ - bMinZ);

    // Draw Base Minimap image if available
    if (minimap && minimap.baseCanvas) {
      ctx.drawImage(minimap.baseCanvas, bMinX, bMinZ, bMaxX - bMinX, bMaxZ - bMinZ);
    }

    // Draw District Labels
    const districts = [
      { name: "TUSOUXROE", x: 92, z: -100 },
      { name: "CHATBORO", x: 0, z: 40 },
      { name: "PARISH HIGHWAY 9", x: -220, z: 120 },
      { name: "BAYOU NOIR", x: -320, z: 200 },
      { name: "CROWN STRIP", x: 10, z: -320 },
      { name: "LAFOURCHETTE", x: 320, z: -80 },
      { name: "CAUSEWAY", x: 0, z: 165 },
      { name: "ORLEAROUGE", x: 18, z: 280 },
    ];

    ctx.fillStyle = "rgba(255, 200, 59, 0.4)";
    ctx.font = `bold ${Math.max(12, 14 * baseScale * 0.04)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    districts.forEach((d) => {
      const [dx, dy] = toCanvas(d.x, d.z);
      ctx.fillText(d.name, dx, dy);
    });

    // Draw Custom Waypoint
    if (customWaypoint) {
      const [wx, wy] = toCanvas(customWaypoint.x, customWaypoint.z);
      ctx.fillStyle = "#ffd23a";
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.moveTo(wx, wy - 12);
      ctx.lineTo(wx + 10, wy);
      ctx.lineTo(wx, wy + 12);
      ctx.lineTo(wx - 10, wy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#ffd23a";
      ctx.font = "bold 12px system-ui";
      ctx.fillText("GPS WAYPOINT", wx, wy - 16);
    }

    // Draw Landmark Pins
    LANDMARK_PINS.forEach((pin) => {
      const [px, py] = toCanvas(pin.x, pin.z);
      ctx.font = `${Math.round(20 * dpr)}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(pin.icon, px, py);

      // Label below icon if zoomed in
      if (baseScale > 1.2) {
        ctx.fillStyle = "#ffffff";
        ctx.font = `bold ${Math.round(11 * dpr)}px system-ui`;
        ctx.fillText(pin.name, px, py + 16 * dpr);
      }
    });

    // Draw Player Arrow
    const p = getPlayerPos();
    if (p) {
      const [px, py] = toCanvas(p.x, p.z);
      ctx.fillStyle = "#4fc3f7";
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.arc(px, py, 8 * dpr, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 12px system-ui";
      ctx.fillText("YOU", px, py - 14 * dpr);
    }
  }

  // Map Mouse Events (Pan & Zoom & Waypoint)
  mapContainer.onmousedown = (e) => {
    if (e.button === 0) {
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      mapContainer.style.cursor = "grabbing";
    }
  };

  window.addEventListener("mousemove", (e) => {
    if (isDragging && isOpen && activeTab === "MAP") {
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      dragStartX = e.clientX;
      dragStartY = e.clientY;

      const rect = mapContainer.getBoundingClientRect();
      const mapW = MAP.maxX - MAP.minX;
      const mapH = MAP.maxZ - MAP.minZ;
      const baseScale = Math.min(rect.width / mapW, rect.height / mapH) * 0.85 * mapZoom;

      panX -= dx / baseScale;
      panY -= dy / baseScale;
      renderMap();
    }
  });

  window.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
      mapContainer.style.cursor = "grab";
    }
  });

  mapContainer.onclick = (e) => {
    if (Math.abs(e.clientX - dragStartX) > 5 || Math.abs(e.clientY - dragStartY) > 5) return;
    const rect = mapContainer.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (window.devicePixelRatio || 1);
    const py = (e.clientY - rect.top) * (window.devicePixelRatio || 1);

    const W = mapCanvas.width, H = mapCanvas.height;
    const cx = W / 2, cy = H / 2;
    const mapW = MAP.maxX - MAP.minX;
    const mapH = MAP.maxZ - MAP.minZ;
    const mapCenterX = (MAP.minX + MAP.maxX) / 2;
    const mapCenterZ = (MAP.minZ + MAP.maxZ) / 2;
    const baseScale = Math.min(W / mapW, H / mapH) * 0.85 * mapZoom;

    const wx = mapCenterX + panX + (px - cx) / baseScale;
    const wz = mapCenterZ + panY + (py - cy) / baseScale;

    // Check if clicked near a landmark pin
    const clickedPin = LANDMARK_PINS.find((pin) => Math.hypot(pin.x - wx, pin.z - wz) < 25 / baseScale);
    if (clickedPin) {
      inspectLandmark(clickedPin);
    } else {
      // Set custom GPS Waypoint
      customWaypoint = { x: wx, z: wz };
      if (state) state.customWaypoint = customWaypoint;
      inspectLandmark(null);
      const titleEl = sidebar.querySelector("#infoTitle");
      const descEl = sidebar.querySelector("#infoDesc");
      titleEl.textContent = "📍 Custom GPS Waypoint";
      descEl.innerHTML = `Location: <b>(${Math.round(wx)}, ${Math.round(wz)})</b><br>Waypoint set on radar minimap.`;
    }
    renderMap();
  };

  mapContainer.onwheel = (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 0.85;
    mapZoom = Math.max(0.4, Math.min(3.5, mapZoom * factor));
    renderMap();
  };

  function renderStats() {
    const p = getPlayerPos() || { x: 0, z: 0 };
    statsPanel.innerHTML = `
      <div style="font:900 22px/1 system-ui;color:#ffc83b;letter-spacing:.08em;border-bottom:2px solid #3a4a58;padding-bottom:10px;">
        GAMEPLAY METRICS & STATS
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div style="background:rgba(255,255,255,0.04);padding:16px;border-radius:8px;border:1px solid rgba(255,255,255,0.08);">
          <div style="color:#708090;font-size:12px;font-weight:700;">PLAYER CASH</div>
          <div style="font:900 28px/1 system-ui;color:#6fe07a;margin-top:4px;">$${(state.cash || 0).toLocaleString()}</div>
        </div>
        <div style="background:rgba(255,255,255,0.04);padding:16px;border-radius:8px;border:1px solid rgba(255,255,255,0.08);">
          <div style="color:#708090;font-size:12px;font-weight:700;">HEALTH STATUS</div>
          <div style="font:900 28px/1 system-ui;color:#ff4a4a;margin-top:4px;">${Math.max(0, Math.round(state.hp || 100))}%</div>
        </div>
        <div style="background:rgba(255,255,255,0.04);padding:16px;border-radius:8px;border:1px solid rgba(255,255,255,0.08);">
          <div style="color:#708090;font-size:12px;font-weight:700;">EQUIPPED WEAPON</div>
          <div style="font:900 22px/1 system-ui;color:#4fc3f7;margin-top:6px;">${WEAPONS[state.weapon]?.name || "Baseball Bat"}</div>
        </div>
        <div style="background:rgba(255,255,255,0.04);padding:16px;border-radius:8px;border:1px solid rgba(255,255,255,0.08);">
          <div style="color:#708090;font-size:12px;font-weight:700;">COORDINATES</div>
          <div style="font:700 18px/1 system-ui;color:#f4f1ea;margin-top:8px;">X: ${Math.round(p.x)} &nbsp; Z: ${Math.round(p.z)}</div>
        </div>
      </div>
      <div style="background:rgba(255,255,255,0.04);padding:20px;border-radius:8px;border:1px solid rgba(255,255,255,0.08);">
        <div style="font:800 16px/1 system-ui;color:#ffc83b;margin-bottom:12px;">ELIMINATION RECORD</div>
        <div style="display:flex;gap:32px;font-size:15px;">
          <div>🔴 Rednecks: <b>${kills.redneck || 0}</b></div>
          <div>🔵 Hoodrats: <b>${kills.hoodrat || 0}</b></div>
          <div>🐗 Hogs: <b>${kills.hog || 0}</b></div>
        </div>
      </div>
    `;
  }

  function renderWeapons() {
    weaponsPanel.innerHTML = "";
    Object.values(WEAPONS).forEach((w) => {
      const isEquipped = state.weapon === w.id;
      const card = document.createElement("div");
      card.style.cssText = `background:${isEquipped ? "rgba(79,195,247,0.12)" : "rgba(255,255,255,0.04)"};` +
        `border:1px solid ${isEquipped ? "#4fc3f7" : "rgba(255,255,255,0.08)"};padding:20px;border-radius:10px;` +
        "display:flex;flex-direction:column;gap:10px;";
      
      const res = state.reserve && state.reserve[w.id] != null ? state.reserve[w.id] : 0;
      const ammoStr = w.melee ? "Infinite Durability" : `Clip: ${w.clip} | Reserve: ${res}`;

      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div style="font:900 18px/1 system-ui;color:#f4f1ea;">${w.name}</div>
          <span style="font-size:11px;font-weight:800;padding:3px 8px;border-radius:4px;background:#${RARITY[w.rarity]?.color.toString(16).padStart(6, "0")};color:#000;">
            ${RARITY[w.rarity]?.label || "Starter"}
          </span>
        </div>
        <div style="font-size:13px;color:#a0b0c0;">${ammoStr}</div>
        <div style="font-size:12px;color:#708090;display:flex;flex-direction:column;gap:4px;margin-top:6px;">
          <div>Damage: <b>${w.damage}</b></div>
          <div>Effective Range: <b>${w.range} m</b></div>
          <div>Cooldown: <b>${w.cooldown}s</b></div>
        </div>
      `;
      weaponsPanel.appendChild(card);
    });
  }

  function open() {
    isOpen = true;
    state.paused = true;
    if (document.pointerLockElement) document.exitPointerLock();
    overlay.style.display = "flex";
    switchTab("MAP");
  }

  function close() {
    isOpen = false;
    state.paused = false;
    overlay.style.display = "none";
  }

  function toggle() {
    if (isOpen) close();
    else open();
  }

  return {
    open,
    close,
    toggle,
    get isOpen() { return isOpen; },
    get customWaypoint() { return customWaypoint; },
  };
}

const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const replacement = `<section id="multiplayerPanel" hidden aria-label="Multiplayer lobby">
    <div class="select-kicker">Grand Theft Bayou · Shared Bayou</div>
    <div class="select-title">Bring the whole damn crew.</div>
    <div id="mpConnection">Not connected</div>
    
    <div id="mpBrowserView">
      <div class="mp-row" style="margin-bottom: 10px;">
        <button id="mpRefreshRooms">Refresh</button>
        <button id="mpCreate">Create game</button>
        <select id="mpVisibility" style="padding:4px;"><option value="PUBLIC">Public</option><option value="PRIVATE">Private</option></select>
        <input id="mpCreatePassword" type="password" placeholder="Pass (Private)" style="width: 100px; padding: 4px;">
      </div>
      <div id="mpRoomList" style="background: rgba(0,0,0,0.5); padding: 10px; border-radius: 8px; min-height: 120px; max-height: 200px; overflow-y: auto; margin-bottom: 10px;">
        <!-- room items -->
      </div>
      <div class="mp-row">
        <input id="mpRoomInput" placeholder="Code (BAYOU-1234)" maxlength="10" style="padding: 4px;">
        <input id="mpJoinPassword" type="password" placeholder="Password (if any)" style="padding: 4px;">
        <button id="mpJoin" class="alt">Join by Code</button>
      </div>
    </div>

    <div id="mpLobbyView" hidden>
      <div class="mp-code" id="mpCode">—</div>
      <div id="mpPlayers"></div>
      <div class="mp-row">
        <button id="mpPick">Choose character</button>
        <button id="mpReady" disabled>Ready</button>
        <button id="mpStart" class="alt" disabled>Start game</button>
        <button id="mpLeaveRoom" class="alt">Leave Room</button>
      </div>
    </div>

    <div class="mp-row" style="margin-top: 15px;"><button id="mpBack" class="alt">Back to Main Menu</button></div>
    <div id="mpMessage" class="mp-status">Create a room or join a friend's code.</div>
  </section>`;

html = html.replace(/<section id="multiplayerPanel"[^]*?<\/section>/, replacement);
fs.writeFileSync('index.html', html);

const fs = require('fs');
let code = fs.readFileSync('src/main.js', 'utf8');

code = code.replace(
  /const mpCreate = document\.getElementById\("mpCreate"\);\nconst mpJoin = document\.getElementById\("mpJoin"\);\nconst mpRoomInput = document\.getElementById\("mpRoomInput"\);\nconst mpCode = document\.getElementById\("mpCode"\);\nconst mpPlayers = document\.getElementById\("mpPlayers"\);\nconst mpPick = document\.getElementById\("mpPick"\);\nconst mpReady = document\.getElementById\("mpReady"\);\nconst mpStart = document\.getElementById\("mpStart"\);\nconst mpBack = document\.getElementById\("mpBack"\);\nconst mpMessage = document\.getElementById\("mpMessage"\);/,
  `const mpCreate = document.getElementById("mpCreate");
const mpJoin = document.getElementById("mpJoin");
const mpRoomInput = document.getElementById("mpRoomInput");
const mpCode = document.getElementById("mpCode");
const mpPlayers = document.getElementById("mpPlayers");
const mpPick = document.getElementById("mpPick");
const mpReady = document.getElementById("mpReady");
const mpStart = document.getElementById("mpStart");
const mpBack = document.getElementById("mpBack");
const mpMessage = document.getElementById("mpMessage");

const mpBrowserView = document.getElementById("mpBrowserView");
const mpRefreshRooms = document.getElementById("mpRefreshRooms");
const mpVisibility = document.getElementById("mpVisibility");
const mpCreatePassword = document.getElementById("mpCreatePassword");
const mpRoomList = document.getElementById("mpRoomList");
const mpJoinPassword = document.getElementById("mpJoinPassword");
const mpLobbyView = document.getElementById("mpLobbyView");
const mpLeaveRoom = document.getElementById("mpLeaveRoom");`
);

code = code.replace(
  /function drawMultiplayerRoom\(room\) \{/,
  `function drawMultiplayerRoom(room) {
  if (!room) {
    if (mpBrowserView) mpBrowserView.hidden = false;
    if (mpLobbyView) mpLobbyView.hidden = true;
    if (multiplayer) multiplayer.fetchRooms();
    return;
  }
  if (mpBrowserView) mpBrowserView.hidden = true;
  if (mpLobbyView) mpLobbyView.hidden = false;`
);

code = code.replace(
  /mpCreate\.addEventListener\("click", \(\) => multiplayer\?\.createRoom\(\)\);\nmpJoin\.addEventListener\("click", \(\) => multiplayer\?\.joinRoom\(mpRoomInput\.value\)\);/,
  `mpCreate.addEventListener("click", () => multiplayer?.createRoom({ visibility: mpVisibility.value, password: mpCreatePassword.value }));
mpJoin.addEventListener("click", () => multiplayer?.joinRoom(mpRoomInput.value, mpJoinPassword.value));
if (mpRefreshRooms) mpRefreshRooms.addEventListener("click", () => multiplayer?.fetchRooms());
if (mpLeaveRoom) mpLeaveRoom.addEventListener("click", () => multiplayer?.leave());
`
);

const onRoomsImpl = `
function drawMultiplayerRooms(rooms) {
  if (!mpRoomList) return;
  mpRoomList.innerHTML = "";
  if (!rooms || rooms.length === 0) {
    mpRoomList.innerHTML = "<div style='color: #888;'>No public rooms found. Create one!</div>";
    return;
  }
  rooms.forEach(r => {
    const d = document.createElement("div");
    d.style.cssText = "display: flex; justify-content: space-between; padding: 4px; border-bottom: 1px solid #333;";
    const name = document.createElement("span");
    name.textContent = \`\${r.name} (\${r.players}/\${r.maxPlayers})\`;
    const btn = document.createElement("button");
    btn.textContent = "Join";
    btn.style.padding = "2px 8px";
    btn.onclick = () => {
      mpRoomInput.value = r.code;
      multiplayer?.joinRoom(r.code, mpJoinPassword.value);
    };
    d.appendChild(name);
    d.appendChild(btn);
    mpRoomList.appendChild(d);
  });
}
`;

code = code.replace(
  /function openMultiplayer\(\) \{/,
  onRoomsImpl + `\nfunction openMultiplayer() {`
);

code = code.replace(
  /if \(!multiplayer\) multiplayer = createMultiplayer\(\{ onConnection/,
  `if (!multiplayer) multiplayer = createMultiplayer({ onConnection`
);

code = code.replace(
  /onRoom: \(room\) => \{ drawMultiplayerRoom\(room\);/,
  `onRooms: drawMultiplayerRooms, onRoom: (room) => { drawMultiplayerRoom(room);`
);

fs.writeFileSync('src/main.js', code);

const fs = require('fs');
let code = fs.readFileSync('src/multiplayer.js', 'utf8');

code = code.replace(
  /export function createMultiplayer\(\{ url = DEFAULT_URL, onConnection = \(\) => \{\}, onRoom = \(\) => \{\}, onSnapshot = \(\) => \{\}, onError = \(\) => \{\} \} = \{\}\) \{/,
  `export function createMultiplayer({ url = DEFAULT_URL, onConnection = () => {}, onRoom = () => {}, onRooms = () => {}, onSnapshot = () => {}, onError = () => {} } = {}) {`
);

code = code.replace(
  /createRoom\(\) \{ api\.send\("CREATE_ROOM"\); \}, joinRoom\(code\) \{ api\.send\("JOIN_ROOM", \{ code \}\); \},/,
  `createRoom(opts = {}) { api.send("CREATE_ROOM", opts); }, joinRoom(code, password) { api.send("JOIN_ROOM", { code, password }); },
    async fetchRooms() {
      try {
        const httpUrl = url.replace(/^ws/, "http");
        const res = await fetch(httpUrl + "/rooms");
        if (res.ok) {
          const data = await res.json();
          onRooms(data.rooms);
        }
      } catch (e) {
        console.warn("Failed to fetch rooms", e);
      }
    },`
);

code = code.replace(
  /leave\(\) \{ api\.send\("LEAVE_ROOM"\); \},/,
  `leave() { api.send("LEAVE_ROOM"); api.room = null; onRoom(null); },`
);


fs.writeFileSync('src/multiplayer.js', code);

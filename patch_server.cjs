const fs = require('fs');
let code = fs.readFileSync('server/index.js', 'utf8');

code = code.replace(
  /if \(p === "\/health"\) \{ sendJson\(res, 200, \{ ok: true, rooms: rooms\.size \}\); return; \}/,
  `if (p === "/health") { sendJson(res, 200, { ok: true, rooms: rooms.size }); return; }
  
  if (p === "/rooms" && req.method === "GET") {
    cors(res);
    const list = [...rooms.values()].filter(r => r.visibility === "PUBLIC").map(r => ({
      code: r.code,
      name: r.name || r.code,
      players: r.players.size,
      maxPlayers: require("./protocol.js").MAX_PLAYERS,
      phase: r.phase
    }));
    sendJson(res, 200, { rooms: list });
    return;
  }`
);

code = code.replace(
  /if \(msg\.type === "CREATE_ROOM"\) \{\n\s*if \(record\) return fail\(ws, "ALREADY_IN_ROOM"\);\n\s*const room = new Room\(createRoomCode\(rooms\)\); rooms\.set\(room\.code, room\); const player = room\.add\(ws\); attach\(ws, room, player\); console\.log\(`\[ROOM\] Created \$\{room\.code\}`\); return;\n\s*\}/,
  `if (msg.type === "CREATE_ROOM") {
      if (record) return fail(ws, "ALREADY_IN_ROOM");
      const room = new Room(createRoomCode(rooms));
      room.visibility = msg.visibility === "PRIVATE" ? "PRIVATE" : "PUBLIC";
      room.password = msg.password || "";
      room.name = room.code;
      rooms.set(room.code, room); const player = room.add(ws); attach(ws, room, player); console.log(\`[ROOM] Created \${room.code}\`); return;
    }`
);

code = code.replace(
  /if \(msg\.type === "JOIN_ROOM"\) \{\n\s*if \(record\) return fail\(ws, "ALREADY_IN_ROOM"\);\n\s*const room = rooms\.get\(String\(msg\.code \|\| ""\)\.trim\(\)\.toUpperCase\(\)\); if \(!room\) return fail\(ws, "ROOM_NOT_FOUND"\);\n\s*if \(room\.phase !== "LOBBY"\) return fail\(ws, "GAME_ALREADY_STARTED"\); if \(room\.players\.size >= MAX_PLAYERS\) return fail\(ws, "ROOM_FULL"\);\n\s*return attach\(ws, room, room\.add\(ws\)\);\n\s*\}/,
  `if (msg.type === "JOIN_ROOM") {
      if (record) return fail(ws, "ALREADY_IN_ROOM");
      const room = rooms.get(String(msg.code || "").trim().toUpperCase()); if (!room) return fail(ws, "ROOM_NOT_FOUND");
      if (room.visibility === "PRIVATE" && room.password !== msg.password) return fail(ws, "INVALID_PASSWORD");
      if (room.phase !== "LOBBY") return fail(ws, "GAME_ALREADY_STARTED"); if (room.players.size >= MAX_PLAYERS) return fail(ws, "ROOM_FULL");
      return attach(ws, room, room.add(ws));
    }`
);

fs.writeFileSync('server/index.js', code);

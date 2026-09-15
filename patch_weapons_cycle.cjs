const fs = require('fs');

let code = fs.readFileSync('src/weapons.js', 'utf8');

const injectCode = `    cycleWeapon(dir) {
      const keys = Object.keys(WEAPONS);
      const available = keys.filter(k => {
        if (k === 'bat') return true;
        if (state.weapon === k && state.ammo > 0) return true;
        if (state.reserve && state.reserve[k] > 0) return true;
        return false;
      });
      if (available.length <= 1) return; // Nothing to switch to
      
      let idx = available.indexOf(state.weapon);
      if (idx === -1) idx = 0;
      
      // Before switching, dump current clip into reserve
      if (!WEAPONS[state.weapon].melee && Number.isFinite(state.ammo)) {
        if (!state.reserve) state.reserve = {};
        const maxRes = WEAPONS[state.weapon].maxReserve || 100;
        state.reserve[state.weapon] = Math.min(maxRes, (state.reserve[state.weapon] || 0) + state.ammo);
      }
      
      idx = (idx + dir + available.length) % available.length;
      const nextId = available[idx];
      
      state.weapon = nextId;
      const w = WEAPONS[nextId];
      if (w.melee) {
        state.ammo = Infinity;
      } else {
        const res = state.reserve && state.reserve[nextId] ? state.reserve[nextId] : 0;
        const take = Math.min(w.clip, res);
        state.ammo = take;
        state.reserve[nextId] -= take;
      }
      render();
    },`;

code = code.replace('reload,', injectCode + '\n    reload,');
fs.writeFileSync('src/weapons.js', code);

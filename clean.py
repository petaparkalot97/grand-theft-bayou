import sys, re
with open('src/main.js', 'r', encoding='utf-8') as f:
    c = f.read()

c = re.sub(r'const CAN_GOAL = 4;.*?\n', '', c)
c = re.sub(r'const truckPos = new THREE\.Vector3\(-6, 0, TRUCK_Z\);.*?\n', '', c)
c = re.sub(r'const TRUCK_Z = NORTH_MIN_Z \+ 30;.*?\n', '', c)
c = re.sub(r'let truckMarker, truck;.*?\n', '', c)

c = re.sub(r'\s*if \(state\.cans >= CAN_GOAL\) _blips\.push\(\{ kind: "waypoint", x: truckPos\.x, z: truckPos\.z \}\);\s*else for \(const c of cans\) if \(!c\.userData\.taken\) _blips\.push\(\{ kind: "can", x: c\.position\.x, z: c\.position\.z \}\);', '', c)
c = re.sub(r'\s*_blips\.push\(\{ kind: "truck", x: truckPos\.x, z: truckPos\.z \}\);', '', c)
c = re.sub(r'\s*truck = truckMesh \|\| fallbackCar\(null\);\s*truck\.position\.copy\(truckPos\);\s*truck\.rotation\.y = Math\.PI / 2;\s*scene\.add\(truck\);\s*addBlocker\(truckPos\.x, truckPos\.z, 2\.4\);\s*truckMarker = new THREE\.Mesh\(new THREE\.ConeGeometry\(0\.7, 1\.6, 4\),\s*new THREE\.MeshBasicMaterial\(\{ color: 0x7ee87e \}\)\);\s*truckMarker\.position\.set\(truckPos\.x, 5\.5, truckPos\.z\);\s*scene\.add\(truckMarker\);\s*poolLight\(0x7ee87e, 26, 34, truckPos\.x, 4, truckPos\.z\);', '', c)
c = re.sub(r'\s*if \(playerPos\.distanceTo\(truckPos\) < 4\.5\) \{\s*if \(state\.cans >= CAN_GOAL\) return win\(\);\s*flashObjective\(The tank is dry — need \$\{CAN_GOAL - state\.cans\} more can\(s\)\.\);\s*\}', '', c)
c = re.sub(r'\s*The swamp took you back\. \$\{state\.cans\}/\$\{CAN_GOAL\} gas cans, and the truck\'s\s*still sitting up past the city line with the keys in it\.<br><br>\$\{scoreLine\(\)\}', '\n    The swamp took you back.<br><br>', c)
c = re.sub(r'\s*if \(state\.cans >= CAN_GOAL && playerPos\.distanceTo\(truckPos\) < 4\.2\) win\(\);', '', c)
c = re.sub(r'\s*return state\.cans >= CAN_GOAL\s*\? "Get to the truck past the Tusouxroe city limits\."\s*: Jack a ride · rob gas cans: \$\{state\.cans\}/\$\{CAN_GOAL\};', '\n    return "Explore the Bayou.";', c)

with open('src/main.js', 'w', encoding='utf-8') as f:
    f.write(c)

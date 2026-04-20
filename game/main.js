// Dunegon 3D - Three.js + PeerJS | Sprint & Multiplayer

var canvas      = document.getElementById("dungeon-canvas");
var statusEl    = document.getElementById("status");
var lobbyEl     = document.getElementById("lobby");
var lobbyStatEl = document.getElementById("lobby-status");
var roomCodeEl  = document.getElementById("room-code");
var joinCodeEl  = document.getElementById("join-code");
var sprintFill  = document.getElementById("sprint-fill");

// ── Scene ──
var scene = new THREE.Scene();
scene.background = new THREE.Color(0x080810);
scene.fog = new THREE.Fog(0x080810, 6, 24);

var camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
camera.rotation.order = "YXZ";

var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false });
var PIXEL_RATIO = 0.35; // render at 35% resolution then upscale = pixelated look
renderer.setPixelRatio(PIXEL_RATIO);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;

window.addEventListener("resize", function() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
});
// ── Dungeon ──
var CELL = 4, GRID = 10;
var MAP = [
    [1,1,1,1,1,1,1,1,1,1],
    [1,0,0,0,0,0,0,0,0,1],
    [1,0,1,1,0,1,0,1,0,1],
    [1,0,0,1,0,0,0,0,0,1],
    [1,0,0,0,0,1,1,0,0,1],
    [1,0,1,0,0,0,0,0,0,1],
    [1,0,1,0,1,0,1,1,0,1],
    [1,0,0,0,0,0,0,0,0,1],
    [1,0,0,1,0,0,1,0,0,1],
    [1,1,1,1,1,1,1,1,1,1]
];

function isWall(gx, gz) {
    if (gx < 0 || gz < 0 || gx >= GRID || gz >= GRID) return true;
    return MAP[gz][gx] === 1;
}

function cellCenter(gx, gz) {
    return new THREE.Vector3(gx * CELL + CELL / 2, CELL / 2, gz * CELL + CELL / 2);
}

// ── Lighting ──
scene.add(new THREE.AmbientLight(0x110e22, 0.5));
var torchLight = new THREE.PointLight(0xff7722, 4.0, 14);
torchLight.castShadow = true;
torchLight.shadow.mapSize.width = 512;
torchLight.shadow.mapSize.height = 512;
torchLight.shadow.camera.near = 0.2;
torchLight.shadow.camera.far = 14;
scene.add(torchLight);

// ── Wall sconce lights ──
[{gx:2,gz:2},{gx:7,gz:2},{gx:2,gz:7},{gx:7,gz:7},{gx:1,gz:5},{gx:5,gz:1},{gx:8,gz:5}].forEach(function(c) {
    var sc = new THREE.PointLight(0xff5500, 1.6, 9);
    sc.position.set(c.gx*CELL+CELL/2, CELL*0.75, c.gz*CELL+CELL/2);
    scene.add(sc);
});

// ── Procedural Textures ──
function makeBrickTex() {
    // 16x16 pixelated voxel stone tile
    var cv = document.createElement("canvas"); cv.width = 16; cv.height = 16;
    var ctx = cv.getContext("2d");
    var stoneColors = ["#3a3535","#433e3e","#4a4444","#302c2c","#3e3939"];
    for (var py=0; py<16; py++) for (var ppx=0; ppx<16; ppx++) {
        ctx.fillStyle = stoneColors[Math.floor(Math.abs(Math.sin(ppx*7+py*13)*5))];
        ctx.fillRect(ppx,py,1,1);
    }
    // mortar lines (grid pattern)
    ctx.fillStyle = "#1a1818";
    for (var my=0; my<16; my+=8) ctx.fillRect(0,my,16,1);
    ctx.fillRect(0,0,1,8); ctx.fillRect(8,8,1,8);
    var t = new THREE.CanvasTexture(cv);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
}
function makeFloorTex() {
    // 16x16 pixelated voxel dirt/stone floor
    var cv = document.createElement("canvas"); cv.width = 16; cv.height = 16;
    var ctx = cv.getContext("2d");
    var floorColors = ["#1e1c17","#221f19","#252219","#1a1812","#201d15"];
    for (var py=0; py<16; py++) for (var ppx=0; ppx<16; ppx++) {
        ctx.fillStyle = floorColors[Math.floor(Math.abs(Math.sin(ppx*3+py*17)*5))];
        ctx.fillRect(ppx,py,1,1);
    }
    ctx.fillStyle = "#111009";
    for (var mx=0; mx<16; mx+=8) ctx.fillRect(mx,0,1,16);
    for (var mmy=0; mmy<16; mmy+=8) ctx.fillRect(0,mmy,16,1);
    var t = new THREE.CanvasTexture(cv);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
}
var brickTex = makeBrickTex();
brickTex.repeat.set(1,1);
var floorTex = makeFloorTex();
floorTex.repeat.set(GRID*2, GRID*2);
var ceilTex = makeBrickTex();
ceilTex.repeat.set(GRID, GRID);

// ── Custom Wall Shader ──
var wallVert = [
"varying vec2 vUv;",
"varying vec3 vNormal;",
"varying vec3 vWorldPos;",
"void main() {",
"  vUv = uv;",
"  vNormal = normalize(normalMatrix * normal);",
"  vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;",
"  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
"}"
].join("\n");

var wallFrag = [
"uniform float time;",
"uniform sampler2D brickMap;",
"varying vec2 vUv;",
"varying vec3 vNormal;",
"varying vec3 vWorldPos;",
"",
"float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898,78.233))) * 43758.5453); }",
"float noise(vec2 p) {",
"  vec2 i = floor(p); vec2 f = fract(p);",
"  f = f*f*(3.0-2.0*f);",
"  return mix(mix(rand(i),rand(i+vec2(1,0)),f.x),mix(rand(i+vec2(0,1)),rand(i+vec2(1,1)),f.x),f.y);",
"}",
"",
"void main() {",
"  vec4 brick = texture2D(brickMap, vUv);",
"  // Moss / moisture streaks on lower parts of wall",
"  float mossFactor = clamp(1.0 - vWorldPos.y * 0.9, 0.0, 1.0);",
"  float mossNoise = noise(vUv * 6.0 + vec2(0.0, time * 0.03));",
"  vec3 mossCol = vec3(0.06, 0.14, 0.06);",
"  vec3 col = mix(brick.rgb, mossCol, mossFactor * mossNoise * 0.6);",
"  // Edge darkening (fake AO on brick seams)",
"  float brickU = fract(vUv.x * 4.0);",
"  float brickV = fract(vUv.y * 4.0);",
"  float seam = min(min(brickU, 1.0-brickU), min(brickV, 1.0-brickV));",
"  col *= 0.75 + 0.25 * smoothstep(0.02, 0.12, seam);",
"  // Lambertian lighting approximation",
"  float nDotUp = abs(dot(vNormal, vec3(0.0, 1.0, 0.0)));",
"  col *= 0.6 + 0.4 * nDotUp;",
"  gl_FragColor = vec4(col, 1.0);",
"}"
].join("\n");

var wallMat = new THREE.ShaderMaterial({
    vertexShader: wallVert,
    fragmentShader: wallFrag,
    uniforms: {
        time:     { value: 0.0 },
        brickMap: { value: brickTex }
    }
});
var floorMat  = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 1.0,  metalness: 0.0, color: 0x445544 });
var ceilMat   = new THREE.MeshStandardMaterial({ map: ceilTex,  roughness: 1.0,  metalness: 0.0, color: 0x222233 });
var enemyMat  = new THREE.MeshStandardMaterial({ color: 0xcc2211, roughness: 0.6, metalness: 0.3, emissive: new THREE.Color(0x550000) });
var itemMat   = new THREE.MeshStandardMaterial({ color: 0x44ff88, roughness: 0.2, metalness: 0.8, emissive: new THREE.Color(0x114422) });
var remoteMat = new THREE.MeshStandardMaterial({ color: 0x3399ff, roughness: 0.6, metalness: 0.3, emissive: new THREE.Color(0x001144) });

// ── Voxel Enemy builder ──
function makeVoxelEnemy() {
    var group = new THREE.Group();
    var mat = enemyMat.clone();
    var s = 0.38;
    // head
    var head = new THREE.Mesh(new THREE.BoxGeometry(s*2,s*2,s*2), mat);
    head.position.set(0, 1.7, 0); head.castShadow=true; group.add(head);
    // body
    var body = new THREE.Mesh(new THREE.BoxGeometry(s*2.4, s*3, s*1.4), mat);
    body.position.set(0, 0.85, 0); body.castShadow=true; group.add(body);
    // left arm
    var lArm = new THREE.Mesh(new THREE.BoxGeometry(s*0.9, s*2.6, s*0.9), mat);
    lArm.position.set(-s*1.65, 0.85, 0); lArm.castShadow=true; group.add(lArm);
    // right arm
    var rArm = new THREE.Mesh(new THREE.BoxGeometry(s*0.9, s*2.6, s*0.9), mat);
    rArm.position.set( s*1.65, 0.85, 0); rArm.castShadow=true; group.add(rArm);
    // left leg
    var lLeg = new THREE.Mesh(new THREE.BoxGeometry(s*1.1, s*2.8, s*1.1), mat);
    lLeg.position.set(-s*0.7, -0.3, 0); lLeg.castShadow=true; group.add(lLeg);
    // right leg
    var rLeg = new THREE.Mesh(new THREE.BoxGeometry(s*1.1, s*2.8, s*1.1), mat);
    rLeg.position.set( s*0.7, -0.3, 0); rLeg.castShadow=true; group.add(rLeg);
    return group;
}
// ── Voxel Item ──
var itemGeo = new THREE.BoxGeometry(0.55, 0.55, 0.55);
var wallGeo   = new THREE.BoxGeometry(CELL, CELL, CELL);
var floorGeo  = new THREE.PlaneGeometry(GRID * CELL, GRID * CELL);
var remoteGeo = new THREE.BoxGeometry(0.9, 1.9, 0.9);

// ── Build static dungeon ──
(function() {
    var floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(GRID * CELL / 2, 0, GRID * CELL / 2);
    floor.receiveShadow = true;
    scene.add(floor);

    var ceil = new THREE.Mesh(floorGeo.clone(), ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(GRID * CELL / 2, CELL, GRID * CELL / 2);
    ceil.receiveShadow = true;
    scene.add(ceil);

    for (var gz = 0; gz < GRID; gz++) {
        for (var gx = 0; gx < GRID; gx++) {
            if (MAP[gz][gx] === 1) {
                var w = new THREE.Mesh(wallGeo, wallMat);
                w.position.set(gx * CELL + CELL / 2, CELL / 2, gz * CELL + CELL / 2);
                w.castShadow = true;
                w.receiveShadow = true;
                scene.add(w);
            }
        }
    }
})();

var ENEMY_CELLS = [{gx:8,gz:8},{gx:7,gz:3},{gx:3,gz:7},{gx:5,gz:5}];
var ITEM_CELLS  = [{gx:5,gz:1},{gx:1,gz:5},{gx:8,gz:2},{gx:2,gz:8},{gx:6,gz:6},{gx:3,gz:3}];

// ── Game state ──
var enemies = [], items = [], player = {}, gameOver = false, won = false, gameRunning = false;
var keys = {};

// ── Sprint ──
var MOVE_SPEED   = 5;
var SPRINT_SPEED = 11;
var stamina = 100, maxStamina = 100;

// ── Multiplayer ──
var peer = null, conn = null;
var remoteMesh = null;
var syncTimer = 0;

function initGame(startX, startZ) {
    enemies.forEach(function(e) { scene.remove(e.mesh); });
    items.forEach(function(i)   { scene.remove(i.mesh); });
    if (remoteMesh) { scene.remove(remoteMesh); remoteMesh = null; }
    enemies = []; items = [];
    gameOver = false; won = false; stamina = maxStamina;

    ENEMY_CELLS.forEach(function(pos) {
        var mesh = makeVoxelEnemy();
        mesh.position.copy(cellCenter(pos.gx, pos.gz));
        mesh.add(new THREE.PointLight(0xff2200, 1.8, 8));
        scene.add(mesh);
        enemies.push({ mesh: mesh, gx: pos.gx, gz: pos.gz, alive: true });
    });

    ITEM_CELLS.forEach(function(pos) {
        var mesh = new THREE.Mesh(itemGeo, itemMat.clone());
        mesh.position.copy(cellCenter(pos.gx, pos.gz));
        mesh.add(new THREE.PointLight(0x44ff88, 1.3, 6));
        scene.add(mesh);
        items.push({ mesh: mesh, gx: pos.gx, gz: pos.gz, collected: false });
    });

    var sx = startX !== undefined ? startX : cellCenter(1, 1).x;
    var sz = startZ !== undefined ? startZ : cellCenter(1, 1).z;
    player = { x: sx, z: sz, angle: 0, hp: 5, score: 0 };

    gameRunning = true;
    lobbyEl.style.display = "none";
    updateStatus();
}

function updateStatus() {
    if (!gameRunning) return;
    if (gameOver) {
        statusEl.textContent = "GAME OVER!  Press R to restart.";
        statusEl.style.color = "#ff5555";
        return;
    }
    if (won) {
        statusEl.textContent = "YOU WIN!  Score: " + player.score + "   Press R to play again.";
        statusEl.style.color = "#ffb86c";
        return;
    }
    statusEl.style.color = "#50fa7b";
    var h = "", i;
    for (i = 0; i < player.hp; i++) h += "\u2665";
    for (i = player.hp; i < 5; i++) h += "\u2661";
    var gl = items.filter(function(it) { return !it.collected; }).length;
    var el = enemies.filter(function(e) { return e.alive; }).length;
    statusEl.textContent = "HP: " + h + "   Score: " + player.score + "   Gems: " + gl + "   Enemies: " + el;
}

document.addEventListener("keydown", function(e) {
    keys[e.key] = true;
    if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].indexOf(e.key) >= 0) e.preventDefault();
});
document.addEventListener("keyup", function(e) { keys[e.key] = false; });

var TURN_SPEED = 1.5, PLAYER_RADIUS = 0.9;
var pointerLocked = false;
const MOUSE_SENSITIVITY = 0.0022;
var playerPitch = 0;
var bobTime = 0;

// ── Pointer Lock (Mouse Look) ──
canvas.addEventListener("click", function() {
    if (!pointerLocked) canvas.requestPointerLock();
});
document.addEventListener("pointerlockchange", function() {
    pointerLocked = (document.pointerLockElement === canvas);
});
document.addEventListener("mousemove", function(e) {
    if (pointerLocked && gameRunning && !gameOver && !won) {
        player.angle -= e.movementX * MOUSE_SENSITIVITY;
        playerPitch = Math.max(-0.45, Math.min(0.45, playerPitch - e.movementY * MOUSE_SENSITIVITY));
    }
});
var lastTime = performance.now();

// ── Remote player ──
function ensureRemoteMesh() {
    if (!remoteMesh) {
        remoteMesh = new THREE.Mesh(remoteGeo, remoteMat.clone());
        var rLight = new THREE.PointLight(0x3399ff, 1.5, 8);
        remoteMesh.add(rLight);
        scene.add(remoteMesh);
    }
    return remoteMesh;
}

// ── Multiplayer connection ──
function onConnected(connection) {
    conn = connection;
    lobbyStatEl.textContent = "Connected! Starting...";

    conn.on("data", function(data) {
        try {
            var d = JSON.parse(data);
            if (d.type === "pos") {
                var rm = ensureRemoteMesh();
                rm.position.set(d.x, CELL * 0.55, d.z);
                rm.rotation.y = d.angle;
            } else if (d.type === "enemyKill") {
                var idx = d.idx;
                if (enemies[idx] && enemies[idx].alive) {
                    enemies[idx].alive = false;
                    scene.remove(enemies[idx].mesh);
                }
            } else if (d.type === "itemGet") {
                var idx2 = d.idx;
                if (items[idx2] && !items[idx2].collected) {
                    items[idx2].collected = true;
                    scene.remove(items[idx2].mesh);
                }
            }
        } catch (err) {}
    });

    conn.on("close", function() {
        if (remoteMesh) { scene.remove(remoteMesh); remoteMesh = null; }
        lobbyStatEl.textContent = "Partner disconnected.";
    });
}

// ── Lobby buttons ──
window.startSolo = function() {
    initGame();
};

window.hostGame = function() {
    lobbyStatEl.textContent = "Creating room...";
    peer = new Peer();
    peer.on("open", function(id) {
        roomCodeEl.textContent = id;
        document.getElementById("host-code-area").style.display = "block";
        lobbyStatEl.textContent = "Waiting for partner...";
        peer.on("connection", function(c) {
            onConnected(c);
            setTimeout(function() { initGame(cellCenter(1,1).x, cellCenter(1,1).z); }, 800);
        });
    });
    peer.on("error", function(e) { lobbyStatEl.textContent = "Error: " + e.message; });
};

window.joinGame = function() {
    var code = joinCodeEl.value.trim();
    if (!code) { lobbyStatEl.textContent = "Enter a room code first."; return; }
    lobbyStatEl.textContent = "Connecting...";
    peer = new Peer();
    peer.on("open", function() {
        var c = peer.connect(code, { reliable: true });
        c.on("open", function() {
            onConnected(c);
            setTimeout(function() { initGame(cellCenter(8,1).x, cellCenter(8,1).z); }, 500);
        });
        c.on("error", function(e) { lobbyStatEl.textContent = "Error: " + e.message; });
    });
    peer.on("error", function(e) { lobbyStatEl.textContent = "Error: " + e.message; });
};

// ── Game loop ──
function animate(now) {
    requestAnimationFrame(animate);
    var dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    renderer.render(scene, camera);
    if (!gameRunning) return;

    if (keys["r"] || keys["R"]) {
        keys["r"] = false; keys["R"] = false;
        initGame();
        return;
    }

    if (gameOver || won) return;

    // ── Turning (only when pointer NOT locked — otherwise A/D strafe) ──
    if (!pointerLocked) {
        if (keys["ArrowLeft"]  || keys["a"] || keys["A"]) player.angle += TURN_SPEED * dt;
        if (keys["ArrowRight"] || keys["d"] || keys["D"]) player.angle -= TURN_SPEED * dt;
    }

    // ── Sprint stamina ──
    var sprinting = (keys["Shift"] || keys["ShiftLeft"] || keys["ShiftRight"]) && stamina > 0;
    if (sprinting) {
        stamina = Math.max(0, stamina - 45 * dt);
    } else {
        stamina = Math.min(maxStamina, stamina + 22 * dt);
    }
    sprintFill.style.width = (stamina / maxStamina * 100) + "%";
    sprintFill.style.background = sprinting ? "#ff5555" : (stamina < 30 ? "#ffb86c" : "#50fa7b");

    // ── Movement (normalized so diagonal isn't faster) ──
    var speed = sprinting ? SPRINT_SPEED : MOVE_SPEED;
    var sinA = Math.sin(player.angle), cosA = Math.cos(player.angle);
    var moveX = 0, moveZ = 0;
    var fwd  = (keys["ArrowUp"]    || keys["w"] || keys["W"]) ? 1 : 0;
    var back = (keys["ArrowDown"]  || keys["s"] || keys["S"]) ? 1 : 0;
    var strafeL = (pointerLocked && (keys["a"] || keys["A"] || keys["ArrowLeft"]))  ? 1 : 0;
    var strafeR = (pointerLocked && (keys["d"] || keys["D"] || keys["ArrowRight"])) ? 1 : 0;
    moveX += -sinA * (fwd - back) + (-cosA) * (strafeL - strafeR);
    moveZ += -cosA * (fwd - back) + ( sinA) * (strafeL - strafeR);
    var moveLen = Math.sqrt(moveX*moveX + moveZ*moveZ);
    if (moveLen > 1.0) { moveX /= moveLen; moveZ /= moveLen; }
    var nx = player.x + moveX * speed * dt;
    var nz = player.z + moveZ * speed * dt;

    var r = PLAYER_RADIUS;
    var gzc = Math.floor(player.z / CELL);
    if (!isWall(Math.floor((nx-r)/CELL), gzc) && !isWall(Math.floor((nx+r)/CELL), gzc)) player.x = nx;
    var gxc = Math.floor(player.x / CELL);
    if (!isWall(gxc, Math.floor((nz-r)/CELL)) && !isWall(gxc, Math.floor((nz+r)/CELL))) player.z = nz;

    // ── Enemy collision ──
    enemies.forEach(function(e, idx) {
        if (!e.alive) return;
        var c = cellCenter(e.gx, e.gz);
        if (Math.hypot(player.x - c.x, player.z - c.z) < 2) {
            e.alive = false;
            scene.remove(e.mesh);
            player.hp--;
            if (conn && conn.open) conn.send(JSON.stringify({ type: "enemyKill", idx: idx }));
            if (player.hp <= 0) { gameOver = true; updateStatus(); return; }
        }
    });

    // ── Item pickup ──
    items.forEach(function(i, idx) {
        if (i.collected) return;
        var c = cellCenter(i.gx, i.gz);
        if (Math.hypot(player.x - c.x, player.z - c.z) < 2) {
            i.collected = true;
            scene.remove(i.mesh);
            player.score++;
            if (conn && conn.open) conn.send(JSON.stringify({ type: "itemGet", idx: idx }));
        }
    });

    if (items.every(function(i){ return i.collected; }) && enemies.every(function(e){ return !e.alive; })) won = true;

    // ── Update shader uniforms ──
    if (wallMat.uniforms) wallMat.uniforms.time.value = now / 1000.0;

    // ── Wall proximity vignette (collision feedback) ──
    var wallVigR = PLAYER_RADIUS + 0.5;
    var px = player.x, pz = player.z;
    var nearWall = (
        isWall(Math.floor((px - wallVigR) / CELL), Math.floor(pz / CELL)) ||
        isWall(Math.floor((px + wallVigR) / CELL), Math.floor(pz / CELL)) ||
        isWall(Math.floor(px / CELL), Math.floor((pz - wallVigR) / CELL)) ||
        isWall(Math.floor(px / CELL), Math.floor((pz + wallVigR) / CELL))
    );
    canvas.style.boxShadow = nearWall
        ? "inset 0 0 60px 30px rgba(255,80,0,0.45)"
        : "inset 0 0 40px 10px rgba(0,0,0,0.6)";

    // ── Head bob ──
    var isMoving = (keys["w"]||keys["W"]||keys["ArrowUp"]||keys["s"]||keys["S"]||keys["ArrowDown"]);
    if (isMoving) bobTime += dt * (sprinting ? 9 : 6);
    var bobY = isMoving ? Math.sin(bobTime) * 0.06 : Math.sin(bobTime) * 0.006;

    // ── Torch flicker ──
    torchLight.intensity = 3.5 + Math.sin(now * 0.009) * 0.5 + (Math.random() * 0.4 - 0.2);

    // ── Camera ──
    camera.position.set(player.x, CELL * 0.55 + bobY, player.z);
    camera.rotation.y = player.angle;
    camera.rotation.x = playerPitch;
    torchLight.position.copy(camera.position);

    // ── Animate objects ──
    var t = now / 1000;
    enemies.forEach(function(e, idx) {
        if (!e.alive) return;
        e.mesh.position.y = Math.sin(t*1.8 + idx*1.2) * 0.18;
        e.mesh.rotation.y = t * 1.2;
    });
    items.forEach(function(i, idx) {
        if (i.collected) return;
        i.mesh.position.y = CELL/2 + Math.sin(t*2.5 + idx*0.9) * 0.25;
        i.mesh.rotation.y = t * 3.0;
        i.mesh.rotation.x = t * 2.0;
    });

    // ── Multiplayer sync ──
    syncTimer += dt;
    if (conn && conn.open && syncTimer >= 0.05) {
        syncTimer = 0;
        conn.send(JSON.stringify({ type: "pos", x: player.x, z: player.z, angle: player.angle }));
    }

    updateStatus();
}

animate(performance.now());

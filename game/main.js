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

var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
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
    var cv = document.createElement("canvas"); cv.width = 128; cv.height = 128;
    var ctx = cv.getContext("2d");
    ctx.fillStyle = "#2e2828"; ctx.fillRect(0,0,128,128);
    for (var i = 0; i < 5000; i++) {
        var px = Math.random()*128, py = Math.random()*128;
        var v = Math.floor(Math.random()*60-20);
        var c = 58+v; ctx.fillStyle = "rgb("+c+","+(c-8)+","+(c-14)+")"; ctx.fillRect(px,py,Math.random()*3+1,Math.random()*2+1);
    }
    var bH=16, bW=32;
    for (var row=0; row<8; row++) {
        ctx.fillStyle="#0e0c0c"; ctx.fillRect(0,row*bH,128,2);
        var off=(row%2)*(bW/2);
        for (var bx=-bW+off; bx<128; bx+=bW) { ctx.fillStyle="#0e0c0c"; ctx.fillRect(bx,row*bH+2,2,bH-2); }
    }
    var t=new THREE.CanvasTexture(cv); t.wrapS=t.wrapT=THREE.RepeatWrapping; return t;
}
function makeFloorTex() {
    var cv = document.createElement("canvas"); cv.width = 128; cv.height = 128;
    var ctx = cv.getContext("2d");
    ctx.fillStyle = "#171512"; ctx.fillRect(0,0,128,128);
    for (var i = 0; i < 4000; i++) {
        var px=Math.random()*128, py=Math.random()*128, v=Math.floor(Math.random()*40);
        ctx.fillStyle="rgba(255,245,230,"+(v/255)+")"; ctx.fillRect(px,py,Math.random()*2+1,1);
    }
    ctx.strokeStyle="#090807"; ctx.lineWidth=2;
    for (var tx=0; tx<128; tx+=32) { ctx.beginPath(); ctx.moveTo(tx,0); ctx.lineTo(tx,128); ctx.stroke(); }
    for (var ty=0; ty<128; ty+=32) { ctx.beginPath(); ctx.moveTo(0,ty); ctx.lineTo(128,ty); ctx.stroke(); }
    var t=new THREE.CanvasTexture(cv); t.wrapS=t.wrapT=THREE.RepeatWrapping; return t;
}
var brickTex = makeBrickTex();
brickTex.repeat.set(1,1);
var floorTex = makeFloorTex();
floorTex.repeat.set(GRID*1.5, GRID*1.5);
var ceilTex = makeBrickTex();
ceilTex.repeat.set(GRID, GRID);

// ── Materials ──
var wallMat   = new THREE.MeshStandardMaterial({ map: brickTex, roughness: 0.95, metalness: 0.0, color: 0xaa99cc });
var floorMat  = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 1.0,  metalness: 0.0, color: 0x445544 });
var ceilMat   = new THREE.MeshStandardMaterial({ map: ceilTex,  roughness: 1.0,  metalness: 0.0, color: 0x222233 });
var enemyMat  = new THREE.MeshStandardMaterial({ color: 0xcc2211, roughness: 0.6, metalness: 0.3, emissive: new THREE.Color(0x550000) });
var itemMat   = new THREE.MeshStandardMaterial({ color: 0x44ff88, roughness: 0.2, metalness: 0.8, emissive: new THREE.Color(0x114422) });
var remoteMat = new THREE.MeshStandardMaterial({ color: 0x3399ff, roughness: 0.6, metalness: 0.3, emissive: new THREE.Color(0x001144) });

// ── Geometries ──
var wallGeo   = new THREE.BoxGeometry(CELL, CELL, CELL);
var floorGeo  = new THREE.PlaneGeometry(GRID * CELL, GRID * CELL);
var enemyGeo  = new THREE.BoxGeometry(0.9, 2.2, 0.9);
var itemGeo   = new THREE.OctahedronGeometry(0.55, 1);
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
        var mesh = new THREE.Mesh(enemyGeo, enemyMat.clone());
        mesh.position.copy(cellCenter(pos.gx, pos.gz));
        mesh.castShadow = true;
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

    // ── Turning ──
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

    // ── Movement ──
    var speed = sprinting ? SPRINT_SPEED : MOVE_SPEED;
    var sinA = Math.sin(player.angle), cosA = Math.cos(player.angle);
    var nx = player.x, nz = player.z;
    if (keys["ArrowUp"]   || keys["w"] || keys["W"]) { nx -= sinA * speed * dt; nz -= cosA * speed * dt; }
    if (keys["ArrowDown"] || keys["s"] || keys["S"]) { nx += sinA * speed * dt; nz += cosA * speed * dt; }

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
        e.mesh.position.y = CELL/2 + Math.sin(t*1.8 + idx*1.2) * 0.25;
        e.mesh.rotation.y = t * 1.5;
    });
    items.forEach(function(i, idx) {
        if (i.collected) return;
        i.mesh.position.y = CELL/2 + Math.sin(t*2.5 + idx*0.9) * 0.3;
        i.mesh.rotation.y = t * 2.5;
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

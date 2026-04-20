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
scene.add(new THREE.AmbientLight(0x112244, 1.8));
var torchLight = new THREE.PointLight(0xff8833, 3, 16);
scene.add(torchLight);

// ── Materials ──
var wallMat   = new THREE.MeshLambertMaterial({ color: 0x2244aa });
var floorMat  = new THREE.MeshLambertMaterial({ color: 0x1a2a1a });
var ceilMat   = new THREE.MeshLambertMaterial({ color: 0x0e0e1e });
var enemyMat  = new THREE.MeshLambertMaterial({ color: 0xff3333, emissive: new THREE.Color(0x660000) });
var itemMat   = new THREE.MeshLambertMaterial({ color: 0x44ff88, emissive: new THREE.Color(0x225533) });
var remoteMat = new THREE.MeshLambertMaterial({ color: 0x3399ff, emissive: new THREE.Color(0x001144) });

// ── Geometries ──
var wallGeo   = new THREE.BoxGeometry(CELL, CELL, CELL);
var floorGeo  = new THREE.PlaneGeometry(GRID * CELL, GRID * CELL);
var enemyGeo  = new THREE.BoxGeometry(1.6, 1.6, 1.6);
var itemGeo   = new THREE.OctahedronGeometry(0.65, 0);
var remoteGeo = new THREE.BoxGeometry(0.9, 1.9, 0.9);

// ── Build static dungeon ──
(function() {
    var floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(GRID * CELL / 2, 0, GRID * CELL / 2);
    scene.add(floor);

    var ceil = new THREE.Mesh(floorGeo.clone(), ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(GRID * CELL / 2, CELL, GRID * CELL / 2);
    scene.add(ceil);

    for (var gz = 0; gz < GRID; gz++) {
        for (var gx = 0; gx < GRID; gx++) {
            if (MAP[gz][gx] === 1) {
                var w = new THREE.Mesh(wallGeo, wallMat);
                w.position.set(gx * CELL + CELL / 2, CELL / 2, gz * CELL + CELL / 2);
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
    if (keys["ArrowLeft"]  || keys["a"] || keys["A"]) player.angle += TURN_SPEED * dt;
    if (keys["ArrowRight"] || keys["d"] || keys["D"]) player.angle -= TURN_SPEED * dt;

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

    // ── Camera ──
    camera.position.set(player.x, CELL * 0.55, player.z);
    camera.rotation.y = player.angle;
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

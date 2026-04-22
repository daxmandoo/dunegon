// Dunegon 3D - Three.js + PeerJS | Sprint & Multiplayer

var canvas      = document.getElementById("dungeon-canvas");
var statusEl    = document.getElementById("status");
var lobbyEl     = document.getElementById("lobby");
var lobbyStatEl = document.getElementById("lobby-status");
var roomCodeEl  = document.getElementById("room-code");
var joinCodeEl  = document.getElementById("join-code");
var sprintFill  = document.getElementById("sprint-fill");

var launchParams = new URLSearchParams(window.location.search || "");
var launchConnectLobby = (launchParams.get("connect_lobby") || "").trim();

// ── Scene ──
var scene = new THREE.Scene();
scene.background = new THREE.Color(0x080810);
scene.fog = new THREE.Fog(0x080810, 8, 40);

var camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
camera.rotation.order = "YXZ";

var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false });
var PIXEL_RATIO = 1.0; // full resolution for realistic textures
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
var CELL = 4, GRID = 16;
var MAP = [
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,0,0,0,0,0,1,0,0,0,0,0,0,0,0,1],
    [1,0,1,1,0,0,1,0,1,1,0,1,0,1,0,1],
    [1,0,1,0,0,0,0,0,0,1,0,1,0,0,0,1],
    [1,0,0,0,1,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,1,0,1,0,1,1,1,0,0,1,1,0,0,1],
    [1,0,1,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,1,0,1,1,0,1,0,1,0,1],
    [1,1,1,0,1,0,0,0,0,0,0,0,0,1,0,1],
    [1,0,0,0,1,0,1,1,0,1,0,0,0,0,0,1],
    [1,0,1,0,0,0,0,0,0,1,0,1,1,0,0,1],
    [1,0,1,1,0,0,0,1,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,1,0,0,0,1,0,0,0,1,0,1],
    [1,0,1,0,0,1,0,1,0,0,0,0,0,0,0,1],
    [1,0,1,0,0,0,0,0,0,1,0,1,0,0,0,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
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

// ── Wall sconce lights + animated flame meshes ──
var sconceLights = [], sconceFlames = [];
var SCONCE_DEFS = [{gx:1,gz:2},{gx:7,gz:2},{gx:14,gz:2},
 {gx:2,gz:7},{gx:7,gz:7},{gx:12,gz:7},
 {gx:2,gz:12},{gx:7,gz:12},{gx:14,gz:12},
 {gx:5,gz:5},{gx:10,gz:10},{gx:13,gz:9},
 {gx:3,gz:14},{gx:9,gz:4},{gx:11,gz:13}];
SCONCE_DEFS.forEach(function(c) {
    var sc = new THREE.PointLight(0xff5500, 1.8, 11);
    sc.position.set(c.gx*CELL+CELL/2, CELL*0.75, c.gz*CELL+CELL/2);
    scene.add(sc);
    sconceLights.push(sc);
    // Flame cone
    var fGeo = new THREE.ConeGeometry(0.10, 0.26, 6);
    var fMat = new THREE.MeshBasicMaterial({ color: 0xff6600 });
    var flame = new THREE.Mesh(fGeo, fMat);
    flame.position.set(c.gx*CELL+CELL/2, CELL*0.80, c.gz*CELL+CELL/2);
    scene.add(flame);
    // Bright core
    var cGeo = new THREE.SphereGeometry(0.065, 5, 5);
    var cMat = new THREE.MeshBasicMaterial({ color: 0xffee66 });
    var core = new THREE.Mesh(cGeo, cMat);
    core.position.set(c.gx*CELL+CELL/2, CELL*0.86, c.gz*CELL+CELL/2);
    scene.add(core);
    sconceFlames.push({ flame: flame, core: core, baseY: CELL*0.80 });
});

// ── Procedural Textures ──
function makeBrickTex() {
    var S = 512;          // texture resolution
    var BW = 64, BH = 32; // brick width/height in pixels — realistic 2:1 ratio
    var MORTAR = 3;        // mortar thickness in pixels
    var cv = document.createElement("canvas"); cv.width = S; cv.height = S;
    var ctx = cv.getContext("2d");
    var imgData = ctx.createImageData(S, S);
    var px = imgData.data;

    // Seeded pseudo-random
    function rng(x, y, s) {
        var v = Math.sin(x * 127.1 + y * 311.7 + (s||0) * 74.3) * 43758.5453;
        return v - Math.floor(v);
    }
    // Value noise — smooth random
    function vnoise(x, y) {
        var ix = Math.floor(x), iy = Math.floor(y);
        var fx = x - ix, fy = y - iy;
        fx = fx*fx*(3-2*fx); fy = fy*fy*(3-2*fy);
        var a = rng(ix,iy), b = rng(ix+1,iy), c = rng(ix,iy+1), d = rng(ix+1,iy+1);
        return a + (b-a)*fx + (c-a)*fy + (a-b-c+d)*fx*fy;
    }
    // Multi-octave fBm
    function fbm(x, y, oct) {
        var v=0, amp=0.5, freq=1, tot=0;
        for (var o=0; o<(oct||4); o++) { v+=vnoise(x*freq,y*freq)*amp; tot+=amp; amp*=0.5; freq*=2.1; }
        return v/tot;
    }

    var rows = S / BH;
    for (var row = 0; row < rows; row++) {
        var offsetX = (row % 2 === 0) ? 0 : BW / 2;
        var cols = Math.ceil(S / BW) + 1;
        for (var col = 0; col < cols; col++) {
            var bx0 = Math.round(col * BW - offsetX);
            var by0 = Math.round(row * BH);

            // Per-brick base color — earthy red/brown/orange variation
            var brickSeed = rng(col, row);
            var hueShift = brickSeed * 0.18 - 0.09;
            // Base RGB for this brick
            var baseR = 130 + Math.round(brickSeed * 55 - 27);
            var baseG = 75  + Math.round(rng(col,row,1) * 30 - 15);
            var baseB = 58  + Math.round(rng(col,row,2) * 25 - 12);

            for (var py = by0 + MORTAR; py < by0 + BH - MORTAR; py++) {
                if (py < 0 || py >= S) continue;
                for (var ppx = bx0 + MORTAR; ppx < bx0 + BW - MORTAR; ppx++) {
                    var wpx = ((ppx % S) + S) % S;
                    if (wpx < 0 || wpx >= S) continue;

                    var u = (ppx - bx0) / BW;
                    var v2 = (py - by0) / BH;

                    // Surface noise at multiple scales
                    var n1 = fbm(ppx * 0.08, py * 0.08, 4);  // large bumps
                    var n2 = fbm(ppx * 0.3,  py * 0.3,  3);  // medium grit
                    var n3 = fbm(ppx * 1.2,  py * 1.2,  2);  // fine grain

                    // Edge bevel — darken near mortar edges
                    var edgeU = Math.min(u - MORTAR/BW, 1.0 - MORTAR/BW - u);
                    var edgeV = Math.min(v2 - MORTAR/BH, 1.0 - MORTAR/BH - v2);
                    var edgeFactor = Math.min(edgeU, edgeV) * BW * 0.35;
                    var bevel = Math.min(1.0, Math.max(0.0, edgeFactor));

                    // Fake surface normal from noise gradient → lighting
                    var gx = fbm(ppx*0.08+0.5, py*0.08) - fbm(ppx*0.08-0.5, py*0.08);
                    var gy = fbm(ppx*0.08, py*0.08+0.5) - fbm(ppx*0.08, py*0.08-0.5);
                    var light = 0.72 + gx*0.8 + gy*0.5 + n1*0.18 + n2*0.08;
                    light = Math.max(0.3, Math.min(1.3, light));

                    // Crack / stain streaks
                    var stain = fbm(ppx*0.04 + row*13.7, py*0.04 + col*7.3, 3);
                    var stainAmt = Math.max(0, stain - 0.55) * 1.2;

                    var r2 = (baseR + n1*28 + n2*12 + n3*6) * light * bevel;
                    var g2 = (baseG + n1*14 + n2*8  + n3*3) * light * bevel;
                    var b2 = (baseB + n1*10 + n2*5  + n3*2) * light * bevel;

                    // Apply dark stain
                    r2 = r2 * (1 - stainAmt*0.6);
                    g2 = g2 * (1 - stainAmt*0.5);
                    b2 = b2 * (1 - stainAmt*0.3);

                    var idx = (py * S + wpx) * 4;
                    px[idx]   = Math.min(255, Math.max(0, Math.round(r2)));
                    px[idx+1] = Math.min(255, Math.max(0, Math.round(g2)));
                    px[idx+2] = Math.min(255, Math.max(0, Math.round(b2)));
                    px[idx+3] = 255;
                }
            }
        }
    }

    // Draw mortar — gritty grey with noise
    for (var my = 0; my < S; my++) {
        for (var mx = 0; mx < S; mx++) {
            var row2 = Math.floor(my / BH);
            var off2 = (row2 % 2 === 0) ? 0 : BW / 2;
            var localX = ((mx + off2) % BW + BW) % BW;
            var localY = my % BH;
            var inMortarX = localX < MORTAR || localX >= BW - MORTAR;
            var inMortarY = localY < MORTAR || localY >= BH - MORTAR;
            if (inMortarX || inMortarY) {
                var mn = fbm(mx*0.15, my*0.15, 3);
                var mv = Math.round(38 + mn * 28);
                var midx = (my * S + mx) * 4;
                px[midx]   = mv + 4;
                px[midx+1] = mv;
                px[midx+2] = mv - 3;
                px[midx+3] = 255;
            }
        }
    }

    ctx.putImageData(imgData, 0, 0);
    var t = new THREE.CanvasTexture(cv);
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
}
function makeFloorTex() {
    var S = 512, TS = 64, GROUT = 3;
    var cv = document.createElement("canvas"); cv.width = S; cv.height = S;
    var ctx = cv.getContext("2d");
    var imgData = ctx.createImageData(S, S);
    var px = imgData.data;

    function rng(x, y, s) {
        var v = Math.sin(x * 127.1 + y * 311.7 + (s||0) * 74.3) * 43758.5453;
        return v - Math.floor(v);
    }
    function vnoise(x, y) {
        var ix = Math.floor(x), iy = Math.floor(y);
        var fx = x-ix, fy = y-iy;
        fx=fx*fx*(3-2*fx); fy=fy*fy*(3-2*fy);
        return rng(ix,iy)+(rng(ix+1,iy)-rng(ix,iy))*fx+(rng(ix,iy+1)-rng(ix,iy))*fy+(rng(ix,iy)+rng(ix+1,iy+1)-rng(ix+1,iy)-rng(ix,iy+1))*fx*fy;
    }
    function fbm(x, y, oct) {
        var v=0, amp=0.5, freq=1, tot=0;
        for (var o=0;o<(oct||4);o++){v+=vnoise(x*freq,y*freq)*amp;tot+=amp;amp*=0.5;freq*=2.1;}
        return v/tot;
    }

    var tiles = S / TS;
    for (var ty2 = 0; ty2 < S; ty2++) {
        for (var tx2 = 0; tx2 < S; tx2++) {
            var col2 = Math.floor(tx2 / TS);
            var row2 = Math.floor(ty2 / TS);
            var lx = tx2 % TS, ly = ty2 % TS;
            var inGroutX = lx < GROUT || lx >= TS - GROUT;
            var inGroutY = ly < GROUT || ly >= TS - GROUT;

            var idx = (ty2 * S + tx2) * 4;
            if (inGroutX || inGroutY) {
                // Grout — dark sandy grey
                var gn = fbm(tx2*0.12, ty2*0.12, 3);
                var gv = Math.round(28 + gn * 22);
                px[idx]=gv+2; px[idx+1]=gv+1; px[idx+2]=gv-2; px[idx+3]=255;
            } else {
                var tileSeed = rng(col2, row2);
                var u = lx / TS, v3 = ly / TS;

                // Surface noise layers
                var n1 = fbm(tx2*0.06, ty2*0.06, 5);
                var n2 = fbm(tx2*0.25, ty2*0.25, 3);
                var n3 = fbm(tx2*0.9,  ty2*0.9,  2);

                // Bevel at edges
                var eu = Math.min(u - GROUT/TS, 1 - GROUT/TS - u);
                var ev = Math.min(v3 - GROUT/TS, 1 - GROUT/TS - v3);
                var bevel = Math.min(1, Math.max(0, Math.min(eu, ev) * TS * 0.4));

                // Fake surface normal lighting
                var gx2 = fbm(tx2*0.06+0.5,ty2*0.06)-fbm(tx2*0.06-0.5,ty2*0.06);
                var gy2 = fbm(tx2*0.06,ty2*0.06+0.5)-fbm(tx2*0.06,ty2*0.06-0.5);
                var light2 = Math.max(0.35, Math.min(1.2, 0.75 + gx2*0.6 + gy2*0.4 + n1*0.15));

                // Base stone color — dark grey/brown
                var baseR2 = 52 + Math.round(tileSeed * 20 - 10);
                var baseG2 = 48 + Math.round(rng(col2,row2,1)*16-8);
                var baseB2 = 40 + Math.round(rng(col2,row2,2)*12-6);

                var r3 = (baseR2 + n1*22 + n2*10 + n3*5) * light2 * bevel;
                var g3 = (baseG2 + n1*16 + n2*7  + n3*3) * light2 * bevel;
                var b3 = (baseB2 + n1*12 + n2*5  + n3*2) * light2 * bevel;

                px[idx]  =Math.min(255,Math.max(0,Math.round(r3)));
                px[idx+1]=Math.min(255,Math.max(0,Math.round(g3)));
                px[idx+2]=Math.min(255,Math.max(0,Math.round(b3)));
                px[idx+3]=255;
            }
        }
    }
    ctx.putImageData(imgData, 0, 0);
    var t = new THREE.CanvasTexture(cv);
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
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
"#pragma vscode_glsllint_stage: vert",
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
"#pragma vscode_glsllint_stage: frag",
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
// Voxel wall: backing slab + 100-brick (10x10) protrusions per face
var BROWS = 10, BCOLS = 10;
var BW = CELL / BCOLS, BH = CELL / BROWS;
var voxBrickGeoZ = new THREE.BoxGeometry(BW * 0.86, BH * 0.86, 1.0); // depth set per-instance via scale.z
var voxBrickGeoX = new THREE.BoxGeometry(1.0, BH * 0.86, BW * 0.86); // depth set per-instance via scale.x
var voxBrickMat  = new THREE.MeshStandardMaterial({ map: brickTex, roughness: 0.9, metalness: 0.0 });
var backSlabGeo  = new THREE.BoxGeometry(CELL, CELL, CELL);
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

    // ── Puddles ──
    var puddleMat = new THREE.MeshStandardMaterial({ color: 0x1a2a38, roughness: 0.04, metalness: 0.9, opacity: 0.7, transparent: true });
    [{gx:5,gz:4,sw:1.4,sd:0.9},{gx:8,gz:9,sw:1.8,sd:1.1},{gx:11,gz:11,sw:1.2,sd:0.8},
     {gx:3,gz:13,sw:2.0,sd:1.0},{gx:7,gz:4,sw:1.0,sd:0.7},{gx:10,gz:5,sw:1.5,sd:1.3}].forEach(function(p) {
        var pg = new THREE.PlaneGeometry(CELL*p.sw, CELL*p.sd);
        var pm = new THREE.Mesh(pg, puddleMat);
        pm.rotation.x = -Math.PI/2;
        pm.position.set(p.gx*CELL+CELL/2, 0.01, p.gz*CELL+CELL/2);
        scene.add(pm);
    });

    // ── Stalactites ──
    var stalaGeo = new THREE.ConeGeometry(0.09, 0.55, 6);
    var stalaMat = new THREE.MeshStandardMaterial({ color: 0x2a2030, roughness: 1.0 });
    [{gx:5,gz:1},{gx:8,gz:1},{gx:12,gz:1},{gx:5,gz:3},{gx:8,gz:3},
     {gx:3,gz:4},{gx:9,gz:4},{gx:4,gz:6},{gx:7,gz:6},{gx:11,gz:6},
     {gx:5,gz:8},{gx:8,gz:9},{gx:4,gz:11},{gx:7,gz:12},{gx:9,gz:13},
     {gx:10,gz:14},{gx:13,gz:14},{gx:1,gz:8},{gx:13,gz:11},{gx:6,gz:14}
    ].forEach(function(s) {
        if (MAP[s.gz] && MAP[s.gz][s.gx] === 0) {
            var stMesh = new THREE.Mesh(stalaGeo, stalaMat);
            stMesh.rotation.z = Math.PI;
            stMesh.position.set(
                s.gx*CELL+CELL/2 + (Math.random()-0.5)*1.0,
                CELL - 0.28 + Math.random()*0.08,
                s.gz*CELL+CELL/2 + (Math.random()-0.5)*1.0
            );
            scene.add(stMesh);
        }
    });

    // ── Barrels ──
    var brlGeo    = new THREE.CylinderGeometry(0.27, 0.30, 0.65, 8);
    var brlMat    = new THREE.MeshStandardMaterial({ color: 0x4a3010, roughness: 0.9, metalness: 0.1 });
    var brlCapGeo = new THREE.CylinderGeometry(0.30, 0.30, 0.04, 8);
    var brlCapMat = new THREE.MeshStandardMaterial({ color: 0x3a2508, roughness: 1.0 });
    [{gx:4,gz:2},{gx:6,gz:6},{gx:9,gz:5},{gx:2,gz:9},
     {gx:11,gz:6},{gx:3,gz:13},{gx:11,gz:11},{gx:6,gz:14}
    ].forEach(function(b) {
        if (MAP[b.gz] && MAP[b.gz][b.gx] === 0) {
            var brl = new THREE.Mesh(brlGeo, brlMat.clone());
            brl.position.set(
                b.gx*CELL+CELL/2 + (Math.random()-0.5)*0.6,
                0.33,
                b.gz*CELL+CELL/2 + (Math.random()-0.5)*0.6
            );
            brl.rotation.y = Math.random()*Math.PI;
            brl.castShadow = true;
            scene.add(brl);
            var cap = new THREE.Mesh(brlCapGeo, brlCapMat);
            cap.position.set(brl.position.x, 0.66, brl.position.z);
            scene.add(cap);
        }
    });

    for (var gz = 0; gz < GRID; gz++) {
        for (var gx = 0; gx < GRID; gx++) {
            if (MAP[gz][gx] === 1) {
                var w = new THREE.Mesh(backSlabGeo, wallMat);
                w.position.set(gx * CELL + CELL / 2, CELL / 2, gz * CELL + CELL / 2);
                w.castShadow = true;
                w.receiveShadow = true;
                scene.add(w);
            }
        }
    }
})();

// ── Voxel brick protrusions (100 individually-colored bricks per exposed wall face) ──
(function() {
    function isEmpty(gx2, gz2) {
        if (gx2 < 0 || gx2 >= GRID || gz2 < 0 || gz2 >= GRID) return true;
        return MAP[gz2][gx2] === 0;
    }
    function brickRng(a, b) {
        var v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
        return v - Math.floor(v);
    }
    // Count instances needed
    var cntZ = 0, cntX = 0;
    for (var gz = 0; gz < GRID; gz++) {
        for (var gx = 0; gx < GRID; gx++) {
            if (MAP[gz][gx] !== 1) continue;
            if (isEmpty(gx, gz-1)) cntZ += BROWS * BCOLS;
            if (isEmpty(gx, gz+1)) cntZ += BROWS * BCOLS;
            if (isEmpty(gx-1, gz)) cntX += BROWS * BCOLS;
            if (isEmpty(gx+1, gz)) cntX += BROWS * BCOLS;
        }
    }
    // Use vertex colors blended with the brick texture
    var instMatZ = new THREE.MeshStandardMaterial({ map: brickTex, roughness: 0.88, metalness: 0.0, vertexColors: false });
    var instMatX = new THREE.MeshStandardMaterial({ map: brickTex, roughness: 0.88, metalness: 0.0, vertexColors: false });
    var instZ = new THREE.InstancedMesh(voxBrickGeoZ, instMatZ, cntZ);
    var instX = new THREE.InstancedMesh(voxBrickGeoX, instMatX, cntX);
    instZ.castShadow = instX.castShadow = true;
    instZ.receiveShadow = instX.receiveShadow = true;
    instZ.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cntZ * 3), 3);
    instX.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cntX * 3), 3);
    var dummy = new THREE.Object3D();
    var col3 = new THREE.Color();
    var iZ = 0, iX = 0;
    for (var gz = 0; gz < GRID; gz++) {
        for (var gx = 0; gx < GRID; gx++) {
            if (MAP[gz][gx] !== 1) continue;
            var wx = gx * CELL + CELL / 2;
            var wz = gz * CELL + CELL / 2;
            // Z-facing exposed faces
            var zFaces = [{nz: gz-1, signZ: -1}, {nz: gz+1, signZ: 1}];
            for (var fi = 0; fi < 2; fi++) {
                if (!isEmpty(gx, zFaces[fi].nz)) continue;
                var sZ = zFaces[fi].signZ;
                for (var row = 0; row < BROWS; row++) {
                    for (var col = 0; col < BCOLS; col++) {
                        var seed = brickRng(col + gx*17.3 + fi*99, row + gz*13.7);
                        var dep = 0.18;
                        dummy.position.set(
                            wx + (col - BCOLS/2 + 0.5) * BW,
                            (row + 0.5) * BH,
                            wz + sZ * (CELL/2 + dep/2)
                        );
                        dummy.scale.set(1, 1, dep);
                        dummy.rotation.set(0, 0, 0);
                        dummy.updateMatrix();
                        instZ.setMatrixAt(iZ, dummy.matrix);
                        // Individual brick color: earthy red/brown/tan variation
                        var r2 = brickRng(col*7.1+gx*3.3, row*11.9+gz*5.7);
                        var r3 = brickRng(col*3.7+gz*8.1, row*6.3+gx*2.9);
                        col3.setRGB(
                            0.48 + r2 * 0.22,           // red channel 0.48–0.70
                            0.28 + r3 * 0.12,           // green channel 0.28–0.40
                            0.20 + brickRng(col,row) * 0.10  // blue channel 0.20–0.30
                        );
                        instZ.setColorAt(iZ, col3);
                        iZ++;
                    }
                }
            }
            // X-facing exposed faces
            var xFaces = [{nx: gx-1, signX: -1}, {nx: gx+1, signX: 1}];
            for (var fi2 = 0; fi2 < 2; fi2++) {
                if (!isEmpty(xFaces[fi2].nx, gz)) continue;
                var sX = xFaces[fi2].signX;
                for (var row2 = 0; row2 < BROWS; row2++) {
                    for (var col2 = 0; col2 < BCOLS; col2++) {
                        var seed2 = brickRng(col2 + gx*17.3 + fi2*99 + 50, row2 + gz*13.7);
                        var dep2 = 0.18;
                        dummy.position.set(
                            wx + sX * (CELL/2 + dep2/2),
                            (row2 + 0.5) * BH,
                            wz + (col2 - BCOLS/2 + 0.5) * BW
                        );
                        dummy.scale.set(dep2, 1, 1);
                        dummy.rotation.set(0, 0, 0);
                        dummy.updateMatrix();
                        instX.setMatrixAt(iX, dummy.matrix);
                        var r4 = brickRng(col2*7.1+gx*3.3+20, row2*11.9+gz*5.7);
                        var r5 = brickRng(col2*3.7+gz*8.1+20, row2*6.3+gx*2.9);
                        col3.setRGB(
                            0.48 + r4 * 0.22,
                            0.28 + r5 * 0.12,
                            0.20 + brickRng(col2+10, row2+10) * 0.10
                        );
                        instX.setColorAt(iX, col3);
                        iX++;
                    }
                }
            }
        }
    }
    instZ.instanceMatrix.needsUpdate = true;
    instX.instanceMatrix.needsUpdate = true;
    if (instZ.instanceColor) instZ.instanceColor.needsUpdate = true;
    if (instX.instanceColor) instX.instanceColor.needsUpdate = true;
    scene.add(instZ);
    scene.add(instX);
})();

var ENEMY_CELLS = [
    {gx:5,gz:3},{gx:10,gz:2},{gx:3,gz:7},{gx:9,gz:8},
    {gx:7,gz:10},{gx:2,gz:12},{gx:12,gz:12},{gx:6,gz:14}
];
var ITEM_CELLS  = [
    {gx:4,gz:1},{gx:1,gz:4},{gx:8,gz:3},{gx:13,gz:3},
    {gx:5,gz:8},{gx:11,gz:6},{gx:4,gz:11},{gx:13,gz:11},
    {gx:8,gz:13},{gx:10,gz:7}
];

// ── Cobwebs ──
(function() {
    var cwMat = new THREE.MeshBasicMaterial({ color: 0xbbbbcc, transparent: true, opacity: 0.32, side: THREE.DoubleSide });
    [[1,1],[14,1],[1,14],[14,14],[4,4],[11,11],[3,8],[8,14],[13,5],[6,11]].forEach(function(c) {
        if (MAP[c[1]] && MAP[c[1]][c[0]] === 0) {
            var geo = new THREE.PlaneGeometry(1.1, 1.1);
            var m1 = new THREE.Mesh(geo, cwMat); m1.position.set(c[0]*CELL+CELL/2, CELL-0.05, c[1]*CELL+CELL/2); m1.rotation.x = Math.PI/2; scene.add(m1);
        }
    });
})();

// ── Spark particle system (one pool per sconce) ──
var sparkParticles = [];
(function() {
    SCONCE_DEFS.forEach(function(c) {
        var pts = [];
        for (var i = 0; i < 6; i++) {
            pts.push({ x: c.gx*CELL+CELL/2, y: CELL*0.85, z: c.gz*CELL+CELL/2, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 0 });
        }
        sparkParticles.push({ pos: { x: c.gx*CELL+CELL/2, y: CELL*0.85, z: c.gz*CELL+CELL/2 }, pts: pts, timer: 0 });
    });
})();
var sparkGeo = new THREE.SphereGeometry(0.025, 3, 3);
var sparkMat = new THREE.MeshBasicMaterial({ color: 0xffcc44 });
var sparkMeshPool = [];
for (var si2 = 0; si2 < 90; si2++) {
    var sm = new THREE.Mesh(sparkGeo, sparkMat.clone());
    sm.visible = false;
    scene.add(sm);
    sparkMeshPool.push({ mesh: sm, life: 0, maxLife: 0, vx: 0, vy: 0, vz: 0 });
}
var sparkPoolIdx = 0;
function spawnSpark(x, y, z) {
    var sp = sparkMeshPool[sparkPoolIdx % sparkMeshPool.length];
    sparkPoolIdx++;
    sp.mesh.position.set(x, y, z);
    sp.mesh.visible = true;
    sp.life = 0;
    sp.maxLife = 0.3 + Math.random() * 0.3;
    sp.vx = (Math.random()-0.5) * 1.2;
    sp.vy = 0.8 + Math.random() * 1.4;
    sp.vz = (Math.random()-0.5) * 1.2;
}

// ── Game state ──
var enemies = [], items = [], player = {}, gameOver = false, won = false, gameRunning = false;
var paused = false;
var dmgFlashEl = document.getElementById("dmg-flash");
var floatNumsEl = document.getElementById("float-numbers");
var pauseMenuEl = document.getElementById("pause-menu");
var fpsCounterEl = document.getElementById("fps-counter");

// ── FPS tracking ──
var fpsFrames = 0, fpsAccum = 0, fpsDisplay = 60;

// ── Floating damage numbers ──
function spawnFloatNum(text, color, screenX, screenY) {
    if (!floatNumsEl) return;
    var el = document.createElement("div");
    el.className = "float-num";
    el.textContent = text;
    el.style.color = color;
    el.style.left = screenX + "px";
    el.style.top  = screenY + "px";
    floatNumsEl.appendChild(el);
    setTimeout(function() { if (el.parentNode) el.parentNode.removeChild(el); }, 900);
}
function worldToScreen(wx, wy, wz) {
    var v = new THREE.Vector3(wx, wy, wz);
    v.project(camera);
    return {
        x: (v.x * 0.5 + 0.5) * window.innerWidth,
        y: (-v.y * 0.5 + 0.5) * window.innerHeight
    };
}

// ── Loot drops (health potion = red, speed boost = blue) ──
var lootDrops = [];
var lootGeoHP   = new THREE.SphereGeometry(0.22, 7, 7);
var lootMatHP   = new THREE.MeshStandardMaterial({ color: 0xff2244, emissive: new THREE.Color(0x440011), roughness: 0.4, metalness: 0.5 });
var lootGeoSP   = new THREE.SphereGeometry(0.22, 7, 7);
var lootMatSP   = new THREE.MeshStandardMaterial({ color: 0x22aaff, emissive: new THREE.Color(0x001144), roughness: 0.4, metalness: 0.5 });
function spawnLoot(x, z) {
    var isHP = Math.random() < 0.6;
    var geo = isHP ? lootGeoHP : lootGeoSP;
    var mat = (isHP ? lootMatHP : lootMatSP).clone();
    var mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x + (Math.random()-0.5)*0.5, 0.3, z + (Math.random()-0.5)*0.5);
    var light = new THREE.PointLight(isHP ? 0xff2244 : 0x22aaff, 1.2, 4);
    mesh.add(light);
    scene.add(mesh);
    lootDrops.push({ mesh: mesh, type: isHP ? "hp" : "speed", collected: false });
}

// ── Jump / crouch / dodge ──
var playerVY = 0, playerY = 0;
var GRAVITY = 18;
var crouching = false;
var dodgeVX = 0, dodgeVZ = 0, dodgeCooldown = 0;

// ── Pause ──
window.resumeGame = function() {
    paused = false;
    pauseMenuEl.classList.remove("active");
    canvas.requestPointerLock();
};
window.quitToLobby = function() {
    paused = false;
    pauseMenuEl.classList.remove("active");
    gameRunning = false;
    gameOver = false; won = false;
    lobbyEl.style.display = "flex";
    document.exitPointerLock();
};

// ── Heartbeat oscillator (Web Audio) ──
var audioCtx = null;
function getAudioCtx() { if (!audioCtx) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e){} } return audioCtx; }
var heartbeatPlaying = false, heartbeatOsc = null;
function startHeartbeat() {
    if (heartbeatPlaying) return;
    var ctx = getAudioCtx(); if (!ctx) return;
    heartbeatPlaying = true;
    function beat() {
        if (!heartbeatPlaying) return;
        var o = ctx.createOscillator();
        var g = ctx.createGain();
        o.type = "sine"; o.frequency.value = 55;
        g.gain.setValueAtTime(0, ctx.currentTime);
        g.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.04);
        g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.18);
        o.connect(g); g.connect(ctx.destination);
        o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.2);
        setTimeout(beat, 700);
    }
    beat();
}
function stopHeartbeat() { heartbeatPlaying = false; }

// ── Blood splats ──
var bloodSplats = [];
function addBloodSplat(x, z) {
    var geo = new THREE.CircleGeometry(0.35 + Math.random()*0.45, 7);
    var mat = new THREE.MeshBasicMaterial({ color: 0x7a0000, transparent: true, opacity: 0.82, depthWrite: false });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x + (Math.random()-0.5)*0.4, 0.02, z + (Math.random()-0.5)*0.4);
    scene.add(mesh);
    bloodSplats.push(mesh);
}

// ── Sticky-key-proof input system ──
// Track keys by e.code + timestamp; auto-expire after 2s if keyup missed
var keyDownAt = Object.create(null);
var KEY_TIMEOUT = 2000;
function isKeyDown(code) {
    if (!keyDownAt[code]) return false;
    if (performance.now() - keyDownAt[code] > KEY_TIMEOUT) { delete keyDownAt[code]; return false; }
    return true;
}
function clearAllKeys() {
    var k;
    for (k in keyDownAt) delete keyDownAt[k];
}
var GAME_KEYS = ["KeyW","KeyA","KeyS","KeyD","ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space","ShiftLeft","ShiftRight","ControlLeft","ControlRight","KeyE","KeyR","Escape","Tab"];
document.addEventListener("keydown", function(e) {
    keyDownAt[e.code] = performance.now();
    // Prevent default browser actions for all game keys while game is running
    if (gameRunning && !gameOver && !won) {
        if (GAME_KEYS.indexOf(e.code) >= 0) e.preventDefault();
    } else {
        if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space"].indexOf(e.code) >= 0) e.preventDefault();
    }
    // Pause toggle
    if (e.code === "Escape" && gameRunning && !gameOver && !won) {
        if (!paused) {
            paused = true;
            pauseMenuEl.classList.add("active");
            document.exitPointerLock();
            clearAllKeys();
        }
    }
});
document.addEventListener("keyup", function(e) {
    delete keyDownAt[e.code];
});
// Only clear keys on real focus loss, not on pointer lock change during gameplay
window.addEventListener("blur", clearAllKeys);
document.addEventListener("visibilitychange", function() {
    if (document.hidden) clearAllKeys();
});

// ── Sprint ──
var MOVE_SPEED   = 5;
var SPRINT_SPEED = 11;
var ENEMY_SPEED  = 1.6;
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
        var cc = cellCenter(pos.gx, pos.gz);
        mesh.position.copy(cc);
        mesh.add(new THREE.PointLight(0xff2200, 1.8, 8));
        scene.add(mesh);
        enemies.push({ mesh: mesh, gx: pos.gx, gz: pos.gz, x: cc.x, z: cc.z, alive: true, hp: 3, dying: false, dyingTimer: 0 });
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
    player = { x: sx, z: sz, angle: 0, hp: 5, score: 0, invincible: 0, kills: 0, gameStartTime: performance.now() };
    lootDrops.forEach(function(l) { scene.remove(l.mesh); });
    lootDrops = [];
    playerVY = 0; playerY = 0; crouching = false; dodgeCooldown = 0;
    bloodSplats.forEach(function(s) { scene.remove(s); });
    bloodSplats = [];

    gameRunning = true;
    lobbyEl.style.display = "none";
    updateStatus();
}

function updateStatus() {
    if (!gameRunning) return;
    if (gameOver) {
        var hsG = parseInt(localStorage.getItem("dunegon_hs") || "0");
        var finalG = player.score * 100 + player.kills * 50;
        if (finalG > hsG) localStorage.setItem("dunegon_hs", finalG);
        statusEl.innerHTML = "GAME OVER! &nbsp; Score: " + finalG + " &nbsp; Kills: " + player.kills + "<br><small style='font-size:0.75em;opacity:0.7'>Best: " + Math.max(hsG, finalG) + " &nbsp;&nbsp; Press R to restart</small>";
        statusEl.style.color = "#ff5555";
        return;
    }
    if (won) {
        var elapsed = Math.round((performance.now() - player.gameStartTime) / 1000);
        var finalW = player.score * 100 + player.kills * 50 + Math.max(0, 600 - elapsed) * 5;
        var hsW = parseInt(localStorage.getItem("dunegon_hs") || "0");
        if (finalW > hsW) localStorage.setItem("dunegon_hs", finalW);
        statusEl.innerHTML = "YOU WIN! &nbsp; Score: " + finalW + " &nbsp; Time: " + elapsed + "s<br><small style='font-size:0.75em;opacity:0.7'>Best: " + Math.max(hsW, finalW) + " &nbsp;&nbsp; Press R to play again</small>";
        statusEl.style.color = "#ffb86c";
        return;
    }
    statusEl.style.color = "#50fa7b";
    var h = "", i;
    for (i = 0; i < player.hp; i++) h += "\u2665";
    for (i = player.hp; i < 5; i++) h += "\u2661";
    var gl = items.filter(function(it) { return !it.collected; }).length;
    var el = enemies.filter(function(e) { return e.alive; }).length;
    statusEl.textContent = "HP: " + h + "   Score: " + player.score + "   Kills: " + player.kills + "   Gems: " + gl + "   Enemies: " + el;
}

document.addEventListener("pointerlockchange", function() {
    pointerLocked = (document.pointerLockElement === canvas);
    // Only clear keys when NOT actively playing (avoid killing held keys on accidental lock loss)
    if (!pointerLocked && (!gameRunning || gameOver || won || paused)) {
        clearAllKeys();
    }
});

var TURN_SPEED = 1.5, PLAYER_RADIUS = 0.9;
var pointerLocked = false;
const MOUSE_SENSITIVITY = 0.0022;
var playerPitch = 0;
var bobTime = 0;

// ── Pointer Lock (Mouse Look) ──
canvas.addEventListener("click", function() {
    if (!pointerLocked) canvas.requestPointerLock();
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

window.copyCode = function() {
    var code = document.getElementById("room-code").textContent.trim();
    if (code && code !== "---") {
        navigator.clipboard.writeText(code).then(function() {
            var btn = document.getElementById("copy-code-btn");
            btn.textContent = "✓ Copied!";
            btn.classList.add("copied");
            setTimeout(function() { btn.textContent = "📋 Copy Code"; btn.classList.remove("copied"); }, 1800);
        }).catch(function() {
            // Fallback for Electron context isolation
            var ta = document.createElement("textarea");
            ta.value = code;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            document.body.removeChild(ta);
            var btn2 = document.getElementById("copy-code-btn");
            btn2.textContent = "✓ Copied!";
            setTimeout(function() { btn2.textContent = "📋 Copy Code"; }, 1800);
        });
    }
};

window.inviteViaSteam = function() {
    var code = document.getElementById("room-code").textContent.trim();
    if (code && code !== "---") {
        // Copy invite text to clipboard then open Steam chat so user can paste it
        var inviteText = "Join my Dunegon 3D game. Lobby code: " + code + "\n" +
            "Steam launch arg: +connect_lobby " + code;
        navigator.clipboard.writeText(inviteText).catch(function() {});
        // Open Steam overlay chat (works if game is running through Steam)
        window.open("steam://open/chat", "_blank");
        lobbyStatEl.textContent = "Code copied! Paste it to your Steam friend.";
    }
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

function autoJoinFromLaunchArg() {
    if (!launchConnectLobby) return;
    joinCodeEl.value = launchConnectLobby;
    lobbyStatEl.textContent = "Steam invite detected. Auto-joining lobby...";
    setTimeout(function() {
        window.joinGame();
    }, 250);
}
autoJoinFromLaunchArg();

// ── Game loop ──
function animate(now) {
    requestAnimationFrame(animate);
    var dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    // FPS
    fpsFrames++; fpsAccum += dt;
    if (fpsAccum >= 0.5) { fpsDisplay = Math.round(fpsFrames / fpsAccum); fpsFrames = 0; fpsAccum = 0; }
    if (fpsCounterEl) fpsCounterEl.textContent = fpsDisplay + " fps";

    renderer.render(scene, camera);
    if (!gameRunning || paused) return;

    if (isKeyDown("KeyR")) {
        delete keyDownAt["KeyR"];
        initGame();
        return;
    }

    if (gameOver || won) return;

    // ── Melee attack (E key) ──
    if (isKeyDown("KeyE")) {
        delete keyDownAt["KeyE"];
        var ATTACK_RANGE = 2.5;
        enemies.forEach(function(en, eidx) {
            if (!en.alive || en.dying) return;
            var adx = en.x - player.x, adz = en.z - player.z;
            var adist = Math.sqrt(adx*adx + adz*adz);
            if (adist < ATTACK_RANGE) {
                en.hp--;
                // Enemy hurt flash
                en.mesh.children.forEach(function(ch) {
                    if (ch.material) { var oc = ch.material.color.clone(); ch.material.emissive && ch.material.emissive.set(0xff0000); setTimeout(function(){ ch.material.emissive && ch.material.emissive.set(0x550000); }, 120); }
                });
                // Floating damage number
                var sc = worldToScreen(en.x, CELL*0.8, en.z);
                spawnFloatNum("-1", "#ff4444", sc.x + (Math.random()-0.5)*30, sc.y - 20);
                // Knockback
                if (adist > 0.01) { en.x += (adx/adist)*0.9; en.z += (adz/adist)*0.9; }
                if (en.hp <= 0) {
                    en.alive = false;
                    en.dying = true;
                    en.dyingTimer = 0;
                    addBloodSplat(en.x, en.z);
                    player.kills++;
                    player.score++;
                    // Loot drop (60% chance)
                    if (Math.random() < 0.6) spawnLoot(en.x, en.z);
                    if (conn && conn.open) conn.send(JSON.stringify({ type: "enemyKill", idx: eidx }));
                }
            }
        });
        // Brief yellow attack flash
        if (dmgFlashEl) {
            dmgFlashEl.style.background = "radial-gradient(ellipse at center, rgba(255,220,50,0.15) 30%, rgba(255,120,0,0.30) 100%)";
            dmgFlashEl.style.opacity = "0.45";
            setTimeout(function() {
                dmgFlashEl.style.opacity = "0";
                setTimeout(function() {
                    dmgFlashEl.style.background = "radial-gradient(ellipse at center, rgba(255,0,0,0.0) 30%, rgba(200,0,0,0.85) 100%)";
                }, 400);
            }, 130);
        }
    }

    // ── Crouch (Ctrl) ──
    crouching = isKeyDown("ControlLeft") || isKeyDown("ControlRight");

    // ── Jump + Gravity ──
    var onGround = playerY <= 0.001;
    if (onGround && isKeyDown("Space")) {
        playerVY = 7.5;
        delete keyDownAt["Space"];
    }
    playerVY -= GRAVITY * dt;
    playerY = Math.max(0, playerY + playerVY * dt);
    if (playerY <= 0) { playerY = 0; playerVY = 0; }

    // ── Dodge roll (Space mid-air OR double-tap) ──
    if (dodgeCooldown > 0) dodgeCooldown -= dt;
    var dodgeLen = Math.sqrt(dodgeVX*dodgeVX + dodgeVZ*dodgeVZ);
    if (dodgeLen > 0.01) {
        var dnx = player.x + dodgeVX * dt;
        var dnz = player.z + dodgeVZ * dt;
        var dgzc = Math.floor(player.z / CELL);
        if (!isWall(Math.floor((dnx-PLAYER_RADIUS)/CELL), dgzc) && !isWall(Math.floor((dnx+PLAYER_RADIUS)/CELL), dgzc)) player.x = dnx;
        var dgxc = Math.floor(player.x / CELL);
        if (!isWall(dgxc, Math.floor((dnz-PLAYER_RADIUS)/CELL)) && !isWall(dgxc, Math.floor((dnz+PLAYER_RADIUS)/CELL))) player.z = dnz;
        dodgeVX *= (1 - dt * 8);
        dodgeVZ *= (1 - dt * 8);
        if (dodgeLen < 0.1) { dodgeVX = 0; dodgeVZ = 0; }
    }

    // ── Crouch (Ctrl) ──
    crouching = isKeyDown("ControlLeft") || isKeyDown("ControlRight");

    // ── Jump + Gravity ──
    var onGround = playerY <= 0.001;
    if (onGround && isKeyDown("Space")) {
        playerVY = 7.5;
        delete keyDownAt["Space"];
    }
    playerVY -= GRAVITY * dt;
    playerY = Math.max(0, playerY + playerVY * dt);
    if (playerY <= 0) { playerY = 0; playerVY = 0; }

    // ── Dodge roll (Space mid-air OR double-tap) ──
    if (dodgeCooldown > 0) dodgeCooldown -= dt;
    var dodgeLen = Math.sqrt(dodgeVX*dodgeVX + dodgeVZ*dodgeVZ);
    if (dodgeLen > 0.01) {
        var dnx = player.x + dodgeVX * dt;
        var dnz = player.z + dodgeVZ * dt;
        var dgzc = Math.floor(player.z / CELL);
        if (!isWall(Math.floor((dnx-PLAYER_RADIUS)/CELL), dgzc) && !isWall(Math.floor((dnx+PLAYER_RADIUS)/CELL), dgzc)) player.x = dnx;
        var dgxc = Math.floor(player.x / CELL);
        if (!isWall(dgxc, Math.floor((dnz-PLAYER_RADIUS)/CELL)) && !isWall(dgxc, Math.floor((dnz+PLAYER_RADIUS)/CELL))) player.z = dnz;
        dodgeVX *= (1 - dt * 8);
        dodgeVZ *= (1 - dt * 8);
        if (dodgeLen < 0.1) { dodgeVX = 0; dodgeVZ = 0; }
    }

    // ── Turning (only when pointer NOT locked — otherwise A/D strafe) ──
    if (!pointerLocked) {
        if (isKeyDown("ArrowLeft")  || isKeyDown("KeyA")) player.angle += TURN_SPEED * dt;
        if (isKeyDown("ArrowRight") || isKeyDown("KeyD")) player.angle -= TURN_SPEED * dt;
    }

    // ── Sprint stamina ──
    var sprinting = (isKeyDown("ShiftLeft") || isKeyDown("ShiftRight")) && stamina > 0;
    if (sprinting) {
        stamina = Math.max(0, stamina - 45 * dt);
    } else {
        stamina = Math.min(maxStamina, stamina + 22 * dt);
    }
    sprintFill.style.width = (stamina / maxStamina * 100) + "%";
    sprintFill.style.background = sprinting ? "#ff5555" : (stamina < 30 ? "#ffb86c" : "#50fa7b");

    // ── Movement (normalized so diagonal isn't faster) ──
    var speed = (sprinting ? SPRINT_SPEED : MOVE_SPEED) + (player.speedBoost || 0);
    var sinA = Math.sin(player.angle), cosA = Math.cos(player.angle);
    var moveX = 0, moveZ = 0;
    var fwd     = (isKeyDown("ArrowUp")    || isKeyDown("KeyW")) ? 1 : 0;
    var back    = (isKeyDown("ArrowDown")  || isKeyDown("KeyS")) ? 1 : 0;
    var strafeL = (pointerLocked && (isKeyDown("KeyA") || isKeyDown("ArrowLeft")))  ? 1 : 0;
    var strafeR = (pointerLocked && (isKeyDown("KeyD") || isKeyDown("ArrowRight"))) ? 1 : 0;
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

    // ── Invincibility timer ──
    if (player.invincible > 0) player.invincible = Math.max(0, player.invincible - dt);

    // ── Enemy AI: chase player + collision ──
    var er = 0.45;
    enemies.forEach(function(e, idx) {
        if (!e.alive) return;
        var dx = player.x - e.x;
        var dz = player.z - e.z;
        var dist = Math.sqrt(dx*dx + dz*dz);
        // Move toward player
        if (dist > 0.8) {
            var enx = e.x + (dx/dist) * ENEMY_SPEED * dt;
            var enz = e.z + (dz/dist) * ENEMY_SPEED * dt;
            var egzc = Math.floor(e.z / CELL);
            if (!isWall(Math.floor((enx-er)/CELL), egzc) && !isWall(Math.floor((enx+er)/CELL), egzc)) e.x = enx;
            var egxc = Math.floor(e.x / CELL);
            if (!isWall(egxc, Math.floor((enz-er)/CELL)) && !isWall(egxc, Math.floor((enz+er)/CELL))) e.z = enz;
        }
        // Damage player if touching
        if (dist < 1.3 && !player.invincible) {
            player.hp--;
            player.invincible = 1.5;
            if (dmgFlashEl) { dmgFlashEl.style.opacity = "0.7"; setTimeout(function(){ dmgFlashEl.style.opacity="0"; }, 350); }
            if (conn && conn.open) conn.send(JSON.stringify({ type: "enemyKill", idx: idx }));
            if (player.hp <= 0) { gameOver = true; updateStatus(); }
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

    // ── Loot pickup (auto when near) ──
    lootDrops.forEach(function(l) {
        if (l.collected) return;
        var lp = l.mesh.position;
        if (Math.hypot(player.x - lp.x, player.z - lp.z) < 1.2) {
            l.collected = true;
            scene.remove(l.mesh);
            var sc2 = worldToScreen(lp.x, lp.y + 0.5, lp.z);
            if (l.type === "hp") {
                player.hp = Math.min(5, player.hp + 1);
                spawnFloatNum("+1 HP", "#ff4488", sc2.x, sc2.y);
            } else {
                player.speedBoost = (player.speedBoost || 0) + 4.0;
                spawnFloatNum("+SPEED", "#22aaff", sc2.x, sc2.y);
            }
        }
    });

    // ── Speed boost decay ──
    if (player.speedBoost > 0) player.speedBoost = Math.max(0, player.speedBoost - dt * 0.6);

    if (items.every(function(i){ return i.collected; }) && enemies.every(function(e){ return !e.alive && !e.dying; })) won = true;

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

    // ── Head bob + idle breathing ──
    var isMoving = isKeyDown("KeyW") || isKeyDown("ArrowUp") || isKeyDown("KeyS") || isKeyDown("ArrowDown");
    if (isMoving) bobTime += dt * (sprinting ? 9 : 6);
    var bobY = isMoving ? Math.sin(bobTime) * 0.06 : 0;
    var idleBreath = !isMoving ? Math.sin(t * 0.72) * 0.018 : 0;

    // ── Main torch flicker ──
    torchLight.intensity = 3.5 + Math.sin(now * 0.009) * 0.5 + (Math.random() * 0.4 - 0.2);

    // ── Per-sconce flicker + flame animation ──
    sconceLights.forEach(function(sc, si) {
        sc.intensity = 1.6 + Math.sin(now * 0.007 + si * 2.31) * 0.35 + (Math.random() * 0.18 - 0.09);
    });
    sconceFlames.forEach(function(sf, si) {
        var flk = Math.sin(now * 0.013 + si * 1.73) * 0.038 + Math.random() * 0.022;
        sf.flame.position.y = sf.baseY + flk;
        sf.flame.scale.set(1 + flk*2.4, 1 + flk*1.7, 1 + flk*2.4);
        sf.core.position.y = sf.baseY + 0.06 + flk;
        sf.flame.material.color.setHSL(0.08 + flk * 0.22, 1.0, 0.50 + flk * 0.8);
    });

    // ── Invincibility camera shake ──
    var shakeX = player.invincible > 0 ? (Math.random()-0.5)*0.04 : 0;
    var shakeY = player.invincible > 0 ? (Math.random()-0.5)*0.03 : 0;
    // ── Camera (includes jump offset + crouch) ──
    var camHeight = crouching ? CELL * 0.32 : CELL * 0.55;
    camera.position.set(player.x + shakeX, camHeight + bobY + idleBreath + shakeY + playerY, player.z);
    camera.rotation.y = player.angle;
    camera.rotation.x = playerPitch;
    torchLight.position.copy(camera.position);

    // ── Low HP effects: heartbeat + pulse vignette ──
    if (player.hp <= 1 && !gameOver) {
        startHeartbeat();
        var vigEl = document.getElementById("vignette");
        if (vigEl) {
            var pulse = 0.74 + Math.sin(t * 3.8) * 0.22;
            vigEl.style.background = "radial-gradient(ellipse at center, transparent 30%, rgba(" + Math.round(160*pulse) + ",0,0," + (0.55 + Math.sin(t*3.8)*0.2) + ") 100%)";
        }
    } else {
        stopHeartbeat();
        var vigEl2 = document.getElementById("vignette");
        if (vigEl2 && player.hp > 1) vigEl2.style.background = "radial-gradient(ellipse at center, transparent 38%, rgba(0,0,0,0.74) 100%)";
    }

    // ── Health bar ──
    var healthFillEl = document.getElementById("health-fill");
    if (healthFillEl) {
        healthFillEl.style.width = (player.hp / 5 * 100) + "%";
        healthFillEl.style.background = player.hp <= 1 ? "#ff5555" : player.hp <= 2 ? "#ffb86c" : "#50fa7b";
    }

    // ── Minimap ──
    var mmCv = document.getElementById("minimap-canvas");
    if (mmCv) {
        var mmCtx = mmCv.getContext("2d");
        var mmS = 160, cS = mmS / GRID;
        mmCtx.fillStyle = "#000000";
        mmCtx.fillRect(0, 0, mmS, mmS);
        for (var mz = 0; mz < GRID; mz++) {
            for (var mmx = 0; mmx < GRID; mmx++) {
                mmCtx.fillStyle = MAP[mz][mmx] === 1 ? "#3a2212" : "#0e0b09";
                mmCtx.fillRect(mmx*cS+0.5, mz*cS+0.5, cS-1, cS-1);
            }
        }
        items.forEach(function(it) {
            if (!it.collected) {
                mmCtx.fillStyle = "#44ff88";
                mmCtx.fillRect(it.gx*cS+cS/2-1.5, it.gz*cS+cS/2-1.5, 3, 3);
            }
        });
        enemies.forEach(function(em) {
            if (em.alive) {
                var emx = em.x/CELL*cS, emz = em.z/CELL*cS;
                mmCtx.fillStyle = "#ff3333";
                mmCtx.beginPath(); mmCtx.arc(emx, emz, 2.5, 0, Math.PI*2); mmCtx.fill();
            }
        });
        var ppx2 = player.x/CELL*cS, ppz2 = player.z/CELL*cS;
        mmCtx.fillStyle = "#ffffff";
        mmCtx.beginPath(); mmCtx.arc(ppx2, ppz2, 3, 0, Math.PI*2); mmCtx.fill();
        mmCtx.strokeStyle = "#ffffff"; mmCtx.lineWidth = 1.5;
        mmCtx.beginPath();
        mmCtx.moveTo(ppx2, ppz2);
        mmCtx.lineTo(ppx2 - Math.sin(player.angle)*7, ppz2 - Math.cos(player.angle)*7);
        mmCtx.stroke();
    }

    // ── Loot animation ──
    lootDrops.forEach(function(l, li) {
        if (!l.collected) {
            l.mesh.position.y = 0.3 + Math.sin(t * 3 + li * 1.3) * 0.12;
            l.mesh.rotation.y = t * 2.5;
        }
    });

    // ── Spark particles ──
    sparkParticles.forEach(function(sp) {
        sp.timer -= dt;
        if (sp.timer <= 0) {
            sp.timer = 0.06 + Math.random() * 0.12;
            spawnSpark(sp.pos.x + (Math.random()-0.5)*0.12, sp.pos.y, sp.pos.z + (Math.random()-0.5)*0.12);
        }
    });
    sparkMeshPool.forEach(function(sp) {
        if (!sp.mesh.visible) return;
        sp.life += dt;
        if (sp.life >= sp.maxLife) { sp.mesh.visible = false; return; }
        sp.vy -= 4 * dt;
        sp.mesh.position.x += sp.vx * dt;
        sp.mesh.position.y += sp.vy * dt;
        sp.mesh.position.z += sp.vz * dt;
        var fade = 1 - sp.life / sp.maxLife;
        sp.mesh.material.opacity = fade;
        sp.mesh.material.transparent = true;
        sp.mesh.material.color.setHSL(0.10 + fade * 0.05, 1.0, 0.5 + fade * 0.2);
    });

    // ── Film grain overlay (canvas overlay each frame) ──
    var grainCv = document.getElementById("minimap-canvas"); // separate from minimap, use renderer domElement trick
    // Apply via CSS filter flicker on canvas for lightweight grain
    var grainAmt = 0.015 + Math.random() * 0.012;
    // Use CSS hue-rotate flicker at very small amounts as grain proxy
    renderer.domElement.style.filter = "contrast(1.04) saturate(1.08)";

    // ── Animate objects ──
    var t = now / 1000;
    enemies.forEach(function(e, idx) {
        if (e.dying) {
            e.dyingTimer += dt;
            var dyProg = Math.min(1.0, e.dyingTimer / 0.65);
            e.mesh.position.y = CELL*0.4 - dyProg * 1.4;
            e.mesh.scale.setScalar(1.0 - dyProg * 0.85);
            e.mesh.children.forEach(function(ch) {
                if (ch.material) { ch.material.transparent = true; ch.material.opacity = 1.0 - dyProg; }
            });
            if (e.dyingTimer >= 0.65) { scene.remove(e.mesh); e.dying = false; }
            return;
        }
        if (!e.alive) return;
        e.mesh.position.set(e.x, CELL*0.4 + Math.sin(t*1.8 + idx*1.2)*0.08, e.z);
        e.mesh.rotation.y = Math.atan2(player.x - e.x, player.z - e.z);
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

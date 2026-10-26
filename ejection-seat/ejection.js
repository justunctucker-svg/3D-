/* Ejection Seat · Inside the Mechanism
   Procedural Three.js (r128) scene. Everything on screen is a pure function of the time t (0–22 s):
   window.__render(t) draws one frame, window.__ready turns true once fonts and the first frame are done.
   Units are metres and seconds; y is up, the jet flies along +x at 150 m/s, 150 m above a desert floor.
   τ ("tau") is real time since the handle is pulled. The video plays τ at different speeds (slow motion for the
   ejection itself) and the hook shot (0–2 s) and the last 0.4 s share one clock, so the video loops. */
(() => {
  'use strict';
  const T = THREE, PI = Math.PI, TAU = PI * 2;
  const DURATION = 22, V = 150, H = 150, G = 9.81;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const smooth = k => { k = clamp(k); return k * k * (3 - 2 * k); };
  const span = (t, a, b) => clamp((t - a) / (b - a));
  const pulse = (t, a, b, c, d) => smooth(span(t, a, b)) * (1 - smooth(span(t, c, d)));
  const rand = (i, j) => { const x = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return x - Math.floor(x); };
  const RENDER = new URLSearchParams(location.search).has('render');
  const V3 = (x, y, z) => new T.Vector3(x, y, z);

  // ---------------------------------------------------------------- page frame + renderer
  const frameEl = document.getElementById('frame'), stage = document.getElementById('stage');
  const renderer = new T.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  stage.appendChild(renderer.domElement);

  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(38, 360 / 640, 0.05, 6000);
  const HORIZON = new T.Color(0.15, 0.135, 0.12), NAVY = new T.Color(0.006, 0.014, 0.034);
  scene.fog = new T.Fog(HORIZON.clone(), 900, 5200);

  const rtOpts = { minFilter: T.LinearFilter, magFilter: T.LinearFilter, format: T.RGBAFormat, type: T.HalfFloatType };
  let rt;
  if (renderer.capabilities.isWebGL2) { rt = new T.WebGLMultisampleRenderTarget(360, 640, rtOpts); rt.samples = 4; }
  else rt = new T.WebGLRenderTarget(360, 640, Object.assign(rtOpts, { type: T.UnsignedByteType }));
  const composer = new T.EffectComposer(renderer, rt);

  // ---------------------------------------------------------------- environment, lights, sky
  {
    const env = new T.Scene();
    const basic = c => new T.MeshBasicMaterial({ color: c, side: T.DoubleSide });
    env.add(new T.Mesh(new T.SphereGeometry(50, 32, 16), new T.MeshBasicMaterial({ color: new T.Color(0.09, 0.12, 0.18), side: T.BackSide })));
    const band = new T.Mesh(new T.CylinderGeometry(48, 48, 9, 32, 1, true), basic(new T.Color(0.42, 0.36, 0.3)));
    band.position.y = 1; env.add(band);
    const gnd = new T.Mesh(new T.CircleGeometry(49, 32), basic(new T.Color(0.2, 0.14, 0.09)));
    gnd.rotation.x = -PI / 2; gnd.position.y = -4; env.add(gnd);
    const sunPanel = new T.Mesh(new T.PlaneGeometry(9, 9), basic(new T.Color(9, 7, 5)));
    sunPanel.position.set(-30, 18, 24); sunPanel.lookAt(0, 0, 0); env.add(sunPanel);
    scene.environment = new T.PMREMGenerator(renderer).fromScene(env, 0.03).texture;
  }
  renderer.autoClear = false;
  const SUN_DIR = V3(-0.62, 0.52, 0.58).normalize();
  const sun = new T.DirectionalLight(0xffdcb4, 2.5);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 60 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02; sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const hemi = new T.HemisphereLight(0x9fb2cc, 0x5a4632, 0.6); scene.add(hemi);
  const rim = new T.DirectionalLight(0x7fd8ff, 0); rim.position.set(6, 8, -8); scene.add(rim);
  const fireLight = new T.PointLight(0xff9a50, 0, 9, 1.6); scene.add(fireLight);
  const cockpitLight = new T.PointLight(0x9fd0ff, 0.35, 2.5, 2); scene.add(cockpitLight);

  const bgMat = new T.ShaderMaterial({
    uniforms: { uX: { value: 0 }, uRes: { value: new T.Vector2(1080, 1920) }, uInvProj: { value: new T.Matrix4() }, uCamWorld: { value: new T.Matrix4() } },
    vertexShader: 'varying vec2 vNdc; void main(){ vNdc = position.xy; gl_Position = vec4(position.xy, 0.9999, 1.0); }',
    fragmentShader: `
      varying vec2 vNdc; uniform float uX; uniform vec2 uRes; uniform mat4 uInvProj; uniform mat4 uCamWorld;
      void main(){
        vec4 v = uInvProj * vec4(vNdc, 1.0, 1.0);
        vec3 d = normalize((uCamWorld * vec4(v.xyz / v.w, 0.0)).xyz);
        float e = d.y;
        vec3 sky = mix(vec3(0.15, 0.135, 0.12), vec3(0.04, 0.07, 0.125), smoothstep(-0.02, 0.38, e));
        sky = mix(sky, vec3(0.018, 0.03, 0.06), smoothstep(0.42, 1.0, e));
        sky += vec3(0.16, 0.08, 0.03) * pow(max(dot(d, normalize(vec3(-0.62, 0.52, 0.58))), 0.0), 18.0);
        vec2 c = gl_FragCoord.xy / uRes - 0.5; c.x *= uRes.x / uRes.y; float r = length(c);
        vec3 xr = mix(vec3(0.010, 0.022, 0.050), vec3(0.002, 0.006, 0.016), smoothstep(0.05, 0.85, r));
        float px = 1.0 / (uRes.x / 9.0);
        vec2 g = gl_FragCoord.xy / (uRes.x / 9.0);
        vec2 f = abs(fract(g + 0.5) - 0.5);
        float major = 1.0 - smoothstep(px * 0.6, px * 1.8, min(f.x, f.y));
        vec2 f2 = abs(fract(g * 4.0 + 0.5) - 0.5);
        float minor = 1.0 - smoothstep(px * 2.0, px * 5.5, min(f2.x, f2.y));
        xr += vec3(0.010, 0.032, 0.070) * major * (1.0 - 0.6 * smoothstep(0.2, 0.9, r));
        xr += vec3(0.004, 0.012, 0.026) * minor * (1.0 - smoothstep(0.2, 0.9, r));
        gl_FragColor = vec4(mix(sky, xr, uX), 1.0);
      }`,
    depthWrite: false, depthTest: false
  });
  const bg = new T.Mesh(new T.PlaneGeometry(2, 2), bgMat);
  bg.frustumCulled = false; bg.renderOrder = -10; scene.add(bg);
  const flashMat = new T.ShaderMaterial({
    uniforms: { uAmt: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'varying vec2 vUv; uniform float uAmt; void main(){ float v = 1.0 - 0.5 * length(vUv - vec2(0.5, 0.45)); gl_FragColor = vec4(vec3(1.0, 0.93, 0.82) * uAmt * v * 2.0, 1.0); }',
    transparent: true, depthWrite: false, depthTest: false, blending: T.AdditiveBlending
  });
  const flash = new T.Mesh(new T.PlaneGeometry(2, 2), flashMat);
  flash.frustumCulled = false; flash.renderOrder = 100; scene.add(flash);

  // ---------------------------------------------------------------- helpers + materials
  const alongX = g => g.rotateZ(-PI / 2);
  const latheX = (pts, seg = 48, phiStart = 0, phiLength = TAU) => alongX(new T.LatheGeometry(pts.map(([r, x]) => new T.Vector2(r, x)), seg, phiStart, phiLength));
  const canvasTex = (w, h, draw, srgb = true) => {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h);
    const t = new T.CanvasTexture(cv); t.wrapS = t.wrapT = T.RepeatWrapping; if (srgb) t.encoding = T.sRGBEncoding; t.anisotropy = 4; return t;
  };
  const std = (color, metalness, roughness, extra = {}) => { const m = new T.MeshStandardMaterial(Object.assign({ color, metalness, roughness }, extra)); m.color.convertSRGBToLinear(); return m; };
  const DS = { side: T.DoubleSide };
  function extrudeXZ(pts, depth) {           // planform (x, z) extruded upward by depth, centred on y = 0
    const s = new T.Shape(); pts.forEach(([x, z], i) => i ? s.lineTo(x, -z) : s.moveTo(x, -z));
    const g = new T.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: depth * 0.3, bevelSize: depth * 0.3, bevelSegments: 2 });
    g.rotateX(-PI / 2); g.translate(0, -depth / 2, 0); return g;
  }
  function extrudeXY(pts, depth) {           // side profile (x, y) extruded across z, centred
    const s = new T.Shape(); pts.forEach(([x, y], i) => i ? s.lineTo(x, y) : s.moveTo(x, y));
    const g = new T.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: depth * 0.25, bevelSize: depth * 0.25, bevelSegments: 2 });
    g.translate(0, 0, -depth / 2); return g;
  }
  const panelTex = canvasTex(1024, 512, (x, w, h) => {
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(60,64,70,0.35)'; x.lineWidth = 2;
    for (let i = 1; i < 9; i++) { x.beginPath(); x.moveTo(0, (i / 9) * h); x.lineTo(w, (i / 9) * h); x.stroke(); }
    for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo((i / 6) * w, 0); x.lineTo((i / 6) * w, h); x.stroke(); }
    for (let i = 0; i < 300; i++) { x.fillStyle = 'rgba(70,74,80,0.25)'; x.beginPath(); x.arc(rand(i, 1) * w, rand(i, 2) * h, 1.6, 0, TAU); x.fill(); }
  });
  const jetMat = std(0x868d95, 0.35, 0.5, Object.assign({ map: panelTex }, DS));
  const jetDark = std(0x3b3f45, 0.4, 0.55, DS);
  const jetPlain = std(0x868d95, 0.35, 0.5, DS);
  const nozzleMat = std(0x55524f, 0.85, 0.4, DS);
  const canopyMat = std(0xa8c4d8, 0.1, 0.04, { transparent: true, opacity: 0.22, envMapIntensity: 2.0, side: T.DoubleSide, depthWrite: false });
  const frameMat = std(0x2c2f33, 0.5, 0.45, DS);
  const tubMat = std(0x26292d, 0.3, 0.75, DS);
  const panelMat = std(0x1b1d20, 0.3, 0.6);
  const mfdMat = std(0x0c1a14, 0, 0.4, { emissive: new T.Color(0.18, 0.75, 0.42) });
  const mfd2Mat = std(0x0c1420, 0, 0.4, { emissive: new T.Color(0.25, 0.55, 0.9) });
  const seatMat = std(0x4a4f45, 0.35, 0.6, DS);
  const cushionMat = std(0x2f3a2c, 0.0, 0.9, DS);
  const steelMat = std(0xb9bec4, 0.85, 0.32);
  const brassMat = std(0xc29a52, 0.9, 0.35);
  const motorMat = std(0x6c6f74, 0.8, 0.38);
  const stripeTex = canvasTex(256, 32, (x, w, h) => { x.fillStyle = '#e8b400'; x.fillRect(0, 0, w, h); x.fillStyle = '#121212'; for (let i = -2; i < 12; i++) { x.beginPath(); x.moveTo(i * 26, h); x.lineTo(i * 26 + 13, h); x.lineTo(i * 26 + 13 + 16, 0); x.lineTo(i * 26 + 16, 0); x.fill(); } });
  const handleMat = std(0xffffff, 0.2, 0.5, { map: stripeTex });
  const suitMat = std(0x5f6349, 0.0, 0.85);
  const harnessMat = std(0x3a3a33, 0.0, 0.8);
  const gloveMat = std(0x232224, 0.05, 0.7);
  const bootMat = std(0x1c1b1c, 0.1, 0.6);
  const helmetMat = std(0xd9dbdc, 0.15, 0.35);
  const visorMat = std(0x6b4a18, 0.9, 0.08, { envMapIntensity: 1.6 });
  const maskMat = std(0x2a2c2e, 0.1, 0.6);
  const chuteTex = canvasTex(1024, 64, (x, w, h) => { const n = 24; for (let i = 0; i < n; i++) { x.fillStyle = i % 2 ? '#f0ece4' : '#e8621c'; x.fillRect((i / n) * w, 0, w / n + 1, h); } });
  const chuteMat = std(0xffffff, 0, 0.8, { map: chuteTex, side: T.DoubleSide });
  const lineMat = new T.LineBasicMaterial({ color: 0xd8d4cc, transparent: true, opacity: 0.8 });
  const groundTex = canvasTex(1024, 1024, (x, w, h) => {
    x.fillStyle = '#7a5d3e'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 520; i++) { const g = rand(i, 9); x.fillStyle = `rgba(${g < 0.5 ? '62,44,27' : '150,122,88'},${0.06 + rand(i, 8) * 0.1})`; x.beginPath(); x.ellipse(rand(i, 6) * w, rand(i, 7) * h, 30 + rand(i, 10) * 140, 12 + rand(i, 11) * 60, rand(i, 12) * PI, 0, TAU); x.fill(); }
    for (let i = 0; i < 14000; i++) { const g = rand(i, 1); x.fillStyle = g < 0.5 ? `rgba(50,36,22,${0.25 + rand(i, 2) * 0.3})` : `rgba(160,134,100,${0.2 + rand(i, 2) * 0.3})`; x.fillRect(rand(i, 3) * w, rand(i, 4) * h, 1 + rand(i, 5) * 2.5, 1 + rand(i, 5) * 2.5); }
    x.strokeStyle = 'rgba(190,170,140,0.35)'; x.lineWidth = 3; x.beginPath(); x.moveTo(0, h * 0.37); x.bezierCurveTo(w * 0.3, h * 0.3, w * 0.6, h * 0.52, w, h * 0.45); x.stroke();
  });
  groundTex.repeat.set(160, 160);
  const groundMat = std(0xffffff, 0, 0.97, { map: groundTex, envMapIntensity: 0.4 });

  // X-ray "glass"
  const xrayMats = [];
  function xrayMat(color, fill, power, gain = 1) {
    const m = new T.ShaderMaterial({
      uniforms: { uColor: { value: new T.Color(color).convertSRGBToLinear() }, uOpacity: { value: 0 }, uFill: { value: fill }, uPow: { value: power }, uGain: { value: gain } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 p = vec4(position, 1.0);\n#ifdef USE_INSTANCING\n p = instanceMatrix * p;\n#endif\n vec4 mv = modelViewMatrix * p; vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec3 vN; varying vec3 vV; uniform vec3 uColor; uniform float uOpacity; uniform float uFill; uniform float uPow; uniform float uGain; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), uPow); gl_FragColor = vec4(uColor * uGain, (f * 0.75 + uFill) * uOpacity); }',
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide
    });
    xrayMats.push(m); return m;
  }
  const xJet = xrayMat(0x5fd8ff, 0.008, 2.8, 0.38);
  const xSeat = xrayMat(0x5fd8ff, 0.03, 2.0, 0.65);
  const xPilot = xrayMat(0xbfeeff, 0.02, 2.2, 0.35);
  const shells = [];
  const fadeMats = [jetMat, jetPlain, jetDark, nozzleMat, frameMat, tubMat, panelMat, seatMat, cushionMat, suitMat, harnessMat, gloveMat, bootMat, helmetMat, visorMat, maskMat];
  function part(geo, mat, xmat, parent, pos, rot) {
    const g = new T.Group(), s = new T.Mesh(geo, mat), gh = new T.Mesh(geo, xmat);
    s.castShadow = s.receiveShadow = true; gh.renderOrder = 5; gh.visible = false;
    g.add(s, gh); parent.add(g);
    if (pos) g.position.set(...pos);
    if (rot) g.rotation.set(...rot);
    shells.push({ solid: s, ghost: gh }); return g;
  }
  function solid(geo, mat, parent, pos, rot) {
    const m = new T.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; parent.add(m);
    if (pos) m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    return m;
  }

  // ---------------------------------------------------------------- ground + clouds
  const ground = new T.Mesh(new T.CircleGeometry(6000, 64), groundMat);
  ground.rotation.x = -PI / 2; ground.receiveShadow = false; scene.add(ground);

  // ---------------------------------------------------------------- the jet (generic, unmarked); jet frame: nose +x, fuselage axis at y = 0
  const jet = new T.Group(); scene.add(jet);
  const fus = [[0.0, 7.7], [0.1, 7.45], [0.26, 6.9], [0.42, 6.2], [0.56, 5.4], [0.66, 4.6], [0.74, 3.8], [0.8, 3.0], [0.85, 2.2], [0.9, 1.0], [0.92, -0.5], [0.9, -2.5], [0.84, -4.2], [0.76, -5.6], [0.66, -6.8], [0.6, -7.4]];
  const fusAt = x0 => { for (let i = 1; i < fus.length; i++) if (x0 >= fus[i][1]) { const [r0, a] = fus[i - 1], [r1, b] = fus[i]; return lerp(r0, r1, (x0 - a) / (b - a)); } return 0.6; };
  const CK0 = 2.45, CK1 = 5.05;   // cockpit opening along x
  const fusFront = fus.filter(([, x]) => x >= CK1); fusFront.push([fusAt(CK1), CK1]);
  const fusMid = [[fusAt(CK1), CK1], [fusAt(4.2), 4.2], [fusAt(3.4), 3.4], [fusAt(CK0), CK0]];
  const fusRear = [[fusAt(CK0), CK0]].concat(fus.filter(([, x]) => x < CK0));
  const FLAT = 0.84;
  const body = new T.Group(); body.scale.set(1, FLAT, 1); jet.add(body);
  part(latheX(fusFront, 48), jetMat, xJet, body);
  part(latheX(fusRear, 48), jetMat, xJet, body);
  part(latheX(fusMid, 48, 1.5 * PI + 0.9, TAU - 1.8), jetMat, xJet, body);   // open on top for the cockpit
  part(latheX([[0.5, -7.35], [0.58, -7.45], [0.56, -7.9]], 32), nozzleMat, xJet, body);
  part(new T.CircleGeometry(0.5, 24).rotateY(PI / 2), jetDark, xJet, body, [-7.36, 0, 0]);
  // cockpit tub, sill rim, instrument panel with glowing displays, aft bulkhead
  const noTop = new T.MeshBasicMaterial({ visible: false });
  part(new T.BoxGeometry(CK1 - CK0 - 0.1, 0.9, 0.98), [tubMat, tubMat, noTop, tubMat, tubMat, tubMat], xJet, jet, [(CK0 + CK1) / 2, 0.02, 0]);
  {
    const rimPts = []; for (let i = 0; i <= 40; i++) { const a = (i / 40) * TAU; rimPts.push(V3((CK0 + CK1) / 2 + Math.cos(a) * (CK1 - CK0) / 2, 0.62 + 0.04 * Math.cos(a), Math.sin(a) * 0.5)); }
    part(new T.TubeGeometry(new T.CatmullRomCurve3(rimPts, true), 80, 0.035, 8, true), frameMat, xJet, jet);
  }
  part(new T.BoxGeometry(0.12, 0.42, 0.8), panelMat, xJet, jet, [4.45, 0.42, 0], [0, 0, -0.35]);
  [[-0.2, mfdMat], [0.2, mfd2Mat]].forEach(([z, m]) => { const d = new T.Mesh(new T.PlaneGeometry(0.2, 0.16), m); d.position.set(4.37, 0.44, z); d.rotation.set(0, -PI / 2, 0); d.rotateX(-0.35); jet.add(d); });
  part(new T.BoxGeometry(0.06, 0.9, 0.9), tubMat, xJet, jet, [2.55, 0.25, 0]);
  // canopy: bubble + frame; flies away on its own after jettison
  const canopy = new T.Group(); jet.add(canopy);
  const CAN0 = V3(3.75, 0.64, 0);
  {
    const g = new T.SphereGeometry(1, 48, 24, 0, TAU, 0, PI / 2); g.scale(1.32, 0.78, 0.52);
    const glass = new T.Mesh(g, canopyMat); glass.renderOrder = 6; canopy.add(glass);
    const gh = new T.Mesh(g, xJet); gh.renderOrder = 6; gh.visible = false; canopy.add(gh); shells.push({ solid: glass, ghost: gh, keep: true });
    const f = []; for (let i = 0; i <= 48; i++) { const a = (i / 48) * TAU; f.push(V3(Math.cos(a) * 1.32, 0.0, Math.sin(a) * 0.52)); }
    part(new T.TubeGeometry(new T.CatmullRomCurve3(f, true), 96, 0.04, 8, true), frameMat, xJet, canopy);
    const arch = []; for (let i = 0; i <= 16; i++) { const a = (i / 16) * PI; arch.push(V3(-0.45, Math.sin(a) * 0.72, Math.cos(a) * 0.48)); }
    part(new T.TubeGeometry(new T.CatmullRomCurve3(arch), 32, 0.03, 6), frameMat, xJet, canopy);
  }
  canopy.position.copy(CAN0);
  // wings, tails, intakes
  [1, -1].forEach(sz => {
    part(extrudeXZ([[1.6, 0.75 * sz], [-2.7, 4.9 * sz], [-3.9, 4.9 * sz], [-4.4, 0.75 * sz]], 0.1), jetPlain, xJet, jet, [0, -0.2, 0]);
    part(extrudeXZ([[-5.1, 0.55 * sz], [-6.7, 2.7 * sz], [-7.3, 2.7 * sz], [-7.4, 0.55 * sz]], 0.07), jetPlain, xJet, jet, [0, -0.1, 0]);
    part(new T.BoxGeometry(3.4, 0.62, 0.42), jetPlain, xJet, jet, [0.3, -0.3, 0.88 * sz]);
    part(new T.PlaneGeometry(0.4, 0.58).rotateY(PI / 2), jetDark, xJet, jet, [2.01, -0.3, 0.88 * sz]);
  });
  part(extrudeXY([[-4.0, 0.55], [-6.5, 3.0], [-7.3, 3.0], [-7.45, 0.55]], 0.09), jetPlain, xJet, jet);

  // ---------------------------------------------------------------- seat rails + catapult (fixed in the jet)
  const RAIL = 17 * PI / 180, RDIR = V3(-Math.sin(RAIL), Math.cos(RAIL), 0);
  const SRP0 = V3(3.32, 0.12, 0);                // seat reference point in the jet: back of the seat pan
  const railBase = SRP0.clone().add(V3(-0.17, -0.45, 0));
  [-0.19, 0.19].forEach(z => {
    const a = railBase.clone().setZ(z), b = a.clone().add(RDIR.clone().multiplyScalar(1.5));
    const m = solid(new T.BoxGeometry(0.035, a.distanceTo(b), 0.05), steelMat, jet); m.position.copy(a).add(b).multiplyScalar(0.5); m.rotation.z = RAIL;
  });
  const catOuter = solid(new T.CylinderGeometry(0.05, 0.05, 1.05, 16), steelMat, jet);
  catOuter.position.copy(railBase.clone().add(RDIR.clone().multiplyScalar(0.52)).add(V3(-0.04, 0, 0))); catOuter.rotation.z = RAIL;
  const chargeMat = new T.MeshBasicMaterial({ color: new T.Color(3, 1.6, 0.6), transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false });
  const charge = new T.Mesh(new T.SphereGeometry(0.12, 16, 12), chargeMat); charge.position.copy(railBase).add(V3(-0.04, 0.05, 0)); charge.renderOrder = 11; jet.add(charge);

  // ---------------------------------------------------------------- the seat (local frame: origin at the back of the pan, x forward, y up the back)
  const seat = new T.Group(); scene.add(seat);
  part(new T.BoxGeometry(0.52, 0.08, 0.5), seatMat, xSeat, seat, [0.26, -0.04, 0]);
  part(new T.BoxGeometry(0.46, 0.05, 0.44), cushionMat, xSeat, seat, [0.25, 0.025, 0]);
  part(new T.BoxGeometry(0.09, 0.85, 0.5), seatMat, xSeat, seat, [-0.06, 0.43, 0]);
  part(new T.BoxGeometry(0.05, 0.7, 0.42), cushionMat, xSeat, seat, [0.0, 0.42, 0]);
  part(new T.BoxGeometry(0.3, 0.3, 0.48), seatMat, xSeat, seat, [-0.04, 1.0, 0]);        // headbox (drogue + main parachute)
  [-1, 1].forEach(sz => part(new T.BoxGeometry(0.58, 0.32, 0.04), seatMat, xSeat, seat, [0.2, 0.06, 0.26 * sz]));
  // internal parts (solid in X-ray)
  const catInner = solid(new T.CylinderGeometry(0.034, 0.034, 1.0, 14), brassMat, seat, [-0.17, 0.3, 0]);
  const motor = new T.Group(); seat.add(motor); motor.position.set(0.24, -0.13, 0);
  solid(new T.CylinderGeometry(0.07, 0.07, 0.44, 20).rotateX(PI / 2), motorMat, motor);
  solid(new T.CylinderGeometry(0.03, 0.055, 0.1, 16), motorMat, motor, [0, -0.1, 0]);
  const packDrogue = solid(new T.BoxGeometry(0.12, 0.1, 0.36), std(0xd86a24, 0, 0.8), seat, [-0.1, 1.08, 0]);
  const packMain = solid(new T.BoxGeometry(0.16, 0.16, 0.4), std(0x7a7d5e, 0, 0.85), seat, [0.0, 0.95, 0]);
  const handle = new T.Group(); seat.add(handle);
  {
    const pts = []; for (let i = 0; i <= 20; i++) { const a = (i / 20) * PI; pts.push(V3(0, Math.sin(a) * 0.075, Math.cos(a) * 0.11)); }
    solid(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 40, 0.018, 10), handleMat, handle);
  }
  handle.position.set(0.53, 0.02, 0);

  // ---------------------------------------------------------------- pilot (stylized): limbs are cylinders stretched between joints every frame
  const pilot = new T.Group(); scene.add(pilot);
  const limb = (r0, r1, mat) => { const m = new T.Mesh(new T.CylinderGeometry(r1, r0, 1, 14).translate(0, 0.5, 0), mat); m.castShadow = m.receiveShadow = true; pilot.add(m); const gh = new T.Mesh(m.geometry, xPilot); gh.renderOrder = 6; gh.visible = false; m.add(gh); shells.push({ solid: m, ghost: gh, child: true }); return m; };
  const blob = (geo, mat) => { const m = new T.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; pilot.add(m); const gh = new T.Mesh(geo, xPilot); gh.renderOrder = 6; gh.visible = false; m.add(gh); shells.push({ solid: m, ghost: gh, child: true }); return m; };
  const P = {
    torso: limb(0.15, 0.17, suitMat), pelvis: blob(new T.SphereGeometry(0.16, 16, 12).scale(1, 0.75, 1.1), suitMat),
    helmet: blob(new T.SphereGeometry(0.145, 24, 16), helmetMat), visor: blob(new T.SphereGeometry(0.148, 24, 12, PI - 1.2, 2.4, 1.0, 0.8), visorMat), mask: blob(new T.BoxGeometry(0.09, 0.08, 0.1), maskMat),
    vest: blob(new T.BoxGeometry(0.2, 0.34, 0.36), harnessMat)
  };
  ['L', 'R'].forEach(s => {
    P['upper' + s] = limb(0.052, 0.058, suitMat); P['fore' + s] = limb(0.045, 0.05, suitMat); P['glove' + s] = blob(new T.BoxGeometry(0.1, 0.06, 0.08), gloveMat);
    P['thigh' + s] = limb(0.07, 0.078, suitMat); P['shin' + s] = limb(0.055, 0.065, suitMat); P['boot' + s] = blob(new T.BoxGeometry(0.24, 0.1, 0.1), bootMat);
  });
  const _d = new T.Vector3(), _up = V3(0, 1, 0);
  const setLimb = (m, a, b) => { _d.subVectors(b, a); const L = _d.length(); m.position.copy(a); m.quaternion.setFromUnitVectors(_up, _d.divideScalar(L)); m.scale.set(1, L, 1); };
  // poses in "pelvis frame" (x forward, y up): seated and hanging under the canopy
  const SEATED = { pelvis: [0, 0, 0], neck: [-0.06, 0.58, 0], head: [-0.03, 0.78, 0], shoulder: [-0.05, 0.52, 0.19], elbow: [0.16, 0.24, 0.17], hand: [0.39, -0.04, 0.065], hip: [0.02, 0, 0.11], knee: [0.43, 0.05, 0.21], ankle: [0.63, -0.42, 0.19] };
  const HANG = { pelvis: [0, 0, 0], neck: [0.0, 0.58, 0], head: [0.01, 0.78, 0], shoulder: [0, 0.52, 0.2], elbow: [0.02, 0.78, 0.27], hand: [0.02, 0.98, 0.2], hip: [0, 0, 0.1], knee: [0.08, -0.44, 0.12], ankle: [0.0, -0.88, 0.12] };
  const tmpA = new T.Vector3(), tmpB = new T.Vector3();
  function posePilot(root, quat, k, pull) {
    const J = {};
    for (const key in SEATED) {
      const a = SEATED[key], b = HANG[key];
      J[key] = [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
    }
    J.hand = [J.hand[0], J.hand[1] + pull * (1 - k), J.hand[2]];
    const W = (p, side = 1) => V3(p[0], p[1], p[2] * side).applyQuaternion(quat).add(root);
    const pel = W(J.pelvis), neck = W(J.neck), head = W(J.head);
    setLimb(P.torso, pel, neck);
    P.pelvis.position.copy(pel); P.pelvis.quaternion.copy(quat);
    P.vest.position.copy(pel).lerp(neck, 0.55); P.vest.quaternion.copy(P.torso.quaternion);
    P.helmet.position.copy(head); P.helmet.quaternion.copy(quat);
    P.visor.position.copy(head); P.visor.quaternion.copy(quat);
    P.mask.position.copy(W([J.head[0] + 0.12, J.head[1] - 0.06, 0])); P.mask.quaternion.copy(quat);
    [['L', 1], ['R', -1]].forEach(([s, sd]) => {
      const sh = W(J.shoulder, sd), el = W(J.elbow, sd), ha = W(J.hand, sd), hi = W(J.hip, sd), kn = W(J.knee, sd), an = W(J.ankle, sd);
      setLimb(P['upper' + s], sh, el); setLimb(P['fore' + s], el, ha);
      P['glove' + s].position.copy(ha); P['glove' + s].quaternion.copy(P['fore' + s].quaternion);
      setLimb(P['thigh' + s], hi, kn); setLimb(P['shin' + s], kn, an);
      P['boot' + s].position.copy(an).add(V3(0.08, -0.04, 0).applyQuaternion(quat)); P['boot' + s].quaternion.copy(quat);
    });
  }

  // ---------------------------------------------------------------- parachutes
  function chute(radius, mat, nLines) {
    const g = new T.Group(); scene.add(g);
    const dome = new T.Mesh(new T.SphereGeometry(1, 48, 16, 0, TAU, 0, PI * 0.42), mat); dome.castShadow = true; g.add(dome);
    const pos = new Float32Array(nLines * 6), geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    const lines = new T.LineSegments(geo, lineMat); lines.frustumCulled = false; scene.add(lines);
    return { g, dome, lines, pos, n: nLines, radius };
  }
  const drogue = chute(0.6, chuteMat, 12), mainChute = chute(3.6, chuteMat, 24);
  // chute: canopy centre c, axis (unit, from payload toward canopy), open k (0..1), riser point a
  const _q = new T.Quaternion();
  function placeChute(ch, a, axis, len, open, breathe) {
    const vis = open > 0.002; ch.g.visible = ch.lines.visible = vis; if (!vis) return;
    const c = a.clone().addScaledVector(axis, len);
    const r = ch.radius * lerp(0.12, 1, open) * (1 + breathe), h = ch.radius * lerp(1.6, 0.62, open);
    ch.g.position.copy(c); ch.g.quaternion.copy(_q.setFromUnitVectors(_up, axis)); ch.dome.scale.set(r, h, r);
    const skirtY = Math.cos(PI * 0.42), skirtR = Math.sin(PI * 0.42);
    for (let i = 0; i < ch.n; i++) {
      const ang = (i / ch.n) * TAU, p = V3(Math.cos(ang) * skirtR * r, skirtY * h, Math.sin(ang) * skirtR * r).applyQuaternion(ch.g.quaternion).add(c);
      ch.pos.set([a.x, a.y, a.z, p.x, p.y, p.z], i * 6);
    }
    ch.lines.geometry.attributes.position.needsUpdate = true;
  }

  // ---------------------------------------------------------------- flight model (jet frame: inertial, moving with the jet at V)
  // seat + pilot until separation, then pilot (main chute) and seat (falls away) separately
  const T_CAT = 0.18, T_RAILS = 0.32, T_BURN = 0.55, T_DROGUE = 0.62, T_SEP = 1.5, T_MAIN = 1.95, T_FULL = 2.75, A_CAT = 150, A_ROCKET = 105;
  const drogueOpen = tau => smooth(span(tau, T_DROGUE, T_DROGUE + 0.18)) * (tau < T_SEP ? 1 : 0);
  const mainOpen = tau => Math.pow(smooth(span(tau, T_MAIN, T_FULL)), 1.6);
  const SIM = (() => {
    const dt = 0.0005, N = Math.ceil(7 / dt), out = { dt, man: [], seat: [], g: [] };
    let p = null, v = null, ps = null, vs = null;
    for (let i = 0; i <= N; i++) {
      const tau = i * dt; let ax = 0, ay = 0, fg = 1;
      if (tau < T_CAT) { p = V3(0, 0, 0); v = V3(0, 0, 0); }
      else if (tau < T_RAILS) { const u = tau - T_CAT, s = 0.5 * A_CAT * u * u; p = RDIR.clone().multiplyScalar(s); v = RDIR.clone().multiplyScalar(A_CAT * u); fg = A_CAT / G; }
      else {
        const wx = v.x + V, wy = v.y, w = Math.hypot(wx, wy);
        let k = 0.0028 + 0.0072 * drogueOpen(tau);
        if (tau >= T_SEP) k = 0.003 + 0.17 * mainOpen(tau);
        ax = -k * w * wx; ay = -k * w * wy;
        if (tau < T_BURN) { ax += A_ROCKET * RDIR.x; ay += A_ROCKET * RDIR.y; }
        fg = Math.hypot(ax, ay) / G;
        ay -= G;
        v.x += ax * dt; v.y += ay * dt; p.x += v.x * dt; p.y += v.y * dt;
        if (tau >= T_SEP) {
          if (!ps) { ps = p.clone(); vs = v.clone(); }
          const sx = vs.x + V, sy = vs.y, sw = Math.hypot(sx, sy), sk = 0.0045;
          vs.x += -sk * sw * sx * dt; vs.y += (-sk * sw * sy - G) * dt; ps.x += vs.x * dt; ps.y += vs.y * dt;
        }
      }
      if (i % 4 === 0) { out.man.push([p.x, p.y, v.x, v.y]); out.seat.push(ps ? [ps.x, ps.y, vs.x, vs.y] : [p.x, p.y, v.x, v.y]); out.g.push(fg); }
    }
    out.step = dt * 4; return out;
  })();
  const simAt = (arr, tau) => { const q = clamp(tau, 0, 6.9) / SIM.step, i = Math.min(arr.length - 2, q | 0), k = q - i, a = arr[i], b = arr[i + 1]; return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k), lerp(a[3], b[3], k)]; };
  const gAt = tau => { if (tau < T_CAT) return 1; const q = clamp(tau, 0, 6.9) / SIM.step, i = Math.min(SIM.g.length - 2, q | 0); return lerp(SIM.g[i], SIM.g[i + 1], q - i); };
  const jetX = tau => V * tau;                      // jet position along x (world)
  const worldOf = (jx, jy, tau) => V3(jetX(tau) + SRP0.x + jx, H + SRP0.y + jy, 0);   // jet-frame seat offset → world

  // ---------------------------------------------------------------- timeline: video time t → τ (time since the pull)
  const HOOK0 = 0.10, HOOKR = 0.2;                 // hook: τ = 0.10 + 0.2·h, h = t (start) or t − 22 (end pre-roll)
  const hookTau = h => HOOK0 + HOOKR * h;
  function monotone(xs, ys) {
    const n = xs.length, d = [], m = new Array(n).fill(0);
    for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
      const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
      if (s > 9) { const k = 3 / Math.sqrt(s); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
    }
    const f = x => {
      if (x <= xs[0]) return ys[0] + (x - xs[0]) * m[0];
      if (x >= xs[n - 1]) return ys[n - 1] + (x - xs[n - 1]) * m[n - 1];
      let i = 0; while (x > xs[i + 1]) i++;
      const h = xs[i + 1] - xs[i], s = (x - xs[i]) / h, s2 = s * s, s3 = s2 * s;
      return (2 * s3 - 3 * s2 + 1) * ys[i] + (s3 - 2 * s2 + s) * h * m[i] + (-2 * s3 + 3 * s2) * ys[i + 1] + (s3 - s2) * h * m[i + 1];
    };
    return f;
  }
  //                         t:  pull close-up (real time)   pull      canopy      catapult+rocket  stabilize          landing
  const mainTau = monotone([2.7, 5.0, 5.7, 6.0, 10.0, 13.0, 15.0, 16.0, 17.0, 18.3, 21.6], [-2.3, -0.05, 0.0, 0.008, 0.16, 0.32, 0.42, 0.50, 0.98, 1.80, 5.1]);
  const REW0 = 2.0, REW1 = 2.7, END_CUT = 21.6;
  const isHook = t => t < REW0 || t >= END_CUT;
  const hookH = t => (t >= END_CUT ? t - DURATION : t);
  function tauAt(t) {
    if (isHook(t)) return hookTau(hookH(t));
    if (t < REW1) return lerp(hookTau(REW0), 0.0, smooth(span(t, REW0, REW1 - 0.08)));
    return mainTau(t);
  }
  const rateAt = t => (tauAt(t + 0.01) - tauAt(t - 0.01)) / 0.02;
  const PULL = t => smooth(span(t, 5.05, 5.7));      // handle travel in the close-up (and complete in every later scene)
  const xrayAmt = t => smooth(span(t, 10.0, 10.6)) * (1 - smooth(span(t, 15.0, 15.6)));
  const TIMER_FINAL = T_FULL + 0.15;                 // timer stops once the main canopy is fully open

  // ---------------------------------------------------------------- smoke, flame, clouds
  const NOISE = `
    float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
                 mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
    float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * n3(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }`;
  const flameMat = new T.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uAmt: { value: 0 } },
    vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: NOISE + `varying vec2 vUv; varying vec3 vN; varying vec3 vV; uniform float uTime; uniform float uAmt;
      void main(){ float s = 1.0 - vUv.y; float n = fbm(vec3(vUv.x * 8.0, s * 6.0 - uTime * 14.0, 0.5));
        vec3 col = mix(vec3(1.0, 0.95, 0.82) * 3.0, vec3(1.0, 0.5, 0.14) * 1.8, smoothstep(0.1, 0.7, s));
        float facing = pow(abs(dot(normalize(vN), normalize(vV))), 0.8);
        gl_FragColor = vec4(col, (1.0 - smoothstep(0.35, 1.0, s)) * (0.45 + 0.9 * n) * facing * uAmt * 0.7); }`,
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide
  });
  const flame = new T.Mesh(new T.ConeGeometry(0.11, 1.2, 20, 1, true).translate(0, -0.6, 0), flameMat);
  flame.renderOrder = 10; motor.add(flame); flame.position.y = -0.14;
  function puffSystem(n, color) {
    const g = new T.InstancedBufferGeometry(), base = new T.PlaneGeometry(1, 1);
    g.setIndex(base.index); g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
    const pos = new T.InstancedBufferAttribute(new Float32Array(n * 3), 3), dat = new T.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    pos.setUsage(T.DynamicDrawUsage); dat.setUsage(T.DynamicDrawUsage); g.setAttribute('aPos', pos); g.setAttribute('aDat', dat); g.instanceCount = n;
    const m = new T.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uBase: { value: color } },
      vertexShader: `attribute vec3 aPos; attribute vec4 aDat; varying vec2 vUv; varying vec4 vDat;
        void main(){ vUv = uv; vDat = aDat;
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          float c = cos(aDat.w * 6.28), s = sin(aDat.w * 6.28); vec2 q = vec2(c * position.x - s * position.y, s * position.x + c * position.y);
          gl_Position = projectionMatrix * viewMatrix * vec4(aPos + (right * q.x + up * q.y) * aDat.x, 1.0); }`,
      fragmentShader: NOISE + `varying vec2 vUv; varying vec4 vDat; uniform float uTime; uniform vec3 uBase;
        void main(){ vec2 c = vUv - 0.5; float r = length(c) * 2.0;
          float n = fbm(vec3(vUv * 3.0 + vDat.w * 10.0, uTime * 0.25 + vDat.w * 5.0));
          float a = smoothstep(1.0, 0.25, r + (n - 0.5) * 0.7) * vDat.y;
          vec3 col = uBase * (0.75 + 0.5 * n) + vec3(1.0, 0.55, 0.2) * vDat.z * 2.2 * (1.0 - r * 0.6);
          gl_FragColor = vec4(col, a); }`,
      transparent: true, depthWrite: false
    });
    const mesh = new T.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 7; scene.add(mesh); return { mesh, pos, dat, n, m };
  }
  const smoke = puffSystem(110, new T.Color(0.55, 0.53, 0.5));
  const clouds = puffSystem(46, new T.Color(0.95, 0.9, 0.84));
  for (let i = 0; i < clouds.n; i++) {
    clouds.pos.setXYZ(i, -500 + rand(i, 91) * 1500, H + 120 + rand(i, 92) * 220, (rand(i, 93) - 0.5) * 900);
    clouds.dat.setXYZW(i, 40 + rand(i, 94) * 90, 0.22 + rand(i, 95) * 0.2, 0, rand(i, 96));
  }
  clouds.mesh.renderOrder = 1;

  // ---------------------------------------------------------------- camera (monotone cubic per channel; positions relative to a moving focus)
  //   focus: 'jet' (camera rides with the jet) or 'man' (camera follows the seat / pilot in the world)
  //        t    focus  dx    dy    dz    az     el     d
  const SHOTS = [
    { a: 2.7, b: 6.0, focus: 'jet', keys: [[2.7, 3.8, 0.33, 0.0, 1.5708, 0.66, 0.98], [6.0, 3.8, 0.37, 0.0, 1.5708, 0.62, 0.84]] },
    { a: 6.0, b: 10.0, focus: 'jet', keys: [[6.0, 3.6, 1.0, 0.0, 0.7, 0.32, 6.0], [10.0, 3.4, 1.2, 0.0, 0.5, 0.26, 7.2]] },
    { a: 10.0, b: 15.0, focus: 'man', keys: [[10.0, 0.15, 0.4, 0.0, 0.08, 0.12, 5.0], [12.4, 0.05, 0.45, 0.0, 0.02, 0.1, 4.8], [15.0, -0.1, 0.4, 0.0, -0.08, 0.08, 5.6]] },
    { a: 15.0, b: 19.0, focus: 'man', keys: [[15.0, -0.3, 0.6, 0.0, 0.45, 0.14, 7.5], [16.6, -1.2, 0.9, 0.0, 0.85, 0.1, 12.0], [19.0, -0.5, 3.6, 0.0, 0.85, -0.04, 22.0]] },
    { a: 19.0, b: 21.6, focus: 'man', keys: [[19.0, -0.5, 3.6, 0.0, 0.85, -0.04, 22.0], [20.2, 0.0, 4.5, 0.0, 0.92, -0.06, 36.0], [21.6, 0.0, 4.6, 0.0, 1.0, -0.07, 38.0]] }
  ].map(sh => Object.assign(sh, { f: [1, 2, 3, 4, 5, 6].map(c => { const g = monotone(sh.keys.map(k => k[0]), sh.keys.map(k => k[c])); return x => g(clamp(x, sh.keys[0][0], sh.keys[sh.keys.length - 1][0])); }) }));
  // hook camera: rear-left of the cockpit, riding with the jet, tilting up after the seat
  const hookCam = (h, tau) => {
    const m = simAt(SIM.man, tau), rise = clamp(m[1] / 3.0);
    return { focus: V3(jetX(tau) + SRP0.x - 0.4 + m[0] * 0.5, H + SRP0.y + 0.55 + m[1] * 0.58, 0), az: 0.42 + 0.02 * h, el: -0.03 + 0.05 * rise, d: 7.4 + 1.2 * rise };
  };
  const shake = (t, amp) => [amp * (Math.sin(t * 37.1) + 0.6 * Math.sin(t * 53.7 + 1.3) + 0.3 * Math.sin(t * 91.3 + 0.4)), amp * (Math.sin(t * 41.9 + 2.1) + 0.6 * Math.sin(t * 61.3 + 0.2)), amp * 0.7 * Math.sin(t * 47.3 + 0.9)];
  let manNow = V3(), seatNow = V3();
  function cameraAt(t, tau) {
    let fc, az, el, d;
    if (isHook(t) || t < REW1) {
      const h = isHook(t) ? hookH(t) : REW0 + (t - REW0) * 0.3;
      const hc = hookCam(h, tau); fc = hc.focus; az = hc.az; el = hc.el; d = hc.d;
      if (!isHook(t)) { const k = smooth(span(t, REW0, REW1)); d = lerp(d, 2.6, k); el = lerp(el, 0.7, k); fc.lerp(V3(jetX(tau) + 3.8, H + 0.7, 0), k); }
    } else {
      const sh = SHOTS.find(s => t < s.b) || SHOTS[SHOTS.length - 1];
      const [dx, dy, dz, a, e, dd] = sh.f.map(f => f(t));
      const base = sh.focus === 'jet' ? V3(jetX(tau), H, 0) : manNow.clone();
      fc = base.add(V3(dx, dy, dz)); az = a; el = e; d = dd;
    }
    // shake when the catapult fires and while the rocket burns
    const kick = Math.exp(-Math.max(0, tau - T_CAT) / 0.12) * (tau > T_CAT ? 1 : 0) + 0.35 * (tau > T_RAILS && tau < T_BURN ? 1 : 0) * Math.exp(-(tau - T_RAILS) / 0.3);
    const amp = (isHook(t) ? 0.09 : (t >= 10 && t < 15 ? 0.03 : t >= 6 && t < 10 ? 0.02 : 0)) * kick + (t >= 2.7 && t < 6 ? 0.0015 : 0);
    const sk = shake(isHook(t) ? hookH(t) : t, amp);
    camera.position.set(fc.x + d * Math.sin(az) * Math.cos(el) + sk[0], fc.y + d * Math.sin(el) + sk[1], fc.z + d * Math.cos(az) * Math.cos(el) + sk[2]);
    camera.lookAt(fc.x + sk[0] * 0.3, fc.y + sk[1] * 0.3, fc.z);
    return fc;
  }

  // ---------------------------------------------------------------- UI
  const $ = id => document.getElementById(id);
  const ui = { specs: $('specs'), step: $('step'), caption: $('caption'), teaser: $('teaser'), tag: $('tag'), badge: $('badge'), timer: $('timer'), timerV: $('timerV'), timerK: $('timerK'), rewind: $('rewind'), stage: $('vStage'), time: $('vTime'), force: $('vForce'), alt: $('vAlt') };
  const SCENES = [
    { a: 0, b: 2.0, step: '', huge: true, cap: '0.3 seconds to leave a jet.' },
    { a: 2.0, b: 2.7, step: '', cap: '' },
    { a: 2.7, b: 6.0, step: '01 · THE PULL', cap: 'One pull starts everything.' },
    { a: 6.0, b: 10.0, step: '02 · CANOPY', cap: 'First, the canopy has to go.' },
    { a: 10.0, b: 15.0, step: '03 · CATAPULT + ROCKET', x: true, cap: 'A charge kicks it out. A rocket takes over.' },
    { a: 15.0, b: 19.0, step: '04 · STABILIZE', cap: 'A small chute steadies the seat.' },
    { a: 19.0, b: 21.6, step: '05 · LANDING', cap: 'Pull once. Rocket. Parachute.' },
    { a: 21.6, b: 22.5, step: '', huge: true, cap: '0.3 seconds to leave a jet.' }
  ];
  const stageAt = (t, tau) => {
    if (t >= REW0 && t < REW1) return 'REWIND';
    if (tau < -0.05) return 'IN FLIGHT';
    if (tau < 0.0) return 'PULL';
    if (tau < T_CAT) return 'CANOPY';
    if (tau < T_RAILS) return 'CATAPULT';
    if (tau < T_BURN) return 'ROCKET';
    if (tau < T_SEP) return 'DROGUE';
    if (tau < T_MAIN) return 'SEPARATION';
    if (tau < T_FULL) return 'MAIN CHUTE';
    return 'DESCENT';
  };
  const setText = (el, s) => { if (el.textContent !== s) el.textContent = s; };
  // callouts: anchor = function returning a world point
  let anchors = {};
  const CALLOUTS = [
    { text: 'EJECTION HANDLE', on: [[3.1, 5.9]], at: () => anchors.handle, dx: -60, dy: 80 },
    { text: 'CANOPY', on: [[6.4, 9.7]], at: () => anchors.canopy, dx: -70, dy: -60 },
    { text: 'CATAPULT', on: [[10.4, 12.6]], at: () => anchors.catapult, dx: -80, dy: 30 },
    { text: 'ROCKET MOTOR', on: [[12.0, 14.9]], at: () => anchors.motor, dx: 60, dy: 50 },
    { text: 'DROGUE CHUTE', on: [[15.9, 18.6]], at: () => anchors.drogue, dx: -60, dy: -40 },
    { text: 'MAIN PARACHUTE', on: [[19.3, 21.5]], at: () => anchors.main, dx: -40, dy: -50 }
  ];
  const calloutRoot = $('callouts');
  CALLOUTS.forEach(c => {
    c.el = document.createElement('div'); c.el.className = 'callout';
    c.el.innerHTML = '<span class="line"></span><span class="dot"></span><span class="tag"></span>';
    c.line = c.el.querySelector('.line'); c.tag = c.el.querySelector('.tag'); c.tag.textContent = c.text;
    calloutRoot.appendChild(c.el);
  });
  const tmpV = new T.Vector3();
  const toScreen = p => { tmpV.copy(p).project(camera); return [(tmpV.x * 0.5 + 0.5) * 360, (-tmpV.y * 0.5 + 0.5) * 640, tmpV.z]; };
  const headBottom = () => { const els = [ui.tag, ui.teaser, ui.caption].filter(e => +e.style.opacity > 0.01); const el = els[0] || ui.caption; return el.offsetTop + el.offsetHeight + el.offsetParent.offsetTop + 10; };
  function updateCallouts(t, X) {
    const capBottom = Math.max(headBottom(), 100);
    CALLOUTS.forEach(c => {
      let o = 0;
      c.on.forEach(([a, b]) => { o = Math.max(o, pulse(t, a, a + 0.3, b - 0.3, b)); });
      const at = c.at();
      if (!at) o = 0;
      c.el.style.opacity = o.toFixed(3);
      if (o <= 0.001) return;
      c.el.classList.toggle('x', X > 0.5);
      const [px, py] = toScreen(at);
      const w = c.tag.offsetWidth, h = c.tag.offsetHeight;
      let cx = px + c.dx - w / 2, cy = py + c.dy - h / 2;
      const maxX = cy + h > 300 ? 304 - w : 340 - w;
      cx = clamp(cx, 20, maxX); cy = clamp(cy, capBottom, 430 - h);
      c.el.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
      c.tag.style.transform = `translate(${(cx - px).toFixed(1)}px, ${(cy - py).toFixed(1)}px)`;
      const ex = clamp(px, cx, cx + w), ey = clamp(py, cy, cy + h);
      const lx = (ex === px && ey === py) ? 0 : ex - px, ly = ey - py, len = Math.hypot(lx, ly);
      c.line.style.width = len.toFixed(1) + 'px';
      c.line.style.transform = `rotate(${Math.atan2(ly, lx)}rad)`;
    });
  }

  // ---------------------------------------------------------------- per-frame update
  const seatQ = new T.Quaternion(), tmpQ = new T.Quaternion(), qx = new T.Quaternion();
  let curX = 0;
  function update(t) {
    t = clamp(t, 0, DURATION - 1e-4);
    const tau = tauAt(t), X = xrayAmt(t); curX = X;
    const flightT = tau;                          // shader / smoke clock follows real event time

    // X-ray blend
    shells.forEach(sh => { sh.solid.visible = sh.keep || sh.child ? true : X < 0.995; sh.ghost.visible = X > 0.005; sh.solid.castShadow = X < 0.5; });
    fadeMats.forEach(m => { m.transparent = X > 0.005; m.opacity = 1 - X; m.depthWrite = X < 0.6; });
    canopyMat.opacity = 0.22 * (1 - X);
    groundMat.transparent = X > 0.005; groundMat.opacity = 1 - X; ground.visible = X < 0.995;
    clouds.mesh.visible = X < 0.995;
    xrayMats.forEach(m => { m.uniforms.uOpacity.value = X; });
    bgMat.uniforms.uX.value = X;
    scene.fog.color.copy(HORIZON).lerp(NAVY, X);
    rim.intensity = X * 1.1; hemi.intensity = lerp(0.6, 0.45, X);

    // jet
    jet.position.set(jetX(tau), H, 0);
    // canopy: thrusters at τ 0.02, lifts, then the airflow throws it aft and tumbles it
    const cu = Math.max(0, tau - 0.01);
    const cx = -0.5 * 900 * Math.max(0, cu - 0.04) ** 2, cy = 0.5 * 300 * Math.min(cu, 0.06) ** 2 + 18 * Math.max(0, cu - 0.06) - 0.5 * G * cu * cu;
    canopy.position.set(CAN0.x + cx, CAN0.y + cy, 0);
    canopy.rotation.set(0.25 * Math.sin(cu * 6), 0, 3.2 * cu * cu + 1.4 * cu);
    canopy.visible = cu < 1.2;

    // seat + pilot
    const m = simAt(SIM.man, tau), sm = simAt(SIM.seat, tau);
    const sepK = smooth(span(tau, T_SEP, T_SEP + 0.25));
    const seatW = worldOf(sm[0], sm[1], tau);
    const manW = worldOf(m[0], m[1], tau);
    manNow.copy(manW); seatNow.copy(seatW);
    // seat attitude: rail angle; tumbles after burnout; the drogue then steadies it into the wind
    const velW = V3(V + sm[2], sm[3], 0), velDir = velW.clone().normalize();
    let pitch = RAIL;
    if (tau > T_BURN) {
      const u = tau - T_BURN, tumble = 1.1 * Math.sin(u * 9) * Math.exp(-u * 1.4) * (1 - 0.8 * drogueOpen(tau)) + 0.9 * u * (1 - drogueOpen(tau));
      const windPitch = Math.atan2(-velDir.x, Math.max(0.2, Math.abs(velDir.y) + 0.6)) * 0.7;
      pitch = lerp(RAIL + tumble, windPitch + 0.15 * Math.sin(u * 5) * Math.exp(-u * 1.5), drogueOpen(tau));
    }
    if (tau > T_SEP) pitch += 2.2 * (tau - T_SEP) * (tau - T_SEP);       // seat tumbles away after separation
    seatQ.setFromAxisAngle(V3(0, 0, 1), pitch);
    seat.position.copy(seatW); seat.quaternion.copy(seatQ);
    seat.visible = !(tau > T_SEP + 1.4);
    // catapult inner tube rides with the seat; motor flame while burning
    catInner.visible = tau < T_RAILS + 0.02 || X > 0.1;
    const burn = tau > T_RAILS && tau < T_BURN + 0.04 ? smooth(span(tau, T_RAILS, T_RAILS + 0.02)) * (1 - smooth(span(tau, T_BURN - 0.03, T_BURN + 0.04))) : 0;
    flameMat.uniforms.uAmt.value = burn; flameMat.uniforms.uTime.value = flightT * 1.0 + t * 0.15;
    flame.scale.set(1, 0.6 + 0.6 * burn, 1);
    chargeMat.opacity = Math.exp(-Math.pow((tau - T_CAT - 0.01) / Math.max(0.006, 0.25 * Math.abs(rateAt(t))), 2)) * 0.9;
    // handle travel
    const pull = (t >= REW1 && t < 6.0 ? PULL(t) : 1) * 0.09;
    handle.position.set(0.53, 0.02 + pull * 0.9, 0);
    // pilot: rides the seat (seated pose) until separation, then swings upright under the main canopy
    const pelvisSeat = V3(0.14, 0.12, 0).applyQuaternion(seatQ).add(seatW);
    const pelvisMan = pelvisSeat.clone().lerp(manW.clone().add(V3(0, 0.12, 0)), sepK);
    const upright = new T.Quaternion();
    if (tau > T_SEP) { const ax = V3(-(V + m[2]), -m[3], 0).normalize(); upright.setFromUnitVectors(_up, ax.lerp(_up, 0.55).normalize()); }
    tmpQ.copy(seatQ).slerp(upright, smooth(span(tau, T_SEP, T_SEP + 0.9)));
    posePilot(pelvisMan, tmpQ, smooth(span(tau, T_SEP + 0.1, T_SEP + 1.0)), pull);
    // drogue: fired out of the headbox, trailing into the wind
    const head = V3(-0.04, 1.16, 0).applyQuaternion(seatQ).add(seatW);
    const dOpen = drogueOpen(tau), dLen = 4.5 * smooth(span(tau, T_DROGUE - 0.04, T_DROGUE + 0.1));
    placeChute(drogue, head, velDir.clone().negate().lerp(_up, 0.25).normalize(), dLen, dOpen * (tau < T_SEP ? 1 : 0), 0.04 * Math.sin(flightT * 9));
    packDrogue.visible = tau < T_DROGUE;
    // main parachute from the pilot's back pack
    const mOpen = mainOpen(tau), velM = V3(V + m[2], m[3], 0).normalize();
    const shoulders = pelvisMan.clone().add(V3(0, 0.9, 0).applyQuaternion(tmpQ));
    const mAxis = velM.clone().negate().lerp(_up, smooth(span(tau, T_MAIN, T_FULL + 0.5)) * 0.7).normalize();
    placeChute(mainChute, shoulders, mAxis, lerp(1.5, 6.2, smooth(span(tau, T_MAIN, T_MAIN + 0.35))), tau > T_MAIN ? 0.02 + 0.98 * mOpen : 0, 0.03 * Math.sin(flightT * 2.2) * mOpen);
    packMain.visible = tau < T_SEP;

    // smoke: catapult puff + rocket trail (world-fixed puffs, so they stream away behind)
    for (let i = 0; i < smoke.n; i++) {
      const born = T_CAT + 0.02 + (i / smoke.n) * (T_BURN - T_CAT + 0.1), age = tau - born;
      if (age < 0 || age > 2.5) { smoke.dat.setXYZW(i, 0, 0, 0, 0); continue; }
      const bm = simAt(SIM.man, born), bp = worldOf(bm[0], bm[1], born).add(V3(0.2, -0.35, 0)), drift = V3((rand(i, 3) - 0.5) * 2, 0.6 + rand(i, 4), (rand(i, 5) - 0.5) * 2).multiplyScalar(age);
      smoke.pos.setXYZ(i, bp.x + drift.x, bp.y + drift.y, bp.z + drift.z);
      smoke.dat.setXYZW(i, 0.5 + age * 2.2, 0.55 * Math.exp(-age * 1.2) * smooth(span(age, 0, 0.02)), Math.exp(-age * 18) * 0.8, rand(i, 6));
    }
    smoke.pos.needsUpdate = smoke.dat.needsUpdate = true; smoke.m.uniforms.uTime.value = flightT;
    clouds.m.uniforms.uTime.value = flightT * 0.2;

    // lights follow the action
    const focus = cameraAt(t, tau);
    camera.updateMatrixWorld();
    sun.target.position.copy(focus); sun.position.copy(focus).addScaledVector(SUN_DIR, 30);
    fireLight.position.copy(V3(0.24, -0.4, 0).applyQuaternion(seatQ).add(seatW));
    fireLight.intensity = 4.5 * burn + 3.0 * chargeMat.opacity;
    cockpitLight.position.set(jetX(tau) + 4.1, H + 0.75, 0);
    const sig = Math.max(0.002, 0.07 * Math.abs(rateAt(t)));          // ~0.07 s of video, whatever the playback speed
    const ignite = Math.exp(-Math.pow((tau - T_CAT - 0.004) / sig, 2)) + 0.6 * Math.exp(-Math.pow((tau - T_RAILS - 0.004) / sig, 2));
    flashMat.uniforms.uAmt.value = (isHook(t) ? 0.34 : t >= 10 && t < 15 ? 0.16 : 0.2) * ignite + 0.2 * Math.exp(-Math.pow((tau - 0.012) / Math.max(sig, 0.004), 2));
    bgMat.uniforms.uInvProj.value.copy(camera.projectionMatrixInverse);
    bgMat.uniforms.uCamWorld.value.copy(camera.matrixWorld);
    vhs.uniforms.uAmt.value = pulse(t, REW0 - 0.04, REW0 + 0.06, REW1 - 0.12, REW1);
    vhs.uniforms.uTime.value = t;

    // anchors for the callouts
    anchors = {
      handle: V3(0.53, 0.06 + pull, 0.11).applyQuaternion(seatQ).add(seatW),
      canopy: canopy.position.clone().add(V3(0.2, 0.62, 0.2)).add(jet.position),
      catapult: V3(-0.17, 0.15, 0).applyQuaternion(seatQ).add(seatW),
      motor: V3(0.24, -0.16, 0.22).applyQuaternion(seatQ).add(seatW),
      drogue: dOpen > 0.3 ? drogue.g.position.clone() : null,
      main: mOpen > 0.3 ? mainChute.g.position.clone().add(V3(0, mainChute.radius * 0.45, 0)) : null
    };

    // overlay
    const sc = SCENES.find(s => t < s.b) || SCENES[SCENES.length - 1];
    const fadeIn = (sc.a === 0 || sc.a === 21.6) ? 1 : smooth(span(t, sc.a, sc.a + 0.25)), fadeOut = (sc.b > 22 || sc.b === 2.0) ? 1 : 1 - smooth(span(t, sc.b - 0.2, sc.b));
    setText(ui.step, sc.step); ui.step.classList.toggle('x', !!sc.x);
    setText(ui.caption, sc.cap); ui.caption.classList.toggle('huge', !!sc.huge);
    ui.step.style.opacity = ui.caption.style.opacity = (fadeIn * fadeOut).toFixed(3);
    ui.teaser.style.opacity = pulse(t, 13.2, 13.5, 14.75, 15.0).toFixed(3);
    ui.tag.style.opacity = pulse(t, 19.9, 20.3, 21.5, 21.6).toFixed(3);
    ui.badge.style.opacity = (smooth(span(t, 10.05, 10.4)) * (1 - smooth(span(t, 15.0, 15.3)))).toFixed(3);
    ui.rewind.style.opacity = (t >= REW0 && t < REW1 ? (Math.floor(t * 6) % 2 ? 1 : 0.55) : 0).toFixed(2);
    ui.rewind.style.transform = `translate(0px, ${headBottom() + 6}px)`;
    // big timer: seconds since the pull; stops when the main canopy is fully open
    const stopped = !isHook(t) && t >= REW1 && tau >= TIMER_FINAL;
    const shown = stopped ? TIMER_FINAL : Math.max(0, tau);
    setText(ui.timerV, shown.toFixed(2));
    ui.timer.classList.toggle('stopped', stopped);
    setText(ui.timerK, stopped ? 'TO FULL CANOPY' : 'SINCE PULL');
    const rate = Math.abs(rateAt(t));
    setText(ui.stage, stageAt(t, tau));
    setText(ui.time, t >= REW0 && t < REW1 ? '◀◀ REW' : rate > 0.9 ? 'REAL ×1' : `1/${Math.round(1 / Math.max(rate, 1e-3))}×`);
    const g = tau < T_CAT || (t >= REW0 && t < REW1) ? 1 : (tau > T_FULL + 0.3 ? 1 : gAt(tau));
    setText(ui.force, (Math.round(g * 10) / 10).toFixed(g >= 9.95 ? 0 : 1) + ' g');
    const alt = tau < T_CAT ? H : H + SRP0.y + m[1];
    setText(ui.alt, Math.round(alt) + ' m');
    updateCallouts(t, X);
  }

  // ---------------------------------------------------------------- post: VHS rewind look (scanlines, chroma split, tracking jitter)
  const vhs = new T.ShaderPass({
    uniforms: { tDiffuse: { value: null }, uAmt: { value: 0 }, uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uAmt; uniform float uTime; varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        vec2 uv = vUv;
        if (uAmt > 0.001) {
          float fr = floor(uTime * 30.0);
          float row = floor(uv.y * 120.0);
          uv.x += (hash(vec2(row, fr)) - 0.5) * 0.03 * uAmt * step(0.82, hash(vec2(row * 0.37, fr + 3.0)));
          float band = smoothstep(0.06, 0.0, abs(fract(uv.y * 0.9 + uTime * 1.3) - 0.5));
          uv.x += band * 0.02 * uAmt;
        }
        float ca = 0.006 * uAmt;
        vec3 c = vec3(texture2D(tDiffuse, uv + vec2(ca, 0.0)).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - vec2(ca, 0.0)).b);
        if (uAmt > 0.001) {
          float scan = 0.82 + 0.18 * sin(vUv.y * 1920.0 * 1.05);
          c *= mix(1.0, scan, uAmt);
          c = mix(c, vec3(dot(c, vec3(0.3, 0.59, 0.11))), 0.35 * uAmt);
          c += (hash(vUv * 1000.0 + uTime) - 0.5) * 0.08 * uAmt;
          c *= mix(1.0, 1.1, uAmt);
        }
        gl_FragColor = vec4(c, 1.0);
      }`
  });
  class StagePass extends T.Pass {
    constructor() { super(); this.needsSwap = false; }
    render(r, writeBuffer, readBuffer) { r.setRenderTarget(this.renderToScreen ? null : readBuffer); r.clear(); r.render(scene, camera); }
  }
  composer.addPass(new StagePass());
  composer.addPass(new T.UnrealBloomPass(new T.Vector2(360, 640), 0.5, 0.5, 0.9));
  composer.addPass(vhs);
  composer.addPass(new T.ShaderPass(T.GammaCorrectionShader));

  // ---------------------------------------------------------------- sizing, playback, hooks
  function resize() {
    const Wv = innerWidth, Hv = innerHeight, fit = RENDER ? 1 : Math.min(Wv / 360, Hv / 640);
    frameEl.style.transform = RENDER ? '' : `translate(${((Wv - 360 * fit) / 2).toFixed(1)}px, ${((Hv - 640 * fit) / 2).toFixed(1)}px) scale(${fit})`;
    const pr = Math.min(4, (devicePixelRatio || 1) * fit);
    renderer.setPixelRatio(pr); renderer.setSize(360, 640, false);
    composer.setPixelRatio(pr); composer.setSize(360, 640);
    bgMat.uniforms.uRes.value.set(360 * pr, 640 * pr);
    camera.aspect = 360 / 640; camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize); resize();

  let tNow = 0, playing = !RENDER, last = performance.now();
  function draw(t) { tNow = t; update(t); composer.render(); }
  window.__render = t => draw(t);
  window.__duration = DURATION;
  if (!RENDER) {
    addEventListener('keydown', e => {
      if (e.code === 'Space') playing = !playing;
      if (e.code === 'ArrowRight') tNow = Math.min(DURATION, tNow + 1);
      if (e.code === 'ArrowLeft') tNow = Math.max(0, tNow - 1);
    });
    addEventListener('click', () => { playing = !playing; });
    const loop = now => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (playing) tNow = (tNow + dt) % DURATION;
      draw(tNow); requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  const fontsWanted = ['700 35px "Barlow Condensed"', '600 19.5px "Barlow Condensed"', '700 41px "Barlow Condensed"', '500 8px "IBM Plex Mono"', '600 10px "IBM Plex Mono"', '600 31px "IBM Plex Mono"'];
  Promise.all(fontsWanted.map(f => document.fonts.load(f))).then(() => document.fonts.ready).then(() => {
    draw(0);
    requestAnimationFrame(() => { window.__ready = true; });
  });
})();

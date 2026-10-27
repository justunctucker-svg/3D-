/* Refueling in Orbit · NovexDynamics
   Procedural Three.js (r128) scene. Everything on screen is a pure function of the time t (0–30 s):
   window.__render(t) draws one frame, window.__ready turns true once fonts and the first frame are done.
   Units are metres; y is up (the local vertical). In orbit two generic, unmarked ships dock nose to nose along the x axis
   at the origin: the tanker on the -x side (nose toward +x), the lander on the +x side (nose toward -x). The launch pad
   reuses the origin with the orbit dressing hidden. Earth, sky, stars and the Moon are drawn analytically in the
   background shader from the camera altitude. The hook (0–2 s) and the last 0.4 s share one clock, so the last frame
   runs straight into the first. Every readout is illustrative. */
(() => {
  'use strict';
  const T = THREE, PI = Math.PI, TAU = PI * 2;
  const DURATION = 30, R_EARTH = 6.371e6;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const smooth = k => { k = clamp(k); return k * k * (3 - 2 * k); };
  const span = (t, a, b) => clamp((t - a) / (b - a));
  const pulse = (t, a, b, c, d) => smooth(span(t, a, b)) * (1 - smooth(span(t, c, d)));
  const rand = (i, j) => { const x = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return x - Math.floor(x); };
  const RENDER = new URLSearchParams(location.search).has('render');
  const V3 = (x, y, z) => new T.Vector3(x, y, z);
  const deg = d => d * PI / 180;
  const easeOut = k => 1 - (1 - clamp(k)) * (1 - clamp(k));

  // ---------------------------------------------------------------- page frame + renderer
  const frameEl = document.getElementById('frame'), stage = document.getElementById('stage');
  const renderer = new T.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.autoClear = false;
  stage.appendChild(renderer.domElement);
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(36, 360 / 640, 0.5, 400000);
  const HAZE = new T.Color(0.55, 0.64, 0.76), NAVY = new T.Color(0.006, 0.014, 0.034);
  scene.fog = new T.Fog(HAZE.clone(), 3000, 40000);
  const rtOpts = { minFilter: T.LinearFilter, magFilter: T.LinearFilter, format: T.RGBAFormat, type: T.HalfFloatType };
  let rt;
  if (renderer.capabilities.isWebGL2) { rt = new T.WebGLMultisampleRenderTarget(360, 640, rtOpts); rt.samples = 4; }
  else rt = new T.WebGLRenderTarget(360, 640, Object.assign(rtOpts, { type: T.UnsignedByteType }));
  const composer = new T.EffectComposer(renderer, rt);

  // ---------------------------------------------------------------- environment maps (orbit: black sky over a blue Earth; pad: daylight) + lights
  const SUN_DIR = V3(-0.5, 0.45, 0.74).normalize();
  const MOON_DIR = V3(Math.sin(deg(216)) * Math.cos(deg(-5)), Math.sin(deg(-5)), Math.cos(deg(216)) * Math.cos(deg(-5))).normalize();   // below the local horizontal, still well above Earth's limb; just right of the final view
  const envMap = (top, band, ground) => {
    const env = new T.Scene(), basic = c => new T.MeshBasicMaterial({ color: c, side: T.DoubleSide });
    env.add(new T.Mesh(new T.SphereGeometry(50, 32, 16), new T.MeshBasicMaterial({ color: top, side: T.BackSide })));
    const b = new T.Mesh(new T.CylinderGeometry(48, 48, 10, 32, 1, true), basic(band)); b.position.y = -4; env.add(b);
    const g = new T.Mesh(new T.CircleGeometry(49, 32), basic(ground)); g.rotation.x = -PI / 2; g.position.y = -9; env.add(g);
    const sp = new T.Mesh(new T.PlaneGeometry(8, 8), basic(new T.Color(14, 13, 12))); sp.position.copy(SUN_DIR).multiplyScalar(40); sp.lookAt(0, 0, 0); env.add(sp);
    return new T.PMREMGenerator(renderer).fromScene(env, 0.03).texture;
  };
  const ENV_ORBIT = envMap(new T.Color(0.004, 0.005, 0.01), new T.Color(0.2, 0.36, 0.7), new T.Color(0.06, 0.12, 0.26));
  const ENV_PAD = envMap(new T.Color(0.3, 0.45, 0.7), new T.Color(0.62, 0.68, 0.76), new T.Color(0.28, 0.24, 0.2));
  const sun = new T.DirectionalLight(0xfff3e4, 2.6);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 600 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04; sun.shadow.radius = 2;
  scene.add(sun, sun.target);
  const hemi = new T.HemisphereLight(0x0a0c12, 0x2c4c86, 0.7); scene.add(hemi);
  const rim = new T.DirectionalLight(0x7fd8ff, 0); rim.position.set(0, 1, 1); scene.add(rim);
  const flameLight = new T.PointLight(0xffa860, 0, 400, 1.6); scene.add(flameLight);

  // ---------------------------------------------------------------- sky / Earth / stars / Moon (analytic, from the camera altitude) + X-ray grid
  const NOISE = `
    float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
                 mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
    float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * n3(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }`;
  const bgMat = new T.ShaderMaterial({
    uniforms: { uX: { value: 0 }, uAlt: { value: 400000 }, uRes: { value: new T.Vector2(1080, 1920) }, uInvProj: { value: new T.Matrix4() }, uCamWorld: { value: new T.Matrix4() }, uSun: { value: SUN_DIR.clone() }, uMoon: { value: MOON_DIR.clone() } },
    vertexShader: 'varying vec2 vNdc; void main(){ vNdc = position.xy; gl_Position = vec4(position.xy, 0.9999, 1.0); }',
    fragmentShader: NOISE + `
      varying vec2 vNdc; uniform float uX; uniform float uAlt; uniform vec2 uRes; uniform mat4 uInvProj; uniform mat4 uCamWorld; uniform vec3 uSun; uniform vec3 uMoon;
      void main(){
        vec4 v = uInvProj * vec4(vNdc, 1.0, 1.0);
        vec3 d = normalize((uCamWorld * vec4(v.xyz / v.w, 0.0)).xyz);
        float hn = uAlt / ${R_EARTH.toFixed(1)};
        float c = 2.0 * hn + hn * hn;                       // |P|^2 - 1 with P = (0, 1 + hn, 0), in Earth radii
        float b = (1.0 + hn) * d.y;
        float disc = b * b - c;
        float A = exp(-uAlt / 8000.0);                      // air density at the camera, 1 at sea level
        float horizonY = -sqrt(c) / (1.0 + hn);
        float rel = asin(clamp(d.y, -1.0, 1.0)) - asin(clamp(horizonY, -1.0, 1.0));
        vec2 hz = normalize(d.xz + 1e-6);
        float sunSide = 0.5 + 0.5 * dot(hz, normalize(uSun.xz));
        // sky: pale blue near the ground; from orbit black with a thin glowing limb, brighter on the sunlit side
        vec3 low = mix(vec3(0.5, 0.62, 0.78), vec3(0.06, 0.15, 0.4), smoothstep(0.0, 0.62, rel));
        float rp = max(rel, 0.0);
        vec3 space = vec3(0.0006, 0.0008, 0.0022) + vec3(0.05, 0.16, 0.5) * exp(-rp / 0.05) * (0.3 + 0.7 * sunSide)
                   + vec3(0.3, 0.55, 1.05) * exp(-rp / 0.009) * (0.45 + 0.95 * sunSide);
        float k = smoothstep(0.0, 1.0, pow(A, 0.35));
        vec3 sky = mix(space, low, k);
        float sd = max(dot(d, uSun), 0.0);
        sky += vec3(1.0, 0.92, 0.8) * (pow(sd, 900.0) * 30.0 + pow(sd, 12.0) * 0.1 * (0.25 + 0.75 * k));
        // stars, only where the air is thin
        vec3 sg = d * 420.0, sc = floor(sg); float st = h3(sc);
        vec3 sj = vec3(h3(sc + 11.0), h3(sc + 23.0), h3(sc + 37.0)) * 0.6 + 0.2;
        float sr = length(fract(sg) - sj);
        sky += vec3(0.9, 0.95, 1.0) * step(0.9935, st) * (0.3 + (st - 0.9935) * 110.0) * (1.0 - smoothstep(0.0, 0.18, sr)) * (1.0 - smoothstep(0.0005, 0.02, A)) * step(0.0, rel);
        // the Moon: a small sunlit sphere
        float md = dot(d, uMoon), mr = 0.0165;
        if (md > cos(mr) && rel > 0.0) {
          vec3 mx = normalize(cross(uMoon, vec3(0.0, 1.0, 0.0))), my = cross(mx, uMoon);
          vec2 q = vec2(dot(d, mx), dot(d, my)) / sin(mr); float qq = min(dot(q, q), 1.0);
          vec3 n = normalize(q.x * mx + q.y * my - sqrt(1.0 - qq) * uMoon);
          float lit = smoothstep(-0.05, 0.25, dot(n, uSun));
          float mare = fbm(n * 3.2 + 4.0);
          vec3 mc = vec3(0.7, 0.68, 0.64) * (0.62 + 0.55 * smoothstep(0.35, 0.65, mare)) * lit * 1.15;
          sky = mix(sky, mc + vec3(0.003, 0.004, 0.007), 1.0 - smoothstep(0.93, 1.0, qq));
        }
        vec3 col = sky;
        if (disc > 0.0 && b < 0.0) {
          float tt = -b - sqrt(disc);
          vec3 pn = normalize(vec3(0.0, 1.0 + hn, 0.0) + d * tt);
          // from high up: oceans, land and cloud decks; low down: dusty ground fading into haze
          float cont = fbm(pn * 7.0 + vec3(1.3, 2.1, 0.7));
          float land = smoothstep(0.5, 0.55, cont);
          vec3 g = mix(vec3(0.01, 0.04, 0.11), mix(vec3(0.11, 0.12, 0.06), vec3(0.21, 0.17, 0.11), n3(pn * 60.0)), land);
          float cl = smoothstep(0.48, 0.7, fbm(pn * 22.0 + vec3(4.0)) * 0.72 + n3(pn * 90.0) * 0.28);
          g = mix(g, vec3(0.78, 0.81, 0.86), cl * 0.9);
          float sunUp = dot(pn, uSun);
          g *= smoothstep(-0.12, 0.2, sunUp) * (0.3 + 0.8 * max(sunUp, 0.0));
          float graze = 1.0 - abs(dot(d, pn)); graze = graze * graze * graze;
          vec3 atm = vec3(0.16, 0.34, 0.8) * (0.25 + 0.75 * smoothstep(-0.1, 0.4, sunUp)) * (0.6 + 0.6 * sunSide);
          g = mix(g, atm, clamp(graze * 1.1, 0.0, 0.92));
          float n = n3(pn * 9000.0) * 0.6 + n3(pn * 30000.0) * 0.4;
          vec3 dusty = mix(vec3(0.36, 0.3, 0.22), vec3(0.47, 0.4, 0.3), n) * (0.55 + 0.45 * max(dot(pn, uSun), 0.0));
          float dist = tt * ${R_EARTH.toFixed(1)};
          dusty = mix(dusty, vec3(0.55, 0.64, 0.76), 1.0 - exp(-dist / 26000.0));
          col = mix(g, dusty, k);
        }
        vec2 cc = gl_FragCoord.xy / uRes - 0.5; cc.x *= uRes.x / uRes.y; float r = length(cc);
        vec3 xr = mix(vec3(0.010, 0.022, 0.050), vec3(0.002, 0.006, 0.016), smoothstep(0.05, 0.85, r));
        float px = 1.0 / (uRes.x / 9.0);
        vec2 gg = gl_FragCoord.xy / (uRes.x / 9.0); vec2 f = abs(fract(gg + 0.5) - 0.5);
        float major = 1.0 - smoothstep(px * 0.6, px * 1.8, min(f.x, f.y));
        vec2 f2 = abs(fract(gg * 4.0 + 0.5) - 0.5);
        float minor = 1.0 - smoothstep(px * 2.0, px * 5.5, min(f2.x, f2.y));
        xr += vec3(0.010, 0.032, 0.070) * major * (1.0 - 0.6 * smoothstep(0.2, 0.9, r));
        xr += vec3(0.004, 0.012, 0.026) * minor * (1.0 - smoothstep(0.2, 0.9, r));
        gl_FragColor = vec4(mix(col, xr, uX), 1.0);
      }`,
    depthWrite: false, depthTest: false
  });
  const bg = new T.Mesh(new T.PlaneGeometry(2, 2), bgMat); bg.frustumCulled = false; bg.renderOrder = -10; scene.add(bg);
  const flashMat = new T.ShaderMaterial({
    uniforms: { uAmt: { value: 0 }, uCol: { value: new T.Color(0.75, 0.85, 1.0) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'varying vec2 vUv; uniform float uAmt; uniform vec3 uCol; void main(){ float v = 1.0 - 0.6 * length(vUv - vec2(0.5, 0.45)); gl_FragColor = vec4(uCol * uAmt * v, 1.0); }',
    transparent: true, depthWrite: false, depthTest: false, blending: T.AdditiveBlending
  });
  const flash = new T.Mesh(new T.PlaneGeometry(2, 2), flashMat); flash.frustumCulled = false; flash.renderOrder = 100; scene.add(flash);

  // ---------------------------------------------------------------- helpers + materials
  const lathe = (pts, seg = 64) => new T.LatheGeometry(pts.map(([r, y]) => new T.Vector2(r, y)), seg);
  const canvasTex = (w, h, draw, srgb = true) => {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h);
    const t = new T.CanvasTexture(cv); t.wrapS = t.wrapT = T.RepeatWrapping; if (srgb) t.encoding = T.sRGBEncoding; t.anisotropy = 4; return t;
  };
  const std = (color, metalness, roughness, extra = {}) => { const m = new T.MeshStandardMaterial(Object.assign({ color, metalness, roughness }, extra)); m.color.convertSRGBToLinear(); return m; };
  const box = (w, h, d, x = 0, y = 0, z = 0) => new T.BoxGeometry(w, h, d).translate(x, y, z);
  // hull skins: u runs around the hull (u = 0 faces local +z), v runs along it (canvas top = far end)
  const skin = (base, seams, rings, extra) => canvasTex(512, 1024, (x, w, h) => {
    x.fillStyle = base; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) { x.fillStyle = rand(i, 3) < 0.5 ? 'rgba(0,0,0,0.035)' : 'rgba(255,255,255,0.035)'; x.fillRect(rand(i, 1) * w, rand(i, 2) * h, 1 + rand(i, 4) * 3, 8 + rand(i, 5) * 60); }
    x.fillStyle = seams; for (let i = 1; i < rings; i++) x.fillRect(0, h * i / rings - 1, w, 2);
    for (let i = 0; i < 8; i++) x.fillRect(w * (i + 0.5) / 8, 0, 1.5, h);
    if (extra) extra(x, w, h);
  });
  const landerSkin = skin('#e6e8eb', 'rgba(90,96,104,0.55)', 11, (x, w, h) => { x.fillStyle = '#17191d'; x.fillRect(0, h * (1 - 0.14), w, h * 0.14); });
  const landerNoseSkin = skin('#e6e8eb', 'rgba(90,96,104,0.5)', 4, (x, w, h) => {
    x.fillStyle = '#17191d'; x.fillRect(0, h * (1 - 0.36), w, h * 0.13);
    for (let i = -3; i <= 3; i++) { const u = ((i * 0.035) % 1 + 1) % 1; x.fillStyle = '#07090c'; x.fillRect(u * w - 6, h * (1 - 0.34), 12, h * 0.09); x.fillStyle = 'rgba(140,170,210,0.35)'; x.fillRect(u * w - 5, h * (1 - 0.34) + 2, 3, h * 0.03); }
  });
  const tankerSkin = skin('#b4b9bf', 'rgba(60,64,70,0.6)', 11, (x, w, h) => { x.fillStyle = '#1b1d21'; x.fillRect(0, h * (1 - 0.07), w, h * 0.07); x.fillStyle = 'rgba(30,32,36,0.85)'; x.fillRect(0, h * 0.42, w, h * 0.025); });
  const tankerNoseSkin = skin('#b4b9bf', 'rgba(60,64,70,0.55)', 4);
  const landerM = std(0xffffff, 0.08, 0.52, { map: landerSkin }), landerNoseM = std(0xffffff, 0.08, 0.5, { map: landerNoseSkin });
  const tankerM = std(0xffffff, 0.86, 0.32, { map: tankerSkin, envMapIntensity: 1.3 }), tankerNoseM = std(0xffffff, 0.86, 0.3, { map: tankerNoseSkin, envMapIntensity: 1.3 });
  const darkM = std(0x15171b, 0.3, 0.72), collarM = std(0x9aa1a9, 0.85, 0.3), bellM = std(0x2a2c30, 0.8, 0.42, { side: T.DoubleSide });
  const bellIn = std(0x3a2a22, 0.7, 0.5, { side: T.BackSide, emissive: new T.Color(1.0, 0.45, 0.15), emissiveIntensity: 0 });
  const podM = std(0x30343a, 0.5, 0.5), legM = std(0x3a3e45, 0.6, 0.45), radM = std(0x1d2a3a, 0.4, 0.35);
  const boosterSkin = canvasTex(512, 1024, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#3a3e44'); g.addColorStop(0.75, '#2b2e33'); g.addColorStop(1, '#141517'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 3000; i++) { x.fillStyle = rand(i, 13) < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.03)'; x.fillRect(rand(i, 11) * w, rand(i, 12) * h, 1 + rand(i, 14) * 3, 10 + rand(i, 15) * 50); }
    x.fillStyle = 'rgba(0,0,0,0.4)'; for (let i = 1; i < 14; i++) x.fillRect(0, h * i / 14, w, 2);
    x.fillStyle = 'rgba(200,205,212,0.5)'; x.fillRect(0, h * 0.04, w, h * 0.012);
  });
  const boosterM = std(0xffffff, 0.55, 0.55, { map: boosterSkin });
  // X-ray glass
  const xrayMats = [];
  function xrayMat(color, fill, power, gain = 1) {
    const m = new T.ShaderMaterial({
      uniforms: { uColor: { value: new T.Color(color).convertSRGBToLinear() }, uOpacity: { value: 0 }, uFill: { value: fill }, uPow: { value: power }, uGain: { value: gain } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec3 vN; varying vec3 vV; uniform vec3 uColor; uniform float uOpacity; uniform float uFill; uniform float uPow; uniform float uGain; void main(){ float f = pow(max(1.0 - abs(dot(normalize(vN), normalize(vV))), 0.0), uPow); gl_FragColor = vec4(uColor * uGain, (f * 0.75 + uFill) * uOpacity); }',
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide
    });
    xrayMats.push(m); return m;
  }
  const xShell = xrayMat(0x5fd8ff, 0.01, 2.6, 0.5);
  const xParts = xrayMat(0x5fd8ff, 0.03, 1.8, 0.55);
  const xTank = xrayMat(0x8fe6ff, 0.035, 1.6, 0.75);
  const shells = [];
  const fadeMats = [landerM, landerNoseM, tankerM, tankerNoseM, darkM, collarM, bellM, legM, radM];
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

  // ---------------------------------------------------------------- launch site: flat ground, pad, launch mount, tower (pad shots only)
  const padWorld = new T.Group(); scene.add(padWorld);
  const groundTex = canvasTex(1024, 1024, (x, w, h) => {
    x.fillStyle = '#8a7a64'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 500; i++) { x.fillStyle = `rgba(${rand(i, 1) < 0.5 ? '70,60,48' : '160,148,128'},${0.06 + rand(i, 2) * 0.1})`; x.beginPath(); x.ellipse(rand(i, 3) * w, rand(i, 4) * h, 20 + rand(i, 5) * 90, 10 + rand(i, 6) * 40, rand(i, 7) * PI, 0, TAU); x.fill(); }
    for (let i = 0; i < 16000; i++) { x.fillStyle = rand(i, 8) < 0.5 ? 'rgba(50,42,32,0.3)' : 'rgba(190,180,160,0.25)'; x.fillRect(rand(i, 10) * w, rand(i, 11) * h, 1 + rand(i, 12) * 2, 1 + rand(i, 13) * 2); }
  });
  groundTex.repeat.set(400, 400);
  const ground = new T.Mesh(new T.PlaneGeometry(60000, 60000).rotateX(-PI / 2), std(0xffffff, 0, 0.95, { map: groundTex, envMapIntensity: 0.4 })); ground.receiveShadow = true; padWorld.add(ground);
  const concreteM = std(0xa7a49c, 0, 0.9), steelM = std(0x6d727a, 0.75, 0.45), sootM = std(0x26282b, 0.2, 0.9);
  solid(new T.CylinderGeometry(34, 36, 1.2, 8).translate(0, 0.6, 0), concreteM, padWorld);
  solid(new T.CylinderGeometry(14, 14, 0.25, 32).translate(0, 1.25, 0), sootM, padWorld);
  const MOUNT = 13;                                   // the booster's engine exits sit this high above the ground
  solid(new T.CylinderGeometry(7.2, 7.2, 2.2, 32, 1, true).translate(0, MOUNT - 1.1, 0), steelM, padWorld).material.side = T.DoubleSide;
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.26; solid(box(1.6, MOUNT - 2, 1.6, Math.cos(a) * 6.4, (MOUNT - 2) / 2 + 1, Math.sin(a) * 6.4), steelM, padWorld); }
  // tower: four columns, ring beams and cross-bracing, with an arm reaching to the ship
  const TOWER = V3(-19, 0, -8), TW = 8, TH = 128;
  const towerM = std(0x3d4148, 0.6, 0.6);
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sz]) => solid(box(1.0, TH, 1.0, TOWER.x + sx * TW / 2, TH / 2, TOWER.z + sz * TW / 2), towerM, padWorld));
  for (let y = 8; y < TH; y += 9) {
    solid(box(TW, 0.6, 0.6, TOWER.x, y, TOWER.z - TW / 2), towerM, padWorld); solid(box(TW, 0.6, 0.6, TOWER.x, y, TOWER.z + TW / 2), towerM, padWorld);
    solid(box(0.6, 0.6, TW, TOWER.x - TW / 2, y, TOWER.z), towerM, padWorld); solid(box(0.6, 0.6, TW, TOWER.x + TW / 2, y, TOWER.z), towerM, padWorld);
    const L = Math.hypot(TW, 9);
    [-1, 1].forEach(s => {
      const br = solid(box(0.35, L, 0.35), towerM, padWorld); br.position.set(TOWER.x, y + 4.5, TOWER.z + s * TW / 2); br.rotation.z = Math.atan2(TW, 9) * (s > 0 ? 1 : -1);
      const br2 = solid(box(0.35, L, 0.35), towerM, padWorld); br2.position.set(TOWER.x + s * TW / 2, y + 4.5, TOWER.z); br2.rotation.x = Math.atan2(TW, 9) * (s > 0 ? -1 : 1);
    });
  }
  const arm = solid(box(15, 2.2, 3.2), towerM, padWorld); arm.position.set(TOWER.x + 11.5, 112, TOWER.z + 3);
  solid(box(1.4, 1.4, 1.4, TOWER.x, TH + 0.7, TOWER.z), std(0xff3030, 0, 0.5, { emissive: new T.Color(1, 0.1, 0.05), emissiveIntensity: 0.6 }), padWorld);
  // launch plume splashing on the pad
  const splashTex = canvasTex(256, 256, (x, w, h) => { const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); g.addColorStop(0, 'rgba(255,235,190,1)'); g.addColorStop(0.25, 'rgba(255,160,70,0.7)'); g.addColorStop(0.6, 'rgba(255,110,40,0.18)'); g.addColorStop(1, 'rgba(255,90,30,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
  const splashMat = new T.MeshBasicMaterial({ map: splashTex, color: new T.Color(2.2, 1.6, 1.1), transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false });
  const splash = new T.Mesh(new T.PlaneGeometry(70, 70).rotateX(-PI / 2), splashMat); splash.position.y = 1.5; splash.renderOrder = 6; padWorld.add(splash);

  // ---------------------------------------------------------------- the ships (local: y along the axis, y = 0 at the engine exits, docking face at SHIP_L)
  const SHIP_L = 40.9, HR = 4.5;
  const TR = 4.0, TY0 = 8.0, TY1 = 28.0, TD = 1.8;     // propellant tank: radius, cylinder ends, dome depth
  const TBOT = TY0 - TD, TTOP = TY1 + TD;
  const rows = (a, b, n, r) => [...Array(n + 1)].map((_, i) => [r, a + (b - a) * i / n]);
  const bodyGeo = lathe(rows(2.6, 31.0, 28, HR), 72);
  const noseGeo = lathe([...Array(19)].map((_, i) => { const s = i / 18; return [1.36 + (HR - 1.36) * Math.pow(1 - s * s, 0.75), 31.0 + 9.2 * s]; }), 72);
  const collarGeo = lathe([[1.36, 40.15], [1.4, 40.25], [1.4, 40.7], [1.24, SHIP_L], [0.0, SHIP_L]], 48);
  const skirtGeo = lathe([[HR - 0.35, 2.4], [HR, 2.62]], 72);
  const bellGeo = lathe([[0.42, 2.45], [0.5, 2.1], [0.85, 1.2], [1.12, 0.35], [1.2, 0.0]], 32);
  const bellInGeo = lathe([[0.4, 2.4], [0.82, 1.2], [1.1, 0.3], [1.17, 0.02]], 32);
  const tankWallGeo = lathe([[0, TBOT], ...[...Array(9)].map((_, i) => { const a = (i + 1) / 9 * PI / 2; return [TR * Math.sin(a), TY0 - TD * Math.cos(a)]; }), [TR, TY1], ...[...Array(9)].map((_, i) => { const a = (i + 1) / 9 * PI / 2; return [TR * Math.cos(a), TY1 + TD * Math.sin(a)]; })], 48);
  const ENG = [0, 1, 2].map(i => { const a = PI / 2 + i * TAU / 3; return V3(Math.cos(a) * 1.75, 0, Math.sin(a) * 1.75); });
  // thruster nozzles (local): aft pods fire aft (the settling push) and outward; nose pods fire forward and outward
  const POD_A = [45, 135, 225, 315].map(d => deg(d));
  const RCS = [];
  POD_A.forEach(a => { const c = Math.cos(a), s = Math.sin(a); RCS.push({ p: V3(s * (HR + 0.35), 4.0, c * (HR + 0.35)), d: V3(0, -1, 0), g: 'aft' }); });
  POD_A.forEach(a => { const c = Math.cos(a), s = Math.sin(a); RCS.push({ p: V3(s * (HR + 0.75), 5.0, c * (HR + 0.75)), d: V3(s, 0, c), g: 'aftOut' }); });
  POD_A.forEach(a => { const c = Math.cos(a), s = Math.sin(a); RCS.push({ p: V3(s * 3.2, 37.6, c * 3.2), d: V3(s * 0.35, 1, c * 0.35).normalize(), g: 'nose' }); });
  // boil-off vents (local position + outward direction)
  const VENTS = [{ p: V3(0, 30.5, HR + 0.1), d: V3(0.15, 0.2, 1).normalize() }, { p: V3(HR * 0.7, 9, -HR * 0.72), d: V3(0.7, -0.1, -0.7).normalize() }, { p: V3(0.6, SHIP_L - 0.4, 1.1), d: V3(0.3, 0.1, 1).normalize() }];

  function makeShip(kind, simple) {
    const lander = kind === 'lander';
    const root = new T.Group(); scene.add(root);
    const body = new T.Group(); root.add(body);
    part(bodyGeo, lander ? landerM : tankerM, xShell, body);
    part(noseGeo, lander ? landerNoseM : tankerNoseM, xShell, body);
    part(collarGeo, collarM, xParts, body);
    part(skirtGeo, darkM, xShell, body);
    part(new T.CircleGeometry(HR - 0.35, 48).rotateX(PI / 2).translate(0, 2.4, 0), darkM, xShell, body);
    const glowMat = new T.MeshBasicMaterial({ color: new T.Color(0.6, 1.5, 2.2), transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false });
    const seal = new T.Mesh(new T.TorusGeometry(1.46, 0.09, 10, 48).rotateX(PI / 2).translate(0, SHIP_L - 0.25, 0), glowMat); seal.renderOrder = 8; body.add(seal);
    const bells = ENG.map(p => { const g = new T.Group(); g.position.copy(p); body.add(g); part(bellGeo, bellM, xParts, g); const im = bellIn.clone(); fadeMats.push(im); solid(bellInGeo, im, g); return im; });
    POD_A.forEach(a => {
      [4.6, 37.2].forEach((y, j) => {
        const r = j ? 3.25 : HR + 0.3, pod = solid(box(0.9, 1.4, 0.9), podM, body);
        pod.position.set(Math.sin(a) * r, y, Math.cos(a) * r); pod.rotation.y = a;
      });
    });
    if (lander) {
      POD_A.forEach(a => {      // folded landing legs and their foot pads
        const g = new T.Group(); g.rotation.y = a + PI / 4; body.add(g);
        part(box(0.8, 8.5, 0.55, 0, 6.6, HR + 0.32), legM, xParts, g);
        part(new T.CylinderGeometry(0.95, 1.05, 0.35, 20).translate(0, 1.95, HR + 0.5), legM, xParts, g);
      });
    } else {
      [-1, 1].forEach(s => part(box(0.18, 11, 3.6, s * (HR + 0.12), 19, 0), radM, xParts, body));   // radiator panels
    }
    const ship = { kind, root, body, bells, glowMat, inside: null };
    if (simple) return ship;

    // inside (X-ray only): the tank, the fuel line and its pickup or inlet, the liquid
    const inside = new T.Group(); body.add(inside); inside.visible = false; ship.inside = inside;
    const wall = new T.Mesh(tankWallGeo, xTank); wall.renderOrder = 5; inside.add(wall);
    const pipeM = std(0x8b939c, 0.7, 0.4);
    const linePts = lander
      ? [V3(0, SHIP_L - 0.1, 0), V3(0, SHIP_L - 2, 0.15), V3(0, 36, 0.2), V3(0, TTOP + 0.4, 0.05)]
      : [V3(0, TBOT + 0.1, 0), V3(0, TBOT - 0.9, 0), V3(1.7, TBOT - 1.5, 0.2), V3(4.15, 6.2, 0), V3(4.25, 10, 0), V3(4.25, 20, 0), V3(4.25, 30, 0), V3(3.6, 33.5, 0), V3(2.2, 37.5, 0), V3(0.8, 39.6, 0), V3(0, SHIP_L - 0.1, 0)];
    const curve = new T.CatmullRomCurve3(linePts), len = curve.getLength();
    const flowM = new T.ShaderMaterial({
      uniforms: { uFlow: { value: 0 }, uTime: { value: 0 }, uK: { value: len / 2.2 } },
      vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; uniform float uFlow; uniform float uTime; uniform float uK; void main(){ float sh = 0.55 + 0.45 * abs(dot(normalize(vN), normalize(vV))); float s = smoothstep(0.35, 0.9, fract(vUv.x * uK - uTime * 3.0)); gl_FragColor = vec4(vec3(0.42, 0.5, 0.58) * sh * 0.7 + vec3(0.75, 1.15, 1.5) * (0.35 + 0.65 * s) * uFlow * sh, 1.0); }'
    });
    solid(new T.TubeGeometry(curve, 160, 0.32, 10, false), flowM, inside);
    ship.flowM = flowM; ship.curve = curve;
    if (!lander) {
      // the pickup: a funnel with a screen at the bottom of the tank, and the valve below it
      solid(lathe([[0.36, TBOT + 0.05], [0.4, TBOT + 0.5], [1.15, TBOT + 1.25], [1.2, TBOT + 1.35]], 32), pipeM, inside).material.side = T.DoubleSide;
      const scr = new T.Mesh(new T.CircleGeometry(1.15, 32).rotateX(-PI / 2).translate(0, TBOT + 1.3, 0), new T.MeshBasicMaterial({ color: new T.Color(0.5, 0.6, 0.7), wireframe: true })); inside.add(scr);
      const vm = new T.MeshBasicMaterial({ color: new T.Color(0.6, 0.06, 0.05), toneMapped: false });
      const vg = new T.Group(); vg.position.copy(curve.getPoint(0.06)); inside.add(vg);
      solid(box(1.1, 1.0, 1.0), std(0x5c6168, 0.7, 0.4), vg); solid(new T.TorusGeometry(0.5, 0.12, 8, 24).rotateY(PI / 2).translate(0.62, 0, 0), vm, vg);
      ship.valveM = vm; ship.valve = vg;
    }
    return ship;
  }
  const tanker = makeShip('tanker'), lander = makeShip('lander'), farTanker = makeShip('tanker', true);
  farTanker.body.traverse(o => { if (o.isMesh) o.castShadow = false; });

  // ---------------------------------------------------------------- booster (local: y = 0 at the engine exits; the ship sits on top)
  const B_TOP = 66.5, B_SHIP = 64.0;
  const booster = new T.Group(); scene.add(booster);
  solid(lathe(rows(2.6, 62, 28, HR), 64), boosterM, booster);
  solid(lathe([[HR, 62], [HR, B_TOP], [HR - 0.2, B_TOP + 0.05]], 64), darkM, booster);
  solid(new T.CircleGeometry(HR - 0.2, 48).rotateX(PI / 2).translate(0, 2.6, 0), darkM, booster);
  [[0, 0]].concat([...Array(8)].map((_, i) => [Math.cos(i / 8 * TAU) * 3.0, Math.sin(i / 8 * TAU) * 3.0])).forEach(([x, z]) => { const g = new T.Group(); g.position.set(x, 0.3, z); booster.add(g); solid(bellGeo, bellM, g).scale.set(0.95, 1, 0.95); });
  [0, 1, 2, 3].forEach(i => { const a = i / 4 * TAU + PI / 4; const f = solid(box(0.3, 3.2, 3.6), towerM, booster); f.position.set(Math.cos(a) * (HR + 1.6), 63.4, Math.sin(a) * (HR + 1.6)); f.rotation.y = -a; });

  // ---------------------------------------------------------------- engine plumes (sea level: hot and orange; vacuum: wide, soft, pale blue)
  const plumeMat = (tint, gain, vac, len) => new T.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uAmt: { value: 0 }, uLen: { value: len }, uTint: { value: tint }, uGain: { value: gain }, uVac: { value: vac } },
    vertexShader: 'varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vP = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: NOISE + `varying vec3 vP; varying vec3 vN; varying vec3 vV; uniform float uTime; uniform float uAmt; uniform float uLen; uniform vec3 uTint; uniform float uGain; uniform float uVac;
      void main(){
        float d = -vP.y, s = clamp(d / uLen, 0.0, 1.0), ang = atan(vP.z, vP.x);
        float n = fbm(vec3(ang * 3.0, vP.y * 0.3 + uTime * 9.0, length(vP.xz) * 0.5));
        float n2 = fbm(vec3(ang * 8.0, vP.y * 0.7 + uTime * 13.0, 2.0));
        vec3 col = mix(uTint, mix(vec3(1.0, 0.4, 0.1) * 1.2, vec3(0.45, 0.6, 1.0), uVac), smoothstep(0.3, 1.0, s));
        float facing = pow(abs(dot(normalize(vN), normalize(vV))), mix(1.1, 1.6, uVac));
        float a = smoothstep(0.0, 0.02, s) * (1.0 - smoothstep(0.5, 1.0, s)) * mix(0.2 + 1.1 * n * (0.5 + 0.9 * n2), (0.5 + 0.35 * n) * (1.0 - 0.6 * s), uVac);
        gl_FragColor = vec4(col, a * facing * uAmt * uGain);
      }`,
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide
  });
  const plumeShells = (parent, specs, len, vac, r0, spread) => specs.map(([k, c, g, a]) => {
    const pts = []; for (let i = 0; i <= 24; i++) { const d = (i / 24) * len; pts.push([vac ? r0 * k + spread * k * (1 - Math.exp(-d / (len * 0.22))) + d * 0.04 : r0 * k + d * 0.06 * k + 0.4 * Math.sin(d * 0.25) * Math.exp(-d * 0.04), -d]); }
    const m = plumeMat(new T.Color(c[0] * g, c[1] * g, c[2] * g), a, vac ? 1 : 0, len);
    const mesh = new T.Mesh(lathe(pts, 32), m); mesh.renderOrder = 9; parent.add(mesh); return m;
  });
  const bPlume = new T.Group(); bPlume.position.y = 0.3; booster.add(bPlume);
  const bPlumeMats = plumeShells(bPlume, [[1.0, [1.0, 0.36, 0.08], 2.6, 0.32], [0.7, [1.0, 0.6, 0.22], 3.0, 0.32], [0.4, [1.0, 0.9, 0.66], 4.0, 0.42]], 90, false, 4.4, 0);
  const shipPlume = s => { const g = new T.Group(); s.body.add(g); const mats = plumeShells(g, [[1.0, [0.6, 0.75, 1.0], 1.8, 0.07], [0.5, [0.95, 0.9, 0.85], 2.6, 0.13]], 60, true, 3.2, 7); return { g, mats }; };
  const lPlume = shipPlume(lander), tPlume = shipPlume(tanker);

  // ---------------------------------------------------------------- liquid (X-ray): a settled pool, floating blobs, a wall film, gas bubbles
  const liquidVS = `uniform float uTime; varying vec3 vN; varying vec3 vV;
    void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
  const liquidFS = `varying vec3 vN; varying vec3 vV;
    void main(){ vec3 n = normalize(vN), v = normalize(vV); float f = 1.0 - abs(dot(n, v));
      float l = 0.5 + 0.5 * max(dot(n, normalize(vec3(0.35, 0.8, 0.5))), 0.0);
      vec3 col = mix(vec3(0.16, 0.3, 0.48), vec3(0.56, 0.72, 0.88), l) * 0.9 + vec3(0.55, 0.78, 1.0) * f * f * 0.75;
      gl_FragColor = vec4(col, 1.0); }`;
  const poolM = new T.ShaderMaterial({ uniforms: { uTime: { value: 0 } }, vertexShader: liquidVS, fragmentShader: liquidFS, side: T.DoubleSide });
  // tank volume below a level h (measured from the bottom of the lower dome), tabulated so a fill fraction maps to a level
  const VOL = (() => {
    const n = 400, H = TTOP - TBOT, tab = [0];
    const area = y => { const yy = y + TBOT; let r; if (yy < TY0) r = TR * Math.sqrt(Math.max(0, 1 - Math.pow((TY0 - yy) / TD, 2))); else if (yy <= TY1) r = TR; else r = TR * Math.sqrt(Math.max(0, 1 - Math.pow((yy - TY1) / TD, 2))); return PI * r * r; };
    for (let i = 1; i <= n; i++) tab.push(tab[i - 1] + area((i - 0.5) / n * H) * H / n);
    return { H, n, tab, total: tab[n] };
  })();
  const levelAt = f => { const v = clamp(f) * VOL.total; let i = 0; while (i < VOL.n && VOL.tab[i + 1] < v) i++; const a = VOL.tab[i], b = VOL.tab[Math.min(VOL.n, i + 1)]; return (i + (b > a ? (v - a) / (b - a) : 0)) / VOL.n * VOL.H; };
  const radiusAt = y => (y < TY0 ? TR * Math.sqrt(Math.max(0, 1 - Math.pow((TY0 - y) / TD, 2))) : y <= TY1 ? TR : TR * Math.sqrt(Math.max(0, 1 - Math.pow((y - TY1) / TD, 2))));
  function makePool(ship, flip) {
    const g = new T.Group(); ship.inside.add(g);
    if (flip) { g.position.y = TBOT + TTOP; g.rotation.x = PI; }
    const mesh = new T.Mesh(new T.BufferGeometry(), poolM); mesh.renderOrder = 6; g.add(mesh);
    return { g, mesh, level: -1 };
  }
  // rebuild the pool as a lathe (dome + wall up to the surface), with a sloshing surface
  function setPool(pool, fill, slosh, t) {
    if (fill < 0.002) { pool.mesh.visible = false; return; }
    pool.mesh.visible = true;
    const yl = TBOT + levelAt(fill), pts = [[0.001, TBOT]];
    for (let i = 1; i <= 12; i++) { const y = TBOT + (yl - TBOT) * Math.min(1, Math.pow(i / 12, 1.6) * (yl > TY0 ? (TY0 - TBOT) / (yl - TBOT) : 1)); if (y >= yl - 1e-3) break; pts.push([radiusAt(y) * 0.985, y]); }
    if (yl > TY0) pts.push([TR * 0.985, TY0], [TR * 0.985, yl]); else pts.push([radiusAt(yl) * 0.985, yl]);
    const R0 = pts[pts.length - 1][0];
    for (let i = 1; i <= 6; i++) pts.push([R0 * (1 - i / 6) + 0.001 * (i === 6 ? 1 : 0), yl]);
    const geo = lathe(pts, 40), p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      if (Math.abs(p.getY(i) - yl) > 1e-4) continue;
      const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z) / Math.max(R0, 0.01);
      p.setY(i, yl + slosh * (0.55 * Math.sin(x * 0.9 + t * 3.1) + 0.35 * Math.sin(z * 1.3 - t * 2.3) + 0.25 * Math.sin((x + z) * 2.1 + t * 4.7)) * (0.35 + 0.65 * r));
    }
    geo.computeVertexNormals();
    pool.mesh.geometry.dispose(); pool.mesh.geometry = geo;
  }
  const tPool = makePool(tanker, false), lPool = makePool(lander, true);
  // floating blobs and droplets (instanced, wobbling)
  const NBLOB = 26;
  const blobGeo = new T.IcosahedronGeometry(1, 3);
  const blobIG = new T.InstancedBufferGeometry(); blobIG.index = blobGeo.index; blobIG.setAttribute('position', blobGeo.attributes.position); blobIG.setAttribute('normal', blobGeo.attributes.normal);
  const blobSeed = new T.InstancedBufferAttribute(new Float32Array(NBLOB), 1); blobIG.setAttribute('aSeed', blobSeed);
  const blobM = new T.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `attribute float aSeed; uniform float uTime; varying vec3 vN; varying vec3 vV;
      void main(){
        float s = aSeed * 17.0;
        vec3 p = position + normal * (0.09 * sin(2.3 * normal.x + uTime * 2.1 + s) + 0.07 * sin(3.1 * normal.y + uTime * 1.6 + s * 1.3) + 0.05 * sin(4.1 * normal.z + uTime * 2.7 + s * 0.7));
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
        vN = normalize(normalMatrix * mat3(instanceMatrix) * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: liquidFS
  });
  const blobs = new T.InstancedMesh(blobIG, blobM, NBLOB); blobs.instanceMatrix.setUsage(T.DynamicDrawUsage); blobs.frustumCulled = false; blobs.renderOrder = 6; tanker.inside.add(blobs);
  const BLOB = [...Array(NBLOB)].map((_, i) => {
    const big = i < 8, r = big ? 0.9 + 0.75 * rand(i, 1) : 0.18 + 0.3 * rand(i, 1);
    const a = rand(i, 2) * TAU, rr = Math.sqrt(rand(i, 3)) * (TR - r - 0.35);
    blobSeed.setX(i, rand(i, 9));
    return { r, big, home: V3(Math.cos(a) * rr, TY0 + 0.6 + r + rand(i, 4) * (TY1 - TY0 - 1.2 - 2 * r), Math.sin(a) * rr), ph: [rand(i, 5) * TAU, rand(i, 6) * TAU, rand(i, 7) * TAU], delay: rand(i, 8) * 0.9 };
  });
  const BLOB_VOL = BLOB.reduce((s, b) => s + b.r * b.r * b.r, 0);
  // the film of liquid clinging to the wall
  const filmM = new T.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFront: { value: TY1 }, uAmt: { value: 1 } },
    vertexShader: 'varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vP = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: NOISE + `varying vec3 vP; varying vec3 vN; varying vec3 vV; uniform float uTime; uniform float uFront; uniform float uAmt;
      void main(){
        float ang = atan(vP.z, vP.x);
        float n = fbm(vec3(cos(ang) * 1.6, sin(ang) * 1.6, vP.y * 0.32) + vec3(0.0, 0.0, uTime * 0.04));
        float cover = smoothstep(0.5, 0.56, n) * (1.0 - smoothstep(uFront - 1.5, uFront, vP.y)) * uAmt;
        if (cover < 0.04) discard;
        float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        vec3 col = vec3(0.42, 0.6, 0.8) * 0.85 + vec3(0.45, 0.68, 0.95) * f * 0.45;
        gl_FragColor = vec4(col, cover * 0.55);
      }`,
    transparent: true, depthWrite: false, side: T.DoubleSide
  });
  const film = new T.Mesh(new T.CylinderGeometry(TR - 0.08, TR - 0.08, TY1 - TY0, 48, 20, true).translate(0, (TY0 + TY1) / 2, 0), filmM); film.renderOrder = 7; tanker.inside.add(film);
  // gas bubbles: bright rims, empty middles
  const NBUB = 18;
  const bubM = new T.ShaderMaterial({
    uniforms: { uAmt: { value: 1 } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * mat3(instanceMatrix) * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying vec3 vN; varying vec3 vV; uniform float uAmt; void main(){ float f = 1.0 - abs(dot(normalize(vN), normalize(vV))); f = f * f; gl_FragColor = vec4(vec3(0.8, 1.0, 1.15) * (0.1 + 1.0 * f) * uAmt, 1.0); }',
    transparent: true, depthWrite: false, blending: T.AdditiveBlending
  });
  const bubbles = new T.InstancedMesh(new T.SphereGeometry(1, 20, 14), bubM, NBUB); bubbles.instanceMatrix.setUsage(T.DynamicDrawUsage); bubbles.frustumCulled = false; bubbles.renderOrder = 8; tanker.inside.add(bubbles);
  const BUB = [...Array(NBUB)].map((_, i) => ({ r: 0.3 + 0.45 * rand(i, 31), a: rand(i, 32) * TAU, rr: 0.5 + rand(i, 33) * 2.0, y: TBOT + 1.5 + rand(i, 34) * 3.0, ph: rand(i, 35) * TAU, d: rand(i, 36) * 0.6 }));

  // ---------------------------------------------------------------- particles: vapour/RCS puffs, launch smoke, glows, streaks
  function puffSystem(n, color, order = 7) {
    const g = new T.InstancedBufferGeometry(), base = new T.PlaneGeometry(1, 1);
    g.setIndex(base.index); g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
    const pos = new T.InstancedBufferAttribute(new Float32Array(n * 3), 3), dat = new T.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    pos.setUsage(T.DynamicDrawUsage); dat.setUsage(T.DynamicDrawUsage); g.setAttribute('aPos', pos); g.setAttribute('aDat', dat); g.instanceCount = n;
    const m = new T.ShaderMaterial({
      uniforms: { uBase: { value: color }, uWarm: { value: 0 } },
      vertexShader: `attribute vec3 aPos; attribute vec4 aDat; varying vec2 vUv; varying vec4 vDat;
        void main(){ vUv = uv; vDat = aDat;
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          float c = cos(aDat.w * 6.28), s = sin(aDat.w * 6.28); vec2 q = vec2(c * position.x - s * position.y, s * position.x + c * position.y);
          gl_Position = projectionMatrix * viewMatrix * vec4(aPos + (right * q.x + up * q.y) * aDat.x, 1.0); }`,
      fragmentShader: NOISE + `varying vec2 vUv; varying vec4 vDat; uniform vec3 uBase; uniform float uWarm;
        void main(){ vec2 c = vUv - 0.5; float r = length(c) * 2.0;
          float n = fbm(vec3(vUv * 3.0 + vDat.w * 10.0, vDat.w * 5.0));
          float a = clamp(1.0 - (r + (n - 0.5) * 0.7 - 0.25) / 0.75, 0.0, 1.0) * vDat.y;
          vec3 col = uBase * (0.78 + 0.45 * n) + vec3(1.0, 0.55, 0.2) * vDat.z * 2.0 * (1.0 - r * 0.6);
          gl_FragColor = vec4(col, a); }`,
      transparent: true, depthWrite: false
    });
    const mesh = new T.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = order; scene.add(mesh);
    let k = 0;
    return {
      mesh, m, reset() { k = 0; },
      push(p, size, alpha, seed, warm = 0) { if (k >= n || alpha < 0.003) return; pos.setXYZ(k, p.x, p.y, p.z); dat.setXYZW(k, size, alpha, warm, seed); k++; },
      done() { for (let i = k; i < n; i++) dat.setXYZW(i, 0, 0, 0, 0); pos.needsUpdate = dat.needsUpdate = true; }
    };
  }
  const puffs = puffSystem(520, new T.Color(0.9, 0.95, 1.0));
  const smoke = puffSystem(260, new T.Color(0.78, 0.76, 0.73), 6);
  function glowSystem(n) {
    const g = new T.InstancedBufferGeometry(), base = new T.PlaneGeometry(1, 1);
    g.setIndex(base.index); g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
    const pos = new T.InstancedBufferAttribute(new Float32Array(n * 3), 3), col = new T.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    pos.setUsage(T.DynamicDrawUsage); col.setUsage(T.DynamicDrawUsage); g.setAttribute('aPos', pos); g.setAttribute('aCol', col); g.instanceCount = n;
    const m = new T.ShaderMaterial({
      vertexShader: `attribute vec3 aPos; attribute vec4 aCol; varying vec2 vUv; varying vec4 vCol;
        void main(){ vUv = uv; vCol = aCol; vec4 mv = viewMatrix * vec4(aPos, 1.0); mv.xy += position.xy * aCol.a; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec2 vUv; varying vec4 vCol;
        void main(){ float r = length(vUv - 0.5) * 2.0; float a = exp(-r * r * 5.0) + 0.6 * exp(-r * r * 40.0); if (a < 0.004) discard; gl_FragColor = vec4(vCol.rgb * a, a); }`,
      transparent: true, depthWrite: false, blending: T.AdditiveBlending
    });
    const mesh = new T.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 9; scene.add(mesh);
    let k = 0;
    return {
      reset() { k = 0; },
      push(p, r, gr, b, size) { if (k >= n) return; pos.setXYZ(k, p.x, p.y, p.z); col.setXYZW(k, r, gr, b, size); k++; },
      done() { for (let i = k; i < n; i++) col.setXYZW(i, 0, 0, 0, 0); pos.needsUpdate = col.needsUpdate = true; }
    };
  }
  const glows = glowSystem(64);
  const STREAK_N = 120;
  const streakMat = new T.ShaderMaterial({
    vertexShader: 'attribute vec4 aCol; varying vec2 vUv; varying vec4 vCol; void main(){ vUv = uv; vCol = aCol; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
    // the uv is clamped: with MSAA these sub-pixel slivers are shaded at pixel centres that can lie far outside the triangle
    fragmentShader: 'varying vec2 vUv; varying vec4 vCol; void main(){ vec2 uv = clamp(vUv, 0.0, 1.0); float along = pow(uv.x, 1.4) * (1.0 - smoothstep(0.85, 1.0, uv.x)); float across = 1.0 - abs(uv.y * 2.0 - 1.0); across *= across; float a = along * across * vCol.a; if (a < 0.003) discard; gl_FragColor = vec4(vCol.rgb * a, a); }',
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide
  });
  const streakGeo = new T.BufferGeometry();
  streakGeo.setAttribute('position', new T.Float32BufferAttribute([-1, -0.5, 0, 0, -0.5, 0, 0, 0.5, 0, -1, 0.5, 0, -1, 0, -0.5, 0, 0, -0.5, 0, 0, 0.5, -1, 0, 0.5], 3));
  streakGeo.setAttribute('uv', new T.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1], 2));
  streakGeo.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  const stCol = new T.InstancedBufferAttribute(new Float32Array(STREAK_N * 4), 4); stCol.setUsage(T.DynamicDrawUsage);
  streakGeo.setAttribute('aCol', stCol);
  const streaks = new T.InstancedMesh(streakGeo, streakMat, STREAK_N); streaks.instanceMatrix.setUsage(T.DynamicDrawUsage); streaks.frustumCulled = false; streaks.renderOrder = 10; scene.add(streaks);
  // the push arrow (04)
  function arrow(color, L, w) {
    const s = new T.Shape(); s.moveTo(-w, 0); s.lineTo(w, 0); s.lineTo(w, L - 2.2); s.lineTo(w * 2.8, L - 2.2); s.lineTo(0, L); s.lineTo(-w * 2.8, L - 2.2); s.lineTo(-w, L - 2.2); s.lineTo(-w, 0);
    const g = new T.Group(), m = new T.Mesh(new T.ShapeGeometry(s), new T.MeshBasicMaterial({ color: new T.Color(...color), toneMapped: false, transparent: true, side: T.DoubleSide, depthTest: false }));
    m.renderOrder = 20; g.add(m); scene.add(g); g.userData.m = m; return g;
  }
  const pushArrow = arrow([1.35, 0.68, 0.18], 9, 0.45);

  // ---------------------------------------------------------------- clocks
  // One continuous take from the pad to the Moon burn. The only cuts are into the rewind and back into the hook.
  const REW0 = 2.0, REW_MID = 2.25, REW1 = 2.6, FINAL0 = 26.6, END_CUT = 29.6;
  const IGN = 2.72, STAGE_T = 5.4, MECO = 7.4, ARRIVE = 8.4, CONTACT = 12.0, SETTLE = 16.9, VALVE = 20.9, FILL0 = 21.3, FULL = 26.0;
  const X_IN = 12.7, X_OUT = 24.5, UNDOCK = 26.65, TURN0 = 27.2, TURN1 = 28.2, BURN = 28.2;
  const isHook = t => t < REW0 || t >= END_CUT;
  // the hook clock h: real time in the hook, run backwards in the first part of the rewind, [-0.4, 0) in the last 0.4 s
  const hookClock = t => t >= END_CUT ? t - DURATION : t < REW0 ? t : lerp(REW0, -1.0, smooth(span(t, REW0, REW_MID)));
  const inHookScene = t => isHook(t) || t < REW_MID;
  const HOOK_FUEL = h => 56 + 9 * h;
  const landerFuel = t => {
    if (isHook(t)) return HOOK_FUEL(hookClock(t));
    if (t < REW_MID) return lerp(HOOK_FUEL(REW0), 12, smooth(span(t, REW0, REW_MID)));
    if (t < REW1) return lerp(12, 100, smooth(span(t, REW_MID, REW1 - 0.05)));
    if (t < STAGE_T + 0.1) return 100;
    if (t < ARRIVE) return 100 - 88 * Math.pow(span(t, STAGE_T + 0.1, MECO), 0.9);
    if (t < FILL0) return 12;
    if (t < FINAL0) return 12 + 88 * smooth(span(t, FILL0, FULL));
    if (t < BURN + 0.05) return 100;
    return 100 - 3 * span(t, BURN + 0.05, END_CUT);
  };
  const tankerFuelOf = l => 100 - 0.85 * (l - 12);
  const tankerFuel = t => (inHookScene(t) ? tankerFuelOf(landerFuel(t)) : t < ARRIVE ? null : t < FILL0 ? 100 : tankerFuelOf(Math.min(100, landerFuel(Math.min(t, FINAL0 - 0.01)))));
  const xrayAmt = t => smooth(span(t, X_IN, X_IN + 0.6)) * (1 - smooth(span(t, X_OUT - 0.6, X_OUT)));
  // settling: a gentle steady push from the tanker's aft thrusters, from SETTLE through the transfer
  const settleOn = t => inHookScene(t) ? 1 : (t >= SETTLE && t < FINAL0) ? smooth(span(t, SETTLE, SETTLE + 0.3)) : 0;
  const drift = t => (t >= SETTLE ? 0.07 * Math.pow(t - SETTLE, 2) : 0);   // the stack creeping forward under the push (shown by the X-ray camera lagging)
  function monotone(xs, ys) {
    const n = xs.length, d = [], m = new Array(n).fill(0);
    for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
      const a = m[i] / d[i], b = m[i + 1] / d[i], q = a * a + b * b;
      if (q > 9) { const k = 3 / Math.sqrt(q); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
    }
    return x => {
      if (x <= xs[0]) return ys[0];
      if (x >= xs[n - 1]) return ys[n - 1];
      let i = 0; while (x > xs[i + 1]) i++;
      const h = xs[i + 1] - xs[i], u = (x - xs[i]) / h, u2 = u * u, u3 = u2 * u;
      return (2 * u3 - 3 * u2 + 1) * ys[i] + (u3 - 2 * u2 + u) * h * m[i] + (-2 * u3 + 3 * u2) * ys[i + 1] + (u3 - u2) * h * m[i + 1];
    };
  }

  // ---------------------------------------------------------------- the flight (01): pad to orbit in one take, time-lapsed
  // The rocket stays put while the world falls away: the lander's root sits at its docking spot the whole time, the pad
  // sinks below it by the altitude, and the rocket pitches over (nose toward -x) until it lies in its docked attitude.
  const ALT = monotone([0, 0.4, 1.2, 1.9, 2.7, 3.7, 4.7, 5.8], [0, 0, 55, 800, 15000, 80000, 230000, 400000]);   // s = t - REW1
  const PITCH = monotone([0, 1.6, 2.4, 3.2, 4.2, 5.0], [0, 0, 16, 45, 80, 90]);
  const rewAlt = t => lerp(170, 0, easeOut(span(t, REW_MID, REW1 - 0.02)));
  const flightAlt = t => (t < REW1 ? rewAlt(t) : ALT(t - REW1));
  const LANDER_DOCK = V3(SHIP_L, 0, 0), TANKER_DOCK = V3(-SHIP_L, 0, 0);
  const padPos = t => V3(SHIP_L, -B_SHIP - MOUNT - flightAlt(t), 0);
  const pitchQ = t => new T.Quaternion().setFromAxisAngle(V3(0, 0, 1), deg(t < REW1 ? 0 : PITCH(t - REW1)));
  const sepB = t => (t < STAGE_T ? 0 : 0.5 * 7 * Math.pow(t - STAGE_T, 2) + 2 * (t - STAGE_T));

  // ---------------------------------------------------------------- poses (pure functions of t, also used for particles born earlier)
  const Q_UP = new T.Quaternion(), Q_TANKER = new T.Quaternion().setFromAxisAngle(V3(0, 0, 1), -PI / 2), Q_LANDER = new T.Quaternion().setFromAxisAngle(V3(0, 0, 1), PI / 2);
  const Q_MOON = new T.Quaternion().setFromUnitVectors(V3(0, 1, 0), MOON_DIR);
  function shot(t) {
    if (inHookScene(t)) return 'hook';
    if (t < ARRIVE) return 'flight';
    if (t < FINAL0) return 'orbit';
    return 'final';
  }
  const docked = () => ({ t: { pos: TANKER_DOCK.clone(), q: Q_TANKER }, l: { pos: LANDER_DOCK.clone(), q: Q_LANDER } });
  function poses(t) {
    const s = shot(t), P = { s, lander: null, tanker: null, booster: null };
    if (s === 'hook') { const d = docked(); P.lander = d.l; P.tanker = d.t; }
    else if (s === 'flight') {
      P.lander = { pos: LANDER_DOCK.clone(), q: pitchQ(t) };
      if (t < STAGE_T + 2.6) {
        const qs = pitchQ(Math.min(t, STAGE_T)), sb = sepB(t);
        const tumble = new T.Quaternion().setFromAxisAngle(V3(0.3, 0, 1).normalize(), deg(-14) * Math.max(0, t - STAGE_T));
        P.booster = { pos: LANDER_DOCK.clone().add(V3(0, -B_SHIP - sb, 0).applyQuaternion(qs)).add(V3(0, -0.06 * sb * sb / 10, 0)), q: qs.clone().multiply(tumble) };
      }
    } else if (s === 'orbit') {
      const d = docked(); P.lander = d.l; P.tanker = d.t;
      if (t < CONTACT) {
        const k = span(t, ARRIVE, CONTACT), gap = 230 * Math.pow(1 - k, 3);
        P.tanker.pos.x -= gap; P.tanker.pos.z -= 0.08 * gap;
        const wob = (1 - k) * deg(1.6);
        P.tanker.q = Q_TANKER.clone().multiply(new T.Quaternion().setFromEuler(new T.Euler(wob * Math.sin(t * 0.9), 0, wob * 0.7 * Math.sin(t * 0.7 + 1))));
      }
    } else {
      // undock, back off, turn toward the Moon (about the ship's middle), then burn
      const d = docked(); P.tanker = d.t;
      const back = 5 * smooth(span(t, UNDOCK, 27.9));                 // back off a few metres, easing to a stop before the turn
      const q = Q_LANDER.clone().slerp(Q_MOON, smooth(span(t, TURN0, TURN1)));
      const mid = LANDER_DOCK.clone().add(V3(back, 0, 0)).add(V3(0, 20, 0).applyQuaternion(Q_LANDER));
      const tb = Math.max(0, t - BURN);
      P.lander = { pos: mid.sub(V3(0, 20, 0).applyQuaternion(q)).addScaledVector(MOON_DIR, 0.5 * 50 * tb * tb + 2 * tb), q };
    }
    return P;
  }
  // thruster activity (0..1) per ship and nozzle
  function rcsAmt(t, who, k) {
    const g = RCS[k].g, s = shot(t);
    const flick = (a, b, f) => pulse(t, a, a + 0.04, b - 0.05, b) * (0.85 + 0.15 * Math.sin(t * 51 + k * 1.7)) * f;
    if (who === 'tanker') {
      if (g === 'aft') {
        const on = settleOn(t);
        if (on > 0) return on * 0.55 * (0.88 + 0.12 * Math.sin(t * 37 + k));
        if (s === 'orbit') return flick(8.7, 9.2, 0.7);
      }
      if (g === 'nose' && s === 'orbit') return flick(10.4, 11.0, 0.8) + flick(11.35, 11.8, 0.5);
      if (g === 'aftOut' && s === 'orbit') return (k % 2 ? flick(9.5, 9.7, 0.5) : 0);
    } else {
      if (g === 'nose' && s === 'flight') return flick(7.55, 7.8, 0.5) * (k % 2);
      if (g === 'nose' && s === 'final') return flick(UNDOCK, 27.3, 0.9);
      if (g === 'aftOut' && s === 'final') return k % 2 ? flick(TURN0, 27.55, 0.7) : flick(27.85, 28.15, 0.6);
    }
    return 0;
  }
  const engineAmt = (t, who) => {
    const s = shot(t);
    if (who === 'booster') return s === 'flight' ? (t < REW1 ? 1 : smooth(span(t, IGN, IGN + 0.23)) * (1 - smooth(span(t, STAGE_T - 0.1, STAGE_T)))) : 0;
    if (who === 'lander') return s === 'flight' ? smooth(span(t, STAGE_T + 0.1, STAGE_T + 0.25)) * (1 - smooth(span(t, MECO - 0.1, MECO + 0.05))) : s === 'final' ? smooth(span(t, BURN, BURN + 0.12)) : 0;
    return 0;
  };

  // ---------------------------------------------------------------- camera: one continuous path (keyframes, monotone per channel)
  const orbitAround = (look, az, el, d) => look.clone().add(V3(d * Math.sin(az) * Math.cos(el), d * Math.sin(el), d * Math.cos(az) * Math.cos(el)));
  const shake = (t, amp) => V3(amp * (Math.sin(t * 37.1) + 0.6 * Math.sin(t * 53.7 + 1.3)), amp * (Math.sin(t * 41.9 + 2.1) + 0.6 * Math.sin(t * 61.3 + 0.2)), amp * 0.7 * Math.sin(t * 47.3 + 0.9));
  const UP_Y = V3(0, 1, 0), UP_X = V3(1, 0, 0);
  function setCam(pos, look, up, sk, near = 0.5) {
    camera.up.copy(up); camera.position.copy(pos).add(sk || V3(0, 0, 0)); camera.lookAt(look);
    if (camera.near !== near) { camera.near = near; camera.updateProjectionMatrix(); }
  }
  const HOOK_LOOK = V3(2.5, 2.5, 0);
  const hookCam = h => { const k = (h + 1) / 3; return orbitAround(HOOK_LOOK, deg(lerp(21, 17, k)), deg(lerp(9.5, 8.5, k)), lerp(50, 46, k)); };
  // at the pad: a low camera beside the launch mount, tilting up as the rocket rises
  const padCam = t => {
    const alt = flightAlt(t), k = span(t, REW_MID, 3.9), pp = padPos(t);
    return { pos: pp.clone().add(V3(lerp(150, 132, k), 6, lerp(118, 104, k))), look: pp.clone().add(V3(0, lerp(58, 72, k) + alt * 0.85, 0)) };
  };
  const FINAL_POS = V3(95, 20, 80);
  const FINAL_DIR = V3(Math.sin(deg(219)) * Math.cos(deg(-10)), Math.sin(deg(-10)), Math.cos(deg(219)) * Math.cos(deg(-10)));
  const p36 = padCam(3.6), p39 = padCam(3.9);
  // t, camera position, look-at point, roll (0: up is +y; 1: up is +x, the X-ray view with the tanker's tank upright)
  const CAM_KEYS = [
    [3.6, p36.pos.toArray(), p36.look.toArray(), 0],
    [3.9, p39.pos.toArray(), p39.look.toArray(), 0],
    [4.6, [150, -80, 150], [40, -15, 0], 0],
    [5.4, [112, -56, 168], [36, -6, 0], 0],
    [6.4, [84, -22, 152], [28, 4, 0], 0],
    [7.4, [78, 16, 114], [22, 2, 0], 0],
    [8.4, [74, 22, 112], [20, 0, 0], 0],
    [9.4, [68, 20, 98], [8, 0, 0], 0],
    [10.4, [72, 18, 66], [-7, -1, 0], 0],
    [12.0, [66, 13, 46], [-5, -1, 0], 0],
    [12.6, [40, 9, 64], [-14, 0, 0], 0],
    [13.5, [-SHIP_L + TBOT + 7.5, -1.5, 88], [-SHIP_L + TBOT + 7.5, 0, 0], 1],
    [16.8, [-SHIP_L + TBOT + 7.5, -1.5, 84], [-SHIP_L + TBOT + 7.5, 0, 0], 1],
    [22.3, [-SHIP_L + TBOT + 7.5, -1.5, 80], [-SHIP_L + TBOT + 7.5, 0, 0], 1],
    [23.4, [0, -6, 190], [0, 0, 0], 1],
    [25.3, [82, 31, 72], [-6, -10, 0], 0],
    [26.6, [71, 26, 73], [-6, -10, 0], 0],
    [28.0, [90, 21, 80], FINAL_POS.clone().addScaledVector(FINAL_DIR, 60).toArray(), 0],
    [END_CUT, FINAL_POS.toArray(), FINAL_POS.clone().addScaledVector(FINAL_DIR, 100).toArray(), 0]
  ];
  const camCh = [...Array(7)].map((_, c) => monotone(CAM_KEYS.map(k => k[0]), CAM_KEYS.map(k => c < 3 ? k[1][c] : c < 6 ? k[2][c - 3] : k[3])));
  function camFor(t, P) {
    if (P.s === 'hook') { const h = hookClock(t); return { pos: hookCam(h), look: HOOK_LOOK, up: UP_Y, alt: 400000 }; }
    if (t < 3.6) { const c = padCam(t); return { pos: c.pos, look: c.look, up: UP_Y, alt: c.pos.y - padPos(t).y, sk: shake(t, 0.25 * smooth(span(t, 2.8, 3.1))) }; }
    const v = camCh.map(f => f(t));
    const pos = V3(v[0], v[1], v[2]), look = V3(v[3], v[4], v[5]), up = UP_Y.clone().lerp(UP_X, v[6]).normalize();
    // under the push the stack speeds up: the X-ray camera lags behind it, then catches up as it pulls back
    const dr = drift(t) * (1 - smooth(span(t, 22.3, 23.4)));
    pos.x -= dr; look.x -= dr;
    const alt = t < ARRIVE ? Math.max(5, pos.y - padPos(t).y) : 400000;
    return { pos, look, up, alt, sk: shake(t, 0.25 * (1 - smooth(span(t, 3.9, 5.0))) + 0.06 * Math.exp(-Math.max(0, t - CONTACT) / 0.15) * (t > CONTACT && t < 12.6 ? 1 : 0)) };
  }

  // ---------------------------------------------------------------- UI
  const $ = id => document.getElementById(id);
  const ui = { step: $('step'), caption: $('caption'), sub: $('sub'), teaser: $('teaser'), badge: $('badge'), wl: $('wl'), timer: $('timer'), timerV: $('timerV'), rewind: $('rewind'), stage: $('vStage'), tank: $('vTanker'), land: $('vLander'), xfer: $('vTransfer') };
  const HOOK_CAP = 'This moon ship can’t leave orbit… until it’s refueled.';
  const SCENES = [
    { a: 0, b: REW0, step: '', huge: true, cap: HOOK_CAP },
    { a: REW0, b: REW1, step: '', cap: '' },
    { a: REW1, b: ARRIVE, step: '01 · The problem', cap: 'Reaching orbit burns most of the fuel.' },
    { a: ARRIVE, b: 12.6, step: '02 · The tankers', cap: 'Tanker ships bring more fuel and dock.' },
    { a: 12.6, b: 16.8, step: '03 · The problem inside', x: true, cap: 'In space, liquid doesn’t settle. It floats.' },
    { a: 16.8, b: 22.3, step: '04 · The trick', x: true, cap: 'A gentle push makes fuel ‘fall’ to the bottom.' },
    { a: 22.3, b: FINAL0, step: '05 · The transfer', x: true, cap: 'Super-cold liquid flows across. The tank fills.' },
    { a: FINAL0, b: END_CUT, step: '', big: true, cap: 'Fill up in orbit. Then, the Moon.' },
    { a: END_CUT, b: DURATION + 1, step: '', huge: true, cap: HOOK_CAP }
  ];
  const setText = (el, s) => { if (el.textContent !== s) el.textContent = s; };
  let anchors = {};
  const CALLOUTS = [
    { text: 'LANDER', on: [[8.9, 12.45]], at: () => anchors.lander, dx: 40, dy: -60 },
    { text: 'TANKER', on: [[9.5, 12.45]], at: () => anchors.tanker, dx: -40, dy: 55 },
    { text: 'LIQUID', on: [[13.6, 15.9]], at: () => anchors.blob, dx: 80, dy: -20 },
    { text: 'FUEL LINE', sub: 'GAS AT THE INTAKE', on: [[14.4, 16.75]], at: () => anchors.pickup, dx: 80, dy: 20 },
    { text: 'THRUSTERS', on: [[16.95, 19.3]], at: () => anchors.thruster, dx: 75, dy: 10 },
    { text: 'GENTLE PUSH', on: [[17.6, 20.2]], at: () => anchors.arrowTip, dx: 10, dy: -26 },
    { text: 'FUEL LINE', sub: 'OPEN', on: [[20.8, 22.9]], at: () => anchors.pickup, dx: 80, dy: 20 },
    { text: 'LIQUID', sub: 'BELOW −160 °C · APPROX.', on: [[25.2, 26.5]], at: () => anchors.joint, dx: -60, dy: -70 }
  ];
  const calloutRoot = $('callouts');
  CALLOUTS.forEach(c => {
    c.el = document.createElement('div'); c.el.className = 'callout';
    c.el.innerHTML = '<span class="line"></span><span class="dot"></span><span class="tag"></span>';
    c.line = c.el.querySelector('.line'); c.tag = c.el.querySelector('.tag'); c.tag.textContent = c.text;
    if (c.sub) { const s = document.createElement('small'); s.textContent = c.sub; c.tag.appendChild(s); }
    calloutRoot.appendChild(c.el);
  });
  const tmpV = new T.Vector3();
  const toScreen = p => { tmpV.copy(p).project(camera); return [(tmpV.x * 0.5 + 0.5) * 360, (-tmpV.y * 0.5 + 0.5) * 640, tmpV.z]; };
  const headBottom = () => { const els = [ui.teaser, ui.sub, ui.caption].filter(e => +e.style.opacity > 0.01); const el = els[0] || ui.caption; return el.offsetTop + el.offsetHeight + el.offsetParent.offsetTop + 10; };
  function updateCallouts(t, X) {
    const capBottom = Math.max(headBottom(), 100);
    CALLOUTS.forEach(c => {
      let o = 0;
      c.on.forEach(([a, b]) => { o = Math.max(o, pulse(t, a, a + 0.3, b - 0.3, b)); });
      const at = c.at(); if (!at) o = 0;
      c.el.style.opacity = o.toFixed(3);
      if (o <= 0.001) return;
      c.el.classList.toggle('x', X > 0.5);
      const [px, py] = toScreen(at);
      const w = c.tag.offsetWidth, h = c.tag.offsetHeight;
      let cx = px + c.dx - w / 2, cy = py + c.dy - h / 2;
      cx = clamp(cx, 20, 340 - w); cy = clamp(cy, capBottom, 420 - h);
      c.el.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
      c.tag.style.transform = `translate(${(cx - px).toFixed(1)}px, ${(cy - py).toFixed(1)}px)`;
      const ex = clamp(px, cx, cx + w), ey = clamp(py, cy, cy + h);
      const lx = ex - px, ly = ey - py, len = Math.hypot(lx, ly);
      c.line.style.width = len.toFixed(1) + 'px';
      c.line.style.transform = `rotate(${Math.atan2(ly, lx)}rad)`;
    });
  }

  // ---------------------------------------------------------------- per-frame update
  const mtx = new T.Matrix4(), qa = new T.Quaternion(), X1 = V3(1, 0, 0), ONE = V3(1, 1, 1);
  const place = (obj, pose) => { obj.visible = !!pose; if (pose) { obj.position.copy(pose.pos); obj.quaternion.copy(pose.q); } };
  const toWorld = (pose, p) => p.clone().applyQuaternion(pose.q).add(pose.pos);
  const dirWorld = (pose, d) => d.clone().applyQuaternion(pose.q);
  function update(t) {
    t = clamp(t, 0, DURATION - 1e-4);
    const P = poses(t), s = P.s, X = xrayAmt(t), hook = s === 'hook', h = hookClock(t);
    const orbitShot = s !== 'flight';
    const alt = s === 'flight' ? flightAlt(t) : 400000, aK = s === 'flight' ? smooth(span(alt, 2000, 25000)) : 1;
    const ft = hook ? h : t;                           // effects clock: in the hook it is the hook clock, so the loop seam stays continuous
    glows.reset(); puffs.reset(); smoke.reset();
    shells.forEach(sh => { sh.solid.visible = X < 0.995; sh.ghost.visible = X > 0.005; sh.solid.castShadow = X < 0.5; });
    fadeMats.forEach(m => { m.transparent = X > 0.005; m.opacity = 1 - X; m.depthWrite = X < 0.6; });
    xrayMats.forEach(m => { m.uniforms.uOpacity.value = X; });
    bgMat.uniforms.uX.value = X; rim.intensity = 1.0 * X;
    padWorld.visible = s === 'flight' && alt < 8000;
    if (padWorld.visible) padWorld.position.copy(padPos(t));
    scene.environment = aK > 0.5 ? ENV_ORBIT : ENV_PAD;
    scene.fog.near = lerp(2500, 1e7, aK); scene.fog.far = lerp(38000, 2e7, aK);
    scene.fog.color.copy(HAZE).lerp(NAVY, X);
    sun.intensity = lerp(2.3, 2.7, aK); hemi.intensity = lerp(0.65, 0.75, aK);
    hemi.color.setHex(0xa8c0e0).lerp(new T.Color(0x0a0c12), aK); hemi.groundColor.setHex(0x6a5640).lerp(new T.Color(0x2c4c86), aK);
    [tanker, lander].forEach(sh => { sh.inside.visible = X > 0.02; });

    place(lander.root, P.lander); place(tanker.root, P.tanker); place(booster, P.booster);
    farTanker.root.visible = s === 'hook' || t >= X_OUT - 0.3;
    // a second tanker waiting its turn far off (more than one tanker trip; no number implied)
    if (farTanker.root.visible) { farTanker.root.position.set(-346, -103, -336); farTanker.root.quaternion.copy(Q_TANKER); glows.push(V3(-346 + SHIP_L - 1, -103, -336), 2.2, 0.5, 0.4, 6 * (Math.floor(ft * 1.25 + 0.5) % 2 ? 1 : 0.15)); }

    // engines
    const bA = engineAmt(t, 'booster'), lA = engineAmt(t, 'lander');
    const thinAir = smooth(span(alt, 3000, 40000));               // the plume balloons and fades as the air thins
    bPlumeMats.forEach(m => { m.uniforms.uAmt.value = bA * (1 - 0.5 * thinAir); m.uniforms.uTime.value = t; });
    bPlume.visible = bA > 0.01; bPlume.scale.set(1 + 0.9 * thinAir, 1 + 0.4 * thinAir, 1 + 0.9 * thinAir);
    lPlume.mats.forEach(m => { m.uniforms.uAmt.value = lA; m.uniforms.uTime.value = t; }); lPlume.g.visible = lA > 0.01;
    tPlume.g.visible = false;
    lander.bells.forEach(m => { m.emissiveIntensity = 2.5 * lA; });
    if (lA > 0.01 && P.lander) ENG.forEach((e, i) => { const fl = 0.9 + 0.1 * Math.sin(t * 43 + i * 2.1); glows.push(toWorld(P.lander, e.clone().add(V3(0, -0.6, 0))), 1.5 * lA * fl, 1.35 * lA * fl, 1.2 * lA * fl, 3.4 * lA); });
    flameLight.intensity = padWorld.visible ? 6 * bA * clamp(1 - alt / 600) : 0;
    if (P.booster) flameLight.position.copy(P.booster.pos).add(V3(0, -4, 0));
    splashMat.opacity = padWorld.visible ? bA * clamp(1 - alt / 160) * 0.9 : 0;
    // launch smoke spreading off the pad (it sinks away below as the camera climbs with the rocket)
    if (padWorld.visible && t > IGN) {
      const age0 = Math.min(t, STAGE_T) - IGN, pp = padWorld.position;
      for (let j = 0; j < 150; j++) {
        const born = rand(j, 1) * Math.max(0.01, age0), age = t - IGN - born; if (age < 0 || age > 4.2) continue;
        const ang = rand(j, 2) * TAU, sp = 24 + 40 * rand(j, 3), r = 8 + sp * (1 - Math.exp(-age / 1.2)) * 1.6;
        const p = V3(Math.cos(ang) * r, 3 + 5 * rand(j, 4) + 6 * age, Math.sin(ang) * r).add(pp);
        smoke.push(p, 10 + 14 * age + 8 * rand(j, 5), 0.55 * clamp(age / 0.15) * (1 - span(age, 2.5, 4)), rand(j, 6), 0.5 * Math.exp(-age / 0.4));
      }
    }
    // RCS jets on both ships: cores as glows + streaks, puffs in world space from the pose at birth
    let si = 0;
    [['tanker', tanker, P.tanker], ['lander', lander, P.lander]].forEach(([who, sh, pose]) => {
      if (!pose) return;
      RCS.forEach((n, k) => {
        const a = rcsAmt(ft, who, k); if (a < 0.005 && !(n.g === 'aft' && who === 'tanker' && settleOn(ft) > 0)) return;
        const pw = toWorld(pose, n.p), dw = dirWorld(pose, n.d);
        if (a > 0.01) glows.push(pw.clone().addScaledVector(dw, 0.3), 0.9 * a, 1.0 * a, 1.25 * a, 0.9 + 0.5 * a);
        for (let j = 0; j < 4 && si < STREAK_N; j++, si++) {
          const L = 0.16, age = (((ft / L + rand(k * 7 + j, 5)) % 1) + 1) % 1 * L;
          const off = V3(rand(si, 6) - 0.5, rand(si, 8) - 0.5, rand(si, 9) - 0.5).multiplyScalar(0.3);
          const head = pw.clone().add(off).addScaledVector(dw, 0.4 + age * 30);
          qa.setFromUnitVectors(X1, dw); mtx.compose(head, qa, V3(1.6 + 1.6 * a, 0.12, 0.12)); streaks.setMatrixAt(si, mtx);
          stCol.setXYZW(si, 1.0, 1.15, 1.4, a * (1 - age / L) * 0.9);
        }
        const LIFE = 0.7;
        for (let j = 0; j < 12; j++) {
          const ph = rand(k * 31 + j + (who === 'lander' ? 500 : 0), 7), age = (((ft / LIFE + ph) % 1) + 1) % 1 * LIFE, birth = ft - age;
          const ab = rcsAmt(birth, who, k); if (ab < 0.02 || shot(birth) !== s) continue;
          const pb = poses(birth)[who]; if (!pb) continue;
          const pwb = toWorld(pb, n.p), dwb = dirWorld(pb, n.d);
          const spread = V3(rand(k, j + 40) - 0.5, rand(k, j + 50) - 0.5, rand(k, j + 60) - 0.5).multiplyScalar(2.2 * age);
          puffs.push(pwb.addScaledVector(dwb, 0.6 + 9 * (1 - Math.exp(-age / 0.25))).add(spread), (0.7 + 4.5 * age) * (1 - 0.3 * X), 0.5 * ab * Math.pow(1 - age / LIFE, 1.5) * (1 - 0.5 * X), rand(k, j));
        }
      });
    });
    for (; si < STREAK_N; si++) stCol.setW(si, 0);
    streaks.instanceMatrix.needsUpdate = stCol.needsUpdate = true;
    // boil-off: little vapour puffs from the vents (orbit, outside the X-ray), and at the joint while fuel flows
    if (orbitShot && X < 0.6) {
      [['tanker', P.tanker], ['lander', P.lander]].forEach(([who, pose], wi) => {
        if (!pose) return;
        VENTS.forEach((v, vi) => {
          if (vi === 2 && !(hook || (t >= X_OUT - 0.3 && t < FINAL0))) return;
          const per = 1.1 + 0.5 * rand(vi, wi + 3), LIFE = 1.4;
          for (let j = 0; j < 7; j++) {
            const ph = rand(vi * 13 + j, wi + 21), age = (((ft / LIFE + ph) % 1) + 1) % 1 * LIFE;
            const burst = Math.floor((ft - age) / per + rand(vi, wi)), on = rand(burst, vi + wi * 7) < 0.6 ? 1 : 0; if (!on) continue;
            const pw = toWorld(pose, v.p), dw = dirWorld(pose, v.d);
            const spread = V3(rand(j, vi + 40) - 0.5, rand(j, vi + 50) - 0.5, rand(j, vi + 60) - 0.5).multiplyScalar(1.6 * age);
            puffs.push(pw.addScaledVector(dw, 0.4 + 3.2 * (1 - Math.exp(-age / 0.5))).add(spread), (0.5 + 2.4 * age) * (vi === 2 ? 1.3 : 1), 0.32 * Math.pow(1 - age / LIFE, 1.3) * (1 - X), rand(vi, j + wi));
          }
        });
      });
    }
    // the docking seal glows while fuel flows
    const flowing = hook ? 1 : (t >= FILL0 && t < FINAL0) ? smooth(span(t, FILL0, FILL0 + 0.4)) * (1 - smooth(span(t, FULL, FULL + 0.3))) : 0;
    const sealGlow = (s === 'orbit' ? 0.8 * pulse(t, CONTACT - 0.02, CONTACT + 0.05, CONTACT + 0.3, CONTACT + 0.9) : 0) + flowing * 0.5 * (1 - X);
    [tanker, lander].forEach(sh => { sh.glowMat.opacity = sealGlow * (0.85 + 0.15 * Math.sin(ft * 9)); });

    // ---- the liquid (X-ray)
    if (X > 0.02) {
      const settle = t < SETTLE ? 0 : t - SETTLE;
      const G = 2.6;                                   // settling, sped up for the screen
      const fillT = 0.48 * (tankerFuel(t) || 100) / 100;
      // blobs: drift while weightless, then fall to the bottom and merge into the pool
      let merged = 0, poolY = TBOT + levelAt(0.02);
      const visBlob = [];
      BLOB.forEach((b, i) => {
        const fl = V3(1.0 * Math.sin(0.42 * t + b.ph[0]), 1.4 * Math.sin(0.31 * t + b.ph[1]), 1.0 * Math.sin(0.37 * t + b.ph[2])).multiplyScalar(b.big ? 0.8 : 1.6);
        const p = b.home.clone().add(fl);
        p.x = clamp(p.x, -(TR - b.r - 0.2), TR - b.r - 0.2); p.z = clamp(p.z, -(TR - b.r - 0.2), TR - b.r - 0.2);
        let sc = b.r, stretch = 1, m = 0;
        const ts = settle - b.delay * 0.8;
        if (ts > 0) {
          const fall = 0.5 * G * ts * ts * (b.big ? 1 : 1.25), y0 = p.y;
          p.y = y0 - fall; p.x *= 1 - 0.25 * clamp(ts / 2); p.z *= 1 - 0.25 * clamp(ts / 2);
          stretch = 1 + Math.min(0.5, 0.06 * G * ts * 2);
          const floorY = TBOT + 0.6 * b.r + levelAt(0.04 + 0.4 * merged / BLOB_VOL);
          if (p.y < floorY) { m = clamp((floorY - p.y) / (b.r * 1.6 + 0.4)); p.y = floorY - m * b.r; sc = b.r * (1 - m); }
        }
        merged += b.r * b.r * b.r * (ts > 0 ? m : 0);
        visBlob.push({ p, sc, stretch });
      });
      BLOB.forEach((b, i) => {
        const v = visBlob[i];
        mtx.compose(v.p, qa.identity(), v.sc > 0.01 ? V3(v.sc / Math.sqrt(v.stretch), v.sc * v.stretch, v.sc / Math.sqrt(v.stretch)) : V3(1e-4, 1e-4, 1e-4));
        blobs.setMatrixAt(i, mtx);
      });
      blobs.instanceMatrix.needsUpdate = true;
      blobM.uniforms.uTime.value = t;
      anchors.blob = toWorld({ pos: tanker.root.position, q: tanker.root.quaternion }, visBlob[0].p);
      // film on the wall: drains downward once the push starts
      filmM.uniforms.uTime.value = t;
      filmM.uniforms.uFront.value = settle > 0 ? lerp(TY1 + 2, TY0 - 1, smooth(settle / 3.2)) : TY1 + 2;
      filmM.uniforms.uAmt.value = 1 - smooth(span(t, SETTLE + 2.4, SETTLE + 3.6));
      // pool: what has merged plus the drained film, then drawn down by the transfer
      const settledFrac = clamp(merged / BLOB_VOL * 0.75 + 0.25 * smooth(span(t, SETTLE + 0.6, SETTLE + 3.4)));
      const tankFill = t < SETTLE ? 0 : t < FILL0 ? fillT * settledFrac : fillT;
      const slosh = t < SETTLE ? 0 : 0.5 * Math.exp(-Math.max(0, t - SETTLE - 2.8) / 1.6) + 0.06;
      setPool(tPool, tankFill, slosh, t);
      setPool(lPool, 0.98 * landerFuel(t) / 100, 0.06 + 0.1 * flowing, t + 3);
      poolY = TBOT + levelAt(tankFill);
      // bubbles: crowd the intake while weightless; once the liquid settles they rise out of it and vanish
      BUB.forEach((b, i) => {
        let y = b.y + 0.5 * Math.sin(t * 0.8 + b.ph), x = Math.cos(b.a + 0.2 * Math.sin(t * 0.5 + b.ph)) * b.rr, z = Math.sin(b.a + 0.2 * Math.sin(t * 0.5 + b.ph)) * b.rr;
        let sc = b.r, vis = 1;
        if (t >= SETTLE) {
          const ts = Math.max(0, t - SETTLE - 1.2 - b.d);
          y += 0.5 * 3.5 * ts * ts; sc *= 1 + 0.2 * clamp(ts);
          vis = 1 - smooth(clamp((y - poolY - 0.4) / 2.5));
          if (ts <= 0) vis = 1;
        }
        mtx.compose(V3(x, y, z), qa.identity(), vis > 0.02 ? V3(sc, sc, sc) : V3(1e-4, 1e-4, 1e-4)); bubbles.setMatrixAt(i, mtx);
      });
      bubbles.instanceMatrix.needsUpdate = true;
      bubM.uniforms.uAmt.value = 1 - smooth(span(t, SETTLE + 3.0, SETTLE + 4.2));
      // the valve and the line
      const open = smooth(span(t, VALVE, VALVE + 0.3)), flow = Math.max(open * smooth(span(t, FILL0 - 0.3, FILL0 + 0.2)), 0) * (t < FINAL0 ? 1 : 0);
      tanker.valveM.color.setRGB(lerp(0.6, 0.5, open), lerp(0.06, 1.7, open), lerp(0.05, 2.3, open));
      tanker.flowM.uniforms.uFlow.value = flow; tanker.flowM.uniforms.uTime.value = t;
      lander.flowM.uniforms.uFlow.value = flow * smooth(span(t, FILL0 + 0.3, FILL0 + 0.6)); lander.flowM.uniforms.uTime.value = t;
      poolM.uniforms.uTime.value = t;
      // vapour wisps off the surfaces
      if (t >= SETTLE + 2.4) {
        for (let j = 0; j < 10; j++) {
          const LIFE = 1.6, age = (((t / LIFE + rand(j, 71)) % 1) + 1) % 1 * LIFE, a = rand(j, 72) * TAU, rr = rand(j, 73) * (TR - 0.8);
          const lp = V3(Math.cos(a) * rr, poolY + 0.3 + 2.2 * age, Math.sin(a) * rr);
          puffs.push(toWorld({ pos: tanker.root.position, q: tanker.root.quaternion }, lp), 0.5 + 1.2 * age, 0.22 * (1 - age / LIFE) * X, rand(j, 74));
        }
      }
    }

    // camera
    const C = camFor(t, P);
    setCam(C.pos, C.look, C.up, C.sk);
    bgMat.uniforms.uAlt.value = C.alt;
    camera.updateMatrixWorld();
    [lander.root, tanker.root, booster].forEach(o => o.updateMatrixWorld(true));
    glows.done(); puffs.done(); smoke.done();
    // shadows follow the subject
    sun.target.position.copy(C.look); sun.position.copy(C.look).addScaledVector(SUN_DIR, 300);
    const sh = s === 'flight' ? 90 : (t >= X_OUT - 0.5 || hook) ? 60 : 50;
    if (sun.shadow.camera.right !== sh) { Object.assign(sun.shadow.camera, { left: -sh, right: sh, top: sh, bottom: -sh }); sun.shadow.camera.updateProjectionMatrix(); }
    bgMat.uniforms.uInvProj.value.copy(camera.projectionMatrixInverse);
    bgMat.uniforms.uCamWorld.value.copy(camera.matrixWorld);
    vhs.uniforms.uAmt.value = pulse(t, REW0 - 0.04, REW0 + 0.06, REW1 - 0.1, REW1);
    vhs.uniforms.uTime.value = t;
    flashMat.uniforms.uAmt.value = 0;

    // the push arrow (04): beside the tanker, pointing the way the ship speeds up
    const arrK = smooth(span(t, 17.4, 17.8)) * (1 - smooth(span(t, 20.2, 20.5))) * (X > 0.5 ? 1 : 0);
    pushArrow.visible = arrK > 0.01; pushArrow.userData.m.material.opacity = arrK;
    if (arrK > 0.01) { pushArrow.position.set(tanker.root.position.x + 9, 8, 6); pushArrow.rotation.set(0, 0, -PI / 2); pushArrow.scale.set(1, 0.4 + 0.6 * arrK, 1); anchors.arrowTip = V3(tanker.root.position.x + 9 + 9 * (0.4 + 0.6 * arrK), 8, 6); }

    // anchors for the chips
    if (P.lander) anchors.lander = toWorld(P.lander, V3(0, 16, HR * 0.7));
    if (P.tanker) { anchors.tanker = toWorld(P.tanker, V3(0, 16, HR * 0.7)); anchors.pickup = toWorld(P.tanker, V3(0, TBOT + 1.2, 0)); anchors.thruster = toWorld(P.tanker, RCS[0].p); }
    if (P.lander && P.tanker) anchors.joint = P.tanker.pos.clone().lerp(P.lander.pos, 0.5).add(V3(0, 1.6, 0));

    // readouts
    const lf = landerFuel(t), tf = tankerFuel(t), shown = Math.round(lf);
    let stage = '', xfer = '';
    if (hook) { stage = 'TRANSFER'; xfer = 'FLOWING'; }
    else if (t < REW1) { stage = 'REWIND'; xfer = '—'; }
    else if (t < STAGE_T) { stage = 'LAUNCH'; xfer = '—'; }
    else if (t < STAGE_T + 0.4) { stage = 'STAGING'; xfer = '—'; }
    else if (t < ARRIVE) { stage = t < MECO ? 'TO ORBIT' : 'IN ORBIT'; xfer = '—'; }
    else if (t < 12.6) { stage = t < CONTACT ? 'DOCKING' : 'DOCKED'; xfer = 'OFF'; }
    else if (t < 16.8) { stage = 'COASTING'; xfer = 'HOLD'; }
    else if (t < 22.3) { stage = 'SETTLING'; xfer = t < VALVE ? 'HOLD' : t < FILL0 ? 'OPEN' : 'FLOWING'; }
    else if (t < FINAL0) { stage = 'TRANSFER'; xfer = t < FULL ? 'FLOWING' : 'DONE'; }
    else { stage = 'DEPART'; xfer = 'DONE'; }

    // overlay
    const sc = SCENES.find(x => t < x.b) || SCENES[SCENES.length - 1];
    const hard = [0, END_CUT];
    const fadeIn = hard.includes(sc.a) ? 1 : smooth(span(t, sc.a, sc.a + 0.25));
    const fadeOut = (sc.b > DURATION || sc.b === REW0 || sc.b === END_CUT) ? 1 : 1 - smooth(span(t, sc.b - 0.2, sc.b));
    setText(ui.step, sc.step); ui.step.classList.toggle('x', !!sc.x && X > 0.5);
    setText(ui.caption, sc.cap); ui.caption.classList.toggle('huge', !!sc.huge); ui.caption.classList.toggle('big', !!sc.big);
    ui.step.style.opacity = ui.caption.style.opacity = (fadeIn * fadeOut).toFixed(3);
    ui.sub.style.opacity = (t < REW0 ? smooth(span(t, 0.8, 1.1)) : 0).toFixed(3);
    ui.teaser.style.opacity = pulse(t, 15.4, 15.7, 16.45, 16.65).toFixed(3);
    ui.badge.style.opacity = (smooth(span(t, X_IN + 0.15, X_IN + 0.5)) * (1 - smooth(span(t, X_OUT - 0.6, X_OUT - 0.3)))).toFixed(3);
    const wlOn = pulse(t, 13.4, 13.55, 16.95, 17.25), flick = rand(Math.floor(t * 9), 3) < 0.22 ? 0.25 : 1;
    ui.wl.style.opacity = (wlOn * flick).toFixed(3);
    ui.rewind.style.opacity = (t >= REW0 && t < REW1 ? (Math.floor(t * 6) % 2 ? 1 : 0.55) : 0).toFixed(2);
    ui.rewind.style.transform = `translate(0px, ${headBottom() + 6}px)`;
    setText(ui.timerV, String(shown)); ui.timer.classList.toggle('full', shown >= 100);
    setText(ui.stage, stage); setText(ui.tank, tf === null ? '—' : Math.round(tf) + '%'); setText(ui.land, shown + '%'); setText(ui.xfer, xfer);
    updateCallouts(t, X);
  }

  // ---------------------------------------------------------------- post: VHS rewind
  const vhs = new T.ShaderPass({
    uniforms: { tDiffuse: { value: null }, uAmt: { value: 0 }, uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uAmt; uniform float uTime; varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        vec2 uv = vUv;
        if (uAmt > 0.001) {
          float fr = floor(uTime * 30.0), row = floor(uv.y * 120.0);
          uv.x += (hash(vec2(row, fr)) - 0.5) * 0.03 * uAmt * step(0.82, hash(vec2(row * 0.37, fr + 3.0)));
          uv.x += smoothstep(0.06, 0.0, abs(fract(uv.y * 0.9 + uTime * 1.3) - 0.5)) * 0.02 * uAmt;
        }
        float ca = 0.006 * uAmt;
        vec3 c = vec3(texture2D(tDiffuse, uv + vec2(ca, 0.0)).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - vec2(ca, 0.0)).b);
        if (uAmt > 0.001) {
          c *= mix(1.0, 0.82 + 0.18 * sin(vUv.y * 1920.0 * 1.05), uAmt);
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
  const bloom = new T.UnrealBloomPass(new T.Vector2(360, 640), 0.85, 0.5, 1.0);
  if (renderer.capabilities.isWebGL2) [bloom.renderTargetBright, ...bloom.renderTargetsHorizontal, ...bloom.renderTargetsVertical].forEach(r => { r.texture.type = T.HalfFloatType; });
  composer.addPass(bloom);
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
  const fontsWanted = ['700 35px "Barlow Condensed"', '600 19.5px "Barlow Condensed"', '600 15px "Barlow Condensed"', '700 36px "Barlow Condensed"', '500 8px "IBM Plex Mono"', '600 10px "IBM Plex Mono"', '600 38px "IBM Plex Mono"'];
  Promise.all(fontsWanted.map(f => document.fonts.load(f))).then(() => document.fonts.ready).then(() => {
    draw(0);
    requestAnimationFrame(() => { window.__ready = true; });
  });
})();

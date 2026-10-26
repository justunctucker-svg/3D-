/* Booster Landing · NovexDynamics
   Procedural Three.js (r128) scene. Everything on screen is a pure function of the time t (0–24 s):
   window.__render(t) draws one frame, window.__ready turns true once fonts and the first frame are done.
   Units are metres. The landing pad is at the world origin, y is up. s is real flight time since stage separation
   (touchdown at s = 460); the video plays s at different speeds. The hook (0–2 s) and the last 0.4 s share one clock,
   so the last frame runs straight into the first. The sky/planet is drawn analytically in the background shader. */
(() => {
  'use strict';
  const T = THREE, PI = Math.PI, TAU = PI * 2;
  const DURATION = 24, G = 9.81, R_EARTH = 6.371e6;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const smooth = k => { k = clamp(k); return k * k * (3 - 2 * k); };
  const span = (t, a, b) => clamp((t - a) / (b - a));
  const pulse = (t, a, b, c, d) => smooth(span(t, a, b)) * (1 - smooth(span(t, c, d)));
  const rand = (i, j) => { const x = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return x - Math.floor(x); };
  const RENDER = new URLSearchParams(location.search).has('render');
  const V3 = (x, y, z) => new T.Vector3(x, y, z);
  const deg = d => d * PI / 180;

  // ---------------------------------------------------------------- page frame + renderer
  const frameEl = document.getElementById('frame'), stage = document.getElementById('stage');
  const renderer = new T.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  stage.appendChild(renderer.domElement);
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(36, 360 / 640, 0.5, 120000);
  const HAZE = new T.Color(0.42, 0.52, 0.66), NAVY = new T.Color(0.006, 0.014, 0.034);
  scene.fog = new T.Fog(HAZE.clone(), 3000, 45000);
  const rtOpts = { minFilter: T.LinearFilter, magFilter: T.LinearFilter, format: T.RGBAFormat, type: T.HalfFloatType };
  let rt;
  if (renderer.capabilities.isWebGL2) { rt = new T.WebGLMultisampleRenderTarget(360, 640, rtOpts); rt.samples = 4; }
  else rt = new T.WebGLRenderTarget(360, 640, Object.assign(rtOpts, { type: T.UnsignedByteType }));
  const composer = new T.EffectComposer(renderer, rt);

  // ---------------------------------------------------------------- environment + lights
  const SUN_DIR = V3(-0.55, 0.5, 0.67).normalize();
  {
    const env = new T.Scene();
    const basic = c => new T.MeshBasicMaterial({ color: c, side: T.DoubleSide });
    env.add(new T.Mesh(new T.SphereGeometry(50, 32, 16), new T.MeshBasicMaterial({ color: new T.Color(0.12, 0.2, 0.34), side: T.BackSide })));
    const band = new T.Mesh(new T.CylinderGeometry(48, 48, 8, 32, 1, true), basic(new T.Color(0.4, 0.46, 0.55))); band.position.y = 1; env.add(band);
    const gnd = new T.Mesh(new T.CircleGeometry(49, 32), basic(new T.Color(0.25, 0.2, 0.15))); gnd.rotation.x = -PI / 2; gnd.position.y = -4; env.add(gnd);
    const sp = new T.Mesh(new T.PlaneGeometry(9, 9), basic(new T.Color(10, 9, 8))); sp.position.copy(SUN_DIR).multiplyScalar(40); sp.lookAt(0, 0, 0); env.add(sp);
    scene.environment = new T.PMREMGenerator(renderer).fromScene(env, 0.03).texture;
  }
  renderer.autoClear = false;
  const sun = new T.DirectionalLight(0xfff1e0, 2.7);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 300 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.05; sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const hemi = new T.HemisphereLight(0xa8c0e0, 0x6a5640, 0.55); scene.add(hemi);
  const rim = new T.DirectionalLight(0x7fd8ff, 0); rim.position.set(6, 8, -8); scene.add(rim);
  const plumeLight = new T.PointLight(0xffa860, 0, 90, 1.5); scene.add(plumeLight);

  // ---------------------------------------------------------------- sky / planet / stars (analytic, depends on camera altitude)
  const bgMat = new T.ShaderMaterial({
    uniforms: { uX: { value: 0 }, uAlt: { value: 0 }, uRes: { value: new T.Vector2(1080, 1920) }, uInvProj: { value: new T.Matrix4() }, uCamWorld: { value: new T.Matrix4() }, uSun: { value: SUN_DIR.clone() } },
    vertexShader: 'varying vec2 vNdc; void main(){ vNdc = position.xy; gl_Position = vec4(position.xy, 0.9999, 1.0); }',
    fragmentShader: `
      varying vec2 vNdc; uniform float uX; uniform float uAlt; uniform vec2 uRes; uniform mat4 uInvProj; uniform mat4 uCamWorld; uniform vec3 uSun;
      float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float vnoise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z); }
      void main(){
        vec4 v = uInvProj * vec4(vNdc, 1.0, 1.0);
        vec3 d = normalize((uCamWorld * vec4(v.xyz / v.w, 0.0)).xyz);
        float hn = uAlt / ${R_EARTH.toFixed(1)};
        float c = 2.0 * hn + hn * hn;                       // |P|^2 - 1 with P = (0, 1 + hn, 0), in Earth radii
        float b = (1.0 + hn) * d.y;
        float disc = b * b - c;
        float A = exp(-uAlt / 8000.0);                      // air density at the camera, 1 at sea level
        float horizonY = -sqrt(c) / (1.0 + hn);             // direction y of the geometric horizon
        float rel = asin(clamp(d.y, -1.0, 1.0)) - asin(clamp(horizonY, -1.0, 1.0));
        // sky: deep blue-black up high, pale blue near the ground, a thin bright limb from orbit
        vec3 low = mix(vec3(0.42, 0.55, 0.72), vec3(0.06, 0.16, 0.42), smoothstep(0.0, 0.85, rel));
        vec3 space = vec3(0.0015, 0.002, 0.006) + vec3(0.12, 0.3, 0.75) * exp(-max(rel, 0.0) / 0.035) * 0.9 + vec3(0.25, 0.45, 0.8) * exp(-max(rel, 0.0) / 0.008) * 0.6;
        float k = smoothstep(0.0, 1.0, pow(A, 0.35));
        vec3 sky = mix(space, low, k);
        float sd = max(dot(d, uSun), 0.0);
        sky += vec3(1.0, 0.92, 0.8) * (pow(sd, 900.0) * 30.0 + pow(sd, 12.0) * 0.12 * (0.3 + 0.7 * k));
        // stars, only where the air is thin
        vec3 sg = d * 420.0, sc = floor(sg); float st = hash(sc);
        vec3 sj = vec3(hash(sc + 11.0), hash(sc + 23.0), hash(sc + 37.0)) * 0.6 + 0.2;
        float sr = length(fract(sg) - sj);
        sky += vec3(0.9, 0.95, 1.0) * step(0.993, st) * (0.35 + (st - 0.993) * 110.0) * smoothstep(0.16, 0.0, sr) * (1.0 - smoothstep(0.0005, 0.02, A)) * step(0.0, rel);
        vec3 col = sky;
        if (disc > 0.0 && b < 0.0) {
          float tt = -b - sqrt(disc);                       // distance to the ground (Earth radii)
          vec3 p = vec3(0.0, 1.0 + hn, 0.0) + d * tt;      // point on the unit sphere
          float n = vnoise(p * 900.0) * 0.6 + vnoise(p * 3000.0) * 0.4;
          vec3 ground = mix(vec3(0.33, 0.25, 0.17), vec3(0.47, 0.38, 0.27), n);
          float cl = smoothstep(0.55, 0.75, vnoise(p * 1400.0 + 3.0) * 0.7 + vnoise(p * 4200.0) * 0.3) * (1.0 - smoothstep(0.02, 0.6, A));
          ground = mix(ground, vec3(0.85, 0.87, 0.9), cl * 0.8);
          ground *= 0.55 + 0.45 * max(dot(normalize(p), uSun), 0.0);
          float dist = tt * ${R_EARTH.toFixed(1)};
          float haze = 1.0 - exp(-dist / mix(90000.0, 26000.0, k));
          col = mix(ground, mix(vec3(0.35, 0.55, 0.85), vec3(0.42, 0.52, 0.66), k), haze);
        }
        vec2 cc = gl_FragCoord.xy / uRes - 0.5; cc.x *= uRes.x / uRes.y; float r = length(cc);
        vec3 xr = mix(vec3(0.010, 0.022, 0.050), vec3(0.002, 0.006, 0.016), smoothstep(0.05, 0.85, r));
        float px = 1.0 / (uRes.x / 9.0);
        vec2 g = gl_FragCoord.xy / (uRes.x / 9.0); vec2 f = abs(fract(g + 0.5) - 0.5);
        float major = 1.0 - smoothstep(px * 0.6, px * 1.8, min(f.x, f.y));
        vec2 f2 = abs(fract(g * 4.0 + 0.5) - 0.5);
        float minor = 1.0 - smoothstep(px * 2.0, px * 5.5, min(f2.x, f2.y));
        xr += vec3(0.010, 0.032, 0.070) * major * (1.0 - 0.6 * smoothstep(0.2, 0.9, r));
        xr += vec3(0.004, 0.012, 0.026) * minor * (1.0 - smoothstep(0.2, 0.9, r));
        gl_FragColor = vec4(mix(col, xr, uX), 1.0);
      }`,
    depthWrite: false, depthTest: false
  });
  const bg = new T.Mesh(new T.PlaneGeometry(2, 2), bgMat); bg.frustumCulled = false; bg.renderOrder = -10; scene.add(bg);
  const flashMat = new T.ShaderMaterial({
    uniforms: { uAmt: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'varying vec2 vUv; uniform float uAmt; void main(){ float v = 1.0 - 0.5 * length(vUv - vec2(0.5, 0.5)); gl_FragColor = vec4(vec3(1.0, 0.92, 0.8) * uAmt * v * 2.0, 1.0); }',
    transparent: true, depthWrite: false, depthTest: false, blending: T.AdditiveBlending
  });
  const flash = new T.Mesh(new T.PlaneGeometry(2, 2), flashMat); flash.frustumCulled = false; flash.renderOrder = 100; scene.add(flash);

  // ---------------------------------------------------------------- helpers + materials
  const lathe = (pts, seg = 48, phiStart = 0, phiLength = TAU) => new T.LatheGeometry(pts.map(([r, y]) => new T.Vector2(r, y)), seg, phiStart, phiLength);
  const canvasTex = (w, h, draw, srgb = true) => {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h);
    const t = new T.CanvasTexture(cv); t.wrapS = t.wrapT = T.RepeatWrapping; if (srgb) t.encoding = T.sRGBEncoding; t.anisotropy = 4; return t;
  };
  const std = (color, metalness, roughness, extra = {}) => { const m = new T.MeshStandardMaterial(Object.assign({ color, metalness, roughness }, extra)); m.color.convertSRGBToLinear(); return m; };
  const DS = { side: T.DoubleSide };
  // booster skin: white with re-entry soot that thickens toward the engines, faint panel seams; v = 0 at the bottom
  const bodyTex = canvasTex(1024, 1024, (x, w, h) => {
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 2400; i++) { const v = rand(i, 3), a = Math.pow(1 - v, 2.2) * 0.32; x.fillStyle = `rgba(40,34,30,${a * (0.4 + rand(i, 4) * 0.6)})`; x.fillRect(rand(i, 1) * w, (1 - v) * h, 3 + rand(i, 5) * 10, 20 + rand(i, 6) * 120); }
    const g = x.createLinearGradient(0, h, 0, 0); g.addColorStop(0, 'rgba(30,26,24,0.55)'); g.addColorStop(0.35, 'rgba(40,36,32,0.2)'); g.addColorStop(0.7, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(80,84,90,0.35)'; for (let k = 1; k < 7; k++) x.fillRect(0, (k / 7) * h, w, 2);
  });
  const bodyMat = std(0xe9eaeb, 0.2, 0.5, Object.assign({ map: bodyTex }, DS));
  const interMat = std(0x1f2124, 0.35, 0.6, DS);
  const finMat = std(0x8f9297, 0.85, 0.42, DS);
  const legMat = std(0x26282b, 0.3, 0.55, DS);
  const steelMat = std(0xb6bbc1, 0.9, 0.3, DS);
  const engMat = std(0x5a554f, 0.85, 0.4, DS);
  const engInMat = std(0x2b2724, 0.7, 0.55, Object.assign({ emissive: new T.Color(1.0, 0.45, 0.15) }, DS)); engInMat.emissiveIntensity = 0;
  const heatMat = std(0x34302c, 0.4, 0.75, DS);
  const usMat = std(0xeceded, 0.2, 0.45, DS);
  const padTex = canvasTex(1024, 1024, (x, w, h) => {
    x.fillStyle = '#9a978f'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { const g = rand(i, 1); x.fillStyle = g < 0.5 ? `rgba(70,68,64,${0.12 + rand(i, 2) * 0.2})` : `rgba(190,188,180,${0.1 + rand(i, 2) * 0.2})`; x.fillRect(rand(i, 3) * w, rand(i, 4) * h, 1 + rand(i, 5) * 2, 1 + rand(i, 5) * 2); }
    for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(30,26,22,${0.04 + rand(i, 9) * 0.08})`; x.beginPath(); x.arc(w / 2 + (rand(i, 7) - 0.5) * w * 0.4, h / 2 + (rand(i, 8) - 0.5) * h * 0.4, 30 + rand(i, 6) * 90, 0, TAU); x.fill(); }
    x.strokeStyle = 'rgba(235,235,230,0.9)'; x.lineWidth = 16; x.beginPath(); x.arc(w / 2, h / 2, w * 0.4, 0, TAU); x.stroke();
    x.strokeStyle = 'rgba(232,120,40,0.85)'; x.lineWidth = 10; x.beginPath(); x.arc(w / 2, h / 2, w * 0.36, 0, TAU); x.stroke();
    x.fillStyle = 'rgba(235,235,230,0.9)'; x.fillRect(w / 2 - 8, h * 0.22, 16, h * 0.56); x.fillRect(w * 0.22, h / 2 - 8, w * 0.56, 16);
  });
  const padMat = std(0xffffff, 0, 0.9, { map: padTex, envMapIntensity: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const groundTex = canvasTex(1024, 1024, (x, w, h) => {
    x.fillStyle = '#86694a'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 520; i++) { const g = rand(i, 9); x.fillStyle = `rgba(${g < 0.5 ? '70,52,33' : '160,134,100'},${0.06 + rand(i, 8) * 0.1})`; x.beginPath(); x.ellipse(rand(i, 6) * w, rand(i, 7) * h, 30 + rand(i, 10) * 140, 12 + rand(i, 11) * 60, rand(i, 12) * PI, 0, TAU); x.fill(); }
    for (let i = 0; i < 14000; i++) { const g = rand(i, 1); x.fillStyle = g < 0.5 ? `rgba(58,42,26,${0.25 + rand(i, 2) * 0.3})` : `rgba(170,146,110,${0.2 + rand(i, 2) * 0.3})`; x.fillRect(rand(i, 3) * w, rand(i, 4) * h, 1 + rand(i, 5) * 2.5, 1 + rand(i, 5) * 2.5); }
  });
  groundTex.repeat.set(600, 600);
  const groundMat = std(0xffffff, 0, 0.97, { map: groundTex, envMapIntensity: 0.4 });
  groundMat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vGW;').replace('#include <project_vertex>', '#include <project_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec2 vGW;
      float gh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float gn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(gh(i), gh(i + vec2(1, 0)), f.x), mix(gh(i + vec2(0, 1)), gh(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <map_fragment>', '#include <map_fragment>\nfloat gv = gn(vGW / 1400.0) * 0.55 + gn(vGW / 380.0 + 7.0) * 0.3 + gn(vGW / 90.0 + 3.0) * 0.15;\ndiffuseColor.rgb *= 0.72 + 0.56 * gv;');
  };

  // X-ray glass
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
  const xBody = xrayMat(0x5fd8ff, 0.01, 2.6, 0.45);
  const xParts = xrayMat(0x5fd8ff, 0.025, 2.0, 0.55);
  const shells = [];
  const fadeMats = [bodyMat, interMat, finMat, legMat, heatMat, usMat];
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
  function cylBetween(a, b, r, mat, xmat, parent) {
    const d = b.clone().sub(a), L = d.length(), g = part(new T.CylinderGeometry(r, r, 1, 12), mat, xmat, parent);
    const set = (a2, b2) => { const dd = b2.clone().sub(a2), LL = dd.length(); g.position.copy(a2).add(b2).multiplyScalar(0.5); g.quaternion.setFromUnitVectors(V3(0, 1, 0), dd.divideScalar(LL)); g.scale.set(1, LL, 1); };
    set(a, b); g.userData.set = set; void L; return g;
  }

  // ---------------------------------------------------------------- ground + landing pad
  const ground = new T.Mesh(new T.CircleGeometry(45000, 96), groundMat); ground.rotation.x = -PI / 2; ground.receiveShadow = true; scene.add(ground);
  const pad = new T.Mesh(new T.CircleGeometry(46, 96), padMat); pad.rotation.x = -PI / 2; pad.position.y = 0.3; pad.receiveShadow = true; scene.add(pad);
  const padRim = new T.Mesh(new T.CylinderGeometry(46, 46.6, 0.3, 96, 1, true), std(0x8d8a83, 0, 0.95)); padRim.position.y = 0.15; padRim.receiveShadow = true; scene.add(padRim);
  // ground splash: the plume flattening against the pad
  const splashTex = canvasTex(256, 256, (x, w, h) => { const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); g.addColorStop(0, 'rgba(255,235,190,1)'); g.addColorStop(0.25, 'rgba(255,160,70,0.7)'); g.addColorStop(0.6, 'rgba(255,110,40,0.18)'); g.addColorStop(1, 'rgba(255,90,30,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
  const splashMat = new T.MeshBasicMaterial({ map: splashTex, color: new T.Color(2.2, 1.6, 1.1), transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false });
  const splash = new T.Mesh(new T.PlaneGeometry(1, 1).rotateX(-PI / 2), splashMat); splash.position.y = 0.45; splash.renderOrder = 6; scene.add(splash);
  const envFade = [groundMat, padMat];

  // ---------------------------------------------------------------- the booster (local: y up the axis, y = 0 at the engine exits)
  const R = 1.85, TOP = 46, LEG_ANG = 125;
  const FOOT = -(2.6 + 9.6 * Math.cos(deg(LEG_ANG))) + 0.125;   // engine exits sit this high above the ground at touchdown
  const booster = new T.Group(); scene.add(booster);
  part(lathe([[R * 0.94, 1.55], [R, 2.2], [R, 40.0]], 64), bodyMat, xBody, booster);
  part(lathe([[R, 40.0], [R, TOP], [R * 0.97, TOP + 0.05]], 64), interMat, xBody, booster);
  part(new T.CircleGeometry(R * 0.94, 48).rotateX(PI / 2), heatMat, xBody, booster, [0, 1.55, 0]);
  // nine engines: centre + ring of eight (the centre one relights for landing)
  const bell = lathe([[0.13, 1.6], [0.17, 1.35], [0.3, 0.8], [0.42, 0.25], [0.46, 0.0]], 28);
  const engines = [];
  [[0, 0]].concat([...Array(8)].map((_, i) => [Math.cos(i / 8 * TAU) * 1.22, Math.sin(i / 8 * TAU) * 1.22])).forEach(([x, z], i) => {
    const g = new T.Group(); g.position.set(x, 0, z); booster.add(g);
    const im = engInMat.clone(); im.emissiveIntensity = 0;
    solid(bell, engMat, g); const inner = solid(lathe([[0.12, 1.55], [0.4, 0.2], [0.43, 0.02]], 24), im, g); inner.scale.set(0.97, 1, 0.97);
    g.userData.inner = im; engines.push(g);
  });
  // centre engine internals (solid in X-ray): turbopump + feed lines
  const internals = new T.Group(); booster.add(internals);
  solid(new T.CylinderGeometry(0.28, 0.28, 0.8, 16), steelMat, internals, [0, 2.0, 0]);
  solid(new T.CylinderGeometry(0.2, 0.2, 0.5, 16).rotateZ(PI / 2), steelMat, internals, [0.25, 2.3, 0]);
  // tanks: RP-1 (lower) and LOX (upper) with domes; nearly empty — a little propellant left at the bottom of each
  const domeY = (y0, up) => { const p = []; for (let i = 0; i <= 10; i++) { const a = (i / 10) * PI / 2; p.push([R * 0.96 * Math.cos(a), y0 + (up ? 1 : -1) * 0.9 * Math.sin(a)]); } return p; };
  const domeMat = std(0x9fb0c0, 0.8, 0.35, { transparent: true, opacity: 0, depthWrite: false, side: T.DoubleSide });
  [[4.2, false], [20.8, true], [22.0, false], [38.6, true]].forEach(([y, up]) => { const m = new T.Mesh(lathe(domeY(y, up), 48), domeMat); m.renderOrder = 4; internals.add(m); });
  const liquid = (y0, depth, color) => { const m = new T.Mesh(lathe([[0, y0 - 0.9], [R * 0.6, y0 - 0.75], [R * 0.9, y0 - 0.35], [R * 0.94, y0 + depth], [0, y0 + depth]], 48), std(color, 0, 0.3, { transparent: true, opacity: 0.85, emissive: new T.Color(color).multiplyScalar(0.25) })); internals.add(m); return m; };
  liquid(4.2, 0.6, 0xff6a58);    // RP-1 (fuel)
  liquid(22.0, 0.5, 0x6aa8ff);   // LOX
  const flowMat = (c, rate) => new T.ShaderMaterial({
    uniforms: { uColor: { value: new T.Color(c).convertSRGBToLinear() }, uFlow: { value: 0 }, uTime: { value: 0 }, uRate: { value: rate } },
    vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; uniform vec3 uColor; uniform float uFlow; uniform float uTime; uniform float uRate; void main(){ float sh = 0.55 + 0.45 * abs(dot(normalize(vN), normalize(vV))); float st = smoothstep(0.55, 0.95, fract(vUv.y * uRate + uTime * 2.2)); gl_FragColor = vec4(uColor * sh * (0.75 + 1.6 * st * uFlow), 1.0); }'
  });
  const loxFlow = flowMat(0x6aa8ff, 9), fuelFlow = flowMat(0xff7a62, 3);
  solid(new T.CylinderGeometry(0.22, 0.22, 18.3, 16), loxFlow, internals, [0, 12.6, 0]);   // LOX downcomer through the fuel tank
  solid(new T.CylinderGeometry(0.16, 0.16, 2.6, 12), fuelFlow, internals, [0.55, 2.9, 0], [0, 0, 0.32]);   // fuel feed to the centre engine
  internals.visible = false;
  // grid fins: lattice panels hinged at the interstage; stowed flat, deployed straight out
  const finGeo = (() => {
    const geos = [], W = 1.55, Hh = 1.25, D = 0.14, bar = 0.05, n = 7;
    const box = (w, h, d, x, y) => { const g = new T.BoxGeometry(w, h, d); g.translate(x, y, 0); geos.push(g); };
    box(W, bar, D, 0, 0); box(W, bar, D, 0, Hh); box(bar, Hh, D, -W / 2, Hh / 2); box(bar, Hh, D, W / 2, Hh / 2);
    // diagonal web: lines y = ±x + c clipped to the frame
    const r2 = Math.SQRT2, step = 0.2 * r2;
    [1, -1].forEach(sg => {
      for (let c = -W / 2 + step / 2; c < Hh + W / 2; c += step) {
        const t0 = Math.max(-W / 2 * r2, sg > 0 ? -c * r2 : (c - Hh) * r2), t1 = Math.min(W / 2 * r2, sg > 0 ? (Hh - c) * r2 : c * r2);
        if (t1 - t0 < 0.05) continue;
        const tm = (t0 + t1) / 2, g = new T.BoxGeometry(t1 - t0, 0.022, D * 0.92);
        g.rotateZ(sg * PI / 4); g.translate(tm / r2, c + sg * tm / r2, 0); geos.push(g);
      }
    });
    void n;
    const merged = new T.BufferGeometry(), pos = [], nor = [], idx = []; let off = 0;
    geos.forEach(g => { const gi = g.toNonIndexed(); pos.push(...gi.attributes.position.array); nor.push(...gi.attributes.normal.array); off += gi.attributes.position.count; });
    void idx; void off;
    merged.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); merged.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    return merged;
  })();
  // lattice diagonals rendered as a clipped rotated set (cheap visual: cross the frame both ways)
  const fins = [0, 1, 2, 3].map(i => {
    const hinge = new T.Group(); const a = (i / 4) * TAU;
    hinge.position.set(Math.cos(a) * (R + 0.1), 43.6, Math.sin(a) * (R + 0.1)); hinge.rotation.y = -a; booster.add(hinge);
    const fold = new T.Group(); hinge.add(fold);                       // rotates about the tangent axis: 0 = flat up the side, 90° = straight out
    const steer = new T.Group(); fold.add(steer);
    const p = part(finGeo, finMat, xParts, steer); p.rotation.y = PI / 2; p.position.set(0.1, 0, 0);
    return { hinge, fold, steer, a };
  });
  // landing legs: hinged near the bottom, stowed up the side, deployed down and out with a strut
  const legs = [0, 1, 2, 3].map(i => {
    const a = (i / 4 + 1 / 8) * TAU;
    const hinge = new T.Group(); hinge.position.set(Math.cos(a) * (R + 0.18), 2.6, Math.sin(a) * (R + 0.18)); hinge.rotation.y = -a; booster.add(hinge);
    const swing = new T.Group(); hinge.add(swing);
    part(new T.BoxGeometry(0.36, 9.6, 0.95).translate(0, 4.8, 0), legMat, xParts, swing);
    const foot = part(new T.CylinderGeometry(0.55, 0.66, 0.25, 20), legMat, xParts, swing, [0, 9.6, 0]);
    const strut = cylBetween(V3(0, 0, 0), V3(0, 1, 0), 0.12, steelMat, xParts, booster);
    return { hinge, swing, foot, strut, a };
  });
  // cold-gas thrusters at the top (flip + reorientation)
  const rcsPods = [PI / 4, PI * 5 / 4].map(a => { const g = solid(new T.BoxGeometry(0.45, 0.6, 0.45), interMat, booster, [Math.cos(a) * (R + 0.1), 45.0, Math.sin(a) * (R + 0.1)]); g.userData.a = a; return g; });

  // ---------------------------------------------------------------- upper stage (flies on after separation)
  const upper = new T.Group(); scene.add(upper);
  part(lathe([[R, 0], [R, 13.5]], 48), usMat, xBody, upper);
  part(lathe([[R + 0.4, 13.5], [R + 0.4, 18], [R + 0.25, 22], [1.4, 25], [0.6, 26.6], [0, 27.0]], 48), usMat, xBody, upper);
  solid(lathe([[0.45, 0.2], [0.6, -0.8], [1.15, -3.2], [1.5, -5.2]], 32), std(0x3a2a22, 0.8, 0.45, { side: T.DoubleSide, emissive: new T.Color(1.0, 0.35, 0.1), emissiveIntensity: 0.25 }), upper);

  // ---------------------------------------------------------------- shader effects: plumes, puffs, streaks
  const NOISE = `
    float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
                 mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
    float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * n3(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }`;
  const plumeMat = (tint, gain, vac) => new T.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uAmt: { value: 0 }, uLen: { value: 20 }, uTint: { value: tint }, uGain: { value: gain }, uVac: { value: vac } },
    vertexShader: 'varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vP = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: NOISE + `varying vec3 vP; varying vec3 vN; varying vec3 vV; uniform float uTime; uniform float uAmt; uniform float uLen; uniform vec3 uTint; uniform float uGain; uniform float uVac;
      void main(){
        float d = -vP.y, s = clamp(d / uLen, 0.0, 1.0), ang = atan(vP.z, vP.x);
        float n = fbm(vec3(ang * 3.0, vP.y * 0.35 + uTime * 9.0, length(vP.xz) * 0.6));
        float n2 = fbm(vec3(ang * 8.0, vP.y * 0.9 + uTime * 15.0, 2.0));
        vec3 col = mix(uTint, vec3(1.0, 0.4, 0.1) * 1.2, smoothstep(0.35, 1.0, s) * (1.0 - uVac));
        float facing = pow(abs(dot(normalize(vN), normalize(vV))), mix(1.1, 1.6, uVac));
        float a = smoothstep(0.0, 0.02, s) * (1.0 - smoothstep(0.5, 1.0, s)) * mix(0.2 + 1.1 * n * (0.5 + 0.9 * n2), (0.5 + 0.35 * n) * (1.0 - 0.6 * s), uVac);
        gl_FragColor = vec4(col, a * facing * uAmt * uGain);
      }`,
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide
  });
  // landing plume (centre engine, sea level) — three graded shells, length set per frame
  const landPlume = new T.Group(); engines[0].add(landPlume);
  const landMats = [];
  [[1.0, [1.0, 0.36, 0.08], 2.6, 0.3], [0.66, [1.0, 0.58, 0.2], 3.0, 0.3], [0.36, [1.0, 0.88, 0.62], 4.0, 0.4]].forEach(([k, c, g, a]) => {
    const pts = []; for (let i = 0; i <= 24; i++) { const d = (i / 24) * 30; pts.push([0.44 * k + d * 0.075 * k + 0.1 * Math.sin(d * 0.8) * Math.exp(-d * 0.15), -d]); }
    const m = plumeMat(new T.Color(c[0] * g, c[1] * g, c[2] * g), a, 0); landMats.push(m);
    const mesh = new T.Mesh(lathe(pts, 32), m); mesh.renderOrder = 9; landPlume.add(mesh);
  });
  // vacuum plumes: boostback (three engines) and the upper stage
  const vacGeo = (r0, spread, len) => { const pts = []; for (let i = 0; i <= 24; i++) { const d = (i / 24) * len; pts.push([r0 + spread * (1 - Math.exp(-d / (len * 0.25))) + d * 0.05, -d]); } return lathe(pts, 32); };
  const bbMat = plumeMat(new T.Color(2.0, 1.05, 0.5), 0.2, 1); bbMat.uniforms.uLen.value = 40;
  const bbPlumes = [0, 1, 5].map(i => { const m = new T.Mesh(vacGeo(0.45, 6, 45), bbMat); m.renderOrder = 9; engines[i].add(m); return m; });
  const usPlumeMat = plumeMat(new T.Color(2.3, 1.8, 1.35), 0.17, 1); usPlumeMat.uniforms.uLen.value = 55;
  const usPlume = new T.Mesh(vacGeo(1.4, 7, 58), usPlumeMat); usPlume.position.y = -5.2; usPlume.renderOrder = 9; upper.add(usPlume);
  // engine relight flash glow at the nozzle
  const relightMat = new T.MeshBasicMaterial({ color: new T.Color(3, 2, 1.2), transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false });
  const relight = new T.Mesh(new T.SphereGeometry(1.2, 16, 12), relightMat); relight.position.y = -0.6; relight.renderOrder = 11; engines[0].add(relight);

  function puffSystem(n, color, parent = scene) {
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
    const mesh = new T.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 7; parent.add(mesh); return { mesh, pos, dat, n, m };
  }
  const dust = puffSystem(260, new T.Color(0.68, 0.6, 0.5));
  const rcs = puffSystem(60, new T.Color(0.95, 0.97, 1.0));
  // air streaks rushing past the booster as it falls into thicker air
  const streakMat = new T.ShaderMaterial({
    vertexShader: 'attribute vec4 aCol; varying vec2 vUv; varying vec4 vCol; void main(){ vUv = uv; vCol = aCol; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec2 vUv; varying vec4 vCol; void main(){ float along = pow(vUv.x, 1.7) * (1.0 - smoothstep(0.86, 1.0, vUv.x)); float across = 1.0 - abs(vUv.y * 2.0 - 1.0); across *= across; float a = along * across * vCol.a; if (a < 0.003) discard; gl_FragColor = vec4(vCol.rgb, a); }',
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide
  });
  const streakGeo = new T.BufferGeometry();
  streakGeo.setAttribute('position', new T.Float32BufferAttribute([-1, -0.5, 0, 0, -0.5, 0, 0, 0.5, 0, -1, 0.5, 0, -1, 0, -0.5, 0, 0, -0.5, 0, 0, 0.5, -1, 0, 0.5], 3));
  streakGeo.setAttribute('uv', new T.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1], 2));
  streakGeo.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  const NSTREAK = 260, airCol = new T.InstancedBufferAttribute(new Float32Array(NSTREAK * 4), 4); airCol.setUsage(T.DynamicDrawUsage);
  const airGeo = streakGeo.clone(); airGeo.setAttribute('aCol', airCol);
  const air = new T.InstancedMesh(airGeo, streakMat, NSTREAK); air.instanceMatrix.setUsage(T.DynamicDrawUsage); air.frustumCulled = false; air.renderOrder = 8; scene.add(air);

  // ---------------------------------------------------------------- flight profile (s = seconds since separation; touchdown at s = 460)
  const S_TD = 460, DECEL = 14, S_LB = S_TD - 270 / DECEL;          // landing burn: 270 m/s → 0 at a steady 14 m/s²
  const TWR_MAX = 3.2, TWR_MIN = 1.28;                                // one engine, nearly empty booster
  function monotone(xs, ys, clampEnds = true) {
    const n = xs.length, d = [], m = new Array(n).fill(0);
    for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
    if (!clampEnds) { m[0] = d[0]; m[n - 1] = d[n - 2]; }
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
      const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
      if (s > 9) { const k = 3 / Math.sqrt(s); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
    }
    return x => {
      if (x <= xs[0]) return ys[0] + (clampEnds ? 0 : (x - xs[0]) * m[0]);
      if (x >= xs[n - 1]) return ys[n - 1] + (clampEnds ? 0 : (x - xs[n - 1]) * m[n - 1]);
      let i = 0; while (x > xs[i + 1]) i++;
      const h = xs[i + 1] - xs[i], s = (x - xs[i]) / h, s2 = s * s, s3 = s2 * s;
      return (2 * s3 - 3 * s2 + 1) * ys[i] + (s3 - 2 * s2 + s) * h * m[i] + (-2 * s3 + 3 * s2) * ys[i + 1] + (s3 - s2) * h * m[i + 1];
    };
  }
  const ALT_EARLY = monotone([-5, 0, 55, 160, 330, S_LB], [68000, 70000, 85000, 100000, 40000, 0.5 * DECEL * (S_TD - S_LB) ** 2]);
  const SPD_EARLY = monotone([-5, 0, 28, 55, 160, 330, S_LB], [1680, 1667, 1650, 610, 360, 1190, 270]);
  const altAt = s => s >= S_LB ? 0.5 * DECEL * Math.max(0, S_TD - s) ** 2 : ALT_EARLY(s);
  const speedAt = s => s >= S_LB ? DECEL * Math.max(0, S_TD - s) : SPD_EARLY(s);          // m/s
  const PHI = monotone([-5, 8, 28, 55, 110, 460], [55, 55, -95, -95, 0, 0]);
  const phiAt = s => PHI(s) + 1.6 * Math.sin(s * 0.09) * pulse(s, 300, 340, 425, 452);    // grid-fin steering corrections
  const boostback = s => pulse(s, 30, 31.5, 53.5, 55);
  const landingBurn = s => (s >= S_LB && s < S_TD ? smooth(span(s, S_LB, S_LB + 0.6)) : 0) * (1 - smooth(span(s, S_TD - 0.05, S_TD + 0.35)));
  const flameAt = s => (s >= S_LB ? smooth(span(s, S_LB, S_LB + 0.6)) : 0) * (s < S_TD ? 1 : Math.pow(1 - smooth(span(s, S_TD - 0.05, S_TD + 1.0)), 1.5));
  const throttleAt = s => landingBurn(s) > 0.02 ? clamp((DECEL + G) / G / TWR_MAX + 0.03 * Math.sin(s * 1.7)) : boostback(s) > 0.02 ? 1 : 0;
  const rcsOn = s => pulse(s, 8, 9, 26, 28) + pulse(s, 58, 60, 100, 105);
  const finDeploy = s => smooth(span(s, 72, 96));
  const legDeploy = s => smooth(span(s, 452.5, 455.0));
  const sepDist = s => s <= 0 ? 0 : 0.5 * 1.2 * s * s + (s > 3.5 ? 0.5 * 9 * (s - 3.5) ** 2 : 0);
  const usBurn = s => smooth(span(s, 3.5, 4.2));
  const stageAt = s => s < 0 ? 'ASCENT' : s < 8 ? 'SEPARATION' : s < 28 ? 'FLIP' : s < 55 ? 'BOOSTBACK' : s < 110 ? 'COAST' : s < S_LB ? 'GRID FINS' : s < 452.5 ? 'LANDING BURN' : s < S_TD ? 'LEGS DOWN' : 'LANDED';

  // ---------------------------------------------------------------- timeline: video time t → s
  const HOOK_RATE = 0.7, HOOK0 = S_TD - 2.35, REW0 = 2.0, REW1 = 2.6, FINAL0 = 22.0, END_CUT = 23.6;
  const isHook = t => t < REW0 || t >= END_CUT;
  const hookH = t => (t >= END_CUT ? t - DURATION : t);
  //                  t:  letting go   flip      grid fins (slow start, then time-lapse)   landing burn    legs + touchdown
  const mainS = monotone([2.6, 3.8, 5.0, 6.0, 10.0, 10.9, 13.4, 14.0, 14.6, 19.0, 20.6, 21.4, 22.0], [-1.2, 1.0, 4.6, 8.0, 60.0, 100.0, 420.0, 437.0, S_LB, 452.5, 458.0, S_TD, S_TD + 0.28]);
  function sAt(t) {
    if (isHook(t)) return HOOK0 + HOOK_RATE * hookH(t);
    if (t < REW1) { const k = smooth(span(t, REW0, REW1 - 0.05)); return lerp(HOOK0 + HOOK_RATE * REW0, -1.0, 1 - Math.pow(1 - k, 2)); }
    if (t >= FINAL0) return S_TD + 0.3 + (t - FINAL0) * 0.8;
    return mainS(t);
  }
  const xrayAmt = t => smooth(span(t, 14.0, 14.5)) * (1 - smooth(span(t, 19.0, 19.4)));

  // ---------------------------------------------------------------- camera
  //  shots: focus = booster point (local y) + world offset; az/el/d spherical around the focus
  const SHOTS = [
    { a: 2.6, b: 6.0, keys: [[2.6, 42, 0, 0, 0.5, 0.14, 118], [4.4, 50, 0, 0, 0.58, 0.12, 124], [6.0, 54, 0, 0, 0.64, 0.1, 130]] },
    { a: 6.0, b: 10.0, keys: [[6.0, 23, 0, 0, 0.12, 0.08, 118], [7.6, 23, 4, 0, 0.24, 0.12, 150], [8.6, 23, 10, 0, 0.3, 0.14, 175], [10.0, 23, 12, 0, 0.4, 0.16, 180]] },
    { a: 10.0, b: 14.0, keys: [[10.0, 41, 0, 0, 0.42, 0.1, 34], [11.0, 41, 0, 0, 0.55, 0.16, 30], [12.0, 39, 0, 0, 0.66, 0.2, 34], [12.6, 26, -7, 0, 0.5, 0.08, 100], [14.0, 24, -8, 0, 0.58, 0.04, 106]] },
    { a: 14.0, b: 19.0, keys: [[14.0, 21, 0, 0, 0.18, 0.06, 78], [19.0, 21, 0, 0, 0.1, 0.04, 74]] },
    { a: 19.0, b: 22.0, keys: [[19.0, 12, 0, 0, 0.22, 0.1, 62], [20.2, 10, 0, 0, 0.14, 0.06, 72], [21.0, 8, 0, 0, 0.1, 0.04, 84], [22.0, 8, 0, 0, 0.08, 0.04, 86]] },
    { a: 22.0, b: 24.0, keys: [[22.0, 15, -13.2, 2.9, 0.22, 0.03, 142], [23.6, 15, -12.6, 2.8, 0.25, 0.036, 135]] }
  ].map(sh => Object.assign(sh, { f: [1, 2, 3, 4, 5, 6].map(c => monotone(sh.keys.map(k => k[0]), sh.keys.map(k => k[c]))) }));
  // the hook: a fixed camera 200 m from the pad, tilting down with the last seconds of the landing burn
  const HOOK_CAM = V3(205 * Math.sin(0.3), 8, 205 * Math.cos(0.3));
  const shake = (t, amp) => [amp * (Math.sin(t * 37.1) + 0.6 * Math.sin(t * 53.7 + 1.3)), amp * (Math.sin(t * 41.9 + 2.1) + 0.6 * Math.sin(t * 61.3 + 0.2)), amp * 0.7 * Math.sin(t * 47.3 + 0.9)];
  const boosterPoint = (yLocal) => V3(0, yLocal, 0).applyQuaternion(booster.quaternion).add(booster.position);
  function cameraAt(t, s) {
    let pos, look;
    if (isHook(t)) {
      pos = HOOK_CAM.clone();
      look = V3(0, 22 + 0.15 * altAt(s), 0);
    } else if (t < REW1) {
      // the rewind: chase the booster back up through the whole flight (hidden under the VHS tear)
      look = boosterPoint(23);
      pos = look.clone().add(V3(130 * Math.sin(0.45) * Math.cos(0.12), 130 * Math.sin(0.12), 130 * Math.cos(0.45) * Math.cos(0.12)));
    } else {
      const sh = SHOTS.find(x => t < x.b) || SHOTS[SHOTS.length - 1];
      const [fy, dx, dz, az, el, d] = sh.f.map(f => f(t));
      look = boosterPoint(fy).add(V3(dx, 0, dz));
      pos = look.clone().add(V3(d * Math.sin(az) * Math.cos(el), d * Math.sin(el), d * Math.cos(az) * Math.cos(el)));
      if (t >= 19.0 && t < FINAL0) pos.y = Math.max(pos.y, 4);
      if (t >= FINAL0) { pos.y = Math.max(pos.y, 3); }
    }
    const kickRelight = Math.exp(-Math.max(0, s - S_LB) / 1.2) * (s > S_LB ? 1 : 0), kickTD = Math.exp(-Math.max(0, s - S_TD) / 0.6) * (s > S_TD ? 1 : 0);
    const amp = (t >= 14 && t < 19 ? 0.35 * kickRelight : 0) + (t >= 19 && t < FINAL0 ? 0.5 * kickTD : 0) + (isHook(t) ? 0.08 : 0);
    const sk = shake(isHook(t) ? hookH(t) : t, amp);
    camera.position.copy(pos).add(V3(sk[0], sk[1], sk[2]));
    camera.lookAt(look.x + sk[0] * 0.3, look.y + sk[1] * 0.3, look.z);
    return look;
  }

  // ---------------------------------------------------------------- UI
  const $ = id => document.getElementById(id);
  const ui = { step: $('step'), caption: $('caption'), teaser: $('teaser'), badge: $('badge'), timer: $('timer'), timerV: $('timerV'), rewind: $('rewind'), stage: $('vStage'), alt: $('vAlt'), speed: $('vSpeed'), thr: $('vThr'), twr: $('twr'), barT: $('barT'), barW: $('barW'), minLine: $('minLine') };
  const SCENES = [
    { a: 0, b: 2.0, step: '', huge: true, cap: 'It can’t hover. So how does it land?' },
    { a: 2.0, b: 2.6, step: '', cap: '' },
    { a: 2.6, b: 6.0, step: '01 · LETTING GO', cap: 'It lets go of the upper stage.' },
    { a: 6.0, b: 10.0, step: '02 · THE FLIP', cap: 'It flips and burns back toward the pad.' },
    { a: 10.0, b: 14.0, step: '03 · GRID FINS', cap: 'Grid fins steer it like a falling arrow.' },
    { a: 14.0, b: 19.0, step: '04 · THE LANDING BURN', x: true, cap: 'One engine relights at the last second.' },
    { a: 19.0, b: 22.0, step: '05 · LEGS + TOUCHDOWN', cap: 'It has to hit zero speed exactly at the ground.' },
    { a: 22.0, b: 23.6, step: '', big: true, cap: 'Flip. Fall. Burn. Land.' },
    { a: 23.6, b: 24.5, step: '', huge: true, cap: 'It can’t hover. So how does it land?' }
  ];
  const setText = (el, s) => { if (el.textContent !== s) el.textContent = s; };
  const fmtKm = n => Math.round(n).toLocaleString('en-US');
  let anchors = {};
  const CALLOUTS = [
    { text: 'GRID FINS', on: [[10.5, 13.3]], at: () => anchors.fin, dx: -70, dy: 50 },
    { text: 'ENGINE', on: [[14.7, 17.0]], at: () => anchors.engine, dx: -60, dy: -30 },
    { text: 'FUEL TANK', on: [[16.4, 18.9]], at: () => anchors.tank, dx: -60, dy: -20 },
    { text: 'LANDING LEGS', on: [[19.3, 21.6]], at: () => anchors.leg, dx: -70, dy: 50 }
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
  const headBottom = () => { const els = [ui.teaser, ui.caption].filter(e => +e.style.opacity > 0.01); const el = els[0] || ui.caption; return el.offsetTop + el.offsetHeight + el.offsetParent.offsetTop + 10; };
  function updateCallouts(t, X) {
    const capBottom = Math.max(headBottom(), 100), twrOn = +ui.twr.style.opacity > 0.05;
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
      const maxX = twrOn ? 210 - w : cy + h > 300 ? 304 - w : 340 - w;
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
  const qa = new T.Quaternion(), mtx = new T.Matrix4(), vS = new T.Vector3(), X1 = V3(1, 0, 0), vA = new T.Vector3(), vB = new T.Vector3();
  function update(t) {
    t = clamp(t, 0, DURATION - 1e-4);
    const s = sAt(t), X = xrayAmt(t);
    const alt = altAt(s), v = speedAt(s), lb = landingBurn(s), thr = throttleAt(s), fl = flameAt(s);

    // X-ray blend
    shells.forEach(sh => { sh.solid.visible = X < 0.995; sh.ghost.visible = X > 0.005; sh.solid.castShadow = X < 0.5; });
    fadeMats.forEach(m => { m.transparent = X > 0.005; m.opacity = 1 - X; m.depthWrite = X < 0.6; });
    domeMat.opacity = 0.5 * X; internals.visible = X > 0.02;
    [loxFlow, fuelFlow].forEach(m => { m.uniforms.uFlow.value = landingBurn(s); m.uniforms.uTime.value = -s; });
    xrayMats.forEach(m => { m.uniforms.uOpacity.value = X; });
    bgMat.uniforms.uX.value = X; rim.intensity = 1.1 * X;

    // booster pose
    booster.position.set(0, alt + FOOT, 0);
    booster.quaternion.setFromAxisAngle(V3(0, 0, 1), -deg(phiAt(s)));
    fins.forEach((f, i) => { f.fold.rotation.z = -PI / 2 * finDeploy(s); f.steer.rotation.x = deg(6) * Math.sin(s * 0.11 + i * 1.7) * pulse(s, 150, 200, 440, 452) * (i % 2 ? 1 : -1); });
    const legK = legDeploy(s);
    legs.forEach(L => {
      L.swing.rotation.z = -deg(LEG_ANG) * legK; L.foot.rotation.z = deg(LEG_ANG) * legK;
      const top = V3(Math.cos(L.a) * R, 7.5, Math.sin(L.a) * R), mid = V3(0, 5.2, 0).applyEuler(L.swing.rotation).applyEuler(new T.Euler(0, -L.a, 0)).add(L.hinge.position);
      L.strut.userData.set(top, mid);
    });
    // upper stage
    const u0 = V3(0, TOP + 0.4 + sepDist(s), 0).applyAxisAngle(V3(0, 0, 1), -deg(55));
    upper.position.set(u0.x, alt + FOOT + u0.y, 0); upper.quaternion.setFromAxisAngle(V3(0, 0, 1), -deg(55));
    upper.visible = s < 40 && !(t >= 19 && t < 24 && s > 400);
    usPlumeMat.uniforms.uAmt.value = usBurn(s); usPlume.visible = usBurn(s) > 0.01;

    // engines + plumes
    const tf = isHook(t) ? s : s;
    [...landMats, bbMat, usPlumeMat].forEach(m => { m.uniforms.uTime.value = tf; });
    const hEng = alt + FOOT, nearGround = clamp(hEng / 30);
    const fthr = s < S_TD ? thr : 0.76 * fl;
    landMats.forEach(m => { m.uniforms.uAmt.value = fl * (0.75 + 0.35 * fthr); m.uniforms.uLen.value = lerp(6, 26, fthr); });
    landPlume.visible = fl > 0.01; landPlume.scale.set(1 + 0.6 * (1 - nearGround), Math.min(1, (hEng + 0.5) / 26) + 0.0001, 1 + 0.6 * (1 - nearGround));
    bbMat.uniforms.uAmt.value = boostback(s); bbPlumes.forEach(p => { p.visible = boostback(s) > 0.01; });
    engines.forEach((e, i) => { e.userData.inner.emissiveIntensity = 1.6 * Math.max(i === 0 ? fl : 0, i === 0 || i === 1 || i === 5 ? boostback(s) : 0); });
    relightMat.opacity = 0.9 * Math.exp(-Math.pow((s - S_LB - 0.2) / 0.35, 2));
    const hitK = fl * clamp((32 - hEng) / 22);
    splash.scale.setScalar(10 + 16 * hitK); splashMat.opacity = hitK * 0.9 * (1 - X);
    plumeLight.position.copy(boosterPoint(-6)); plumeLight.intensity = 9 * fl * (alt < 400 ? 1 : 0.3);

    // dust: the plume scouring the pad, rolling outward
    const dustOn = s2 => landingBurn(s2) * clamp((50 - altAt(s2)) / 34);
    for (let i = 0; i < dust.n; i++) {
      const L = 3.2, ph = rand(i, 71), age = ((s / L + ph) % 1) * L, born = s - age, on = dustOn(born);
      const a = rand(i, 72) * TAU, out = 7 + 36 * (1 - Math.exp(-age / 0.9)) * (0.7 + 0.5 * rand(i, 73));
      const x = Math.cos(a) * out, z = Math.sin(a) * out, y = 0.8 + 1.5 * age + rand(i, 74) * 1.5;
      const size = 4 + 7 * age + rand(i, 75) * 3, al = on * smooth(span(age, 0, 0.25)) * (1 - smooth(span(age, L * 0.3, L))) * smooth(span(out, 9, 19)) * 0.62 * (X < 0.5 ? 1 : 0);
      dust.pos.setXYZ(i, x, y, z); dust.dat.setXYZW(i, size, al, 0.6 * Math.exp(-age * 1.5) * fl, rand(i, 76));
    }
    dust.pos.needsUpdate = dust.dat.needsUpdate = true; dust.m.uniforms.uTime.value = s;
    // cold-gas puffs at the top
    const rc = rcsOn(s);
    for (let i = 0; i < rcs.n; i++) {
      const pod = rcsPods[i % 2], L = 1.2, age = ((s * (s < 60 ? 1 : 0.6) / L + rand(i, 81)) % 1) * L;
      const dir = V3(Math.cos(pod.userData.a), 0, Math.sin(pod.userData.a)).multiplyScalar(i % 4 < 2 ? 1 : -1).applyQuaternion(booster.quaternion);
      const p = boosterPoint(45).add(V3(Math.cos(pod.userData.a) * R, 0, Math.sin(pod.userData.a) * R).applyQuaternion(booster.quaternion)).addScaledVector(dir, 1 + age * 9);
      const burst = smooth(span(Math.sin((s - age) * 2.3 + (i % 2) * 2.0), 0.1, 0.5));
      rcs.pos.setXYZ(i, p.x, p.y, p.z); rcs.dat.setXYZW(i, 0.6 + age * 2.6, rc * burst * (1 - age / L) * 0.32 * (1 - X), 0, rand(i, 82));
    }
    rcs.pos.needsUpdate = rcs.dat.needsUpdate = true;
    // air streaks (relative wind from below while falling through the atmosphere)
    const airK = (1 - X) * clamp((1 - alt / 45000) * 1.4) * pulse(s, 200, 260, 445, 452) * clamp(v / 300);
    for (let i = 0; i < NSTREAK; i++) {
      const a = rand(i, 91) * TAU, r = R + 0.5 + rand(i, 92) * rand(i, 95) * 6, L = 60, y = ((rand(i, 93) * L + s * v * 0.12 * (0.8 + 0.4 * rand(i, 94))) % L) - 5;
      vA.set(Math.cos(a) * r, y, Math.sin(a) * r).applyQuaternion(booster.quaternion).add(booster.position);
      vB.set(Math.cos(a) * r, y - 4 - v * 0.012, Math.sin(a) * r).applyQuaternion(booster.quaternion).add(booster.position);
      const dir = vA.clone().sub(vB), len = dir.length();
      qa.setFromUnitVectors(X1, dir.divideScalar(len)); vS.set(len, 0.05, 0.05); mtx.compose(vA, qa, vS); air.setMatrixAt(i, mtx);
      airCol.setXYZW(i, 0.85, 0.92, 1.0, airK * (i % 3 ? 0 : 0.5) * smooth(span(y, -5, 3)) * (1 - smooth(span(y, 45, 55))));
    }
    air.instanceMatrix.needsUpdate = airCol.needsUpdate = true;

    // environment by altitude
    const look = cameraAt(t, s);
    camera.updateMatrixWorld();
    const camAlt = Math.max(1, camera.position.y);
    bgMat.uniforms.uAlt.value = camAlt;
    const low = 1 - smooth(span(camAlt, 16000, 34000));
    ground.visible = pad.visible = low > 0.01 && X < 0.995;
    envFade.forEach(m => { m.transparent = X > 0.005 || low < 0.99; m.opacity = (1 - X) * low; m.depthWrite = X < 0.6; });
    scene.fog.color.copy(HAZE).lerp(NAVY, X);
    sun.target.position.copy(look); sun.position.copy(look).addScaledVector(SUN_DIR, 150);
    hemi.intensity = lerp(0.12, 0.55, clamp(Math.exp(-camAlt / 9000) * 1.2)) * (1 - 0.2 * X);
    flashMat.uniforms.uAmt.value = 0.25 * Math.exp(-Math.pow((s - S_LB - 0.15) / 0.25, 2)) * (t >= 14 && t < 19 ? 1 : 0);
    bgMat.uniforms.uInvProj.value.copy(camera.projectionMatrixInverse);
    bgMat.uniforms.uCamWorld.value.copy(camera.matrixWorld);
    vhs.uniforms.uAmt.value = pulse(t, REW0 - 0.04, REW0 + 0.06, REW1 - 0.1, REW1);
    vhs.uniforms.uTime.value = t;

    scene.updateMatrixWorld(true);
    anchors = {
      fin: finDeploy(s) > 0.5 ? fins[0].hinge.getWorldPosition(new T.Vector3()).add(V3(0, 0.3, 0)) : null,
      engine: boosterPoint(1.0),
      tank: boosterPoint(10).add(V3(0, 0, R).applyQuaternion(booster.quaternion)),
      leg: legK > 0.3 ? (() => { const p = new T.Vector3(); legs[1].swing.localToWorld(p.set(0, 7, 0)); return p; })() : null
    };

    // overlay
    const sc = SCENES.find(x => t < x.b) || SCENES[SCENES.length - 1];
    const fadeIn = (sc.a === 0 || sc.a === 23.6 || sc.a === 22.0) ? 1 : smooth(span(t, sc.a, sc.a + 0.25)), fadeOut = (sc.b > 24 || sc.b === 2.0 || sc.b === 22.0 || sc.b === 23.6) ? 1 : 1 - smooth(span(t, sc.b - 0.2, sc.b));
    setText(ui.step, sc.step); ui.step.classList.toggle('x', !!sc.x);
    setText(ui.caption, sc.cap); ui.caption.classList.toggle('huge', !!sc.huge); ui.caption.classList.toggle('big', !!sc.big);
    ui.step.style.opacity = ui.caption.style.opacity = (fadeIn * fadeOut).toFixed(3);
    ui.teaser.style.opacity = pulse(t, 12.4, 12.7, 13.8, 14.0).toFixed(3);
    ui.badge.style.opacity = (smooth(span(t, 14.05, 14.4)) * (1 - smooth(span(t, 19.0, 19.3)))).toFixed(3);
    ui.rewind.style.opacity = (t >= REW0 && t < REW1 ? (Math.floor(t * 6) % 2 ? 1 : 0.55) : 0).toFixed(2);
    ui.rewind.style.transform = `translate(0px, ${headBottom() + 6}px)`;
    // the big speed counter
    const kmh = v * 3.6;
    setText(ui.timerV, fmtKm(kmh));
    ui.timer.classList.toggle('zero', kmh < 0.5 && !isHook(t));
    setText(ui.stage, t >= REW0 && t < REW1 ? 'REWIND' : stageAt(s));
    setText(ui.alt, alt >= 1000 ? (alt / 1000).toFixed(alt >= 10000 ? 0 : 1) + ' km' : Math.round(Math.max(0, alt - 0.0)) + ' m');
    setText(ui.speed, fmtKm(kmh) + ' km/h');
    setText(ui.thr, Math.round(thr * 100) + '%');
    // thrust vs weight bars (landing burn)
    const tw = pulse(t, 14.5, 14.9, 18.7, 19.0);
    ui.twr.style.opacity = tw.toFixed(3);
    if (tw > 0.001) {
      const unit = 30, twr = lb > 0.02 ? thr * TWR_MAX : 0;
      ui.barT.style.height = (twr * unit).toFixed(1) + 'px';
      ui.barW.style.height = unit + 'px';
      ui.minLine.style.bottom = (TWR_MIN * unit).toFixed(1) + 'px';
      ui.twr.style.transform = `translate(0px, ${Math.max(headBottom() + 4, 196)}px)`;
    }
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
  const bloom = new T.UnrealBloomPass(new T.Vector2(360, 640), 0.8, 0.55, 1.0);
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
  const fontsWanted = ['700 35px "Barlow Condensed"', '600 19.5px "Barlow Condensed"', '700 36px "Barlow Condensed"', '500 8px "IBM Plex Mono"', '600 10px "IBM Plex Mono"', '600 31px "IBM Plex Mono"'];
  Promise.all(fontsWanted.map(f => document.fonts.load(f))).then(() => document.fonts.ready).then(() => {
    draw(0);
    requestAnimationFrame(() => { window.__ready = true; });
  });
})();

/* Rocket Engine · Inside the Mechanism
   Procedural Three.js (r128) scene. Everything on screen is a pure function of the time t (0–45 s):
   window.__render(t) draws one frame, window.__ready turns true once fonts and the first frame are done.
   Units are metres, y is up. The engine fires straight down on a vertical test stand; "rig" coordinates have
   the injector face at the origin. The hook (0–3 s) and the final shot (40–45 s) share one ignition clock
   s = t (hook) or t − 45 (final), so the last frame flows straight back into the first. */
(() => {
  'use strict';
  const T = THREE, PI = Math.PI, TAU = PI * 2;
  const DURATION = 45, EY = 6.9;                      // world height of the injector face
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const smooth = k => { k = clamp(k); return k * k * (3 - 2 * k); };
  const span = (t, a, b) => clamp((t - a) / (b - a));
  const pulse = (t, a, b, c, d) => smooth(span(t, a, b)) * (1 - smooth(span(t, c, d)));
  const rand = (i, j) => { const x = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return x - Math.floor(x); };
  const RENDER = new URLSearchParams(location.search).has('render');
  const V = (x, y, z) => new T.Vector3(x, y, z);

  // ---------------------------------------------------------------- page frame + renderer
  const frameEl = document.getElementById('frame'), stage = document.getElementById('stage');
  const renderer = new T.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  stage.appendChild(renderer.domElement);

  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(36, 360 / 640, 0.05, 600);
  const spaceCam = new T.PerspectiveCamera(36, 360 / 640, 0.05, 600);
  const HORIZON = new T.Color(0.07, 0.072, 0.082), NAVY = new T.Color(0.006, 0.014, 0.034);
  const fog = new T.Fog(HORIZON.clone(), 30, 190);
  scene.fog = fog;

  const rtOpts = { minFilter: T.LinearFilter, magFilter: T.LinearFilter, format: T.RGBAFormat, type: T.HalfFloatType };
  let rt;
  if (renderer.capabilities.isWebGL2) { rt = new T.WebGLMultisampleRenderTarget(360, 640, rtOpts); rt.samples = 4; }
  else rt = new T.WebGLRenderTarget(360, 640, Object.assign(rtOpts, { type: T.UnsignedByteType }));
  const composer = new T.EffectComposer(renderer, rt);

  // ---------------------------------------------------------------- environment, lights, sky
  {
    const env = new T.Scene();
    const basic = c => new T.MeshBasicMaterial({ color: c, side: T.DoubleSide });
    env.add(new T.Mesh(new T.SphereGeometry(50, 32, 16), new T.MeshBasicMaterial({ color: new T.Color(0.045, 0.055, 0.08), side: T.BackSide })));
    const band = new T.Mesh(new T.CylinderGeometry(48, 48, 7, 32, 1, true), basic(new T.Color(0.14, 0.13, 0.13)));
    band.position.y = 2; env.add(band);
    const gnd = new T.Mesh(new T.CircleGeometry(49, 32), basic(new T.Color(0.12, 0.09, 0.06)));
    gnd.rotation.x = -PI / 2; gnd.position.y = -1.5; env.add(gnd);
    const sunPanel = new T.Mesh(new T.PlaneGeometry(9, 9), basic(new T.Color(6, 4.6, 3.4)));
    sunPanel.position.set(-28, 22, 26); sunPanel.lookAt(0, 0, 0); env.add(sunPanel);
    const top = new T.Mesh(new T.PlaneGeometry(40, 40), basic(new T.Color(0.26, 0.3, 0.4)));
    top.position.y = 46; top.rotation.x = PI / 2; env.add(top);
    scene.environment = new T.PMREMGenerator(renderer).fromScene(env, 0.03).texture;
  }
  renderer.autoClear = false;            // the stage pass clears explicitly (it may draw two views into one frame)
  const sun = new T.DirectionalLight(0xffd6b0, 2.2);
  sun.position.set(-9, 12, 10); sun.target.position.set(0, 5, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 11, bottom: -9, near: 1, far: 50 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const hemi = new T.HemisphereLight(0x8a9cb8, 0x3e3024, 0.5);
  scene.add(hemi);
  const rim = new T.DirectionalLight(0x7fd8ff, 0);          // cool key used only in X-ray
  rim.position.set(6, 8, -8); scene.add(rim);
  const floods = [[-3.2, 2.6, 3.4], [3.4, 2.4, 2.8]].map(([x, y, z]) => {
    const l = new T.SpotLight(0xe6eeff, 0, 26, 0.55, 0.6, 1.2); l.position.set(x, y, z); l.target.position.set(0, EY - 1.6, 0);
    scene.add(l, l.target); return l;
  });
  const plumeLight = new T.PointLight(0xff8a40, 0, 16, 1.6); plumeLight.position.set(0, EY - 4.6, 0.4); scene.add(plumeLight);
  const padLight = new T.PointLight(0xff7a30, 0, 12, 1.6); padLight.position.set(0, 1.4, 0.8); scene.add(padLight);
  const chamberLight = new T.PointLight(0xffb070, 0, 2.4, 2); chamberLight.position.set(0, EY - 0.45, 0); scene.add(chamberLight);

  const bgMat = new T.ShaderMaterial({
    uniforms: { uX: { value: 0 }, uSpace: { value: 0 }, uRes: { value: new T.Vector2(1080, 1920) }, uInvProj: { value: new T.Matrix4() }, uCamWorld: { value: new T.Matrix4() } },
    vertexShader: 'varying vec2 vNdc; void main(){ vNdc = position.xy; gl_Position = vec4(position.xy, 0.9999, 1.0); }',
    fragmentShader: `
      varying vec2 vNdc; uniform float uX; uniform float uSpace; uniform vec2 uRes; uniform mat4 uInvProj; uniform mat4 uCamWorld;
      void main(){
        vec4 v = uInvProj * vec4(vNdc, 1.0, 1.0);
        vec3 d = normalize((uCamWorld * vec4(v.xyz / v.w, 0.0)).xyz);
        float e = d.y;
        vec3 sky = mix(vec3(0.07, 0.072, 0.082), vec3(0.012, 0.016, 0.03), smoothstep(0.0, 0.45, e));
        sky += vec3(0.022, 0.011, 0.004) * exp(-max(e, 0.0) * 12.0);
        vec3 space = vec3(0.002, 0.003, 0.007) + vec3(0.006, 0.008, 0.016) * (1.0 - abs(e));
        sky = mix(sky, space, uSpace);
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
  // full-frame flash, drawn inside the canvas so the overlay text stays crisp on top
  const flashMat = new T.ShaderMaterial({
    uniforms: { uAmt: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'varying vec2 vUv; uniform float uAmt; void main(){ float v = 1.0 - 0.5 * length(vUv - vec2(0.5, 0.42)); gl_FragColor = vec4(vec3(1.0, 0.93, 0.82) * uAmt * v * 2.0, 1.0); }',
    transparent: true, depthWrite: false, depthTest: false, blending: T.AdditiveBlending
  });
  const flash = new T.Mesh(new T.PlaneGeometry(2, 2), flashMat);
  flash.frustumCulled = false; flash.renderOrder = 100; scene.add(flash);

  // ---------------------------------------------------------------- geometry helpers
  // profile points are [radius, y]; LatheGeometry already revolves around y
  const lathe = (pts, seg = 64, phiStart = 0, phiLength = TAU) => new T.LatheGeometry(pts.map(([r, y]) => new T.Vector2(r, y)), seg, phiStart, phiLength);
  const canvasTex = (w, h, draw, srgb = true) => {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h);
    const t = new T.CanvasTexture(cv); t.wrapS = t.wrapT = T.RepeatWrapping; if (srgb) t.encoding = T.sRGBEncoding;
    t.anisotropy = 4; return t;
  };
  // piecewise-linear lookup on [[r, y], …] sorted by descending y
  const profile = pts => y => {
    if (y >= pts[0][1]) return pts[0][0];
    for (let i = 1; i < pts.length; i++) if (y >= pts[i][1]) { const [r0, y0] = pts[i - 1], [r1, y1] = pts[i]; return lerp(r0, r1, (y - y0) / (y1 - y0)); }
    return pts[pts.length - 1][0];
  };
  const curve = pts => new T.CatmullRomCurve3(pts.map(p => V(...p)), false, 'centripetal');

  // ---------------------------------------------------------------- materials
  const std = (color, metalness, roughness, extra = {}) => { const m = new T.MeshStandardMaterial(Object.assign({ color, metalness, roughness }, extra)); m.color.convertSRGBToLinear(); return m; };
  const DS = { side: T.DoubleSide };
  // regeneratively cooled tube wall: ~200 brazed tubes around the chamber and upper nozzle
  const tubeTex = canvasTex(2048, 16, (x, w, h) => {
    const n = 200, cw = w / n;
    for (let i = 0; i < n; i++) { const g = x.createLinearGradient(i * cw, 0, (i + 1) * cw, 0); g.addColorStop(0, '#5a5a5a'); g.addColorStop(0.45, '#ffffff'); g.addColorStop(1, '#4a4a4a'); x.fillStyle = g; x.fillRect(i * cw, 0, cw, h); }
  });
  const tubeBump = canvasTex(2048, 16, (x, w, h) => {
    const n = 200, cw = w / n;
    for (let i = 0; i < n; i++) { const g = x.createLinearGradient(i * cw, 0, (i + 1) * cw, 0); g.addColorStop(0, '#000'); g.addColorStop(0.5, '#fff'); g.addColorStop(1, '#000'); x.fillStyle = g; x.fillRect(i * cw, 0, cw, h); }
  }, false);
  const regenMat = std(0xb87a50, 0.85, 0.36, Object.assign({ map: tubeTex, bumpMap: tubeBump, bumpScale: 0.004 }, DS));
  const extGlow = canvasTex(16, 256, (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#000'); g.addColorStop(0.35, '#200400'); g.addColorStop(0.5, '#ffffff'); g.addColorStop(0.65, '#200400'); g.addColorStop(1, '#000'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
  extGlow.flipY = false;
  const extMat = std(0x45403c, 0.75, 0.42, Object.assign({ emissive: new T.Color(1.0, 0.36, 0.1), emissiveMap: extGlow }, DS)); extMat.emissiveIntensity = 0;
  const steelMat = std(0xb9bec4, 0.9, 0.3, DS);
  const pumpMat = std(0xc6cace, 0.8, 0.34, DS);
  const pipeMat = std(0xd2d6da, 0.9, 0.24);
  const darkMat = std(0x2f3236, 0.6, 0.5, DS);
  const impMat = std(0xd8dce0, 0.75, 0.28, DS);
  const turbMat = std(0x9a8f84, 0.85, 0.34, Object.assign({ emissive: new T.Color(1.0, 0.35, 0.08) }, DS)); turbMat.emissiveIntensity = 0;
  const shaftMat = std(0xe4e6e8, 0.6, 0.28);
  const tankTex = (label, band) => canvasTex(2048, 1024, (x, w, h) => {
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(80,84,90,0.35)'; [0.18, 0.5, 0.82].forEach(v => x.fillRect(0, v * h - 2, w, 4));
    for (let k = 0; k < 8; k++) x.fillRect((k / 8) * w - 1.5, 0.18 * h, 3, 0.64 * h);
    x.fillStyle = band; x.fillRect(0, 0.62 * h, w, 0.05 * h);
    x.fillStyle = '#1b1d20'; x.font = 'bold 120px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(label, 0.115 * w, 0.4 * h);
  });
  const fuelTankMat = std(0xe9e9e6, 0.15, 0.45, Object.assign({ map: tankTex('RP-1', '#b8322a') }, DS));
  const oxTankMat = std(0xe9e9e6, 0.15, 0.45, Object.assign({ map: tankTex('LOX', '#2f63b8') }, DS));
  const skirtMat = std(0x9aa0a6, 0.6, 0.45, DS);
  const standMat = std(0x3d4754, 0.55, 0.5);
  const lampMat = std(0x222326, 0.4, 0.6, { emissive: new T.Color(0.9, 0.95, 1.0) }); lampMat.emissiveIntensity = 0;
  const padTex = canvasTex(512, 512, (x, w, h) => {
    x.fillStyle = '#8c8a84'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 4000; i++) { const g = rand(i, 1); x.fillStyle = g < 0.5 ? `rgba(60,58,54,${0.15 + rand(i, 2) * 0.2})` : `rgba(170,168,160,${0.12 + rand(i, 2) * 0.2})`; x.fillRect(rand(i, 3) * w, rand(i, 4) * h, 1 + rand(i, 5) * 2, 1 + rand(i, 5) * 2); }
    x.strokeStyle = 'rgba(40,38,36,0.6)'; x.lineWidth = 2; [0.25, 0.5, 0.75].forEach(v => { x.beginPath(); x.moveTo(0, v * h); x.lineTo(w, v * h); x.stroke(); x.beginPath(); x.moveTo(v * w, 0); x.lineTo(v * w, h); x.stroke(); });
    for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(30,26,22,${0.05 + rand(i, 9) * 0.08})`; x.beginPath(); x.arc(w / 2 + (rand(i, 7) - 0.5) * w * 0.5, h / 2 + (rand(i, 8) - 0.5) * h * 0.5, 20 + rand(i, 6) * 60, 0, TAU); x.fill(); }
  });
  padTex.repeat.set(2, 2);
  const padMat = std(0xffffff, 0, 0.92, { map: padTex, envMapIntensity: 0.4 });
  const deflMat = std(0x55585c, 0.6, 0.55, { emissive: new T.Color(1.0, 0.3, 0.06) }); deflMat.emissiveIntensity = 0;
  const groundTex = canvasTex(512, 512, (x, w, h) => {
    x.fillStyle = '#6a5238'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) { const g = rand(i, 9); x.fillStyle = `rgba(${g < 0.5 ? '56,40,25' : '126,102,72'},${0.06 + rand(i, 8) * 0.08})`; x.beginPath(); x.ellipse(rand(i, 6) * w, rand(i, 7) * h, 20 + rand(i, 10) * 70, 10 + rand(i, 11) * 40, rand(i, 12) * PI, 0, TAU); x.fill(); }
    for (let i = 0; i < 9000; i++) { const g = rand(i, 1); x.fillStyle = g < 0.5 ? `rgba(46,34,22,${0.25 + rand(i, 2) * 0.3})` : `rgba(146,122,90,${0.2 + rand(i, 2) * 0.3})`; x.fillRect(rand(i, 3) * w, rand(i, 4) * h, 1 + rand(i, 5) * 2, 1 + rand(i, 5) * 2); }
  });
  groundTex.repeat.set(70, 70);
  const groundMat = std(0xffffff, 0, 0.97, { map: groundTex, envMapIntensity: 0.4 });
  const fuelLiq = std(0xff6a58, 0.0, 0.3, { emissive: new T.Color(0.5, 0.08, 0.05), transparent: true, opacity: 0, depthWrite: false, side: T.DoubleSide });
  const oxLiq = std(0x6aa8ff, 0.0, 0.3, { emissive: new T.Color(0.06, 0.18, 0.5), transparent: true, opacity: 0, depthWrite: false, side: T.DoubleSide });

  // X-ray "glass": additive fresnel shell
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
  const xCase = xrayMat(0x5fd8ff, 0.01, 2.8, 0.42);
  const xEngine = xrayMat(0x5fd8ff, 0.012, 2.4, 0.4);
  const xPipe = xrayMat(0x9fe6ff, 0.03, 1.6, 0.45);
  const xStand = xrayMat(0x3f8fd0, 0.02, 2.0, 0.4);
  const edgeMat = new T.LineBasicMaterial({ color: new T.Color(0.35, 0.85, 1.1), transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false });

  const shells = [];
  const fadeMats = [regenMat, extMat, steelMat, pumpMat, pipeMat, darkMat, fuelTankMat, oxTankMat, skirtMat, standMat, lampMat];
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
  function beamBetween(a, b, w, mat, xmat, parent) {
    const d = b.clone().sub(a), L = d.length(), g = part(new T.BoxGeometry(L, w, w), mat, xmat, parent);
    g.position.copy(a).add(b).multiplyScalar(0.5); g.quaternion.setFromUnitVectors(V(1, 0, 0), d.normalize()); return g;
  }
  function cylBetween(a, b, r, mat, xmat, parent, seg = 16) {
    const d = b.clone().sub(a), L = d.length(), g = xmat ? part(new T.CylinderGeometry(r, r, L, seg), mat, xmat, parent) : solid(new T.CylinderGeometry(r, r, L, seg), mat, parent);
    g.position.copy(a).add(b).multiplyScalar(0.5); g.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); return g;
  }

  // ---------------------------------------------------------------- ground, pad, flame deflector
  const earthOnly = new T.Group(); scene.add(earthOnly);
  const ground = new T.Mesh(new T.CircleGeometry(320, 64), groundMat);
  ground.rotation.x = -PI / 2; ground.position.y = -0.02; ground.receiveShadow = true; earthOnly.add(ground);
  const pad = new T.Mesh(new T.BoxGeometry(16, 0.3, 16), padMat); pad.position.y = -0.13; pad.receiveShadow = true; earthOnly.add(pad);
  {
    // deflector: two curved steel ramps meeting in a ridge under the nozzle, throwing the plume out along ±x
    const sh = new T.Shape(); sh.moveTo(-3.2, 0);
    for (let i = 0; i <= 20; i++) { const k = i / 20, x = lerp(-3.2, 0, k); sh.lineTo(x, 0.95 * Math.pow(k, 2.2)); }
    for (let i = 1; i <= 20; i++) { const k = 1 - i / 20, x = lerp(0, 3.2, i / 20); sh.lineTo(x, 0.95 * Math.pow(k, 2.2)); }
    sh.lineTo(3.2, 0); sh.lineTo(-3.2, 0);
    const g = new T.ExtrudeGeometry(sh, { depth: 2.6, bevelEnabled: false, curveSegments: 4 }); g.translate(0, 0.02, -1.3);
    const m = new T.Mesh(g, deflMat); m.castShadow = m.receiveShadow = true; earthOnly.add(m);
    [-1, 1].forEach(sz => { const w = new T.Mesh(new T.BoxGeometry(6.6, 1.2, 0.25), padMat); w.position.set(0, 0.6, sz * 1.45); w.castShadow = w.receiveShadow = true; earthOnly.add(w); });
  }
  const envFade = [groundMat, padMat, deflMat];

  // ---------------------------------------------------------------- engine + stage ("rig", injector face at the origin)
  const rig = new T.Group(); rig.position.y = EY; scene.add(rig);

  // nozzle contour: cylindrical chamber, cosine-blended convergence to the throat, Rao-style bell to the exit
  const CH_R = 0.34, CH_Y = -0.82, TH_Y = -1.22, TH_R = 0.155, EX_Y = -3.3, EX_R = 0.88, JOINT_Y = -2.05;
  const inner = [];
  for (let i = 0; i <= 8; i++) inner.push([CH_R, lerp(0, CH_Y, i / 8)]);
  for (let i = 1; i <= 16; i++) { const k = i / 16; inner.push([TH_R + (CH_R - TH_R) * (0.5 + 0.5 * Math.cos(PI * k)), lerp(CH_Y, TH_Y, k)]); }
  for (let i = 1; i <= 6; i++) { const a = (i / 6) * (32 * PI / 180), rho = 0.25; inner.push([TH_R + rho * (1 - Math.cos(a)), TH_Y - rho * Math.sin(a)]); }
  {
    const p0 = inner[inner.length - 1], p1 = [0.726, -2.202], p2 = [EX_R, EX_Y];
    for (let i = 1; i <= 30; i++) { const k = i / 30, a = (1 - k) * (1 - k), b = 2 * k * (1 - k), c = k * k; inner.push([a * p0[0] + b * p1[0] + c * p2[0], a * p0[1] + b * p1[1] + c * p2[1]]); }
  }
  const nozR = profile(inner);
  const thick = y => y > TH_Y - 0.1 ? 0.045 : lerp(0.045, 0.014, span(y, TH_Y - 0.1, EX_Y));
  const shellPts = (y0, y1) => {
    const ins = inner.filter(([, y]) => y <= y0 + 1e-6 && y >= y1 - 1e-6);
    if (ins[0][1] < y0) ins.unshift([nozR(y0), y0]);
    if (ins[ins.length - 1][1] > y1) ins.push([nozR(y1), y1]);
    const out = ins.map(([r, y]) => [r + thick(y), y]);
    return out.concat(ins.slice().reverse());
  };
  const engine = new T.Group(); rig.add(engine);
  part(lathe(shellPts(0.0, JOINT_Y), 96), regenMat, xEngine, engine);
  part(lathe(shellPts(JOINT_Y, EX_Y), 96), extMat, xEngine, engine);
  [[JOINT_Y, 0.05, 0.032], [-1.62, 0.035, 0.02], [-2.7, 0.03, 0.018], [EX_Y + 0.02, 0.02, 0.016]].forEach(([y, off, tube]) => {
    part(new T.TorusGeometry(nozR(y) + thick(y) + off * 0.5, tube, 10, 96).rotateX(PI / 2), steelMat, xEngine, engine, [0, y, 0]);
  });
  // injector head: dome, ox inlet boss, gimbal block; fuel manifold ring around the chamber top
  const domePts = [[0.38, 0.0], [0.385, 0.07], [0.35, 0.16], [0.27, 0.24], [0.15, 0.3], [0.0, 0.32]];
  part(lathe(domePts, 64), steelMat, xEngine, engine);
  part(new T.TorusGeometry(0.42, 0.045, 12, 64).rotateX(PI / 2), steelMat, xEngine, engine, [0, -0.06, 0]);
  solid(new T.CylinderGeometry(0.12, 0.15, 0.22, 24), darkMat, engine, [0, 0.42, 0]);
  solid(new T.SphereGeometry(0.09, 16, 12), steelMat, engine, [0, 0.55, 0]);
  // injector plate (internal): copper face with rings of orifices
  const injTex = canvasTex(512, 512, (x, w, h) => {
    x.fillStyle = '#d0a080'; x.fillRect(0, 0, w, h);
    [0.18, 0.36, 0.54, 0.72, 0.88].forEach((rr, ri) => { const n = 10 + ri * 10; for (let i = 0; i < n; i++) { const a = (i / n) * TAU + ri * 0.2; x.fillStyle = ri % 2 ? '#2a1a12' : '#3a2416'; x.beginPath(); x.arc(w / 2 + Math.cos(a) * rr * w / 2, h / 2 + Math.sin(a) * rr * h / 2, 4.5, 0, TAU); x.fill(); } });
  });
  solid(new T.CircleGeometry(CH_R - 0.005, 48).rotateX(PI / 2), std(0xffffff, 0.8, 0.35, { map: injTex, side: T.DoubleSide }), engine, [0, -0.012, 0]);

  // turbopump on the +x side: oxidizer pump (top), fuel pump, turbine (bottom) on one shaft
  const PX = 0.8, PZ = -0.2;
  const pump = new T.Group(); pump.position.set(PX, 0, PZ); rig.add(pump);
  part(lathe([[0.075, 1.12], [0.09, 1.0], [0.17, 0.95], [0.27, 0.88], [0.28, 0.78], [0.2, 0.72], [0.08, 0.7]], 40), pumpMat, xEngine, pump);
  part(new T.TorusGeometry(0.235, 0.06, 12, 40).rotateX(PI / 2), pumpMat, xEngine, pump, [0, 0.8, 0]);
  part(lathe([[0.08, 0.6], [0.18, 0.55], [0.26, 0.48], [0.26, 0.36], [0.18, 0.3], [0.08, 0.28]], 40), pumpMat, xEngine, pump);
  part(new T.TorusGeometry(0.22, 0.055, 12, 40).rotateX(PI / 2), pumpMat, xEngine, pump, [0, 0.42, 0]);
  part(lathe([[0.08, 0.7], [0.085, 0.6]], 24), darkMat, xEngine, pump);
  part(lathe([[0.08, 0.28], [0.09, 0.1], [0.22, 0.03], [0.24, -0.1], [0.2, -0.2], [0.1, -0.24]], 40), pumpMat, xEngine, pump);
  part(new T.CylinderGeometry(0.06, 0.06, 0.3, 20).rotateZ(PI / 2), darkMat, xEngine, pump, [0.3, -0.1, 0]);   // gas generator
  const rotor = new T.Group(); pump.add(rotor);
  solid(new T.CylinderGeometry(0.028, 0.028, 1.2, 16), shaftMat, rotor, [0, 0.42, 0]);
  const impeller = (y, r0, r1, h, n) => {
    const g = new T.Group(); g.position.y = y; rotor.add(g);
    solid(new T.ConeGeometry(r0 * 1.2, h * 1.4, 20), impMat, g, [0, h * 0.2, 0]);
    const blade = new T.BoxGeometry(r1 - r0, h, 0.012).translate((r0 + r1) / 2, 0, 0);
    const m = new T.InstancedMesh(blade, impMat, n), o = new T.Object3D();
    for (let i = 0; i < n; i++) { o.rotation.set(0, (i / n) * TAU, 0.0); o.updateMatrix(); m.setMatrixAt(i, o.matrix); }
    m.castShadow = true; g.add(m);
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU; const sw = solid(new T.BoxGeometry(0.05, h * 0.8, 0.01), impMat, g); sw.position.set(Math.cos(a) * r1 * 0.98, 0, -Math.sin(a) * r1 * 0.98); sw.rotation.y = a + 0.9; }
    return g;
  };
  impeller(0.82, 0.05, 0.2, 0.07, 8);
  impeller(0.43, 0.05, 0.18, 0.06, 8);
  {
    const tb = new T.BoxGeometry(0.075, 0.05, 0.012).translate(0.15, 0, 0), n = 24, m = new T.InstancedMesh(tb, turbMat, n), o = new T.Object3D();
    for (let i = 0; i < n; i++) { o.rotation.set(0, (i / n) * TAU, 0.5); o.updateMatrix(); m.setMatrixAt(i, o.matrix); }
    m.position.y = -0.08; rotor.add(m);
    solid(new T.CylinderGeometry(0.11, 0.11, 0.03, 32), turbMat, rotor, [0, -0.08, 0]);
  }

  // propellant lines (tube + an inner tinted "liquid" core that shows in X-ray)
  const lines = [];
  function line(pts, r, liqMat, endCapAt) {
    const c = curve(pts);
    part(new T.TubeGeometry(c, Math.max(24, pts.length * 14), r, 14, false), pipeMat, xPipe, rig);
    const core = new T.Mesh(new T.TubeGeometry(c, Math.max(24, pts.length * 14), r * 0.62, 10, false), liqMat); core.renderOrder = 4; rig.add(core);
    lines.push(c); return c;
  }
  const OX_FEED = [[0.62, 4.87, 0.33], [0.95, 4.75, 0.32], [1.2, 4.45, 0.3], [1.2, 3.2, 0.3], [1.2, 2.0, 0.3], [1.1, 1.45, 0.15], [0.88, 1.22, -0.12], [0.8, 1.12, -0.2]];
  const FUEL_FEED = [[0.45, 1.59, -0.45], [0.55, 1.3, -0.52], [0.72, 0.85, -0.58], [0.8, 0.52, -0.56], [0.8, 0.42, -0.46], [0.8, 0.42, -0.42]];
  const OX_OUT = [[0.62, 0.8, -0.1], [0.45, 0.65, 0.05], [0.3, 0.42, 0.06], [0.22, 0.27, 0.03]];
  const FUEL_OUT = [[0.62, 0.42, -0.12], [0.55, 0.22, -0.12], [0.47, 0.03, -0.11], [0.42, -0.04, -0.1]];
  line(OX_FEED, 0.06, oxLiq); line(FUEL_FEED, 0.055, fuelLiq); line(OX_OUT, 0.045, oxLiq); line(FUEL_OUT, 0.042, fuelLiq);
  // turbine exhaust duct down the side of the nozzle
  const exhaustDuct = curve([[PX, -0.24, PZ], [0.9, -0.7, -0.32], [1.0, -1.6, -0.4], [1.08, -2.3, -0.42], [1.12, -2.6, -0.43]]);
  part(new T.TubeGeometry(exhaustDuct, 40, 0.065, 12, false), darkMat, xEngine, rig);
  part(new T.CylinderGeometry(0.1, 0.07, 0.16, 16, 1, true), darkMat, xEngine, rig, [1.12, -2.66, -0.43]);
  // gimbal actuators
  [[V(-0.9, 1.4, 0.35), V(-0.33, -0.8, 0.12)], [V(-0.3, 1.4, -0.92), V(-0.12, -0.8, -0.33)]].forEach(([a, b]) => {
    const mid = a.clone().lerp(b, 0.55);
    cylBetween(a, mid, 0.05, steelMat, xEngine, rig); cylBetween(mid, b, 0.025, pipeMat, xEngine, rig);
  });

  // stage: aft skirt, thrust struts, fuel tank (RP-1), intertank, oxidizer tank (LOX)
  const R_T = 1.05, FT = [1.95, 3.95], OT = [5.2, 7.45], DOME = 0.45;
  const tankPts = (y0, y1, rr = R_T, dome = DOME) => {
    const p = [];
    for (let i = 0; i <= 12; i++) { const a = (i / 12) * PI / 2; p.push([rr * Math.sin(a), y0 - dome * Math.cos(a)]); }
    for (let i = 0; i <= 12; i++) { const a = (i / 12) * PI / 2; p.push([rr * Math.cos(a), y1 + dome * Math.sin(a)]); }
    return p;
  };
  part(lathe(tankPts(...FT), 72), fuelTankMat, xCase, rig);
  part(lathe(tankPts(...OT), 72), oxTankMat, xCase, rig);
  part(lathe([[R_T, 1.4], [R_T, 1.95]], 72), skirtMat, xCase, rig);
  part(lathe([[R_T, FT[1]], [R_T, OT[0]]], 72), skirtMat, xCase, rig);
  part(lathe([[R_T, OT[1]], [R_T, 8.15]], 72), skirtMat, xCase, rig);
  part(new T.TorusGeometry(R_T, 0.04, 8, 72).rotateX(PI / 2), steelMat, xCase, rig, [0, 1.4, 0]);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.3; beamBetween(V(0.1 * Math.cos(a), 0.52, 0.1 * Math.sin(a)), V(0.98 * Math.cos(a), 1.4, 0.98 * Math.sin(a)), 0.05, steelMat, xEngine, rig); }
  // liquid inside the tanks (X-ray only), filled to ~80 %
  const liquid = (y0, y1, fill, mat) => {
    const top = lerp(y0, y1, fill), p = tankPts(y0, top, R_T - 0.03, DOME - 0.03).slice(0, 13);
    p.push([R_T - 0.03, top], [0, top]);
    const m = new T.Mesh(lathe(p, 64), mat); m.renderOrder = 3; rig.add(m); return m;
  };
  liquid(...FT, 0.8, fuelLiq); liquid(...OT, 0.8, oxLiq);

  // edge lines for the X-ray look
  const edges = new T.Group(); rig.add(edges);
  const ring = (r, y, seg = 96) => { const p = []; for (let i = 0; i < seg; i++) { const a = (i / seg) * TAU; p.push(V(Math.cos(a) * r, y, Math.sin(a) * r)); } edges.add(new T.LineLoop(new T.BufferGeometry().setFromPoints(p), edgeMat)); };
  const meridian = (pts, a) => edges.add(new T.Line(new T.BufferGeometry().setFromPoints(pts.map(([r, y]) => V(Math.cos(a) * r, y, Math.sin(a) * r))), edgeMat));
  [[CH_R + 0.045, 0], [CH_R + 0.045, CH_Y], [TH_R + 0.045, TH_Y], [nozR(JOINT_Y) + 0.03, JOINT_Y], [EX_R + 0.014, EX_Y]].forEach(([r, y]) => ring(r, y));
  [FT[0], FT[1], OT[0], OT[1], 1.4].forEach(y => ring(R_T, y));
  for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU + PI / 8; meridian(inner.map(([r, y]) => [r + thick(y), y]), a); meridian(tankPts(...FT), a); meridian(tankPts(...OT), a); }
  // Mach 1 marker at the throat
  const machMat = new T.MeshBasicMaterial({ color: new T.Color(0.5, 0.95, 1.4), transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, toneMapped: false });
  const machRing = new T.Mesh(new T.RingGeometry(TH_R * 0.15, TH_R - 0.004, 48).rotateX(PI / 2), machMat); machRing.position.y = TH_Y; machRing.renderOrder = 12; rig.add(machRing);
  const machEdge = new T.Mesh(new T.TorusGeometry(TH_R - 0.004, 0.006, 6, 64).rotateX(PI / 2), machMat); machEdge.position.y = TH_Y; machEdge.renderOrder = 12; rig.add(machEdge);

  // ---------------------------------------------------------------- test stand (Earth only)
  const stand = new T.Group(); earthOnly.add(stand);
  const SC = 1.85, TOP = EY + 8.45;
  [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([sx, sz]) => beamBetween(V(sx * SC, 0, sz * SC), V(sx * SC, TOP, sz * SC), 0.2, standMat, xStand, stand));
  [2.3, EY + 1.4, EY + 4.5, EY + 8.2, TOP].forEach(y => {
    beamBetween(V(-SC, y, -SC), V(SC, y, -SC), 0.14, standMat, xStand, stand); beamBetween(V(-SC, y, SC), V(SC, y, SC), 0.14, standMat, xStand, stand);
    beamBetween(V(-SC, y, -SC), V(-SC, y, SC), 0.14, standMat, xStand, stand); beamBetween(V(SC, y, -SC), V(SC, y, SC), 0.14, standMat, xStand, stand);
  });
  [[2.3, EY + 1.4], [EY + 1.4, EY + 4.5], [EY + 4.5, EY + 8.2]].forEach(([y0, y1]) => {
    beamBetween(V(-SC, y0, -SC), V(SC, y1, -SC), 0.09, standMat, xStand, stand);
    beamBetween(V(-SC, y0, SC * 0.999), V(-SC, y1, -SC), 0.09, standMat, xStand, stand);
  });
  // engine mount: beams from the columns to the aft-skirt ring, and tank support rings
  [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([sx, sz]) => beamBetween(V(sx * SC, EY + 1.4, sz * SC), V(sx * 0.72, EY + 1.4, sz * 0.72), 0.12, standMat, xStand, stand));
  // floodlight fixtures
  [[-3.2, 2.6, 3.4], [3.4, 2.4, 2.8]].forEach(([x, y, z]) => {
    beamBetween(V(x, 0, z), V(x, y, z), 0.08, standMat, xStand, stand);
    const head = part(new T.BoxGeometry(0.42, 0.3, 0.16), lampMat, xStand, stand, [x, y + 0.05, z]); head.lookAt(0, EY - 1.6, 0);
  });

  // ---------------------------------------------------------------- shared shader bits
  const NOISE = `
    float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
                 mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
    float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * n3(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }`;
  const fxVert = `varying vec3 vP; varying vec3 vN; varying vec3 vV; varying vec2 vUv;
    void main(){ vUv = uv; vec4 p = vec4(position, 1.0); vec3 nn = normal;
    #ifdef USE_INSTANCING
      p = instanceMatrix * p; nn = mat3(instanceMatrix) * nn;
    #endif
    vP = p.xyz; vec4 mv = modelViewMatrix * p; vN = normalize(normalMatrix * nn); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
  const fx = (frag, uniforms = {}) => new T.ShaderMaterial({ uniforms: Object.assign({ uTime: { value: 0 }, uAmt: { value: 0 }, uVac: { value: 0 } }, uniforms), vertexShader: fxVert, fragmentShader: NOISE + frag, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide });

  // ---------------------------------------------------------------- combustion glow inside the chamber
  const glowMat = fx(`
    varying vec3 vP; varying vec3 vN; varying vec3 vV; varying vec2 vUv; uniform float uTime; uniform float uAmt;
    void main(){
      float s = clamp(-vP.y / 1.25, 0.0, 1.0);
      float ang = atan(vP.z, vP.x);
      float n = fbm(vec3(ang * 3.0, vP.y * 6.0 + uTime * 5.0, length(vP.xz) * 8.0));
      float n2 = fbm(vec3(ang * 7.0 + 2.0, vP.y * 13.0 + uTime * 9.0, 1.3));
      vec3 col = mix(vec3(1.0, 0.82, 0.55) * 1.8, vec3(1.0, 0.5, 0.18) * 1.5, smoothstep(0.0, 0.8, s));
      float facing = pow(abs(dot(normalize(vN), normalize(vV))), 0.7);
      float a = smoothstep(0.0, 0.08, s) * (0.25 + 1.4 * n * n2 * 2.0);
      gl_FragColor = vec4(col, a * facing * uAmt * 0.07);
    }`);
  [0.21, 0.3].forEach(rr => {
    const p = inner.filter(([, y]) => y > TH_Y - 0.02).map(([r, y]) => [Math.min(r * (rr / CH_R) * 1.0, r - 0.02), y]);
    const m = new T.Mesh(lathe(p, 64), glowMat); m.renderOrder = 9; engine.add(m);
  });

  // ---------------------------------------------------------------- exhaust plume (Earth: shock diamonds; vacuum: wide and soft)
  const plumeMat = fx(`
    varying vec3 vP; varying vec3 vN; varying vec3 vV; varying vec2 vUv; uniform float uTime; uniform float uAmt; uniform float uVac; uniform float uLen; uniform vec3 uTint; uniform float uGain;
    void main(){
      float d = -vP.y;                                             // metres below the nozzle exit
      float s = clamp(d / uLen, 0.0, 1.0);
      float ang = atan(vP.z, vP.x);
      float n = fbm(vec3(ang * 3.0, vP.y * 2.2 + uTime * 9.0, length(vP.xz) * 2.0));
      float n2 = fbm(vec3(ang * 8.0, vP.y * 5.0 + uTime * 15.0, 2.0));
      vec3 cool = vec3(0.72, 0.85, 1.0) * 1.3, edge = vec3(1.0, 0.42, 0.12) * 1.2;
      vec3 col = mix(uTint, cool, smoothstep(0.35, 0.95, s) * 0.45 + uVac * 0.4);
      col = mix(col, edge, smoothstep(0.45, 1.0, s) * (1.0 - uVac));
      float facing = pow(abs(dot(normalize(vN), normalize(vV))), mix(1.1, 1.6, uVac));
      float streaky = fbm(vec3(ang * 14.0, vP.y * 1.5 + uTime * 22.0, 4.0));
      float a = smoothstep(0.0, 0.02, s) * (1.0 - smoothstep(0.55, 1.0, s)) * (0.15 + 1.2 * n * (0.45 + 0.9 * n2) * (0.6 + 0.8 * streaky));
      a *= mix(1.0, 0.55, uVac);
      gl_FragColor = vec4(col, a * facing * uAmt * uGain);
    }`, { uLen: { value: 2.8 }, uTint: { value: new T.Color(1, 0.8, 0.5) }, uGain: { value: 0.1 } });
  const plume = new T.Group(); engine.add(plume);
  const earthPlume = new T.Group(), vacPlume = new T.Group(); plume.add(earthPlume, vacPlume);
  earthPlume.position.y = vacPlume.position.y = EX_Y;
  const plumeMats = [];
  [[1.0, 0.0, [1.0, 0.26, 0.05], 1.6, 0.075], [0.72, 0.3, [1.0, 0.5, 0.13], 2.0, 0.12], [0.45, 0.6, [1.0, 0.82, 0.5], 2.6, 0.15]].forEach(([k, o, c, g, a]) => {
    const pts = []; for (let i = 0; i <= 24; i++) { const d = (i / 24) * 2.75; pts.push([EX_R * k * (0.98 - 0.07 * Math.sin(d * 2.7 + o) * Math.exp(-d * 0.3)) + d * 0.05, -d]); }
    const mat = plumeMat.clone(); mat.uniforms.uTint.value = new T.Color(c[0] * g, c[1] * g, c[2] * g); mat.uniforms.uGain.value = a; plumeMats.push(mat);
    const m = new T.Mesh(lathe(pts, 48), mat); m.renderOrder = 9; earthPlume.add(m);
  });
  const vacMat = plumeMat.clone(); vacMat.uniforms.uVac.value = 1; vacMat.uniforms.uLen.value = 7.5; vacMat.uniforms.uTint.value = new T.Color(1.9, 1.15, 0.6); vacMat.uniforms.uGain.value = 0.22;
  [[1.0, 1.0], [0.7, 0.75], [0.4, 0.5]].forEach(([k, spread]) => {
    const pts = []; for (let i = 0; i <= 24; i++) { const d = (i / 24) * 7.0; pts.push([EX_R * k + spread * 2.6 * (1 - Math.exp(-d / 1.8)) + d * 0.08 * spread, -d]); }
    const m = new T.Mesh(lathe(pts, 48), vacMat); m.renderOrder = 9; vacPlume.add(m);
  });
  // incandescent gas filling the bell, seen when looking up into a firing nozzle
  const bellMat = fx(`
    varying vec3 vP; varying vec3 vN; varying vec3 vV; varying vec2 vUv; uniform float uTime; uniform float uAmt;
    void main(){
      float k = clamp((vP.y - ${EX_Y.toFixed(2)}) / ${(TH_Y - EX_Y).toFixed(2)}, 0.0, 1.0);   // 0 at the exit, 1 at the throat
      float n = fbm(vec3(atan(vP.z, vP.x) * 4.0, vP.y * 5.0 + uTime * 12.0, 0.7));
      vec3 col = mix(vec3(1.0, 0.55, 0.2) * 1.6, vec3(1.0, 0.92, 0.75) * 2.6, k);
      float facing = pow(abs(dot(normalize(vN), normalize(vV))), 0.5);
      gl_FragColor = vec4(col, (0.25 + 0.75 * k) * (0.7 + 0.6 * n) * facing * uAmt * 0.32);
    }`);
  { const p = inner.filter(([, y]) => y <= TH_Y - 0.05).map(([r, y]) => [r * 0.96, y]); const m = new T.Mesh(lathe(p, 64), bellMat); m.renderOrder = 9; engine.add(m); }
  // shock diamonds: bright double cones along the Earth plume
  const diamondMat = fx(`
    varying vec3 vP; varying vec3 vN; varying vec3 vV; varying vec2 vUv; uniform float uTime; uniform float uAmt;
    void main(){
      float facing = pow(abs(dot(normalize(vN), normalize(vV))), 2.6);
      float n = 0.75 + 0.5 * n3(vec3(vP.x * 9.0, vP.y * 9.0 + uTime * 20.0, vP.z * 9.0));
      gl_FragColor = vec4(vec3(0.82, 0.9, 1.0) * 2.2, facing * n * uAmt * 0.16);
    }`);
  const diamondGeo = new T.LatheGeometry([new T.Vector2(0.0, -0.3), new T.Vector2(0.12, -0.12), new T.Vector2(0.2, 0.0), new T.Vector2(0.12, 0.12), new T.Vector2(0.0, 0.3)], 32);
  const diamonds = [0.38, 0.95, 1.46, 1.9, 2.28].map((d, i) => {
    const m = new T.Mesh(diamondGeo, diamondMat); m.position.y = -d; const sc = 1 - i * 0.16; m.scale.set(sc * (1 + i * 0.12), sc, sc * (1 + i * 0.12)); m.renderOrder = 10; earthPlume.add(m); return m;
  });

  // big action/reaction arrows for "the push"
  const arrowMat = (c) => new T.MeshBasicMaterial({ color: new T.Color(c).convertSRGBToLinear(), transparent: true, opacity: 0, depthWrite: false, depthTest: false, side: T.DoubleSide, toneMapped: false });
  function arrowGeo(len, w, head) {
    const s = new T.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, len - head); s.lineTo(w * 1.3, len - head); s.lineTo(0, len); s.lineTo(-w * 1.3, len - head); s.lineTo(-w / 2, len - head); s.lineTo(-w / 2, 0);
    return new T.ShapeGeometry(s);
  }
  const upMat = arrowMat(0xff9a3c), downMat = arrowMat(0x8cc8ff), outlineMat = new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false });
  const arrow = (len, w, head, mat, x, y, down) => {
    const g = new T.Group(), geo = arrowGeo(len, w, head), m = new T.Mesh(geo, mat), pos = geo.attributes.position, pts = [];
    const s = new T.Shape(); void s;
    [[-w / 2, 0], [w / 2, 0], [w / 2, len - head], [w * 1.3, len - head], [0, len], [-w * 1.3, len - head], [-w / 2, len - head]].forEach(([px, py]) => pts.push(V(px, py, 0.001)));
    const o = new T.LineLoop(new T.BufferGeometry().setFromPoints(pts), outlineMat); void pos;
    m.renderOrder = 20; o.renderOrder = 21; g.add(m, o); g.position.set(x, y, 1.0); if (down) g.rotation.z = PI; rig.add(g); return g;
  };
  const upArrow = arrow(1.6, 0.3, 0.6, upMat, -1.05, -2.0, false);
  const downArrow = arrow(1.6, 0.3, 0.6, downMat, 1.05, EX_Y - 0.2, true);

  // ---------------------------------------------------------------- stars (vacuum view only)
  const stars = (() => {
    const n = 1400, p = new Float32Array(n * 3), sz = new Float32Array(n);
    for (let i = 0; i < n; i++) { const u = rand(i, 61) * 2 - 1, a = rand(i, 62) * TAU, r = Math.sqrt(1 - u * u); p.set([r * Math.cos(a) * 160, u * 160 + EY, r * Math.sin(a) * 160], i * 3); sz[i] = 1.0 + Math.pow(rand(i, 63), 4) * 3.5; }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(p, 3)); g.setAttribute('aSize', new T.BufferAttribute(sz, 1));
    const m = new T.ShaderMaterial({ uniforms: { uPR: { value: 3 } }, vertexShader: 'attribute float aSize; uniform float uPR; varying float vS; void main(){ vS = aSize; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uPR; }', fragmentShader: 'varying float vS; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(0.9, 0.94, 1.0) * (0.75 + 0.3 * vS), smoothstep(0.5, 0.1, d)); }', transparent: true, depthWrite: false, blending: T.AdditiveBlending });
    const pts = new T.Points(g, m); pts.frustumCulled = false; pts.visible = false; scene.add(pts); return pts;
  })();

  // ---------------------------------------------------------------- billowing exhaust clouds + pre-start vapour (camera-facing puffs)
  function puffSystem(n, warm) {
    const g = new T.InstancedBufferGeometry(); const base = new T.PlaneGeometry(1, 1);
    g.setIndex(base.index); g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
    const pos = new T.InstancedBufferAttribute(new Float32Array(n * 3), 3), dat = new T.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    pos.setUsage(T.DynamicDrawUsage); dat.setUsage(T.DynamicDrawUsage); g.setAttribute('aPos', pos); g.setAttribute('aDat', dat); g.instanceCount = n;
    const m = new T.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uBase: { value: warm ? new T.Color(0.26, 0.24, 0.22) : new T.Color(0.75, 0.8, 0.86) } },
      vertexShader: `attribute vec3 aPos; attribute vec4 aDat; varying vec2 vUv; varying vec4 vDat;
        void main(){ vUv = uv; vDat = aDat;
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          float c = cos(aDat.w * 6.28), s = sin(aDat.w * 6.28); vec2 q = vec2(c * position.x - s * position.y, s * position.x + c * position.y);
          gl_Position = projectionMatrix * viewMatrix * vec4(aPos + (right * q.x + up * q.y) * aDat.x, 1.0); }`,
      fragmentShader: NOISE + `varying vec2 vUv; varying vec4 vDat; uniform float uTime; uniform vec3 uBase;
        void main(){ vec2 c = vUv - 0.5; float r = length(c) * 2.0;
          float n = fbm(vec3(vUv * 3.0 + vDat.w * 10.0, uTime * 0.25 + vDat.w * 5.0));
          float a = smoothstep(1.0, 0.25, r + (n - 0.5) * 0.7) * vDat.y;
          vec3 col = uBase * (0.75 + 0.5 * n) + vec3(1.0, 0.5, 0.2) * vDat.z * 2.2 * (1.0 - r * 0.6);
          gl_FragColor = vec4(col, a); }`,
      transparent: true, depthWrite: false
    });
    const mesh = new T.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 7; return { mesh, pos, dat, n, m };
  }
  const clouds = puffSystem(150, true); earthOnly.add(clouds.mesh);
  const vapour = puffSystem(48, false); earthOnly.add(vapour.mesh);

  // ---------------------------------------------------------------- flow streaks (fuel, oxidizer, injector jets, hot gas)
  const streakMat = new T.ShaderMaterial({
    vertexShader: 'attribute vec4 aCol; varying vec2 vUv; varying vec4 vCol; void main(){ vUv = uv; vCol = aCol; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec2 vUv; varying vec4 vCol; void main(){ float along = pow(vUv.x, 1.7) * (1.0 - smoothstep(0.86, 1.0, vUv.x)); float across = 1.0 - abs(vUv.y * 2.0 - 1.0); across *= across; float a = along * across * vCol.a; if (a < 0.003) discard; gl_FragColor = vec4(vCol.rgb, a); }',
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide
  });
  const streakGeo = new T.BufferGeometry();
  streakGeo.setAttribute('position', new T.Float32BufferAttribute([-1, -0.5, 0, 0, -0.5, 0, 0, 0.5, 0, -1, 0.5, 0, -1, 0, -0.5, 0, 0, -0.5, 0, 0, 0.5, -1, 0, 0.5], 3));
  streakGeo.setAttribute('uv', new T.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1], 2));
  streakGeo.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  function streaks(n, seed, parent = rig) {
    const g = streakGeo.clone(), col = new T.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    col.setUsage(T.DynamicDrawUsage); g.setAttribute('aCol', col);
    const mesh = new T.InstancedMesh(g, streakMat, n);
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage); mesh.frustumCulled = false; mesh.renderOrder = 8; parent.add(mesh);
    const P = [];
    for (let i = 0; i < n; i++) P.push({ th: rand(i, seed) * TAU, f: Math.sqrt(rand(i, seed + 1)), ph: rand(i, seed + 2), k: 0.9 + rand(i, seed + 3) * 0.2, w: rand(i, seed + 4) });
    return { mesh, col, P, n };
  }
  // A feed path runs from inside a tank, down its line, round the pump volute and out to the injector.
  // points are [x, y, z, radius]; the radius is interpolated along the curve by control-polyline length
  function feedPath(pts) {
    const c = new T.CatmullRomCurve3(pts.map(p => V(p[0], p[1], p[2])), false, 'centripetal'), K = 600;
    const fr = c.computeFrenetFrames(K, false), P = [], Rr = [], cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
    const rad = profile(pts.map((p, i) => [p[3], -cum[i] / cum[cum.length - 1]]));
    for (let i = 0; i <= K; i++) { P.push(c.getPointAt(i / K)); Rr.push(rad(-i / K)); }
    return { K, P, N: fr.normals, B: fr.binormals, R: Rr };
  }
  const withR = (pts, r) => pts.map(p => [p[0], p[1], p[2], r]);
  const helix = (y, r0, r1, aEnd, turns, n, rr) => { const p = []; for (let i = 0; i <= n; i++) { const k = i / n, a = aEnd - (1 - k) * turns * TAU; p.push([PX + Math.cos(a) * lerp(r0, r1, k), y, PZ + Math.sin(a) * lerp(r0, r1, k), rr]); } return p; };
  const OX_PATH = feedPath([[0.15, 6.2, 0.1, 0.4], [0.45, 5.3, 0.25, 0.14]].concat(withR(OX_FEED, 0.036), [[PX, 1.0, PZ, 0.04], [PX, 0.86, PZ, 0.05]],
    helix(0.8, 0.08, 0.21, Math.atan2(-0.1 - PZ, 0.62 - PX), 1.0, 14, 0.036), withR(OX_OUT, 0.027), [[0.1, 0.18, 0.0, 0.08], [0.0, 0.06, 0.0, 0.14]]));
  const FUEL_PATH = feedPath([[0.2, 2.9, -0.2, 0.4], [0.38, 1.85, -0.38, 0.12]].concat(withR(FUEL_FEED, 0.033), [[PX, 0.42, PZ - 0.05, 0.04]],
    helix(0.42, 0.07, 0.2, Math.atan2(-0.12 - PZ, 0.62 - PX), 1.0, 14, 0.033), withR(FUEL_OUT, 0.025), [[0.4, -0.06, 0.05, 0.028], [0.36, -0.06, 0.25, 0.028]]));
  const oxS = streaks(300, 11), fuelS = streaks(260, 23), jetS = streaks(320, 37), gasS = streaks(620, 51);

  // hot-gas path: axisymmetric, injector face → chamber → throat → bell → plume, spaced by local speed
  const GAS_X0 = -0.02, GAS_X1 = EX_Y - 5.5;
  const gasSpeed = profile([[0.45, 0], [0.5, CH_Y], [1.25, TH_Y], [2.6, -2.0], [3.6, EX_Y], [4.6, EX_Y - 2], [5.0, GAS_X1]]);
  const gasTab = (() => {
    const N = 900, ys = [], ts = [0];
    for (let i = 0; i <= N; i++) ys.push(lerp(GAS_X0, GAS_X1, i / N));
    for (let i = 1; i <= N; i++) ts.push(ts[i - 1] + Math.abs(ys[i] - ys[i - 1]) / gasSpeed((ys[i] + ys[i - 1]) / 2));
    const tot = ts[N], M = 1024, inv = new Float32Array(M + 1);
    for (let k = 0, i = 0; k <= M; k++) { const q = (k / M) * tot; while (i < N - 1 && ts[i + 1] < q) i++; inv[k] = lerp(ys[i], ys[i + 1], clamp((q - ts[i]) / (ts[i + 1] - ts[i] || 1))); }
    return { tot, y: u => { const q = clamp(u) * M, i = Math.min(M - 1, q | 0); return lerp(inv[i], inv[i + 1], q - i); } };
  })();
  const gasRadius = (y, vac) => {
    if (y >= EX_Y) return nozR(y) - 0.03;
    const d = EX_Y - y;
    return vac ? EX_R + 2.4 * (1 - Math.exp(-d / 1.8)) : EX_R * (0.97 - 0.06 * Math.sin(d * 2.7) * Math.exp(-d * 0.3)) + d * 0.04;
  };

  // ---------------------------------------------------------------- timeline
  // shot clock for the hook and the final shot (shared so they loop): s = t for t < 3, s = t − 45 for t ≥ 40
  const hookS = t => (t >= 40 ? t - 45 : t);
  const IGN = -0.6;                                            // ignition moment on the shot clock (frame 0 is mid-eruption)
  const liveFire = s => smooth(span(s, IGN, IGN + 1.0));
  const liveTemp = s => 20 + 2980 * smooth(span(s, IGN, 2.6));
  const livePress = s => s < IGN - 0.4 ? 3 : lerp(3, 70, smooth(span(s, IGN - 0.3, 2.2)));
  const liveThrust = s => 800 * smooth(span(s, IGN + 0.05, 7.0));
  const xrayAmt = t => smooth(span(t, 8, 8.8)) * (1 - smooth(span(t, 34, 34.8)));
  // engine fire level, pump speed and propellant flow for every t
  const fireAt = t => {
    if (t < 8 || t >= 40) return liveFire(hookS(t));
    if (t < 20) return 1 - smooth(span(t, 8, 8.7));
    return smooth(span(t, 21.45, 21.9));
  };
  const pumpAt = t => {
    if (t < 8 || t >= 40) return smooth(span(hookS(t), IGN - 0.9, IGN + 0.4));
    if (t < 14) return 1 - smooth(span(t, 8, 8.9));
    return smooth(span(t, 14.3, 17.0));
  };
  const feedAt = t => (t < 8 || t >= 40) ? pumpAt(t) : (t < 14 ? lerp(1 - smooth(span(t, 8, 8.7)), 0.16, smooth(span(t, 8.5, 9.5))) : lerp(0.16, 1, smooth(span(t, 14.3, 17.2))));
  // effect clock: real time, except slow motion right after the chamber lights
  const slowAt = t => 1 - 0.72 * pulse(t, 21.55, 21.75, 24.0, 25.2);
  const DT = 1 / 240, TN = Math.ceil(DURATION / DT) + 2;
  const fxTab = new Float64Array(TN), pumpTab = new Float64Array(TN), feedTab = new Float64Array(TN), gasTabT = new Float64Array(TN);
  for (let i = 1; i < TN; i++) {
    const t = (i - 0.5) * DT, sl = slowAt(t);
    fxTab[i] = fxTab[i - 1] + sl * DT;
    pumpTab[i] = pumpTab[i - 1] + 0.42 * TAU * pumpAt(t) * sl * DT;
    feedTab[i] = feedTab[i - 1] + feedAt(t) * sl * DT;
    gasTabT[i] = gasTabT[i - 1] + fireAt(t) * sl * DT;
  }
  const tab = (a, t) => { const q = clamp(t, 0, DURATION) / DT, i = Math.min(TN - 2, q | 0); return lerp(a[i], a[i + 1], q - i); };
  // shot-clock versions for the looped hook/final shots (pure functions of s so the loop matches)
  const loopFx = s => s;
  const loopPump = s => 0.42 * TAU * Math.max(0, s - (IGN - 0.9) - 0.65);
  const loopFeed = s => Math.max(0, s - IGN + 0.4) * 0.8;
  const loopGas = s => Math.max(0, s - IGN - 0.25);
  const clockFx = t => (t < 3 || t >= 40) ? loopFx(hookS(t)) : tab(fxTab, t);
  const clockPump = t => (t < 3 || t >= 40) ? loopPump(hookS(t)) : tab(pumpTab, t) + loopPump(3) - tab(pumpTab, 3);
  const clockFeed = t => (t < 3 || t >= 40) ? loopFeed(hookS(t)) : tab(feedTab, t);
  const clockGas = t => (t < 3 || t >= 40) ? loopGas(hookS(t)) : tab(gasTabT, t);

  const SCENES = [
    { a: 0, b: 3, step: '', big: true, cap: 'Why does a rocket work in space... when a jet engine can’t?', stage: 'IGNITION' },
    { a: 3, b: 8, step: '', cap: 'A jet engine breathes air. A rocket brings its own.', stage: 'FIRING' },
    { a: 8, b: 14, step: '01 · TWO TANKS', x: true, cap: 'Two propellants: fuel, and oxidizer to burn it. No outside air needed.', stage: 'TANKS' },
    { a: 14, b: 20, step: '02 · PUMPS', x: true, cap: 'Powerful pumps force both propellants in at huge pressure.', stage: 'PUMPS' },
    { a: 20, b: 27, step: '03 · COMBUSTION', x: true, cap: 'They mix and burn at around 3,000 degrees C. The gas wants to expand, fast.', stage: 'COMBUSTION' },
    { a: 27, b: 34, step: '04 · THROAT + NOZZLE', x: true, cap: 'The squeezed throat speeds the gas up. The bell lets it expand and go even faster.', stage: 'NOZZLE' },
    { a: 34, b: 40, step: '05 · THE PUSH', cap: 'Gas goes out the back, the engine goes the other way. That works anywhere, even in a vacuum.', stage: 'THRUST' },
    { a: 40, b: 45.5, step: '', big: true, cap: 'Burn. Expand. Push.', stage: 'PRE-START' }
  ];
  // readouts: the hook/hero/final shots show a live start-up; the X-ray walk-through replays it step by step
  function readouts(t) {
    if (t < 8 || t >= 40) {
      const s = t < 8 ? t : t - 45;
      return { temp: liveTemp(s), press: livePress(s), thrust: liveThrust(s), stage: t >= 40 ? (s >= IGN ? 'IGNITION' : 'PRE-START') : (t < 3 ? 'IGNITION' : 'FIRING') };
    }
    const rew = 1 - smooth(span(t, 8, 8.8));                      // quick rewind of the live numbers
    const live = { temp: liveTemp(8), press: livePress(8), thrust: liveThrust(8) };
    let temp = 20, press = 3, thrust = 0;
    if (t >= 14) press = lerp(3, 110, smooth(span(t, 14.4, 17.5)));
    if (t >= 20) { press = lerp(110, 70, smooth(span(t, 21.5, 23))); temp = lerp(20, 3000, smooth(span(t, 21.5, 25.5))); thrust = lerp(0, 380, smooth(span(t, 21.6, 26))); }
    if (t >= 27) thrust = lerp(380, 720, smooth(span(t, 27.5, 33.5)));
    if (t >= 34) thrust = lerp(720, 800, smooth(span(t, 34, 36)));
    if (t >= 22) temp += 8 * Math.sin(t * 2.3) * smooth(span(t, 25, 26));
    if (t >= 23) press += 0.6 * Math.sin(t * 3.1);
    if (t >= 30) thrust += 2.5 * Math.sin(t * 2.7);
    return { temp: lerp(temp, live.temp, rew), press: lerp(press, live.press, rew), thrust: lerp(thrust, live.thrust, rew), stage: SCENES.find(s => t < s.b).stage };
  }

  // ---------------------------------------------------------------- camera (monotone cubic per channel, one spline per shot)
  function monotone(xs, ys) {
    const n = xs.length, d = [], m = new Array(n).fill(0);
    for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
      const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
      if (s > 9) { const k = 3 / Math.sqrt(s); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
    }
    return x => {
      if (x <= xs[0]) return ys[0];
      if (x >= xs[n - 1]) return ys[n - 1];
      let i = 0; while (x > xs[i + 1]) i++;
      const h = xs[i + 1] - xs[i], s = (x - xs[i]) / h, s2 = s * s, s3 = s2 * s;
      return (2 * s3 - 3 * s2 + 1) * ys[i] + (s3 - 2 * s2 + s) * h * m[i] + (-2 * s3 + 3 * s2) * ys[i + 1] + (s3 - s2) * h * m[i + 1];
    };
  }
  const W = EY;   // shorthand: world y of the injector face
  //        t     tx     ty           tz     az     el     d
  const SHOTS = [[
    [3.0, 0.0, 4.9, 0, -0.18, 0.06, 13.6],
    [8.0, 0.0, 5.3, 0, 0.22, 0.09, 12.8],
    [10.2, 0.0, 9.4, 0, 0.78, 0.1, 22.5],
    [13.9, 0.0, 9.5, 0, 0.62, 0.1, 21.5],
    [15.1, 0.72, W + 0.42, -0.15, 1.02, 0.12, 3.0],
    [19.9, 0.72, W + 0.42, -0.15, 1.24, 0.1, 2.75],
    [21.0, 0.0, W - 0.5, 0, 0.26, 0.1, 3.3],
    [26.9, 0.0, W - 0.55, 0, 0.4, 0.08, 3.0],
    [28.1, 0.0, W - 1.2, 0, 0.32, 0.04, 2.7],
    [30.2, 0.0, W - 1.45, 0, 0.34, 0.02, 3.0],
    [32.2, 0.0, W - 2.3, 0, 0.4, -0.02, 3.9],
    [33.9, 0.0, W - 2.75, 0, 0.44, -0.05, 4.3],
    [35.2, 0.0, 4.3, 0, 0.04, 0.05, 20.0],
    [40.0, 0.0, 4.35, 0, -0.06, 0.05, 19.4]
  ]].map(keys => ({ a: keys[0][0], b: keys[keys.length - 1][0], f: [1, 2, 3, 4, 5, 6].map(c => monotone(keys.map(k => k[0]), keys.map(k => k[c]))) }));
  const hookCam = s => [0.0, EY + EX_Y + 0.15, 0, 0.3 + 0.012 * s, -0.26, 5.0 - 0.06 * s];
  const shake = (t, amp) => [amp * (Math.sin(t * 37.1) + 0.6 * Math.sin(t * 53.7 + 1.3) + 0.3 * Math.sin(t * 91.3 + 0.4)), amp * (Math.sin(t * 41.9 + 2.1) + 0.6 * Math.sin(t * 61.3 + 0.2)), amp * 0.7 * Math.sin(t * 47.3 + 0.9)];
  function cameraAt(t) {
    let k;
    if (t < 3 || t >= 40) k = hookCam(hookS(t));
    else k = SHOTS[0].f.map(f => f(t));
    const [tx, ty, tz, az, el, d] = k;
    let amp = 0;
    if (t < 8 || t >= 40) { const s = hookS(t); amp = (s > IGN ? 0.075 * Math.exp(-(s - IGN) / 1.1) + 0.006 : 0) * (t < 3 || t >= 40 ? 1 : 0.4); }
    amp += 0.018 * pulse(t, 21.45, 21.5, 21.9, 23.2);
    const sk = shake(t >= 40 ? t - 45 : t, amp);
    camera.position.set(tx + d * Math.sin(az) * Math.cos(el) + sk[0], ty + d * Math.sin(el) + sk[1], tz + d * Math.cos(az) * Math.cos(el) + sk[2]);
    camera.lookAt(tx + sk[0] * 0.4, ty + sk[1] * 0.4, tz);
  }

  // ---------------------------------------------------------------- UI
  const $ = id => document.getElementById(id);
  const ui = { specs: $('specs'), step: $('step'), caption: $('caption'), teaser: $('teaser'), badge: $('badge'), bar: $('bar'), stage: $('vStage'), temp: $('vTemp'), press: $('vPress'), thrust: $('vThrust'), speed: $('speed'), vSpeed: $('vSpeed'), mach: $('mach'), divider: $('divider'), sideEarth: $('sideEarth'), sideSpace: $('sideSpace') };
  const fmt = n => Math.round(n).toLocaleString('en-US');
  const setText = (el, s) => { if (el.textContent !== s) el.textContent = s; };
  // callouts: anchor in rig coordinates, chip offset in CSS px
  const CALLOUTS = [
    { text: 'OXIDIZER TANK', cls: 'ox', on: [[9.7, 13.9]], at: [0.68, 6.3, 0.8], dx: -90, dy: -30 },
    { text: 'FUEL TANK', cls: 'fuel', on: [[10.0, 13.9]], at: [0.68, 2.9, 0.8], dx: -80, dy: 30 },
    { text: 'OXIDIZER PUMP', cls: 'ox', on: [[15.2, 19.9]], at: [1.03, 0.8, -0.08], dx: -90, dy: -40 },
    { text: 'FUEL PUMP', cls: 'fuel', on: [[15.5, 19.9]], at: [1.02, 0.42, -0.09], dx: -80, dy: 52 },
    { text: 'COMBUSTION CHAMBER', on: [[20.9, 26.9]], at: [0.1, -0.4, 0.37], dx: -40, dy: 92 },
    { text: 'THROAT', on: [[27.6, 33.9]], at: [-TH_R - 0.04, TH_Y, 0.02], dx: -70, dy: -6 },
    { text: 'NOZZLE', on: [[29.8, 33.9]], at: [-0.34, -2.6, 0.74], dx: -60, dy: 40 }
  ];
  const calloutRoot = $('callouts');
  CALLOUTS.forEach(c => {
    c.el = document.createElement('div'); c.el.className = 'callout' + (c.cls ? ' ' + c.cls : '');
    c.el.innerHTML = '<span class="line"></span><span class="dot"></span><span class="tag"></span>';
    c.line = c.el.querySelector('.line'); c.tag = c.el.querySelector('.tag'); c.tag.textContent = c.text;
    calloutRoot.appendChild(c.el);
  });
  const tmpV = new T.Vector3();
  const toScreen = (x, y, z) => { tmpV.set(x, y + EY, z).project(camera); return [(tmpV.x * 0.5 + 0.5) * 360, (-tmpV.y * 0.5 + 0.5) * 640, tmpV.z]; };
  const headBottom = () => { const el = ui.teaser.style.opacity > 0.01 ? ui.teaser : ui.caption; return el.offsetTop + el.offsetHeight + el.offsetParent.offsetTop + 10; };
  function updateCallouts(t, X) {
    const capBottom = headBottom();
    CALLOUTS.forEach(c => {
      let o = 0;
      c.on.forEach(([a, b]) => { o = Math.max(o, pulse(t, a, a + 0.35, b - 0.35, b)); });
      c.el.style.opacity = o.toFixed(3);
      if (o <= 0.001) return;
      c.el.classList.toggle('x', X > 0.5 && !c.cls);
      const [px, py] = toScreen(...c.at);
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
  const mtx = new T.Matrix4(), qd = new T.Quaternion(), vA = new T.Vector3(), vB = new T.Vector3(), vDir = new T.Vector3(), vS = new T.Vector3(), X1 = new T.Vector3(1, 0, 0);
  function placeStreak(sys, i, head, tail, w, r, g, b, a) {
    vDir.subVectors(head, tail); const L = vDir.length();
    if (L < 1e-4 || a <= 0.002) { mtx.makeScale(0, 0, 0); sys.mesh.setMatrixAt(i, mtx); sys.col.setXYZW(i, 0, 0, 0, 0); return; }
    qd.setFromUnitVectors(X1, vDir.divideScalar(L)); vS.set(L, w, w);
    mtx.compose(head, qd, vS); sys.mesh.setMatrixAt(i, mtx); sys.col.setXYZW(i, r, g, b, a);
  }
  const feedPoint = (out, path, u, th, f) => {
    const q = clamp(u) * path.K, i = Math.min(path.K - 1, q | 0), k = q - i;
    const p0 = path.P[i], p1 = path.P[i + 1], n = path.N[i], b = path.B[i], r = lerp(path.R[i], path.R[i + 1], k) * f;
    return out.set(lerp(p0.x, p1.x, k) + (n.x * Math.cos(th) + b.x * Math.sin(th)) * r, lerp(p0.y, p1.y, k) + (n.y * Math.cos(th) + b.y * Math.sin(th)) * r, lerp(p0.z, p1.z, k) + (n.z * Math.cos(th) + b.z * Math.sin(th)) * r);
  };
  const FUEL_C = [1.0, 0.5, 0.36], OX_C = [0.42, 0.66, 1.0];
  function updateFlow(t, X, vac) {
    const feedA = clockFeed(t), gasA = clockGas(t), feed = (t < 8 || t >= 40) ? 1 : feedAt(t), fire = fireAt(t);
    const xv = X;                                                     // feed lines are only visible in X-ray
    const runFeed = (sys, path, rate, c, seedOff) => {
      const tau = 0.05 + 0.1 * feed;
      sys.P.forEach((p, i) => {
        const u = (p.ph + feedA * rate * p.k) % 1, uT = Math.max(0, u - Math.max(0.006, tau * rate * feed));
        feedPoint(vA, path, u, p.th + seedOff, p.f); feedPoint(vB, path, uT, p.th + seedOff, p.f);
        const a = 0.75 * xv * smooth(span(u, 0, 0.04)) * (1 - smooth(span(u, 0.93, 1))) * (0.5 + 0.5 * Math.min(1, feed * 2));
        placeStreak(sys, i, vA, vB, 0.012 + 0.006 * p.w, c[0], c[1], c[2], a);
      });
    };
    runFeed(oxS, OX_PATH, 0.16, OX_C, 0);
    runFeed(fuelS, FUEL_PATH, 0.2, FUEL_C, 1.3);
    // injector jets: alternating fuel/ox orifice rings, mixing into a spray just under the face
    const jetOn = (t < 8 || t >= 40) ? pumpAt(t) : (t < 20 ? smooth(span(t, 18.6, 19.6)) * feed : 1);
    jetS.P.forEach((p, i) => {
      const ringI = i % 5, isFuel = ringI % 2 === 1, rr = [0.06, 0.11, 0.17, 0.23, 0.29][ringI];
      const a0 = p.th, s = (p.ph + clockFx(t) * 2.6 * p.k) % 1;
      const conv = isFuel ? 0.045 : -0.045, r = Math.max(0.035, rr + conv * s * 1.1);
      vA.set(Math.cos(a0) * r, -0.015 - s * 0.24, Math.sin(a0) * r); vB.set(Math.cos(a0) * (r - conv * 0.12), -0.015 - Math.max(0, s - 0.12) * 0.24, Math.sin(a0) * (r - conv * 0.12));
      const c = isFuel ? FUEL_C : OX_C, burn = clamp(fire * 1.4);
      const cr = lerp(c[0], 1.0, burn), cg = lerp(c[1], 0.85, burn), cb = lerp(c[2], 0.6, burn);
      placeStreak(jetS, i, vA, vB, 0.007, cr, cg, cb, 0.8 * jetOn * X * (1 - s) * (1 - 0.5 * burn));
    });
    // hot gas: orange-white in the chamber, accelerating through the throat, blue-white in the bell and plume
    const GR = 1.6;                                                   // visual gas speed scale
    gasS.P.forEach((p, i) => {
      const u = (p.ph + (gasA * GR * p.k) / gasTab.tot) % 1, uT = Math.max(0, u - (GR * 0.07) / gasTab.tot);
      const y = gasTab.y(u), yt = gasTab.y(uT), f = Math.min(1, p.f * 1.02);
      const r = gasRadius(y, vac) * f, rt = gasRadius(yt, vac) * f;
      vA.set(Math.cos(p.th) * r, y, Math.sin(p.th) * r); vB.set(Math.cos(p.th) * rt, yt, Math.sin(p.th) * rt);
      const kT = smooth(span(y, CH_Y, TH_Y - 0.25)), kE = smooth(span(y, TH_Y - 0.2, EX_Y)), kP = smooth(span(y, EX_Y, EX_Y - 4.5));
      let cr = lerp(1.0, 1.0, kT), cg = lerp(0.68, 0.9, kT), cb = lerp(0.36, 0.72, kT);
      cr = lerp(cr, 0.55, kE); cg = lerp(cg, 0.78, kE); cb = lerp(cb, 1.0, kE);
      const inside = y > EX_Y;
      if (!inside && X < 0.5) { const kw = smooth(span(y, EX_Y, EX_Y - 1.2)); cr = lerp(cr, 1.0, kw); cg = lerp(cg, 0.8, kw); cb = lerp(cb, 0.55, kw); }
      let a = (inside ? 0.85 * X : lerp(0.28, 0.55, X)) * (1 - kP) * fire;
      a *= smooth(span(u, 0, 0.03)) * (1 - smooth(span(u, 0.9, 1)));
      const w = (inside ? 0.011 + 0.006 * p.w : 0.014 + 0.01 * p.w) * (vac ? 1.6 : 1);
      placeStreak(gasS, i, vA, vB, w, cr * 1.25, cg * 1.25, cb * 1.25, a);
    });
    [oxS, fuelS, jetS, gasS].forEach(s => { s.mesh.instanceMatrix.needsUpdate = true; s.col.needsUpdate = true; });
  }

  function updatePuffs(t, fire, cold) {
    const tf = clockFx(t);
    // exhaust clouds: born at the deflector ridge, thrown out along ±x, growing and rising
    for (let i = 0; i < clouds.n; i++) {
      const L = 3.6, ph = rand(i, 71), age = ((tf / L + ph) % 1) * L, side = rand(i, 72) < 0.5 ? -1 : 1;
      const out = 0.6 + 7.5 * (1 - Math.exp(-age / 1.3)), lat = (rand(i, 73) - 0.5) * (1.2 + age * 1.1);
      const x = side * out, y = 0.9 + 0.35 * age + 0.12 * age * age, z = lat + (rand(i, 74) - 0.5) * 0.8;
      const size = 1.1 + 1.6 * age + rand(i, 75) * 0.8;
      const a = fire * smooth(span(age, 0, 0.35)) * (1 - smooth(span(age, L * 0.55, L))) * 0.3;
      const warm = fire * Math.exp(-age * 1.6) * 0.6;
      clouds.pos.setXYZ(i, x, y, z); clouds.dat.setXYZW(i, size, a, warm, rand(i, 76));
    }
    // pre-start vapour: cold oxygen boil-off sinking off the turbopump and lines
    for (let i = 0; i < vapour.n; i++) {
      const L = 4.5, ph = rand(i, 81), age = ((tf / L + ph) % 1) * L;
      const ea = rand(i, 86) * TAU, src = [[PX, EY + 1.0, PZ], [Math.cos(ea) * (EX_R + 0.05), EY + EX_Y + 0.05, Math.sin(ea) * (EX_R + 0.05)], [Math.cos(ea) * 0.5, EY + EX_Y + 0.6, Math.sin(ea) * 0.5]][i % 3];
      const x = src[0] + (rand(i, 82) - 0.5) * 0.5 + age * 0.12 * (rand(i, 83) - 0.5), y = src[1] - age * 0.32, z = src[2] + (rand(i, 84) - 0.5) * 0.5;
      const a = cold * smooth(span(age, 0, 0.6)) * (1 - smooth(span(age, L * 0.5, L))) * 0.085;
      vapour.pos.setXYZ(i, x, y, z); vapour.dat.setXYZW(i, 0.25 + age * 0.3, a, 0, rand(i, 85));
    }
    [clouds, vapour].forEach(p => { p.pos.needsUpdate = true; p.dat.needsUpdate = true; p.m.uniforms.uTime.value = tf; });
  }

  let splitK = 0, curX = 0, curT = 0;
  function update(t) {
    t = clamp(t, 0, DURATION - 1e-4); curT = t;
    const X = xrayAmt(t); curX = X;
    const fire = fireAt(t), tf = clockFx(t);

    // X-ray blend
    shells.forEach(({ solid: s, ghost }) => { s.visible = X < 0.995; ghost.visible = X > 0.005; s.castShadow = X < 0.5; });
    fadeMats.concat(envFade).forEach(m => { m.transparent = X > 0.005; m.opacity = 1 - X; m.depthWrite = X < 0.6; });
    ground.visible = X < 0.995;
    xrayMats.forEach(m => { m.uniforms.uOpacity.value = X; });
    edgeMat.opacity = X * 0.4; edges.visible = X > 0.005;
    fuelLiq.opacity = oxLiq.opacity = 0.42 * X;
    bgMat.uniforms.uX.value = X;
    rim.intensity = X * 1.1;

    // engine state
    rotor.rotation.y = -clockPump(t);
    const flick = 0.9 + 0.1 * Math.sin(tf * 23.0) * Math.sin(tf * 7.3 + 1.0);
    [glowMat, vacMat, diamondMat, bellMat, ...plumeMats].forEach(m => { m.uniforms.uTime.value = tf; });
    bellMat.uniforms.uAmt.value = fireAt(t) * (t >= 8 && t < 21.5 ? 0 : 1) * (1 - X);
    const ignFlash = (t < 3 || t >= 40) ? Math.exp(-Math.pow((hookS(t) - IGN - 0.18) / 0.16, 2)) * 0.55 + 0.12 * Math.exp(-Math.max(0, hookS(t) - IGN) / 0.35) * (hookS(t) > IGN ? 1 : 0) : 0;
    const chamberFlash = Math.exp(-Math.pow((t - 21.5) / 0.09, 2)) * 0.75 + 0.15 * pulse(t, 21.45, 21.5, 21.6, 22.4);
    flashMat.uniforms.uAmt.value = ignFlash + chamberFlash;
    glowMat.uniforms.uAmt.value = fire * flick * lerp(0.35, 1.0, X);
    const plumeFire = fire * (t >= 8 && t < 21.5 ? 0 : 1);
    plumeMats.forEach(m => { m.uniforms.uAmt.value = plumeFire * flick * lerp(1.0, 0.55, X); m.uniforms.uLen.value = 2.8 * lerp(0.3, 1, smooth(fire * 1.2)); });
    vacMat.uniforms.uAmt.value = plumeFire * flick;
    diamondMat.uniforms.uAmt.value = plumeFire * smooth(span(fire, 0.6, 1)) * flick * lerp(1, 0.6, X);
    earthPlume.scale.y = lerp(0.25, 1, smooth(fire));
    extMat.emissiveIntensity = 1.4 * plumeFire * (t < 8 || t >= 40 ? smooth(span(hookS(t), IGN + 0.5, 5)) : 1);
    turbMat.emissiveIntensity = 0.25 * pumpAt(t) * fire;
    deflMat.emissiveIntensity = 0.35 * plumeFire;
    plumeLight.intensity = 5.0 * plumeFire * flick * (1 - X);
    padLight.intensity = 2.0 * plumeFire * flick * (1 - X);
    chamberLight.intensity = 1.2 * fire * flick * X;
    const cold = (t < 3 || t >= 40) ? 1 - smooth(span(hookS(t), IGN, IGN + 1.0)) : 0;
    floods.forEach(l => { l.intensity = 2.2 * (0.35 + 0.65 * (1 - plumeFire)) * (1 - X); });
    lampMat.emissiveIntensity = 1.5 * (1 - X);
    sun.intensity = lerp(2.0, 1.5, X); hemi.intensity = lerp(0.5, 0.4, X);
    machMat.opacity = 0.32 * pulse(t, 27.4, 28.0, 33.6, 34.2);
    const push = pulse(t, 34.9, 35.6, 39.6, 40.0);
    upMat.opacity = downMat.opacity = 0.92 * push; outlineMat.opacity = 0.9 * push;
    upArrow.position.y = -2.1 + 0.25 * smooth(span(t, 34.9, 35.8)) + 0.05 * Math.sin(t * 5);
    downArrow.position.y = EX_Y - 0.1 - 0.25 * smooth(span(t, 34.9, 35.8)) - 0.05 * Math.sin(t * 5);
    updatePuffs(t, plumeFire * (1 - X), cold);

    cameraAt(t);
    splitK = smooth(span(t, 36.1, 36.6)) * (t < 40 ? 1 : 0);
    if (splitK > 0) camera.setViewOffset(360, 640, 90 * splitK, 0, 360, 640); else camera.clearViewOffset();
    camera.updateMatrixWorld();
    if (splitK > 0) { spaceCam.copy(camera); spaceCam.setViewOffset(360, 640, 90, 0, 180, 640); spaceCam.aspect = 360 / 640; spaceCam.updateProjectionMatrix(); spaceCam.updateMatrixWorld(); }

    // overlay
    const sc = SCENES.find(s => t < s.b) || SCENES[SCENES.length - 1];
    const fadeIn = (sc.a === 0 || sc.a === 40) ? 1 : smooth(span(t, sc.a, sc.a + 0.3)), fadeOut = (sc.b > 44 || sc.b === 3) ? 1 : 1 - smooth(span(t, sc.b - 0.25, sc.b));
    setText(ui.step, sc.step); ui.step.classList.toggle('x', !!sc.x);
    setText(ui.caption, sc.cap); ui.caption.classList.toggle('big', !!sc.big);
    ui.step.style.opacity = ui.caption.style.opacity = (fadeIn * fadeOut).toFixed(3);
    ui.teaser.style.opacity = pulse(t, 18.2, 18.6, 19.7, 20.0).toFixed(3);
    ui.badge.style.opacity = (smooth(span(t, 8.1, 8.6)) * (1 - smooth(span(t, 34.0, 34.5)))).toFixed(3);
    const r = readouts(t);
    setText(ui.stage, r.stage);
    setText(ui.temp, fmt(Math.round(r.temp / 10) * 10) + ' °C');
    setText(ui.press, fmt(r.press) + ' bar');
    setText(ui.thrust, fmt(Math.round(r.thrust / 5) * 5) + ' kN');
    // gas speed chip follows the gas from the throat down the bell
    const sp = pulse(t, 27.5, 27.9, 33.6, 34.0);
    ui.speed.style.opacity = sp.toFixed(3);
    if (sp > 0.001) {
      const yy = lerp(TH_Y, EX_Y + 0.15, smooth(span(t, 27.8, 33.2)));
      const v = yy > TH_Y - 0.01 ? 1150 : lerp(1150, 3000, smooth(span(yy, TH_Y, EX_Y + 0.15)) ** 0.8);
      setText(ui.vSpeed, fmt(Math.round(v / 10) * 10) + ' m/s');
      const [px, py] = toScreen(0.0, yy, 0);
      ui.speed.style.transform = `translate(${clamp(px + 40, 20, 300 - ui.speed.offsetWidth).toFixed(1)}px, ${clamp(py - 12, headBottom(), 395).toFixed(1)}px)`;
    }
    let mo = pulse(t, 27.6, 28.1, 33.5, 34.0);
    if (mo > 0.001) { const [px, py] = toScreen(TH_R + 0.03, TH_Y, 0.05); mo *= smooth(span(py, headBottom(), headBottom() + 14)); ui.mach.style.transform = `translate(${(px + 6).toFixed(1)}px, ${(py - 4).toFixed(1)}px)`; }
    ui.mach.style.opacity = mo.toFixed(3);
    // split screen furniture
    const capB = headBottom();
    const dx = lerp(360, 180, splitK);
    ui.divider.style.opacity = (splitK > 0.001 ? 1 : 0) * (1 - smooth(span(t, 39.85, 40)));
    ui.divider.style.transform = `translate(${dx.toFixed(1)}px, 0)`;
    ui.divider.style.top = capB + 'px'; ui.divider.style.bottom = '196px';
    const so = smooth(span(t, 36.5, 36.9)) * (t < 40 ? 1 : 0);
    ui.sideEarth.style.opacity = ui.sideSpace.style.opacity = so.toFixed(3);
    ui.sideEarth.style.transform = `translate(${(90 - ui.sideEarth.offsetWidth / 2).toFixed(1)}px, ${(capB + 4).toFixed(1)}px)`;
    ui.sideSpace.style.transform = `translate(${(dx + 90 - ui.sideSpace.offsetWidth / 2).toFixed(1)}px, ${(capB + 4).toFixed(1)}px)`;
    updateCallouts(t, X);
  }

  // ---------------------------------------------------------------- rendering: one pass for the main view, plus the vacuum panel in split screen
  function setWorld(space) {
    earthOnly.visible = !space; stars.visible = space;
    earthPlume.visible = !space; vacPlume.visible = space;
    fog.near = space ? 1e5 : 30; fog.far = space ? 2e5 : 190;
    bgMat.uniforms.uSpace.value = space ? 1 : 0;
    sun.intensity = space ? 2.8 : lerp(2.0, 1.5, curX); hemi.intensity = space ? 0.08 : lerp(0.5, 0.4, curX);
    plumeLight.intensity = space ? 0 : plumeLight.intensity;
    floods.forEach(l => { if (space) { l.userData.i = l.intensity; l.intensity = 0; } else if (l.userData.i !== undefined) l.intensity = l.userData.i; });
    padLight.intensity = space ? 0 : padLight.intensity;
    fog.color.copy(HORIZON).lerp(NAVY, space ? 0 : curX);
  }
  function viewUniforms(cam) {
    bgMat.uniforms.uInvProj.value.copy(cam.projectionMatrixInverse);
    bgMat.uniforms.uCamWorld.value.copy(cam.matrixWorld);
  }
  let plumeLightSave = 0;
  class StagePass extends T.Pass {
    constructor() { super(); this.needsSwap = false; }
    render(r, writeBuffer, readBuffer) {
      const target = this.renderToScreen ? null : readBuffer;
      r.setRenderTarget(target); r.clear();
      plumeLightSave = [plumeLight.intensity, padLight.intensity];
      setWorld(false); viewUniforms(camera); updateFlow(curT, curX, false);
      r.render(scene, camera);
      if (splitK > 0 && target) {
        const Wd = target.width, Hd = target.height, x0 = Math.round(lerp(Wd, Wd / 2, splitK));
        target.viewport.set(x0, 0, Wd / 2, Hd); target.scissor.set(x0, 0, Wd - x0, Hd); target.scissorTest = true;
        r.setRenderTarget(target); r.clear();
        setWorld(true); viewUniforms(spaceCam); updateFlow(curT, curX, true);
        r.render(scene, spaceCam);
        target.viewport.set(0, 0, Wd, Hd); target.scissor.set(0, 0, Wd, Hd); target.scissorTest = false;
        r.setRenderTarget(target);
        setWorld(false); [plumeLight.intensity, padLight.intensity] = plumeLightSave;
      }
    }
  }
  composer.addPass(new StagePass());
  const bloom = new T.UnrealBloomPass(new T.Vector2(360, 640), 0.5, 0.5, 0.9);
  composer.addPass(bloom);
  composer.addPass(new T.ShaderPass(T.GammaCorrectionShader));

  // ---------------------------------------------------------------- sizing, playback, hooks
  function resize() {
    const Wv = innerWidth, Hv = innerHeight, fit = RENDER ? 1 : Math.min(Wv / 360, Hv / 640);
    frameEl.style.transform = RENDER ? '' : `translate(${((Wv - 360 * fit) / 2).toFixed(1)}px, ${((Hv - 640 * fit) / 2).toFixed(1)}px) scale(${fit})`;
    const pr = Math.min(4, (devicePixelRatio || 1) * fit);
    renderer.setPixelRatio(pr); renderer.setSize(360, 640, false);
    composer.setPixelRatio(pr); composer.setSize(360, 640);
    bgMat.uniforms.uRes.value.set(360 * pr, 640 * pr);
    stars.material.uniforms.uPR.value = pr;
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
  const fontsWanted = ['700 35px "Barlow Condensed"', '600 19.5px "Barlow Condensed"', '700 27px "Barlow Condensed"', '500 8px "IBM Plex Mono"', '600 10px "IBM Plex Mono"'];
  Promise.all(fontsWanted.map(f => document.fonts.load(f))).then(() => document.fonts.ready).then(() => {
    draw(0);
    requestAnimationFrame(() => { window.__ready = true; });
  });
})();

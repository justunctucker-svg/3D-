/* Turbofan Jet Engine · Inside the Mechanism
   Procedural Three.js (r128) scene. Everything on screen is a pure function of the time t (0–40 s):
   window.__render(t) draws one frame, window.__ready turns true once fonts and the first frame are done.
   Units are metres. The engine axis runs along x with the intake facing +x; air flows toward -x. */
(() => {
  'use strict';
  const T = THREE, PI = Math.PI, TAU = PI * 2;
  const DURATION = 40, Y0 = 1.9;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const smooth = k => { k = clamp(k); return k * k * (3 - 2 * k); };
  const span = (t, a, b) => clamp((t - a) / (b - a));
  const pulse = (t, a, b, c, d) => smooth(span(t, a, b)) * (1 - smooth(span(t, c, d)));
  const rand = (i, j) => { const x = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return x - Math.floor(x); };
  const RENDER = new URLSearchParams(location.search).has('render');

  // ---------------------------------------------------------------- page frame + renderer
  const frameEl = document.getElementById('frame'), stage = document.getElementById('stage');
  let fitScale = 1;
  const renderer = new T.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  stage.appendChild(renderer.domElement);

  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(36, 360 / 640, 0.05, 500);
  const HORIZON = new T.Color(0.083, 0.088, 0.098), NAVY = new T.Color(0.006, 0.014, 0.034);
  scene.fog = new T.Fog(HORIZON.clone(), 28, 170);

  const rtOpts = { minFilter: T.LinearFilter, magFilter: T.LinearFilter, format: T.RGBAFormat, type: T.HalfFloatType };
  let rt;
  if (renderer.capabilities.isWebGL2) { rt = new T.WebGLMultisampleRenderTarget(360, 640, rtOpts); rt.samples = 4; }
  else rt = new T.WebGLRenderTarget(360, 640, Object.assign(rtOpts, { type: T.UnsignedByteType }));
  const composer = new T.EffectComposer(renderer, rt);
  composer.addPass(new T.RenderPass(scene, camera));
  const bloom = new T.UnrealBloomPass(new T.Vector2(360, 640), 0.45, 0.5, 0.9);
  composer.addPass(bloom);
  composer.addPass(new T.ShaderPass(T.GammaCorrectionShader));

  // ---------------------------------------------------------------- environment, lights, sky
  {
    const env = new T.Scene();
    const basic = c => new T.MeshBasicMaterial({ color: c, side: T.DoubleSide });
    env.add(new T.Mesh(new T.SphereGeometry(50, 32, 16), new T.MeshBasicMaterial({ color: new T.Color(0.05, 0.065, 0.09), side: T.BackSide })));
    const band = new T.Mesh(new T.CylinderGeometry(48, 48, 7, 32, 1, true), basic(new T.Color(0.16, 0.16, 0.17)));
    band.position.y = 2; env.add(band);
    const gnd = new T.Mesh(new T.CircleGeometry(49, 32), basic(new T.Color(0.13, 0.085, 0.05)));
    gnd.rotation.x = -PI / 2; gnd.position.y = -1.5; env.add(gnd);
    const sunPanel = new T.Mesh(new T.PlaneGeometry(9, 9), basic(new T.Color(7, 5.6, 4.2)));
    sunPanel.position.set(24, 30, 28); sunPanel.lookAt(0, 0, 0); env.add(sunPanel);
    const top = new T.Mesh(new T.PlaneGeometry(40, 40), basic(new T.Color(0.3, 0.36, 0.46)));
    top.position.y = 46; top.rotation.x = PI / 2; env.add(top);
    const pm = new T.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(env, 0.03).texture;
  }
  const sun = new T.DirectionalLight(0xffe2c0, 2.6);
  sun.position.set(5.5, 9.5, 8.5); sun.target.position.set(-0.4, 1, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -5.5, right: 5.5, top: 5.5, bottom: -5.5, near: 1, far: 30 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02; sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const hemi = new T.HemisphereLight(0x8fa3bd, 0x4a3826, 0.55);
  scene.add(hemi);
  const rim = new T.DirectionalLight(0x7fd8ff, 0);          // cool key used only in X-ray
  rim.position.set(-4, 6, -6); scene.add(rim);
  const fireLights = [0, 1, 2].map(i => {
    const l = new T.PointLight(0xff8a3a, 0, 2.6, 2);
    const a = (i / 3) * TAU + 0.6; l.position.set(-0.45, Y0 + Math.cos(a) * 0.36, Math.sin(a) * 0.36);
    scene.add(l); return l;
  });
  const plumeLight = new T.PointLight(0xff7a30, 0, 6, 2);
  plumeLight.position.set(-2.6, Y0 - 0.3, 0); scene.add(plumeLight);

  const bgMat = new T.ShaderMaterial({
    uniforms: { uX: { value: 0 }, uRes: { value: new T.Vector2(1080, 1920) }, uInvProj: { value: new T.Matrix4() }, uCamWorld: { value: new T.Matrix4() } },
    vertexShader: 'varying vec2 vNdc; void main(){ vNdc = position.xy; gl_Position = vec4(position.xy, 0.9999, 1.0); }',
    fragmentShader: `
      varying vec2 vNdc; uniform float uX; uniform vec2 uRes; uniform mat4 uInvProj; uniform mat4 uCamWorld;
      void main(){
        vec4 v = uInvProj * vec4(vNdc, 1.0, 1.0);
        vec3 d = normalize((uCamWorld * vec4(v.xyz / v.w, 0.0)).xyz);
        float e = d.y;
        vec3 sky = mix(vec3(0.083, 0.088, 0.098), vec3(0.016, 0.024, 0.040), smoothstep(0.0, 0.5, e));
        sky += vec3(0.020, 0.012, 0.005) * exp(-max(e, 0.0) * 14.0);
        // X-ray backdrop: dark navy with a faint blue grid (major + minor lines), slight vignette
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

  // ---------------------------------------------------------------- geometry helpers
  const alongX = g => g.rotateZ(-PI / 2);
  // profile points are [radius, x]; the lathe axis becomes the engine axis (x)
  const lathe = (pts, seg = 64, phiStart = 0, phiLength = TAU) => alongX(new T.LatheGeometry(pts.map(([r, x]) => new T.Vector2(r, x)), seg, phiStart, phiLength));
  const cylX = (r, len, seg = 24, r2) => alongX(new T.CylinderGeometry(r2 === undefined ? r : r2, r, len, seg, 1, true));
  const canvasTex = (w, h, draw, srgb = true) => {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h);
    const t = new T.CanvasTexture(cv); t.wrapS = t.wrapT = T.RepeatWrapping; if (srgb) t.encoding = T.sRGBEncoding;
    t.anisotropy = 4; return t;
  };
  // piecewise-linear profile lookup, pts sorted by descending x: [[r, x], …]
  const profile = pts => x => {
    if (x >= pts[0][1]) return pts[0][0];
    for (let i = 1; i < pts.length; i++) if (x >= pts[i][1]) { const [r0, x0] = pts[i - 1], [r1, x1] = pts[i]; return lerp(r0, r1, (x - x0) / (x1 - x0)); }
    return pts[pts.length - 1][0];
  };

  // Twisted, cambered blade with a little thickness. r: hub→tip radius, c: chord, g: stagger from the axis (rad).
  function bladeGeo({ r0, r1, c0, c1, g0, g1, cam = 0.06, th0 = 0.02, th1 = 0.006, nu = 8, nv = 6, sweep = 0, flip = 1 }) {
    const P = [], I = [], row = nu + 1, off = (nv + 1) * row;
    for (let side = 0; side < 2; side++) for (let j = 0; j <= nv; j++) {
      const s = j / nv, r = lerp(r0, r1, s), c = lerp(c0, c1, s), g = lerp(g0, g1, s) * flip, th = lerp(th0, th1, s);
      const ca = Math.cos(g), sa = Math.sin(g);
      for (let i = 0; i <= nu; i++) {
        const u = i / nu - 0.5, e = Math.sqrt(Math.max(0, 1 - 4 * u * u));
        const h = cam * c * (1 - 4 * u * u) * flip + (side ? 0.5 : -0.5) * th * e;
        const a = -u * c * ca + h * sa - sweep * s * s, b = u * c * sa + h * ca, phi = b / r;
        P.push(a, r * Math.cos(phi), r * Math.sin(phi));
      }
    }
    for (let side = 0; side < 2; side++) for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = side * off + j * row + i, b = a + 1, c = a + row, d = c + 1;
      if (side) I.push(a, b, c, b, d, c); else I.push(a, c, b, b, c, d);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals();
    return g;
  }

  // ---------------------------------------------------------------- materials
  const std = (color, metalness, roughness, extra = {}) => { const m = new T.MeshStandardMaterial(Object.assign({ color, metalness, roughness }, extra)); m.color.convertSRGBToLinear(); return m; };
  const DS = { side: T.DoubleSide };

  // nacelle panel seams; u runs around the engine (bottom is u = 0.25), v runs along the lathe profile
  const NAC_K = 24, NAC_X0 = 1.86, NAC_X1 = -0.36;
  const nacTex = canvasTex(2048, 512, (x, w, h) => {
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
    const vOf = X => ((NAC_X0 - X) / (NAC_X0 - NAC_X1)) * (NAC_K - 1) / (2 * NAC_K - 1);
    x.fillStyle = 'rgba(60,64,70,0.4)';
    [1.55, 0.72, 0.02].forEach(X => x.fillRect(0, vOf(X) * h - 1.5, w, 3));
    [0.25, 0.75].forEach(u => x.fillRect(u * w - 1.5, 0, 3, vOf(NAC_X1) * h));
    x.fillStyle = 'rgba(60,64,70,0.35)';
    for (let k = 0; k < 6; k++) { const u = 0.25 + (k - 2.5) * 0.035; x.fillRect(u * w - 9, vOf(0.72) * h + 6, 18, 5); }   // latches
  });
  nacTex.flipY = false;
  const nacelleMat = std(0xc7cbd0, 0.15, 0.42, Object.assign({ map: nacTex }, DS));
  const lipMat = std(0xe4e6e9, 0.8, 0.26, DS);
  const coreMat = std(0x8e949b, 0.35, 0.45, DS);
  const spinTex = canvasTex(512, 256, (x, w, h) => {
    x.fillStyle = '#f2f2f0'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#111214';
    for (let j = 0; j < h; j++) { const v = j / h, c = (0.08 + 0.42 * v) % 1, hw = 0.012 + 0.035 * v * v; for (const o of [-1, 0, 1]) x.fillRect((c - hw + o) * w, j, hw * 2 * w, 1.5); }
  });
  spinTex.flipY = false;
  const spinnerMat = std(0xffffff, 0.25, 0.3, Object.assign({ map: spinTex }, DS));
  const fanMat = std(0xa4abb3, 0.75, 0.32, DS);
  const ogvMat = std(0x6e747b, 0.8, 0.45, DS);
  const compMat = std(0xc9ced4, 0.72, 0.34, DS);
  const statorMat = std(0x8f979f, 0.65, 0.42, DS);
  const turbMat = std(0x9a8f84, 0.9, 0.32, Object.assign({ emissive: new T.Color(1.0, 0.32, 0.06) }, DS)); turbMat.emissiveIntensity = 0;
  const linerMat = std(0xa79e90, 0.85, 0.4, Object.assign({ emissive: new T.Color(1.0, 0.36, 0.08) }, DS)); linerMat.emissiveIntensity = 0;
  const nozzleMat = std(0xcfc6b4, 0.95, 0.3);
  const shaftTex = canvasTex(256, 64, (x, w, h) => { x.fillStyle = '#e6e8ea'; x.fillRect(0, 0, w, h); x.fillStyle = '#3a3e44'; for (let k = 0; k < 4; k++) x.fillRect((k / 4) * w, 0, w * 0.06, h); });
  shaftTex.repeat.set(1, 1);
  const shaftMat = std(0xffffff, 0.6, 0.28, { map: shaftTex });
  const drumMat = std(0x9aa1a9, 0.9, 0.36, DS), hubMat = std(0x9aa1a9, 0.9, 0.36, DS);
  const exhaustMat = std(0x77706a, 0.85, 0.45, Object.assign({ emissive: new T.Color(1.0, 0.3, 0.05) }, DS)); exhaustMat.emissiveIntensity = 0;
  const standMat = std(0x3d4754, 0.55, 0.5);
  const padMat = std(0x1b1c1e, 0.0, 0.9);
  const casterMat = std(0x222326, 0.2, 0.7);
  const yellowMat = std(0xd8a21a, 0.3, 0.5);

  const groundTex = canvasTex(512, 512, (x, w, h) => {
    x.fillStyle = '#6e5539'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) { const g = rand(i, 9); x.fillStyle = `rgba(${g < 0.5 ? '58,42,26' : '128,104,74'},${0.06 + rand(i, 8) * 0.08})`; x.beginPath(); x.ellipse(rand(i, 6) * w, rand(i, 7) * h, 20 + rand(i, 10) * 70, 10 + rand(i, 11) * 40, rand(i, 12) * PI, 0, TAU); x.fill(); }
    for (let i = 0; i < 9000; i++) { const g = rand(i, 1); x.fillStyle = g < 0.5 ? `rgba(48,35,22,${0.25 + rand(i, 2) * 0.3})` : `rgba(150,124,92,${0.2 + rand(i, 2) * 0.3})`; x.fillRect(rand(i, 3) * w, rand(i, 4) * h, 1 + rand(i, 5) * 2, 1 + rand(i, 5) * 2); }
  });
  groundTex.repeat.set(70, 70);
  const groundMat = std(0xffffff, 0, 0.97, { map: groundTex, envMapIntensity: 0.4 });
  const rockMat = std(0x5d4936, 0, 0.92, { envMapIntensity: 0.4 });

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
  const xCase = xrayMat(0x5fd8ff, 0.01, 3.0, 0.4);
  const xCore = xrayMat(0x5fd8ff, 0.015, 2.4, 0.55);
  const xDrum = xrayMat(0x9fe6ff, 0.03, 1.8, 0.4);
  const xStand = xrayMat(0x3f8fd0, 0.02, 2.0, 0.45);
  const edgeMat = new T.LineBasicMaterial({ color: new T.Color(0.35, 0.85, 1.1), transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false });

  const shells = [];
  const fadeMats = [nacelleMat, lipMat, coreMat, drumMat, standMat, padMat, casterMat, yellowMat];
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
  function bladeRow(geo, mat, n, x, parent, phase = 0) {
    const m = new T.InstancedMesh(geo, mat, n), o = new T.Object3D();
    for (let i = 0; i < n; i++) { o.position.set(x, 0, 0); o.rotation.set((i / n) * TAU + phase, 0, 0); o.updateMatrix(); m.setMatrixAt(i, o.matrix); }
    m.castShadow = m.receiveShadow = true; parent.add(m); return m;
  }

  // ---------------------------------------------------------------- ground
  const ground = new T.Mesh(new T.CircleGeometry(320, 64), groundMat);
  ground.rotation.x = -PI / 2; ground.receiveShadow = true; scene.add(ground);
  {
    const rockGeo = new T.DodecahedronGeometry(1, 0), n = 70, rocks = new T.InstancedMesh(rockGeo, rockMat, n), o = new T.Object3D();
    for (let i = 0; i < n; i++) {
      const a = rand(i, 41) * TAU, d = 3.2 + rand(i, 42) * 14, s = 0.02 + rand(i, 43) * rand(i, 44) * 0.12;
      o.position.set(Math.cos(a) * d - 0.5, s * 0.3, Math.sin(a) * d); o.rotation.set(rand(i, 45) * 3, rand(i, 46) * 3, 0); o.scale.set(s * 1.3, s * 0.7, s); o.updateMatrix(); rocks.setMatrixAt(i, o.matrix);
    }
    rocks.receiveShadow = true; rocks.castShadow = true; scene.add(rocks);
  }
  const envFade = [groundMat, rockMat];

  // ---------------------------------------------------------------- engine
  const eng = new T.Group(); eng.position.y = Y0; scene.add(eng);
  const lp = new T.Group(), hp = new T.Group(); eng.add(lp, hp);

  // nacelle: polished lip + painted body (outer skin, trailing edge, inner duct wall)
  const lipPts = [[0.99, 1.86]];
  for (let i = 0; i <= 14; i++) { const a = -PI / 2 + (i / 14) * PI; lipPts.push([1.055 + 0.065 * Math.sin(a), 1.975 + 0.065 * Math.cos(a)]); }
  lipPts.push([1.122, 1.86]);
  const NAC_OUT = [[1.122, 1.86], [1.138, 1.62], [1.146, 1.3], [1.146, 0.95], [1.138, 0.62], [1.118, 0.3], [1.08, 0.02], [1.02, -0.2], [0.935, -0.36]];
  const NAC_IN = [[0.99, 1.86], [0.98, 1.6], [0.976, 1.36], [0.975, 1.05], [0.968, 0.78], [0.952, 0.42], [0.932, 0.1], [0.91, -0.16], [0.895, -0.36]];
  const nacOuter = profile(NAC_OUT), nacInner = profile(NAC_IN);
  const nacBody = [];
  for (let i = 0; i < NAC_K; i++) { const x = lerp(NAC_X0, NAC_X1, i / (NAC_K - 1)); nacBody.push([nacOuter(x), x]); }
  for (let i = NAC_K - 1; i >= 0; i--) { const x = lerp(NAC_X0, NAC_X1, i / (NAC_K - 1)); nacBody.push([nacInner(x), x]); }
  part(lathe(lipPts, 96), lipMat, xCase, eng);
  part(lathe(nacBody, 96), nacelleMat, xCase, eng);

  // core cowl: outer skin from the splitter to the core nozzle, inner wall = core flow-path outer wall
  const CORE_OUT = [[0.555, 1.03], [0.588, 0.97], [0.616, 0.87], [0.642, 0.7], [0.66, 0.48], [0.665, 0.2], [0.66, -0.12], [0.645, -0.45], [0.62, -0.8], [0.588, -1.12], [0.55, -1.4], [0.5, -1.62]];
  const CORE_IN = [[0.47, -1.62], [0.49, -1.46], [0.5, -1.36], [0.44, -0.95], [0.43, -0.9], [0.43, -0.74], [0.47, -0.7], [0.47, -0.2], [0.36, -0.12], [0.338, -0.07], [0.455, 0.66], [0.47, 0.7], [0.488, 0.76], [0.53, 0.95], [0.545, 1.03]];
  const coreOuter = profile(CORE_OUT);
  part(lathe(CORE_OUT.concat(CORE_IN), 80), coreMat, xCore, eng);

  // edge lines for the X-ray look
  const edges = new T.Group(); eng.add(edges);
  const ring = (r, x, seg = 96) => { const p = []; for (let i = 0; i < seg; i++) { const a = (i / seg) * TAU; p.push(new T.Vector3(x, Math.cos(a) * r, Math.sin(a) * r)); } edges.add(new T.LineLoop(new T.BufferGeometry().setFromPoints(p), edgeMat)); };
  const meridian = (pts, a) => edges.add(new T.Line(new T.BufferGeometry().setFromPoints(pts.map(([r, x]) => new T.Vector3(x, Math.cos(a) * r, Math.sin(a) * r))), edgeMat));
  ring(1.122, 1.975); ring(1.055, 2.04); ring(0.99, 1.975); ring(1.146, 1.1); ring(1.138, 0.62); ring(0.935, -0.36); ring(0.895, -0.36);
  ring(0.555, 1.03); ring(0.665, 0.2); ring(0.5, -1.62); ring(0.47, -1.62);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU + PI / 8; meridian(lipPts.slice(1, -1).concat(NAC_OUT), a); meridian(CORE_OUT, a); }

  // spinner, fan disk and 22 wide-chord fan blades (LP spool)
  const spinnerPts = [[0.362, 1.29], [0.36, 1.36], [0.345, 1.47], [0.315, 1.58], [0.27, 1.68], [0.205, 1.77], [0.13, 1.84], [0.055, 1.885], [0.0, 1.9]];
  const spinnerR = profile(spinnerPts.slice().reverse());
  solid(lathe(spinnerPts, 64), spinnerMat, lp);
  solid(cylX(0.358, 0.33, 48), hubMat, lp, [1.13, 0, 0]);
  const fanGeo = bladeGeo({ r0: 0.35, r1: 0.966, c0: 0.25, c1: 0.4, g0: 0.5, g1: 1.08, cam: 0.07, th0: 0.026, th1: 0.008, nu: 10, nv: 10, sweep: 0.05 });
  bladeRow(fanGeo, fanMat, 22, 1.2, lp);
  // bypass outlet guide vanes (static)
  bladeRow(bladeGeo({ r0: 0.6, r1: 0.972, c0: 0.13, c1: 0.15, g0: 0.25, g1: 0.2, cam: 0.08, th0: 0.012, th1: 0.01, nu: 5, nv: 4, flip: -1 }), ogvMat, 40, 0.86, eng);

  // booster (LP spool): 3 rotor rows + stators
  const flowIn = profile([[0.36, 1.03], [0.352, 0.76], [0.25, 0.66], [0.285, -0.07], [0.29, -0.14], [0.27, -0.2], [0.27, -0.7], [0.3, -0.74], [0.3, -0.92], [0.29, -0.95], [0.282, -1.38]]);
  const flowOut = profile([[0.545, 1.03], [0.53, 0.95], [0.488, 0.76], [0.47, 0.7], [0.455, 0.66], [0.338, -0.07], [0.36, -0.12], [0.47, -0.2], [0.47, -0.7], [0.43, -0.74], [0.43, -0.9], [0.44, -0.95], [0.5, -1.36], [0.49, -1.46], [0.47, -1.62]]);
  const rowGeo = (x, c, g, flip, cam = 0.07, inset = 0.008) => bladeGeo({ r0: flowIn(x) + 0.002, r1: flowOut(x) - inset, c0: c, c1: c * 0.92, g0: g, g1: g + 0.28 * flip, cam, th0: c * 0.12, th1: c * 0.06, nu: 6, nv: 4, flip });
  [0.975, 0.875, 0.775].forEach((x, i) => {
    bladeRow(rowGeo(x, 0.07, 0.75, 1), compMat, 30, x, lp, i * 0.3);
    bladeRow(rowGeo(x - 0.05, 0.06, 0.55, -1), statorMat, 36, x - 0.05, eng);
  });
  part(lathe([[0.36, 1.03], [0.352, 0.76], [0.3, 0.7]], 48), drumMat, xDrum, lp);

  // high-pressure compressor (HP spool): 9 rotor rows shrinking toward the back, stators between
  const HPC_X = []; for (let i = 0; i < 9; i++) HPC_X.push(0.62 - i * 0.085);
  HPC_X.forEach((x, i) => {
    const k = i / 8, c = lerp(0.062, 0.034, k);
    bladeRow(rowGeo(x, c, 0.85, 1, 0.07, 0.005), compMat, Math.round(lerp(24, 34, k)), x, hp, i * 0.21);
    if (i < 8) bladeRow(rowGeo(x - 0.0425, c * 0.9, 0.6, -1, 0.06, 0.004), statorMat, Math.round(lerp(30, 40, k)), x - 0.0425, eng);
  });
  part(lathe([[0.25, 0.68], [0.25, 0.66], [0.285, -0.07], [0.29, -0.13], [0.18, -0.16], [0.12, -0.2]], 48), drumMat, xDrum, hp);

  // combustor: annular liner cut away on the near (+z) half, 18 fuel nozzles
  const linerOut = [[0.43, -0.205], [0.44, -0.26], [0.44, -0.6], [0.425, -0.7]], linerIn = [[0.29, -0.205], [0.282, -0.26], [0.282, -0.6], [0.3, -0.7]];
  const domePts = [[0.43, -0.205], [0.4, -0.185], [0.36, -0.178], [0.32, -0.185], [0.29, -0.205]];
  const combustor = new T.Group(); eng.add(combustor);
  solid(lathe(linerOut, 48, PI / 2, PI), linerMat, combustor);
  solid(lathe(domePts, 48, PI / 2, PI), linerMat, combustor);
  solid(lathe(linerIn, 48), linerMat, combustor);
  const xLiner = xrayMat(0xffb070, 0.04, 1.8, 0.5);
  [linerOut, domePts].forEach(p => { const m = new T.Mesh(lathe(p, 48, -PI / 2, PI), xLiner); m.renderOrder = 6; combustor.add(m); });
  {
    // liner dilution holes: small dark rings on the outer liner (far half only)
    const holes = new T.InstancedMesh(new T.TorusGeometry(0.014, 0.004, 6, 12), std(0x50483e, 0.8, 0.5), 36), o = new T.Object3D();
    for (let i = 0; i < 36; i++) { const a = PI / 2 + ((i % 18) + 0.5) / 18 * PI, x = i < 18 ? -0.36 : -0.5; o.position.set(x, -0.441 * Math.sin(a), 0.441 * Math.cos(a)); o.lookAt(o.position.x, 0, 0); o.updateMatrix(); holes.setMatrixAt(i, o.matrix); }
    combustor.add(holes);
  }
  const NOZ = 18, nozzleTips = [];
  {
    const stem = new T.CylinderGeometry(0.012, 0.012, 1, 8), tip = new T.CylinderGeometry(0.018, 0.022, 0.05, 10).rotateZ(PI / 2);
    const stems = new T.InstancedMesh(stem, nozzleMat, NOZ), tips = new T.InstancedMesh(tip, nozzleMat, NOZ), o = new T.Object3D();
    for (let i = 0; i < NOZ; i++) {
      const a = (i / NOZ) * TAU, cy = Math.cos(a), cz = Math.sin(a);
      const p0 = new T.Vector3(-0.12, 0.47 * cy, 0.47 * cz), p1 = new T.Vector3(-0.18, 0.36 * cy, 0.36 * cz), d = p1.clone().sub(p0);
      o.position.copy(p0).add(p1).multiplyScalar(0.5); o.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.clone().normalize()); o.scale.set(1, d.length(), 1); o.updateMatrix(); stems.setMatrixAt(i, o.matrix);
      o.position.set(-0.195, 0.36 * cy, 0.36 * cz); o.quaternion.identity(); o.scale.set(1, 1, 1); o.updateMatrix(); tips.setMatrixAt(i, o.matrix);
      nozzleTips.push([a, -0.22]);
    }
    stems.castShadow = tips.castShadow = true; combustor.add(stems, tips);
  }

  // turbines: 2 HP stages (HP spool), 4 LP stages (LP spool); nozzle guide vanes / stators are static
  const turbRow = (x, c, g, flip, n, mat, parent, inset = 0.006) => bladeRow(bladeGeo({ r0: flowIn(x) + 0.002, r1: flowOut(x) - inset, c0: c, c1: c * 0.9, g0: g, g1: g + 0.12 * flip, cam: 0.16, th0: c * 0.2, th1: c * 0.1, nu: 6, nv: 4, flip }), mat, n, x, parent);
  turbRow(-0.735, 0.05, 0.55, -1, 28, statorMat, eng);
  turbRow(-0.785, 0.045, 0.7, 1, 30, turbMat, hp);
  turbRow(-0.84, 0.045, 0.55, -1, 30, statorMat, eng);
  turbRow(-0.89, 0.045, 0.7, 1, 30, turbMat, hp);
  part(lathe([[0.12, -0.7], [0.2, -0.72], [0.298, -0.74], [0.298, -0.92], [0.2, -0.93], [0.12, -0.92]], 48), drumMat, xDrum, hp);
  [-0.97, -1.08, -1.19, -1.3].forEach((x, i) => {
    turbRow(x, 0.05, 0.5, -1, 32, statorMat, eng);
    turbRow(x - 0.05, 0.05, 0.62, 1, 30 + (i % 2) * 2, turbMat, lp);
  });
  part(lathe([[0.07, -0.93], [0.2, -0.94], [0.29, -0.95], [0.282, -1.38], [0.2, -1.39], [0.07, -1.38]], 48), drumMat, xDrum, lp);

  // shafts: LP shaft (always solid) runs fan → LPT through the hollow HP shaft
  const lpShaft = solid(cylX(0.055, 2.7, 32), shaftMat, lp, [-0.08, 0, 0]);
  part(cylX(0.11, 1.42, 32), drumMat, xDrum, hp, [-0.12, 0, 0]);
  const pulseMat = new T.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uAmt: { value: 0 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vP; uniform float uTime; uniform float uAmt;
      void main(){ float s = fract(vP.x * 2.2 - uTime * 1.3); float band = smoothstep(0.0, 0.08, s) * (1.0 - smoothstep(0.14, 0.32, s));
        float ends = smoothstep(-1.42, -1.3, vP.x) * (1.0 - smoothstep(1.15, 1.28, vP.x));
        gl_FragColor = vec4(vec3(1.0, 0.62, 0.22) * 2.2, (0.3 + 1.2 * band) * ends * uAmt); }`,
    transparent: true, depthWrite: false, blending: T.AdditiveBlending
  });
  const pulseMesh = new T.Mesh(cylX(0.072, 2.7, 32), pulseMat); pulseMesh.position.x = -0.08; pulseMesh.renderOrder = 7; eng.add(pulseMesh);

  // exhaust: tail cone (static)
  solid(lathe([[0.282, -1.38], [0.28, -1.5], [0.262, -1.65], [0.22, -1.82], [0.15, -1.98], [0.07, -2.1], [0.0, -2.15]], 48), exhaustMat, eng);

  // ---------------------------------------------------------------- stand
  const stand = new T.Group(); scene.add(stand);
  const V = (x, y, z) => new T.Vector3(x, y, z);
  function beam(a, b, w, mat = standMat) {
    const d = b.clone().sub(a), L = d.length(), g = part(new T.BoxGeometry(L, w, w), mat, xStand, stand);
    g.position.copy(a).add(b).multiplyScalar(0.5); g.quaternion.setFromUnitVectors(V(1, 0, 0), d.normalize()); return g;
  }
  class Arc extends T.Curve {
    constructor(R, a0, a1, x, cy) { super(); Object.assign(this, { R, a0, a1, x, cy }); }
    getPoint(k, out = new T.Vector3()) { const a = lerp(this.a0, this.a1, k); return out.set(this.x, this.cy - this.R * Math.cos(a), this.R * Math.sin(a)); }
  }
  const FX = 0.5, RX = -1.0, RAIL_Y = 0.21, RAIL_Z = 0.62;
  [-1, 1].forEach(sz => beam(V(-1.8, RAIL_Y, sz * RAIL_Z), V(1.6, RAIL_Y, sz * RAIL_Z), 0.12));
  [FX, RX, -1.72, 1.52].forEach(x => beam(V(x, RAIL_Y, -RAIL_Z), V(x, RAIL_Y, RAIL_Z), 0.1));
  // front saddle under the fan case
  const fR = nacOuter(FX) + 0.03, fA = 0.72;
  part(new T.TubeGeometry(new Arc(fR + 0.035, -fA, fA, FX, Y0), 28, 0.045, 6), standMat, xStand, stand);
  part(new T.TubeGeometry(new Arc(fR - 0.005, -fA + 0.05, fA - 0.05, FX, Y0), 28, 0.022, 6), padMat, xStand, stand);
  [-1, 1].forEach(sz => {
    const top = V(FX, Y0 - (fR + 0.035) * Math.cos(fA), sz * (fR + 0.035) * Math.sin(fA));
    beam(V(FX, RAIL_Y + 0.05, sz * RAIL_Z), top, 0.085);
    beam(V(FX + 0.42, RAIL_Y + 0.05, sz * RAIL_Z), V(FX + 0.02, top.y - 0.12, sz * (RAIL_Z + 0.02)), 0.06);
    beam(V(FX - 0.42, RAIL_Y + 0.05, sz * RAIL_Z), V(FX - 0.02, top.y - 0.12, sz * (RAIL_Z + 0.02)), 0.06);
  });
  // rear saddle under the core
  const rR = coreOuter(RX) + 0.025, rA = 0.85;
  part(new T.TubeGeometry(new Arc(rR + 0.03, -rA, rA, RX, Y0), 24, 0.04, 6), standMat, xStand, stand);
  part(new T.TubeGeometry(new Arc(rR, -rA + 0.05, rA - 0.05, RX, Y0), 24, 0.02, 6), padMat, xStand, stand);
  [-1, 1].forEach(sz => {
    const top = V(RX, Y0 - (rR + 0.03) * Math.cos(rA), sz * (rR + 0.03) * Math.sin(rA));
    beam(V(RX, RAIL_Y + 0.05, sz * RAIL_Z), top, 0.08);
    beam(V(RX + 0.38, RAIL_Y + 0.05, sz * RAIL_Z), V(RX + 0.02, top.y - 0.15, sz * (RAIL_Z - 0.05)), 0.055);
  });
  // casters + yellow lifting eyes
  [[-1.72, -1], [-1.72, 1], [1.52, -1], [1.52, 1]].forEach(([x, sz]) => {
    part(new T.CylinderGeometry(0.075, 0.075, 0.05, 20).rotateX(PI / 2), casterMat, xStand, stand, [x, 0.075, sz * RAIL_Z]);
    part(new T.BoxGeometry(0.1, 0.07, 0.1), standMat, xStand, stand, [x, 0.13, sz * RAIL_Z]);
  });
  [[1.62, 1], [1.62, -1], [-1.88, 1], [-1.88, -1]].forEach(([x, sz]) => part(new T.TorusGeometry(0.045, 0.013, 8, 16), yellowMat, xStand, stand, [x, RAIL_Y + 0.03, sz * RAIL_Z], [0, PI / 2, 0]));

  // ---------------------------------------------------------------- flame, spray, plume (additive shaders)
  const NOISE = `
    float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
                 mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
    float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * n3(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }`;
  const fxVert = `varying vec3 vP; varying vec3 vN; varying vec3 vV; varying vec2 vUv;
    void main(){ vUv = uv; vec4 p = vec4(position, 1.0);
    #ifdef USE_INSTANCING
      p = instanceMatrix * p;
    #endif
    vec3 nn = normal;
    #ifdef USE_INSTANCING
      nn = mat3(instanceMatrix) * nn;
    #endif
    vP = p.xyz; vec4 mv = modelViewMatrix * p; vN = normalize(normalMatrix * nn); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
  const fx = (frag, uniforms) => new T.ShaderMaterial({ uniforms: Object.assign({ uTime: { value: 0 }, uAmt: { value: 0 } }, uniforms), vertexShader: fxVert, fragmentShader: NOISE + frag, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide });

  // annular flame volume: nested shells filled with scrolling noise
  const flameMat = fx(`
    varying vec3 vP; varying vec3 vN; varying vec3 vV; varying vec2 vUv; uniform float uTime; uniform float uAmt; uniform float uReach;
    void main(){
      float s = clamp((-0.2 - vP.x) / 0.5, 0.0, 1.0);
      float ang = atan(vP.z, vP.y);
      float jets = pow(0.5 + 0.5 * cos(ang * 18.0), 2.0);
      float n = fbm(vec3(ang * 5.0, s * 7.0 - uTime * 6.0, length(vP.yz) * 9.0 + uTime * 0.6));
      float n2 = fbm(vec3(ang * 13.0 + 3.0, s * 15.0 - uTime * 10.0, 1.7));
      float body = smoothstep(0.0, 0.07, s) * (1.0 - smoothstep(uReach * 0.6, uReach, s));
      float dens = body * mix(jets, 1.0, smoothstep(0.08, 0.5, s)) * clamp(0.15 + 1.6 * n * n2 * 2.0 - 0.35, 0.0, 2.0);
      vec3 col = mix(vec3(1.0, 0.86, 0.6) * 2.0, vec3(1.0, 0.5, 0.13) * 1.6, smoothstep(0.1, 0.5, s));
      col = mix(col, vec3(0.75, 0.2, 0.04), smoothstep(0.65, 1.0, s));
      float facing = pow(abs(dot(normalize(vN), normalize(vV))), 0.6);
      gl_FragColor = vec4(col, dens * facing * uAmt * 0.085);
    }`, { uReach: { value: 0 } });
  [0.315, 0.355, 0.395].forEach(r => { const m = new T.Mesh(lathe([[r, -0.2], [r + 0.012, -0.45], [r, -0.72]], 72), flameMat); m.renderOrder = 9; combustor.add(m); });

  // flame tongues from each nozzle + fuel spray cones
  const tongueGeo = new T.LatheGeometry([...Array(13)].map((_, i) => { const h = i / 12; return new T.Vector2(0.008 + 0.05 * Math.pow(Math.sin(PI * Math.pow(h, 0.55)), 1.2), h * 0.4); }), 16).rotateZ(PI / 2);
  const tongueMat = fx(`
    varying vec3 vP; varying vec3 vN; varying vec3 vV; varying vec2 vUv; uniform float uTime; uniform float uAmt; uniform float uReach;
    void main(){
      float s = vUv.y;
      float n = fbm(vec3(vUv.x * 6.0, s * 6.0 - uTime * 7.0, vP.y * 4.0 + vP.z * 4.0));
      float body = (1.0 - smoothstep(uReach * 0.5, uReach, s)) * smoothstep(0.0, 0.05, s);
      vec3 col = mix(vec3(1.0, 0.97, 0.85) * 2.6, vec3(1.0, 0.6, 0.18) * 1.8, smoothstep(0.2, 0.75, s));
      float facing = pow(abs(dot(normalize(vN), normalize(vV))), 1.2);
      gl_FragColor = vec4(col, body * facing * (0.35 + 1.1 * n) * uAmt * 0.13);
    }`, { uReach: { value: 0 } });
  const sprayGeo = new T.ConeGeometry(0.032, 0.11, 16, 1, true).translate(0, -0.055, 0).rotateZ(-PI / 2);
  const sprayMat = fx(`
    varying vec3 vP; varying vec3 vN; varying vec3 vV; varying vec2 vUv; uniform float uTime; uniform float uAmt;
    void main(){
      float s = 1.0 - vUv.y;
      float n = fbm(vec3(vUv.x * 10.0, s * 8.0 - uTime * 9.0, 0.3));
      float facing = pow(abs(dot(normalize(vN), normalize(vV))), 0.8);
      gl_FragColor = vec4(vec3(1.0, 0.9, 0.62) * 1.5, (1.0 - s) * smoothstep(0.0, 0.15, s) * (0.3 + n) * facing * uAmt * 0.5);
    }`);
  {
    const tongues = new T.InstancedMesh(tongueGeo, tongueMat, NOZ), sprays = new T.InstancedMesh(sprayGeo, sprayMat, NOZ), o = new T.Object3D();
    nozzleTips.forEach(([a], i) => {
      o.position.set(-0.22, 0.36 * Math.cos(a), 0.36 * Math.sin(a)); o.rotation.set(a, 0, 0); o.updateMatrix();
      tongues.setMatrixAt(i, o.matrix); sprays.setMatrixAt(i, o.matrix);
    });
    tongues.renderOrder = 9; sprays.renderOrder = 9; combustor.add(tongues, sprays);
  }

  // exhaust plume: hot core jet + faint cool bypass sheath
  const plumeMat = fx(`
    varying vec3 vP; varying vec3 vN; varying vec3 vV; varying vec2 vUv; uniform float uTime; uniform float uAmt;
    void main(){
      float s = clamp((-1.62 - vP.x) / 3.6, 0.0, 1.0);
      float ang = atan(vP.z, vP.y);
      float n = fbm(vec3(ang * 3.0, vP.x * 2.4 + uTime * 5.0, length(vP.yz) * 3.0));
      vec3 col = mix(vec3(1.0, 0.66, 0.3) * 1.5, vec3(0.9, 0.28, 0.06), smoothstep(0.0, 0.5, s));
      float facing = pow(abs(dot(normalize(vN), normalize(vV))), 1.4);
      float a = (1.0 - smoothstep(0.1, 1.0, s)) * smoothstep(0.0, 0.03, s) * (0.25 + 0.9 * n) * facing;
      gl_FragColor = vec4(col, a * uAmt * 0.13);
    }`);
  const plume = new T.Group(); eng.add(plume);
  [[0.44, 0.7], [0.3, 0.55]].forEach(([r0, r1]) => { const m = new T.Mesh(lathe([[r0, -1.62], [r0 * 1.05, -2.2], [r1 * 1.15, -3.4], [r1 * 1.4, -5.2]], 64), plumeMat); m.renderOrder = 9; plume.add(m); });
  const sheathMat = fx(`
    varying vec3 vP; varying vec3 vN; varying vec3 vV; varying vec2 vUv; uniform float uTime; uniform float uAmt;
    void main(){
      float s = clamp((-0.36 - vP.x) / 3.0, 0.0, 1.0);
      float ang = atan(vP.z, vP.y);
      float n = fbm(vec3(ang * 6.0, vP.x * 3.0 + uTime * 4.0, 0.5));
      float facing = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
      gl_FragColor = vec4(vec3(0.55, 0.8, 1.0), (1.0 - s) * smoothstep(0.0, 0.05, s) * (0.2 + 0.8 * n) * facing * uAmt * 0.12);
    }`);
  { const m = new T.Mesh(lathe([[0.86, -0.36], [0.74, -0.9], [0.66, -1.6], [0.7, -2.6], [0.78, -3.4]], 64), sheathMat); m.renderOrder = 9; plume.add(m); }

  // ---------------------------------------------------------------- airflow streaks
  const streakMat = new T.ShaderMaterial({
    vertexShader: 'attribute vec4 aCol; varying vec2 vUv; varying vec4 vCol; void main(){ vUv = uv; vCol = aCol; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec2 vUv; varying vec4 vCol; void main(){ float along = pow(vUv.x, 1.7) * (1.0 - smoothstep(0.86, 1.0, vUv.x)); float across = 1.0 - abs(vUv.y * 2.0 - 1.0); across *= across; float a = along * across * vCol.a; if (a < 0.003) discard; gl_FragColor = vec4(vCol.rgb, a); }',
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide
  });
  const streakGeo = new T.BufferGeometry();
  streakGeo.setAttribute('position', new T.Float32BufferAttribute([-1, -0.5, 0, 0, -0.5, 0, 0, 0.5, 0, -1, 0.5, 0, -1, 0, -0.5, 0, 0, -0.5, 0, 0, 0.5, -1, 0, 0.5], 3));
  streakGeo.setAttribute('uv', new T.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1], 2));
  streakGeo.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  function streaks(n, seed) {
    const g = streakGeo.clone(), col = new T.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    col.setUsage(T.DynamicDrawUsage); g.setAttribute('aCol', col);
    const mesh = new T.InstancedMesh(g, streakMat, n);
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage); mesh.frustumCulled = false; mesh.renderOrder = 8; eng.add(mesh);
    const P = [];
    for (let i = 0; i < n; i++) P.push({ th: rand(i, seed) * TAU, f: rand(i, seed + 1), ph: rand(i, seed + 2), k: 0.9 + rand(i, seed + 3) * 0.2, w: rand(i, seed + 4) });
    return { mesh, col, P, n };
  }
  // A flow path maps u ∈ [0, 1] to an axial position x, spaced so equal steps in u take equal time.
  function flowPath(x0, x1, speedPts) {
    const v = profile(speedPts), N = 800, ts = [0], xs = [x0];
    for (let i = 1; i <= N; i++) { const x = lerp(x0, x1, i / N); xs.push(x); ts.push(ts[i - 1] + Math.abs(x - xs[i - 1]) / v((x + xs[i - 1]) / 2)); }
    const tot = ts[N], M = 1024, inv = new Float32Array(M + 1);
    for (let k = 0, i = 0; k <= M; k++) { const q = (k / M) * tot; while (i < N - 1 && ts[i + 1] < q) i++; inv[k] = lerp(xs[i], xs[i + 1], clamp((q - ts[i]) / (ts[i + 1] - ts[i] || 1))); }
    return { tot, x: u => { const q = clamp(u) * M, i = Math.min(M - 1, q | 0); return lerp(inv[i], inv[i + 1], q - i); }, v };
  }
  const coreFlow = flowPath(3.5, -4.6, [[1.0, 3.5], [1.0, 1.4], [0.75, 1.0], [0.62, 0.66], [0.6, -0.06], [0.5, -0.16], [0.62, -0.25], [0.7, -0.68], [1.1, -0.8], [1.35, -1.35], [2.0, -1.65], [2.6, -2.5], [2.8, -4.6]]);
  const bypassFlow = flowPath(3.7, -3.8, [[1.0, 3.7], [0.95, 1.4], [0.9, 0.9], [0.95, -0.2], [1.5, -0.6], [1.8, -3.8]]);
  // core flow-path bounds (inner, outer radius) along x, from the intake capture to the jet
  const coreBand = x => {
    if (x > 1.9) { const k = smooth(span(x, 1.95, 3.5)); return [lerp(0.06, 0.22, k), lerp(0.56, 0.86, k)]; }
    if (x > 1.03) { const k = span(x, 1.03, 1.9); return [lerp(0.36, Math.max(spinnerR(x), 0.04), k) + 0.03, lerp(0.545, 0.57, k)]; }
    if (x > -1.38) return [flowIn(x) + 0.008, flowOut(x) - 0.01];
    const tc = profile([[0.282, -1.38], [0.262, -1.65], [0.15, -1.98], [0.0, -2.15], [0.0, -5]])(x);
    const k = smooth(span(x, -1.62, -4.6));
    return [lerp(tc + 0.01, 0.0, smooth(span(x, -2.0, -3.2))), lerp(flowOut(Math.max(x, -1.62)) - 0.01, 0.78, k)];
  };
  const bypassBand = x => {
    if (x > 1.95) { const k = smooth(span(x, 1.95, 3.7)); return [lerp(0.6, 0.85, k), lerp(0.95, 1.45, k)]; }
    if (x > 1.03) { const k = span(x, 1.03, 1.95); return [lerp(0.58, 0.6, k), nacInner(x) - 0.03]; }
    if (x > -0.36) return [coreOuter(x) + 0.025, nacInner(x) - 0.025];
    const k = smooth(span(x, -0.36, -1.62)), c = x > -1.62 ? coreOuter(x) : 0.5;
    return [c + 0.025, lerp(0.87, c + 0.3, k) + smooth(span(x, -1.62, -3.8)) * 0.18];
  };
  const coreS = streaks(560, 11), bypassS = streaks(440, 23), sprayS = streaks(NOZ * 14, 37);

  // ---------------------------------------------------------------- timeline: spools, readouts, X-ray
  const xrayAmt = t => smooth(span(t, 10, 10.8)) * (1 - smooth(span(t, 31, 31.8)));
  const rpmAt = t => {
    if (t < 4.4) return 0;
    if (t < 9.6) return 5600 * smooth(span(t, 4.4, 9.6));
    if (t < 16.5) return lerp(5600, 9800, smooth(span(t, 9.6, 16.5)));
    return lerp(9800, 10000, smooth(span(t, 16.5, 18.5))) + 25 * Math.sin(t * 1.9) * smooth(span(t, 18, 19));
  };
  const tempAt = t => {
    if (t < 10) return 15;
    if (t < 17.6) return lerp(15, 550, smooth(span(t, 10.2, 16.6)));
    if (t < 24) return lerp(550, 1500, smooth(span(t, 18.3, 21.2))) + 6 * Math.sin(t * 2.3) * smooth(span(t, 21, 22));
    if (t < 31) return lerp(1500, 650, smooth(span(t, 24.4, 30.4)));
    return lerp(650, 550, smooth(span(t, 31.2, 34))) + 3 * Math.sin(t * 1.7) * smooth(span(t, 34, 35));
  };
  const thrustAt = t => {
    if (t < 4.6) return 0;
    if (t < 17) return lerp(0, 18, smooth(span(t, 4.6, 10))) + lerp(0, 24, smooth(span(t, 10, 16.5)));
    if (t < 24) return lerp(42, 95, smooth(span(t, 18.3, 23.5)));
    if (t < 31) return lerp(95, 110, smooth(span(t, 24, 30.5)));
    return lerp(110, 130, smooth(span(t, 31.2, 35.5))) + 0.6 * Math.sin(t * 2.1);
  };
  const flowAt = t => clamp(Math.sqrt(rpmAt(t) / 10000) * smooth(span(t, 4.5, 6.2)));
  const ignAt = t => smooth(span(t, 18.2, 19.0));
  // integrate spool angles and the flow phase once, so any t can be evaluated directly
  const DT = 1 / 240, TN = Math.ceil(DURATION / DT) + 2, lpTab = new Float64Array(TN), hpTab = new Float64Array(TN), flowTab = new Float64Array(TN);
  for (let i = 1; i < TN; i++) {
    const t = (i - 0.5) * DT, r = rpmAt(t) / 10000;
    lpTab[i] = lpTab[i - 1] + 0.36 * TAU * Math.sqrt(r) * DT;
    hpTab[i] = hpTab[i - 1] + 0.35 * TAU * Math.sqrt(r) * DT;
    flowTab[i] = flowTab[i - 1] + 3.0 * flowAt(t) * DT;
  }
  const tab = (a, t) => { const q = clamp(t, 0, DURATION) / DT, i = Math.min(TN - 2, q | 0); return lerp(a[i], a[i + 1], q - i); };

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
  //        t     tx     ty    tz    az     el     d
  const SHOTS = [[
    [0.0, 0.2, 1.55, 0, 0.6, 0.1, 14.2],
    [4.0, 0.35, 1.62, 0, 0.98, 0.11, 12.6],
    [6.7, 1.7, 1.9, 0, 1.18, 0.07, 6.6],
    [7.7, 1.62, 1.9, 0, 1.1, 0.08, 6.7],
    [9.7, -0.15, 1.85, 0, 0.5, 0.14, 10.6],
    [11.7, 0.32, 1.88, 0, 0.3, 0.15, 6.6],
    [16.8, 0.28, 1.9, 0, 0.12, 0.13, 4.7],
    [18.2, -0.42, 1.9, 0, 0.32, 0.2, 3.6],
    [23.8, -0.5, 1.9, 0, 0.46, 0.17, 3.35],
    [24.9, -1.05, 1.88, 0, 0.24, 0.14, 3.7],
    [26.4, -1.0, 1.88, 0, 0.17, 0.13, 3.9],
    [28.6, 0.0, 1.82, 0, 0.1, 0.12, 12.0],
    [30.9, 0.0, 1.82, 0, 0.04, 0.12, 12.3],
    [32.0, -0.25, 1.72, 0, -0.12, 0.08, 13.6],
    [37.0, -2.0, 1.72, 0, -0.32, 0.07, 12.8]
  ], [
    [37.0, 0.45, 1.55, 0, 0.8, 0.11, 14.0],
    [40.0, 0.45, 1.55, 0, 0.96, 0.12, 13.4]
  ]].map(keys => ({ a: keys[0][0], b: keys[keys.length - 1][0], f: [1, 2, 3, 4, 5, 6].map(c => monotone(keys.map(k => k[0]), keys.map(k => k[c]))) }));
  function cameraAt(t) {
    const s = SHOTS.find(s => t < s.b) || SHOTS[SHOTS.length - 1];
    const [tx, ty, tz, az, el, d] = s.f.map(f => f(t));
    camera.position.set(tx + d * Math.sin(az) * Math.cos(el), ty + d * Math.sin(el), tz + d * Math.cos(az) * Math.cos(el));
    camera.lookAt(tx, ty, tz);
  }

  // ---------------------------------------------------------------- UI
  const $ = id => document.getElementById(id);
  const ui = { specs: $('specs'), step: $('step'), caption: $('caption'), badge: $('badge'), bar: $('bar'), stage: $('vStage'), rpm: $('vRpm'), temp: $('vTemp'), thrust: $('vThrust') };
  const SCENES = [
    { a: 0, b: 4, step: '', cap: 'A jet engine does four things: suck, squeeze, bang, blow.', stage: 'STANDBY' },
    { a: 4, b: 10, step: '01 · INTAKE', cap: 'The big fan pulls in a huge amount of air. Most of it goes around the core.', stage: 'INTAKE' },
    { a: 10, b: 17, step: '02 · COMPRESSOR', x: true, cap: 'Rows of spinning blades squeeze the air to a fraction of its size.', stage: 'COMPRESS' },
    { a: 17, b: 24, step: '03 · COMBUSTOR', x: true, cap: 'Fuel is sprayed in and burned. The hot gas expands and rushes backward.', stage: 'COMBUST' },
    { a: 24, b: 31, step: '04 · TURBINE', x: true, cap: 'The hot gas spins the turbine, and the turbine spins the fan and compressor through a shaft. The engine runs itself.', stage: 'TURBINE' },
    { a: 31, b: 37, step: '05 · THRUST', cap: 'The gases blasting out the back push the engine forward.', stage: 'THRUST' },
    { a: 37, b: 40.5, step: '', cap: 'Suck, squeeze, bang, blow.', stage: 'THRUST' }
  ];
  const fmt = n => Math.round(n).toLocaleString('en-US');
  const setText = (el, s) => { if (el.textContent !== s) el.textContent = s; };

  // callouts: anchor in engine coordinates, chip offset in CSS px
  const CALLOUTS = [
    { text: 'FAN', on: [[5.2, 9.4], [27.9, 30.8]], at: [1.22, 0.55, 0.42], dx: -62, dy: -46 },
    { text: 'BYPASS DUCT', on: [[8.2, 11.3]], at: [-0.25, 0.55, 0.62], dx: -30, dy: 62 },
    { text: 'COMPRESSOR', on: [[11.6, 16.9]], at: [0.28, 0.3, 0.2], dx: -30, dy: 70 },
    { text: 'COMBUSTOR', on: [[18.7, 23.9]], at: [-0.52, -0.26, -0.3], dx: 40, dy: 40 },
    { text: 'TURBINE', on: [[25.0, 30.8]], at: [-1.12, 0.4, 0.18], dx: -36, dy: -60 },
    { text: 'SHAFT', on: [[26.2, 30.8]], at: [0.95, 0.0, 0.06], dx: 24, dy: 58 }
  ];
  const calloutRoot = $('callouts');
  CALLOUTS.forEach(c => {
    c.el = document.createElement('div'); c.el.className = 'callout';
    c.el.innerHTML = '<span class="line"></span><span class="dot"></span><span class="tag"></span>';
    c.line = c.el.querySelector('.line'); c.tag = c.el.querySelector('.tag'); c.tag.textContent = c.text;
    calloutRoot.appendChild(c.el);
  });
  const tmpV = new T.Vector3();
  function updateCallouts(t, X) {
    const capBottom = ui.caption.offsetTop + ui.caption.offsetHeight + ui.caption.offsetParent.offsetTop + 10;
    CALLOUTS.forEach(c => {
      let o = 0;
      c.on.forEach(([a, b]) => { o = Math.max(o, pulse(t, a, a + 0.35, b - 0.35, b)); });
      c.el.style.opacity = o.toFixed(3);
      if (o <= 0.001) return;
      c.el.classList.toggle('x', X > 0.5);
      tmpV.set(c.at[0], c.at[1] + Y0, c.at[2]).project(camera);
      const px = (tmpV.x * 0.5 + 0.5) * 360, py = (-tmpV.y * 0.5 + 0.5) * 640;
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
  const COOL = [0.36, 0.64, 1.0];
  function placeStreak(sys, i, head, tail, w, r, g, b, a) {
    vDir.subVectors(head, tail); const L = vDir.length();
    if (L < 1e-4 || a <= 0.002) { mtx.makeScale(0, 0, 0); sys.mesh.setMatrixAt(i, mtx); sys.col.setXYZW(i, 0, 0, 0, 0); return; }
    qd.setFromUnitVectors(X1, vDir.divideScalar(L)); vS.set(L, w, w);
    mtx.compose(head, qd, vS); sys.mesh.setMatrixAt(i, mtx); sys.col.setXYZW(i, r, g, b, a);
  }
  const pathPoint = (out, band, x, th, f) => { const [ri, ro] = band(x), r = lerp(ri, ro, f); return out.set(x, Math.cos(th) * r, Math.sin(th) * r); };

  function updateFlow(t, X) {
    const A = tab(flowTab, t), flow = flowAt(t), ign = ignAt(t);
    const vis = smooth(span(t, 4.6, 6.4)) * (1 - 0.6 * smooth(span(t, 37, 37.3)));
    const hotFront = (t - 18.25) * 2.6;                               // metres behind the nozzles that the hot gas has reached
    const coreGain = lerp(0.8, 1.0, X) * vis, byGain = lerp(1.0, 0.3, X) * vis;
    const tau = 0.24 * flow, wm = clamp(camera.position.distanceTo(vA.set(0, Y0, 0)) / 5.5, 1, 2.4);
    streakMat.depthTest = X < 0.5;
    // core air
    coreS.P.forEach((p, i) => {
      const u = (p.ph + (A * p.k) / coreFlow.tot) % 1, uT = u - (tau * 3.0) / coreFlow.tot;
      const x = coreFlow.x(u), xt = coreFlow.x(Math.max(0, uT));
      const f = 0.1 + 0.8 * p.f, th = p.th + 0.05 * x;
      pathPoint(vA, coreBand, x, th, f); pathPoint(vB, coreBand, xt, th, f);
      let r = COOL[0], g = COOL[1], b = COOL[2], a = 0.55;
      const sq = smooth(span(x, 0.7, -0.1));                          // squeezed: denser, brighter
      r = lerp(r, 0.86, sq); g = lerp(g, 0.95, sq); a *= 1 + 0.9 * sq;
      const hot = x < -0.18 ? clamp(hotFront - (-0.2 - x) * 1.0) * ign : 0;
      if (hot > 0) {
        const kT = smooth(span(x, -0.35, -0.9)), kE = smooth(span(x, -1.6, -4.0));
        const hr = 1.0, hg = lerp(lerp(0.88, 0.5, kT), 0.36, kE), hb = lerp(lerp(0.6, 0.16, kT), 0.08, kE);
        const ha = lerp(lerp(0.85, 0.8, kT), 0.75, kE);
        r = lerp(r, hr * 1.4, hot); g = lerp(g, hg * 1.4, hot); b = lerp(b, hb * 1.4, hot); a = lerp(a, ha, hot);
      } else if (x < -0.2) a *= 0.55;
      a *= smooth(span(u, 0, 0.05)) * (1 - smooth(span(u, 0.86, 1))) * coreGain * lerp(1, 0.7, X);
      placeStreak(coreS, i, vA, vB, (0.009 + 0.005 * p.w + (x < -1.6 ? 0.008 : 0)) * wm, r, g, b, a);
    });
    // bypass air
    bypassS.P.forEach((p, i) => {
      const u = (p.ph + (A * p.k) / bypassFlow.tot) % 1, uT = u - (tau * 3.0) / bypassFlow.tot;
      const x = bypassFlow.x(u), xt = bypassFlow.x(Math.max(0, uT)), f = 0.08 + 0.84 * p.f;
      pathPoint(vA, bypassBand, x, p.th, f); pathPoint(vB, bypassBand, xt, p.th, f);
      const a = 0.6 * smooth(span(u, 0, 0.05)) * (1 - smooth(span(u, 0.8, 1))) * byGain;
      placeStreak(bypassS, i, vA, vB, (0.011 + 0.005 * p.w) * wm, COOL[0], COOL[1], COOL[2], a);
    });
    // fuel spray droplets
    const spray = smooth(span(t, 17.5, 18.0)) * (1 - 0.5 * ign) * (1 - smooth(span(t, 30.5, 31.2)));
    sprayS.P.forEach((p, i) => {
      const nz = i % NOZ, a0 = (nz / NOZ) * TAU, s = (p.ph + t * 2.4 * p.k) % 1, lat = s * 0.11 * 0.55 * Math.sqrt(p.f);
      const rr = 0.36 + Math.cos(p.th) * lat, x = -0.215 - s * 0.11, a1 = a0 + Math.sin(p.th) * lat / 0.36;
      vA.set(x, Math.cos(a1) * rr, Math.sin(a1) * rr); vB.set(x + 0.022, Math.cos(a1) * rr, Math.sin(a1) * rr);
      placeStreak(sprayS, i, vA, vB, 0.005, 1.0, 0.86, 0.5, spray * (1 - s) * 0.9);
    });
    [coreS, bypassS, sprayS].forEach(s => { s.mesh.instanceMatrix.needsUpdate = true; s.col.needsUpdate = true; });
  }

  function update(t) {
    t = clamp(t, 0, DURATION);
    const X = xrayAmt(t), ign = ignAt(t);

    // X-ray blend
    shells.forEach(({ solid: s, ghost }) => { s.visible = X < 0.995; ghost.visible = X > 0.005; s.castShadow = X < 0.5; });
    fadeMats.forEach(m => { m.transparent = X > 0.005; m.opacity = 1 - X; m.depthWrite = X < 0.6; });
    envFade.forEach(m => { m.transparent = X > 0.005; m.opacity = 1 - X; m.depthWrite = X < 0.6; });
    ground.visible = X < 0.995;
    xrayMats.forEach(m => { m.uniforms.uOpacity.value = X; });
    edgeMat.opacity = X * 0.4; edges.visible = X > 0.005;
    bgMat.uniforms.uX.value = X;
    scene.fog.color.copy(HORIZON).lerp(NAVY, X);
    sun.intensity = lerp(2.6, 1.7, X); rim.intensity = X * 1.1; hemi.intensity = lerp(0.55, 0.45, X);

    // spools
    lp.rotation.x = -tab(lpTab, t);
    hp.rotation.x = -tab(hpTab, t);

    // combustion + heat
    const flick = 0.9 + 0.1 * Math.sin(t * 23.0) * Math.sin(t * 7.3 + 1.0);
    flameMat.uniforms.uTime.value = tongueMat.uniforms.uTime.value = sprayMat.uniforms.uTime.value = plumeMat.uniforms.uTime.value = sheathMat.uniforms.uTime.value = t;
    flameMat.uniforms.uAmt.value = ign * flick * (1 - 0.35 * (1 - X));
    flameMat.uniforms.uReach.value = lerp(0.15, 1.15, ign);
    tongueMat.uniforms.uAmt.value = ign * flick;
    tongueMat.uniforms.uReach.value = lerp(0.2, 1.0, ign);
    sprayMat.uniforms.uAmt.value = smooth(span(t, 17.5, 18.0)) * (1 - 0.6 * ign);
    const hotTurb = smooth(span(t, 18.6, 20.6));
    turbMat.emissiveIntensity = 0.32 * hotTurb * flick;
    linerMat.emissiveIntensity = 0.55 * ign * flick;
    exhaustMat.emissiveIntensity = 0.12 * hotTurb;
    fireLights.forEach((l, i) => { l.intensity = 0.6 * ign * (0.85 + 0.15 * Math.sin(t * (17 + i * 5) + i)); });
    const plumeAmt = smooth(span(t, 19.0, 20.5)) * lerp(1.0, 0.3, X) * (t > 31 ? lerp(1, 1.25, smooth(span(t, 31, 34))) : 1);
    plumeMat.uniforms.uAmt.value = plumeAmt;
    sheathMat.uniforms.uAmt.value = smooth(span(t, 6, 8)) * (1 - X);
    plumeLight.intensity = 2.2 * plumeAmt * (1 - X) * flick;
    pulseMat.uniforms.uTime.value = t;
    pulseMat.uniforms.uAmt.value = pulse(t, 25.0, 26.0, 30.4, 31.0);

    updateFlow(t, X);
    cameraAt(t);
    camera.updateMatrixWorld();
    bgMat.uniforms.uInvProj.value.copy(camera.projectionMatrixInverse);
    bgMat.uniforms.uCamWorld.value.copy(camera.matrixWorld);

    // overlay
    const si = SCENES.findIndex(s => t < s.b), sc = SCENES[si < 0 ? SCENES.length - 1 : si];
    const fadeIn = sc.a === 0 ? 1 : smooth(span(t, sc.a, sc.a + 0.35)), fadeOut = sc.b > 40 ? 1 : 1 - smooth(span(t, sc.b - 0.3, sc.b));
    setText(ui.step, sc.step); ui.step.classList.toggle('x', !!sc.x);
    setText(ui.caption, sc.cap);
    ui.step.style.opacity = ui.caption.style.opacity = (fadeIn * fadeOut).toFixed(3);
    const fin = smooth(span(t, 37.0, 37.6));
    ui.specs.style.opacity = (1 - fin).toFixed(3);
    ui.bar.style.opacity = (1 - fin).toFixed(3);
    ui.badge.style.opacity = smooth(span(t, 10.1, 10.6)) * (1 - smooth(span(t, 31.0, 31.5)));
    setText(ui.stage, sc.stage);
    setText(ui.rpm, fmt(Math.round(rpmAt(t) / 10) * 10));
    setText(ui.temp, fmt(Math.round(tempAt(t) / 5) * 5) + ' °C');
    setText(ui.thrust, fmt(thrustAt(t)) + ' kN');
    updateCallouts(t, X);
  }

  // ---------------------------------------------------------------- sizing, playback, hooks
  function resize() {
    const W = innerWidth, H = innerHeight;
    fitScale = RENDER ? 1 : Math.min(W / 360, H / 640);
    frameEl.style.transform = RENDER ? '' : `translate(${((W - 360 * fitScale) / 2).toFixed(1)}px, ${((H - 640 * fitScale) / 2).toFixed(1)}px) scale(${fitScale})`;
    const pr = Math.min(4, (devicePixelRatio || 1) * fitScale);
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
  const fontsWanted = ['700 35px "Barlow Condensed"', '600 19.5px "Barlow Condensed"', '500 8px "IBM Plex Mono"', '600 10px "IBM Plex Mono"'];
  Promise.all(fontsWanted.map(f => document.fonts.load(f))).then(() => document.fonts.ready).then(() => {
    draw(0);
    requestAnimationFrame(() => { window.__ready = true; });
  });
})();

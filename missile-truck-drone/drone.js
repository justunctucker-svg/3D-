/* The Missile Truck Drone · NovexDynamics
   Procedural Three.js (r128) scene. Everything on screen is a pure function of the time t (0–27 s):
   window.__render(t) draws one frame, window.__ready turns true once fonts and the first frame are done.
   A concept visualization of an air-launched, uncrewed drone that carries air-to-air missiles in an internal bay.
   Units are metres; y is up, the aircraft fly along +x at y = 0. The enemy threat zone is a dome standing on the cloud
   deck far below. Every distance is illustrative and compressed; nothing here is a real range, speed or altitude.
   One world clock w drives the flight (w = 0 at the drone's release). The hook (0–2 s) and the last 2 s share it, so
   the last frame runs straight into the first. The comparison (05) is a split screen of two schematic replays. */
(() => {
  'use strict';
  const T = THREE, PI = Math.PI, TAU = PI * 2;
  const DURATION = 27;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const smooth = k => { k = clamp(k); return k * k * (3 - 2 * k); };
  const span = (t, a, b) => clamp((t - a) / (b - a));
  const pulse = (t, a, b, c, d) => smooth(span(t, a, b)) * (1 - smooth(span(t, c, d)));
  const rand = (i, j) => { const x = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return x - Math.floor(x); };
  const RENDER = new URLSearchParams(location.search).has('render');
  const V3 = (x, y, z) => new T.Vector3(x, y, z);
  const deg = d => d * PI / 180;
  function monotone(xs, ys, flat = []) {
    const n = xs.length, d = [], m = new Array(n).fill(0);
    for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    flat.forEach(i => { m[i] = 0; });                                                  // keys the curve comes to rest at
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
  const camera = new T.PerspectiveCamera(36, 360 / 640, 0.3, 300000);
  const rtOpts = { minFilter: T.LinearFilter, magFilter: T.LinearFilter, format: T.RGBAFormat, type: T.HalfFloatType };
  let rt;
  if (renderer.capabilities.isWebGL2) { rt = new T.WebGLMultisampleRenderTarget(360, 640, rtOpts); rt.samples = 4; }
  else rt = new T.WebGLRenderTarget(360, 640, Object.assign(rtOpts, { type: T.UnsignedByteType }));
  const composer = new T.EffectComposer(renderer, rt);

  // ---------------------------------------------------------------- environment + lights (high altitude: deep blue above, clouds far below)
  const SUN_DIR = V3(0.35, 0.72, 0.6).normalize();
  {
    const env = new T.Scene(), basic = c => new T.MeshBasicMaterial({ color: c, side: T.DoubleSide });
    env.add(new T.Mesh(new T.SphereGeometry(50, 32, 16), new T.MeshBasicMaterial({ color: new T.Color(0.06, 0.16, 0.42), side: T.BackSide })));
    const band = new T.Mesh(new T.CylinderGeometry(48, 48, 10, 32, 1, true), basic(new T.Color(0.6, 0.68, 0.8))); band.position.y = -2; env.add(band);
    const deck = new T.Mesh(new T.CircleGeometry(49, 32), basic(new T.Color(0.78, 0.8, 0.84))); deck.rotation.x = -PI / 2; deck.position.y = -8; env.add(deck);
    const sp = new T.Mesh(new T.PlaneGeometry(8, 8), basic(new T.Color(14, 13, 12))); sp.position.copy(SUN_DIR).multiplyScalar(40); sp.lookAt(0, 0, 0); env.add(sp);
    scene.environment = new T.PMREMGenerator(renderer).fromScene(env, 0.03).texture;
  }
  const sun = new T.DirectionalLight(0xfff3e4, 2.6);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 200 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const hemi = new T.HemisphereLight(0x6f9ade, 0xcfd5de, 0.75); scene.add(hemi);
  const rim = new T.DirectionalLight(0x7fd8ff, 0); rim.position.set(0, 1, 1); scene.add(rim);

  // ---------------------------------------------------------------- sky + cloud deck (analytic) + X-ray grid
  const CLOUD_Y = -3000;
  const NOISE = `
    float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
                 mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
    float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * n3(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }`;
  const bgMat = new T.ShaderMaterial({
    uniforms: { uX: { value: 0 }, uRes: { value: new T.Vector2(1080, 1920) }, uInvProj: { value: new T.Matrix4() }, uCamWorld: { value: new T.Matrix4() }, uCamPos: { value: new T.Vector3() }, uSun: { value: SUN_DIR.clone() } },
    vertexShader: 'varying vec2 vNdc; void main(){ vNdc = position.xy; gl_Position = vec4(position.xy, 0.9999, 1.0); }',
    fragmentShader: NOISE + `
      varying vec2 vNdc; uniform float uX; uniform vec2 uRes; uniform mat4 uInvProj; uniform mat4 uCamWorld; uniform vec3 uCamPos; uniform vec3 uSun;
      void main(){
        vec4 v = uInvProj * vec4(vNdc, 1.0, 1.0);
        vec3 d = normalize((uCamWorld * vec4(v.xyz / v.w, 0.0)).xyz);
        float e = d.y;
        vec3 hor = vec3(0.6, 0.7, 0.83), mid = vec3(0.13, 0.33, 0.7), zen = vec3(0.02, 0.08, 0.27);
        vec3 sky = mix(hor, mid, smoothstep(-0.005, 0.07, e));
        sky = mix(sky, zen, smoothstep(0.06, 0.45, e));
        float sd = max(dot(d, uSun), 0.0);
        sky += vec3(1.0, 0.9, 0.75) * (pow(sd, 700.0) * 18.0 + pow(sd, 9.0) * 0.12);
        vec3 col = sky;
        if (e < 0.0) {
          // a soft cloud deck far below, fading into haze toward the horizon
          float tt = (${CLOUD_Y.toFixed(1)} - uCamPos.y) / min(e, -1e-4);
          vec2 p = uCamPos.xz + d.xz * tt;
          float n = fbm(vec3(p / 5200.0, 0.0)) * 0.6 + fbm(vec3(p / 1300.0, 3.0)) * 0.3 + n3(vec3(p / 300.0, 7.0)) * 0.1;
          float cover = smoothstep(0.4, 0.6, n);
          vec3 under = vec3(0.24, 0.33, 0.45);
          vec3 cloud = mix(vec3(0.66, 0.71, 0.79), vec3(0.97, 0.98, 1.0), smoothstep(0.5, 0.78, n));
          vec3 deck = mix(under, cloud, cover);
          float haze = 1.0 - exp(-tt / 70000.0);
          col = mix(deck, hor * 1.02, clamp(haze, 0.0, 1.0));
          col = mix(col, hor, smoothstep(-0.05, 0.0, e));
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

  // ---------------------------------------------------------------- helpers + materials
  const lathe = (pts, seg = 48) => new T.LatheGeometry(pts.map(([r, y]) => new T.Vector2(r, y)), seg);
  const alongX = g => g.rotateZ(-PI / 2);                       // lathe/cylinder axis y → the aircraft's forward x
  const std = (color, metalness, roughness, extra = {}) => { const m = new T.MeshStandardMaterial(Object.assign({ color, metalness, roughness }, extra)); m.color.convertSRGBToLinear(); return m; };
  const box = (w, h, d, x = 0, y = 0, z = 0) => new T.BoxGeometry(w, h, d).translate(x, y, z);
  // a flat plate from a planform in the x/z plane (x forward, z out along the span), t thick
  function plate(pts, t) {
    const s = new T.Shape(); s.moveTo(pts[0][0], pts[0][1]); pts.slice(1).forEach(p => s.lineTo(p[0], p[1]));
    const g = new T.ExtrudeGeometry(s, { depth: t, bevelEnabled: true, bevelThickness: t * 0.3, bevelSize: t * 0.3, bevelSegments: 1 });
    g.translate(0, 0, -t / 2); g.rotateX(PI / 2); return g;     // shape y → +z (span), extrusion → y (thickness)
  }
  // a fin in the x/y plane (x forward, y up the span), t thick
  function fin(pts, t) {
    const s = new T.Shape(); s.moveTo(pts[0][0], pts[0][1]); pts.slice(1).forEach(p => s.lineTo(p[0], p[1]));
    const g = new T.ExtrudeGeometry(s, { depth: t, bevelEnabled: true, bevelThickness: t * 0.3, bevelSize: t * 0.3, bevelSegments: 1 });
    g.translate(0, 0, -t / 2); return g;
  }
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
  const xShell = xrayMat(0x5fd8ff, 0.012, 2.4, 0.55);
  const xParts = xrayMat(0x5fd8ff, 0.03, 1.8, 0.6);
  const shells = [];
  const greyM = std(0x7b838d, 0.35, 0.55), droneM = std(0x4b525c, 0.3, 0.62), darkM = std(0x15171b, 0.3, 0.7);
  const glassM = new T.MeshPhysicalMaterial({ color: new T.Color(0x0a0d12), metalness: 0.4, roughness: 0.05, clearcoat: 1.0, clearcoatRoughness: 0.04 });
  const nozM = std(0x2b2d31, 0.8, 0.45, { side: T.DoubleSide });
  const fadeMats = [droneM, darkM, nozM];
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

  // ---------------------------------------------------------------- the fighter (generic; local +x forward, +z to its right; no markings)
  const fighter = new T.Group(); scene.add(fighter);
  const fBody = new T.Group(); fighter.add(fBody);
  {
    const fus = alongX(lathe([[0.5, -8.2], [0.78, -7.5], [0.9, -5.2], [1.0, -1.2], [0.95, 1.5], [0.78, 3.6], [0.55, 5.6], [0.28, 7.3], [0.02, 8.3]], 40)); fus.scale(1, 0.82, 1.12);
    solid(fus, greyM, fBody);
    const can = new T.SphereGeometry(1, 28, 14, 0, TAU, 0, PI / 2); can.scale(1.9, 0.62, 0.5); solid(can, glassM, fBody, [3.6, 0.5, 0]);
    [-1, 1].forEach(s => {
      solid(box(4.0, 0.95, 0.6, 0.3, -0.15, s * 1.05), greyM, fBody);
      solid(box(0.08, 0.8, 0.5, 2.32, -0.15, s * 1.05), darkM, fBody);                                   // intake mouths
      const vt = fin([[-5.0, 0], [-7.0, 2.6], [-7.9, 2.6], [-7.8, 0]], 0.1); const v = solid(vt, greyM, fBody, [0, 0.55, s * 0.95]); v.rotation.x = s * deg(22);
      solid(alongX(new T.CylinderGeometry(0.42, 0.46, 1.1, 24, 1, true)), nozM, fBody, [-8.6, -0.05, s * 0.48]);
    });
    solid(plate([[2.2, 0], [-3.4, 5.8], [-4.9, 5.8], [-4.6, 0], [-4.9, -5.8], [-3.4, -5.8]], 0.12), greyM, fBody, [0, -0.1, 0]);
    solid(plate([[-5.8, 0], [-7.4, 3.0], [-8.3, 3.0], [-8.0, 0], [-8.3, -3.0], [-7.4, -3.0]], 0.1), greyM, fBody, [0, -0.15, 0]);
    solid(box(3.2, 0.35, 0.3, -0.3, -0.95, 0), greyM, fBody);                                              // centreline pylon
  }
  const fNozGlow = [-1, 1].map(s => V3(-9.1, -0.05, s * 0.48));

  // ---------------------------------------------------------------- the drone (after public renderings: chined slim body, canards,
  // reverse-swept main wings toward the rear that swing out after launch, an inverted-V tail, a dorsal intake; local +x forward)
  const DL = 6.6;
  const drone = new T.Group(); scene.add(drone);
  const dBody = new T.Group(); drone.add(dBody);
  const dInside = new T.Group(); dBody.add(dInside); dInside.visible = false;
  const BAY0 = -1.85, BAY1 = 1.75, BAYW = 0.34;
  {
    const body = alongX(lathe([[0.16, -3.3], [0.29, -3.05], [0.36, -2.2], [0.37, 0.2], [0.35, 1.6], [0.27, 2.5], [0.14, 3.05], [0.01, 3.32]], 40)); body.scale(1, 0.8, 1.15);
    part(body, droneM, xShell, dBody);
    [-1, 1].forEach(s => part(plate([[3.0, 0], [1.0, 0.13], [-0.6, 0.06], [-0.6, 0]], 0.025), droneM, xShell, dBody, [0, -0.02, s * 0.4], [s < 0 ? PI : 0, 0, 0]));   // nose chines
    part(box(1.5, 0.22, 0.4, -0.9, 0.3, 0), droneM, xShell, dBody);                                          // dorsal intake
    solid(box(0.05, 0.16, 0.34, -0.15, 0.31, 0), darkM, dBody);
    part(fin([[-1.6, 0], [-2.7, 0.18], [-2.9, 0.18], [-2.7, 0]], 0.08), droneM, xShell, dBody, [0, 0.33, 0]);     // the fairing behind the intake
    [-1, 1].forEach(s => { const g = part(fin([[-2.55, 0], [-3.05, 0.95], [-3.35, 0.95], [-3.25, 0]], 0.04), droneM, xShell, dBody, [0, -0.1, s * 0.12]); g.rotation.x = s * deg(180 - 42); });   // inverted V tail
    part(alongX(new T.CylinderGeometry(0.15, 0.17, 0.3, 20, 1, true)), nozM, xParts, dBody, [-3.42, 0, 0]);
  }
  // folding main wings (pivot on top, toward the rear) and canards (fold down, flip up)
  const WING = [[0.25, 0], [0.55, 2.35], [0.12, 2.42], [-0.45, 0]];          // forward-swept planform, root at the pivot
  const wings = [-1, 1].map(s => {
    const piv = new T.Group(); piv.position.set(-0.75, 0.31, 0); dBody.add(piv);
    const g = part(plate(WING, 0.05), droneM, xShell, piv); if (s < 0) g.scale.z = -1;
    piv.userData.s = s; return piv;
  });
  const canards = [-1, 1].map(s => {
    const piv = new T.Group(); piv.position.set(2.0, 0.0, s * 0.36); dBody.add(piv);
    const g = part(plate([[0.18, 0], [0.12, 0.5], [-0.1, 0.5], [-0.2, 0]], 0.03), droneM, xShell, piv); if (s < 0) g.scale.z = -1;
    piv.userData.s = s; return piv;
  });
  // weapons bay doors on the belly, hinged along the bay's sides
  const doors = [-1, 1].map(s => {
    const piv = new T.Group(); piv.position.set((BAY0 + BAY1) / 2, -0.27, s * BAYW / 2); dBody.add(piv);
    part(box(BAY1 - BAY0, 0.025, BAYW / 2, 0, 0, -s * BAYW / 4), droneM, xShell, piv);
    piv.userData.s = s; return piv;
  });
  // inside (solid in the X-ray): the bay, the engine, the fuel tank, the avionics
  const bayM = std(0x252a31, 0.4, 0.6), engM = std(0x8a929b, 0.8, 0.35), tankM = std(0x3d5f86, 0.3, 0.5), aviM = std(0x6b5a2a, 0.3, 0.6);
  solid(box(BAY1 - BAY0, 0.03, BAYW + 0.02, (BAY0 + BAY1) / 2, 0.1, 0), bayM, dInside);
  [-1, 1].forEach(s => solid(box(BAY1 - BAY0, 0.36, 0.02, (BAY0 + BAY1) / 2, -0.08, s * (BAYW / 2 + 0.01)), bayM, dInside));
  solid(alongX(new T.CylinderGeometry(0.17, 0.2, 1.0, 24)), engM, dInside, [-2.75, 0.05, 0]);
  const fan = solid(alongX(new T.CylinderGeometry(0.2, 0.2, 0.05, 24)), std(0xc0c6cd, 0.9, 0.25), dInside, [-2.2, 0.08, 0]);
  solid(alongX(new T.CylinderGeometry(0.06, 0.06, 0.6, 12)), engM, dInside, [-1.8, 0.24, 0], [0, 0, deg(-12)]);
  solid(alongX(new T.CylinderGeometry(0.2, 0.2, 1.1, 24)), tankM, dInside, [2.35, 0.03, 0]);
  solid(box(0.5, 0.18, 0.3, 2.95, 0.02, 0), aviM, dInside);
  // the missile (generic, no markings): rides in the bay until it is released
  const missile = new T.Group(); scene.add(missile);
  const mBody = new T.Group(); missile.add(mBody);
  {
    const mw = std(0xe3e5e8, 0.25, 0.45), mg = std(0x9ca3ab, 0.3, 0.5);
    solid(alongX(lathe([[0.095, -1.66], [0.105, -1.6], [0.105, 1.0], [0.088, 1.3], [0.045, 1.55], [0.006, 1.68]], 24)), mw, mBody);
    solid(alongX(new T.CylinderGeometry(0.106, 0.106, 0.12, 24)), mg, mBody, [1.0, 0, 0]);
    for (let i = 0; i < 4; i++) {
      const a = i * PI / 2 + PI / 4, r = new T.Euler(a, 0, 0);
      solid(fin([[0.35, 0.09], [0.18, 0.2], [0.0, 0.2], [-0.05, 0.09]], 0.012), mg, mBody, [0, 0, 0], [a, 0, 0]);
      solid(fin([[-1.35, 0.09], [-1.52, 0.21], [-1.66, 0.21], [-1.66, 0.09]], 0.012), mg, mBody, [0, 0, 0], [a, 0, 0]); void r;
    }
  }
  const M_IN_BAY = V3(-0.1, -0.1, 0);

  // ---------------------------------------------------------------- the threat zone (red dome on the cloud deck) and the missile reach rings
  const DOME_C = V3(18000, CLOUD_Y, 0), DOME_R = 7000, REACH = 4500;
  const DOME_EDGE_X = DOME_C.x - Math.sqrt(DOME_R * DOME_R - CLOUD_Y * CLOUD_Y);   // where the dome wall crosses the flight level
  const domeM = new T.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uAmt: { value: 1 }, uAlarm: { value: 0 }, uFill: { value: 0.035 } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vL; void main(){ vL = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: `varying vec3 vN; varying vec3 vV; varying vec3 vL; uniform float uTime; uniform float uAmt; uniform float uAlarm; uniform float uFill;
      void main(){
        float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        float edge = f * f * f;
        float lat = vL.y / ${DOME_R.toFixed(1)};
        float bands = smoothstep(0.86, 1.0, sin(lat * 46.0 - uTime * 2.2)) * (1.0 - lat);
        float beat = 0.5 + 0.5 * sin(uTime * 4.2);
        float a = (uFill + 0.5 * edge * (0.75 + 0.25 * beat) + (0.05 + uFill) * bands + 0.08 * uAlarm * beat) * uAmt;
        vec3 col = vec3(1.0, 0.16, 0.1) * (0.7 + 1.5 * edge * (0.7 + 0.5 * beat) + 0.6 * uAlarm * beat);
        gl_FragColor = vec4(col, clamp(a, 0.0, 0.9));
      }`,
    transparent: true, depthWrite: false, side: T.DoubleSide
  });
  const dome = new T.Mesh(new T.SphereGeometry(DOME_R, 96, 48, 0, TAU, 0, PI / 2), domeM); dome.position.copy(DOME_C); dome.renderOrder = 3; scene.add(dome);
  const ringMat = (color) => new T.ShaderMaterial({
    uniforms: { uColor: { value: new T.Color(...color) }, uAmt: { value: 0 }, uSweep: { value: 1 } },
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec2 vP; uniform vec3 uColor; uniform float uAmt; uniform float uSweep;
      void main(){ float a = atan(vP.y, -vP.x) / 6.2831853 + 0.5; if (a > uSweep) discard; gl_FragColor = vec4(uColor, uAmt); }`,
    transparent: true, depthWrite: false, side: T.DoubleSide, toneMapped: false
  });
  const domeBase = new T.Mesh(new T.RingGeometry(DOME_R - 90, DOME_R + 90, 160).rotateX(-PI / 2), ringMat([1.6, 0.25, 0.18])); domeBase.position.copy(DOME_C).setY(CLOUD_Y + 5); domeBase.renderOrder = 4; scene.add(domeBase);
  domeBase.material.uniforms.uAmt.value = 0.55;
  const reachLine = new T.Mesh(new T.RingGeometry(REACH - 70, REACH + 70, 160), ringMat([0.45, 1.1, 2.0])); reachLine.renderOrder = 6;
  const reachFill = new T.Mesh(new T.CircleGeometry(REACH, 96), ringMat([0.25, 0.6, 1.1])); reachFill.renderOrder = 5;
  const reach = new T.Group(); reach.add(reachLine, reachFill); reach.rotation.x = -PI / 2; scene.add(reach);

  // ---------------------------------------------------------------- particles: smoke, glows
  function puffSystem(n, color, order = 7) {
    const g = new T.InstancedBufferGeometry(), base = new T.PlaneGeometry(1, 1);
    g.setIndex(base.index); g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
    const pos = new T.InstancedBufferAttribute(new Float32Array(n * 3), 3), dat = new T.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    pos.setUsage(T.DynamicDrawUsage); dat.setUsage(T.DynamicDrawUsage); g.setAttribute('aPos', pos); g.setAttribute('aDat', dat); g.instanceCount = n;
    const m = new T.ShaderMaterial({
      uniforms: { uBase: { value: color } },
      vertexShader: `attribute vec3 aPos; attribute vec4 aDat; varying vec2 vUv; varying vec4 vDat;
        void main(){ vUv = uv; vDat = aDat;
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          float c = cos(aDat.w * 6.28), s = sin(aDat.w * 6.28); vec2 q = vec2(c * position.x - s * position.y, s * position.x + c * position.y);
          gl_Position = projectionMatrix * viewMatrix * vec4(aPos + (right * q.x + up * q.y) * aDat.x, 1.0); }`,
      fragmentShader: NOISE + `varying vec2 vUv; varying vec4 vDat; uniform vec3 uBase;
        void main(){ vec2 c = vUv - 0.5; float r = length(c) * 2.0;
          float n = fbm(vec3(vUv * 3.0 + vDat.w * 10.0, vDat.w * 5.0));
          float a = clamp(1.0 - (r + (n - 0.5) * 0.7 - 0.25) / 0.75, 0.0, 1.0) * vDat.y;
          vec3 col = uBase * (0.8 + 0.4 * n) + vec3(1.0, 0.55, 0.2) * vDat.z * 2.0 * (1.0 - r * 0.6);
          gl_FragColor = vec4(col, a); }`,
      transparent: true, depthWrite: false
    });
    const mesh = new T.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = order; scene.add(mesh);
    let k = 0;
    return {
      mesh, reset() { k = 0; },
      push(p, size, alpha, seed, warm = 0) { if (k >= n || alpha < 0.003) return; pos.setXYZ(k, p.x, p.y, p.z); dat.setXYZW(k, size, alpha, warm, seed); k++; },
      done() { for (let i = k; i < n; i++) dat.setXYZW(i, 0, 0, 0, 0); pos.needsUpdate = dat.needsUpdate = true; }
    };
  }
  const smoke = puffSystem(420, new T.Color(0.88, 0.89, 0.91));
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
  const glows = glowSystem(32);
  // exhaust cones (drone engine, missile motor): additive, hot white at the nozzle fading to orange
  const coneM = (len) => new T.ShaderMaterial({
    uniforms: { uAmt: { value: 0 }, uTime: { value: 0 } },
    vertexShader: 'varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vP = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: NOISE + `varying vec3 vP; varying vec3 vN; varying vec3 vV; uniform float uAmt; uniform float uTime;
      void main(){
        float k = clamp(-vP.x / ${len.toFixed(2)}, 0.0, 1.0);
        float n = fbm(vec3(atan(vP.z, vP.y) * 2.0, vP.x * 3.0 + uTime * 9.0, 1.0));
        float f = pow(abs(dot(normalize(vN), normalize(vV))), 1.3);
        float a = uAmt * (1.0 - smoothstep(0.1, 1.0, k)) * (0.45 + 0.8 * n) * f;
        vec3 col = mix(vec3(2.2, 2.0, 1.7), vec3(1.6, 0.6, 0.15), smoothstep(0.0, 0.5, k));
        gl_FragColor = vec4(col * a, a);
      }`,
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide
  });
  const cone = (r0, r1, len, parent, x) => { const m = coneM(len); const g = new T.CylinderGeometry(r0, r1, len, 20, 4, true).translate(0, -len / 2, 0); alongX(g); const mesh = new T.Mesh(g, m); mesh.position.x = x; mesh.renderOrder = 9; parent.add(mesh); return m; };
  const dExh = cone(0.13, 0.22, 2.2, dBody, -3.55);
  const mExh = cone(0.07, 0.16, 1.6, mBody, -1.7);

  // ---------------------------------------------------------------- the world clock and the flight
  const REW0 = 2.0, REW1 = 2.6, T_REL = 7.2, SPLIT0 = 21.0, FINAL0 = 25.0, H_OFF = 0.25;
  const W_DOORS = 9.3, W_DROP = 9.95, W_IGN = 10.5;
  const isHook = t => t < REW0 || t >= FINAL0;
  const hookClock = t => (t >= FINAL0 ? t - DURATION : t);
  // w: seconds since the drone's release (the hook sits 0.25 s after it; the rewind scrubs back 6.8 s of flight)
  const worldW = t => {
    if (isHook(t)) return hookClock(t) + H_OFF;
    if (t < REW1) return lerp(REW0 + H_OFF, REW1 - T_REL, smooth(span(t, REW0, REW1 - 0.02)));
    return t - T_REL;
  };
  const X_REL = 6800, V_F = 300;
  const AHEAD = monotone([0, 0.4, 1.0, 2.0, 4.0, 7.0, 10.3, 14, 20], [0, 0, 4, 25, 150, 800, 2700, 4200, 7000]);
  const DROP = monotone([0, 0.4, 0.9, 1.6, 3.0, 6.0], [0, -0.8, -3.2, -5.5, -6.5, -6]);
  // the fighter flies straight until just after the release, then banks away and turns back, staying outside the zone
  const HEADING = w => deg(140) * smooth(span(w, 1.0, 7.0));
  const F_PATH = (() => {
    const tab = [], dw = 0.02; let x = X_REL + V_F * -8, z = 0;
    for (let w = -8; w <= 18 + 1e-9; w += dw) { tab.push([x, z]); const hd = HEADING(w); x += V_F * Math.cos(hd) * dw; z -= V_F * Math.sin(hd) * dw; }
    return w => { const i = clamp((w + 8) / dw, 0, tab.length - 1.001), i0 = Math.floor(i), f = i - i0; return [lerp(tab[i0][0], tab[i0 + 1][0], f), lerp(tab[i0][1], tab[i0 + 1][1], f)]; };
  })();
  const fighterPose = w => {
    const [x, z] = F_PATH(w), hd = HEADING(w), bank = deg(48) * pulse(w, 1.0, 2.2, 5.6, 7.0);
    return { pos: V3(x, 0.2 * Math.sin(w * 0.9), z), q: new T.Quaternion().setFromEuler(new T.Euler(-bank, hd, 0, 'YXZ')) };
  };
  const D_ATTACH = V3(0.4, -1.55, 0);
  const dronePose = w => {
    if (w < 0) { const f = fighterPose(w); return { pos: D_ATTACH.clone().applyQuaternion(f.q).add(f.pos), q: f.q.clone() }; }
    const pitch = deg(-4) * pulse(w, 0.05, 0.5, 1.0, 2.2), roll = deg(3) * Math.sin(w * 0.8) * smooth(span(w, 1.5, 3));
    return { pos: V3(X_REL + V_F * w + AHEAD(w), D_ATTACH.y + DROP(w), 0), q: new T.Quaternion().setFromEuler(new T.Euler(roll, 0, pitch)) };
  };
  const A_M = 420;
  const missilePose = w => {
    const d = dronePose(Math.max(w, 0));
    const drop = -1.3 * smooth(span(w, W_DROP, W_IGN + 0.05));
    if (w < W_IGN) return { pos: M_IN_BAY.clone().add(V3(0, drop, 0)).applyQuaternion(d.q).add(d.pos), q: d.q.clone() };
    const tau = w - W_IGN;
    return { pos: M_IN_BAY.clone().add(V3(0.5 * A_M * tau * tau + 2 * tau, -1.3 - 0.4 * tau, 0)).applyQuaternion(d.q).add(d.pos), q: d.q.clone() };
  };
  const wingOpen = w => smooth(span(w, 0.25, 0.85)), canardUp = w => smooth(span(w, 0.3, 0.6));
  const engOn = w => smooth(span(w, 0.4, 0.6));
  const doorsOpen = w => smooth(span(w, W_DOORS, W_DOORS + 0.45));
  const motorOn = w => smooth(span(w, W_IGN, W_IGN + 0.1));
  const distDisplay = w => {
    if (w <= 0) return 0;
    const d = dronePose(w).pos.distanceTo(fighterPose(w).pos) - D_ATTACH.length();
    return 30 * Math.log10(1 + Math.max(0, d) / 5);
  };
  const xrayAmt = t => smooth(span(t, 10.0, 10.6)) * (1 - smooth(span(t, 14.6, 15.2)));
  const TAC = t => smooth(span(t, 3.4, 4.4)) * (1 - smooth(span(t, 6.0, 6.8))) + smooth(span(t, 19.2, 20.2)) * (t < SPLIT0 ? 1 : 0);   // tactical: icons scaled up, rings on

  // ---------------------------------------------------------------- camera: one continuous path (keys relative to moving anchors)
  const UP_Y = V3(0, 1, 0), UP_X = V3(1, 0, 0);
  const shake = (t, amp) => V3(amp * (Math.sin(t * 37.1) + 0.6 * Math.sin(t * 53.7 + 1.3)), amp * (Math.sin(t * 41.9 + 2.1) + 0.6 * Math.sin(t * 61.3 + 0.2)), amp * 0.7 * Math.sin(t * 47.3 + 0.9));
  const anchor = (a, w) => a === 'F' ? fighterPose(w).pos : a === 'D' ? dronePose(w).pos : a === 'M' ? missilePose(w).pos : V3(0, 0, 0);
  const HOOK_OFF = [-38, 3, 14], HOOK_LOOK = [14, -5.4, -1];
  // t, position anchor + offset, look anchor + offset, roll (1: up is +x, the X-ray view with the drone upright)
  const CAM_KEYS = [
    [REW1, 'F', HOOK_OFF, 'F', HOOK_LOOK, 0],
    [3.3, 'F', [-40, 5, 16], 'F', [12, -4.5, -1], 0],
    [4.6, 'W', [-24000, 15000, 6000], 'W', [11000, 500, 0], 0],
    [6.0, 'W', [-23000, 14500, 6500], 'W', [11400, 500, 0], 0],
    [7.0, 'F', [-20, 1.5, 15], 'F', [3, -1.5, 0], 0],
    [7.9, 'F', [-12, -2, 12], 'D', [2, 0, 0], 0],
    [9.3, 'D', [-15, 3, 10], 'D', [6, 0, 0], 0],
    [10.5, 'D', [0.8, -10, 11], 'D', [0.15, -0.25, 0], 1],
    [14.4, 'D', [1.2, -8, 13], 'D', [0.15, -0.25, 0], 1],
    [15.4, 'D', [-17, 4, 13], 'D', [10, -1, 0], 0],
    [16.5, 'D', [-4, -6.5, 12], 'D', [0.3, -0.8, 0], 0],
    [17.5, 'D', [-3, -6, 12.5], 'D', [0.6, -1.2, 0], 0],
    [18.1, 'M', [-20, 1.5, 6.5], 'M', [6, -0.4, 0], 0],
    [19.0, 'M', [-42, 6, 10], 'M', [12, -1, 0], 0],
    [20.3, 'W', [-20000, 13000, 7000], 'W', [11500, 0, 0], 0],
    [20.95, 'W', [-19800, 12900, 7000], 'W', [11500, 0, 0], 0]
  ];
  // segments between a close key and a world key are zooms; the curve rests at both ends of each
  const ZOOMS = CAM_KEYS.map((k, i) => i).filter(i => i < CAM_KEYS.length - 1 && (CAM_KEYS[i][1] === 'W') !== (CAM_KEYS[i + 1][1] === 'W'));
  const ZOOM_FLAT = ZOOMS.flatMap(i => [i, i + 1]);
  function camFor(t) {
    const w = worldW(t);
    if (isHook(t) || t < REW1) {
      const f = fighterPose(w).pos;
      return { pos: f.clone().add(V3(...HOOK_OFF)), look: f.clone().add(V3(...HOOK_LOOK)), up: UP_Y, sk: shake(t, 0.06 * pulse(w, 0.6, 0.75, 1.4, 2.3)) };
    }
    const keys = CAM_KEYS.map(k => [k[0], anchor(k[1], w).add(V3(...k[2])), anchor(k[3], w).add(V3(...k[4])), k[5]]);
    const ch = c => monotone(keys.map(k => k[0]), keys.map(k => c < 3 ? k[1].getComponent(c) : c < 6 ? k[2].getComponent(c - 3) : k[3]), ZOOM_FLAT)(t);
    const z = ZOOMS.find(i => t >= keys[i][0] && t < keys[i + 1][0]);
    let pos, look;
    if (z !== undefined) {
      // a pull-out to (or push-in from) a tactical view: the distance eases in log space so the zoom reads as one
      // steady move, and the aim shifts in step with the distance so the subject drifts smoothly off centre
      const [ta, pa, la] = keys[z], [tb, pb, lb] = keys[z + 1];
      const e = smooth(span(t, ta, tb)), oa = pa.clone().sub(la), ob = pb.clone().sub(lb), La = oa.length(), Lb = ob.length();
      const L = La * Math.pow(Lb / La, e);
      look = la.clone().lerp(lb, (L - La) / (Lb - La));
      pos = oa.normalize().lerp(ob.normalize(), e).normalize().multiplyScalar(L).add(look);
    } else { pos = V3(ch(0), ch(1), ch(2)); look = V3(ch(3), ch(4), ch(5)); }
    const up = UP_Y.clone().lerp(UP_X, ch(6)).normalize();
    return { pos, look, up, sk: shake(t, 0.06 * pulse(t, 7.75, 7.9, 8.5, 9.3) + 0.04 * pulse(t, 17.5, 17.6, 18.0, 18.6)) };
  }

  // ---------------------------------------------------------------- UI
  const $ = id => document.getElementById(id);
  const ui = { step: $('step'), caption: $('caption'), sub: $('sub'), teaser: $('teaser'), badge: $('badge'), timer: $('timer'), timerV: $('timerV'), rewind: $('rewind'), stage: $('vStage'), dist: $('vDist'), bay: $('vBay'), status: $('vStatus'), halfL: $('halfL'), halfR: $('halfR'), divider: $('divider') };
  const HOOK_CAP = 'The pilot stays back. The drone goes in.';
  const SCENES = [
    { a: 0, b: REW0, step: '', huge: true, cap: HOOK_CAP },
    { a: REW0, b: REW1, step: '', cap: '' },
    { a: REW1, b: 6.0, step: '01 · The problem', cap: 'Missiles only reach so far. Closer means riskier.' },
    { a: 6.0, b: 10.0, step: '02 · The launch', cap: 'A fighter launches it from a safe distance.' },
    { a: 10.0, b: 15.0, step: '03 · Inside', x: true, cap: 'Inside, a bay holds the missiles.' },
    { a: 15.0, b: SPLIT0, step: '04 · The release', cap: 'It carries them closer, then lets go.' },
    { a: SPLIT0, b: FINAL0, step: '05 · The point', cap: 'Same missiles. The pilot stays outside the danger zone.' },
    { a: FINAL0, b: DURATION + 1, step: '', big: true, cap: 'Launch. Carry. Release.' }
  ];
  const setText = (el, s) => { if (el.textContent !== s) el.textContent = s; };
  let anchors = {};
  const CALLOUTS = [
    { text: 'FIGHTER', on: [[3.7, 5.9], [7.0, 8.4]], at: () => anchors.fighter, dx: -50, dy: 50 },
    { text: 'THREAT ZONE', on: [[4.1, 5.9], [15.6, 17.4]], at: () => anchors.zone, dx: -40, dy: -40, red: true },
    { text: 'DRONE', on: [[8.1, 9.9]], at: () => anchors.drone, dx: 60, dy: -40 },
    { text: 'WEAPONS BAY', on: [[11.0, 14.7]], at: () => anchors.bay, dx: 80, dy: 0 },
    { text: 'ENGINE', on: [[11.6, 14.7]], at: () => anchors.engine, dx: 75, dy: 10 },
    { text: 'WINGS', on: [[12.2, 14.7]], at: () => anchors.wing, dx: -70, dy: -10 },
    { text: 'FIGHTER', sub: 'STILL OUTSIDE', on: [[19.8, 20.95]], at: () => anchors.fighter, dx: 40, dy: 40 }
  ];
  const SPLIT_CHIPS = [
    { text: 'FIGHTER', sub: 'IN THE RED', side: 'without', red: true, at: s => V3(splitPoses('without', s).fx, 0, 0), dx: 0, dy: 46 },
    { text: 'DRONE', side: 'with', at: s => V3(splitPoses('with', s).launcherX, -1.55 * ICON, 0), dx: 18, dy: -44 },
    { text: 'FIGHTER', sub: 'OUTSIDE', side: 'with', at: s => V3(splitPoses('with', s).fx, 0, 0), dx: 0, dy: 40 }
  ];
  const calloutRoot = $('callouts');
  CALLOUTS.concat(SPLIT_CHIPS).forEach(c => {
    c.el = document.createElement('div'); c.el.className = 'callout' + (c.red ? ' fuel' : '');
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
      let px = 0, py = 0;
      if (o > 0.001) { [px, py] = toScreen(at); if (tmpV.z > 1 || px < -40 || px > 400 || py < -40 || py > 680) o = 0; }
      c.el.style.opacity = o.toFixed(3);
      if (o <= 0.001) return;
      c.el.classList.toggle('x', X > 0.5);
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

  // ---------------------------------------------------------------- posing (shared by the main view and the two halves of the split screen)
  const ICON = 160;                                    // aircraft scale in the tactical views (they are drawn as icons there)
  const place = (obj, pose, scale = 1) => { obj.visible = !!pose; if (pose) { obj.position.copy(pose.pos); obj.quaternion.copy(pose.q); obj.scale.setScalar(scale); } };
  const toWorld = (pose, p, s = 1) => p.clone().multiplyScalar(s).applyQuaternion(pose.q).add(pose.pos);
  function setDroneShape(w) {
    const o = wingOpen(w), c = canardUp(w), dr = doorsOpen(w);
    wings.forEach(p => { p.rotation.y = p.userData.s * lerp(deg(78), 0, o) * -1; p.rotation.x = 0; });
    canards.forEach(p => { p.rotation.x = p.userData.s * lerp(deg(-80), 0, c) * -1; });
    doors.forEach(p => { p.rotation.x = -p.userData.s * deg(100) * dr; });   // free edges swing down and out
  }
  // the missile's smoke trail: puffs dropped along its path, each from where the missile was when it was born
  function missileTrail(posAt, tNow, t0, scale) {
    const age0 = tNow - t0; if (age0 <= 0) return;
    for (let j = 0; j < 160; j++) {
      const born = t0 + (j / 160) * Math.min(age0, 3.2); if (born > tNow) break;
      const age = tNow - born, p = posAt(born);
      const sp = V3(rand(j, 1) - 0.5, rand(j, 2) - 0.5, rand(j, 3) - 0.5).multiplyScalar(1.2 * age * scale);
      smoke.push(p.add(sp), (0.7 + 3.2 * age) * scale, 0.55 * clamp(age / 0.04) * Math.pow(1 - clamp(age / 3.4), 1.4), rand(j, 4), 0.6 * Math.exp(-age / 0.1));
    }
  }
  // the two replays side by side (05): s = seconds into the comparison
  const splitS = t => t - SPLIT0;
  function splitPoses(side, s) {
    const fly = smooth(span(s, 0.2, 2.3));
    const launcherX = side === 'without' ? lerp(6400, 12700, fly) : lerp(11300, 12700, fly);
    return { launcherX, fx: side === 'without' ? launcherX : lerp(6400, 6750, s / 4) };
  }
  function poseSplit(side, s) {
    const launchS = 2.45, { launcherX, fx } = splitPoses(side, s);
    place(fighter, { pos: V3(fx, 0, 0), q: new T.Quaternion() }, ICON);
    if (side === 'with') { setDroneShape(1); place(drone, { pos: V3(launcherX, -1.55 * ICON, 0), q: new T.Quaternion() }, ICON); } else drone.visible = false;
    const mpos = s0 => V3(launcherX + 0.5 * 2000 * Math.max(0, s0 - launchS) ** 2, side === 'with' ? -1.55 * ICON - 120 : -150, 0);
    place(missile, s >= launchS ? { pos: mpos(s), q: new T.Quaternion() } : null, ICON);
    mExh.uniforms.uAmt.value = s >= launchS ? 1 : 0; mExh.uniforms.uTime.value = s;
    dExh.uniforms.uAmt.value = side === 'with' ? 1 : 0;
    smoke.reset(); glows.reset();
    if (s >= launchS) missileTrail(s0 => mpos(s0), s, launchS, ICON * 0.5);
    if (s >= launchS) glows.push(mpos(s).add(V3(-1.8 * ICON, 0, 0)), 2.2, 1.6, 1.0, 1.2 * ICON);
    smoke.done(); glows.done();
    reach.visible = true; reach.position.set(side === 'without' ? fx : launcherX, 0, 0); reachLine.material.uniforms.uAmt.value = 0.85; reachFill.material.uniforms.uAmt.value = 0.08;
    reachLine.material.uniforms.uSweep.value = reachFill.material.uniforms.uSweep.value = 1;
    domeM.uniforms.uAlarm.value = side === 'without' ? smooth(span(fx, DOME_EDGE_X - 300, DOME_EDGE_X + 600)) : 0;
  }

  // ---------------------------------------------------------------- per-frame update
  function update(t) {
    t = clamp(t, 0, DURATION - 1e-4);
    const w = worldW(t), X = xrayAmt(t), tac = TAC(t), split = t >= SPLIT0 && t < FINAL0;
    const ft = isHook(t) ? hookClock(t) : t;                                          // effects clock: runs on through the loop seam
    shells.forEach(sh => { sh.solid.visible = X < 0.995; sh.ghost.visible = X > 0.005; sh.solid.castShadow = X < 0.5; });
    fadeMats.forEach(m => { m.transparent = X > 0.005; m.opacity = 1 - X; m.depthWrite = X < 0.6; });
    xrayMats.forEach(m => { m.uniforms.uOpacity.value = X; });
    bgMat.uniforms.uX.value = X; rim.intensity = X; dInside.visible = X > 0.02;
    dome.visible = domeBase.visible = X < 0.98; domeM.uniforms.uTime.value = ft; domeM.uniforms.uAmt.value = 1 - X; domeM.uniforms.uAlarm.value = 0; domeM.uniforms.uFill.value = split ? 0.11 : lerp(0.035, 0.08, tac);
    smoke.reset(); glows.reset();

    // aircraft: scaled up into icons as the camera pulls back (1 up close, growing with the camera's distance
    // so they hold a readable size in the tactical views)
    const C = camFor(t), camL = C.pos.distanceTo(C.look), xi = Math.max(0, camL - 60) / 240;
    const s = Math.min(ICON, Math.pow(1 + xi ** 4, 0.25));
    const fp = fighterPose(w), dp = dronePose(w), mp = missilePose(w);
    place(fighter, fp, s);
    // in the tactical views the attached drone hangs from the scaled fighter
    const dpS = w < 0 ? { pos: D_ATTACH.clone().multiplyScalar(s).applyQuaternion(fp.q).add(fp.pos), q: dp.q } : { pos: dp.pos.clone().add(V3(0, D_ATTACH.y * (s - 1), 0)), q: dp.q };
    place(drone, dpS, s);
    setDroneShape(w);
    const mInBay = w < W_DROP;
    place(missile, mInBay ? { pos: M_IN_BAY.clone().multiplyScalar(s).applyQuaternion(dpS.q).add(dpS.pos), q: dpS.q } : { pos: mp.pos.clone().add(V3(0, D_ATTACH.y * (s - 1), 0)), q: mp.q }, s);
    missile.visible = X > 0.02 || !mInBay || doorsOpen(w) > 0.05;
    // engines
    const eo = engOn(w), mo = motorOn(w);
    dExh.uniforms.uAmt.value = eo * (0.9 + 0.1 * Math.sin(ft * 41)) * (1 - 0.8 * X); dExh.uniforms.uTime.value = ft;
    mExh.uniforms.uAmt.value = mo; mExh.uniforms.uTime.value = ft;
    fan.rotation.x = ft * 30;
    if (eo > 0.01) glows.push(toWorld(dpS, V3(-3.55, 0, 0), s), 2.0 * eo, 1.5 * eo, 0.9 * eo, (0.9 + 0.15 * Math.sin(ft * 37)) * s * (1 - 0.6 * X));
    if (mo > 0.01) glows.push(toWorld(missile.visible ? { pos: missile.position, q: missile.quaternion } : mp, V3(-1.75, 0, 0), s), 1.9 * mo, 1.5 * mo, 1.0 * mo, 0.6 * s);
    fNozGlow.forEach(p => glows.push(toWorld(fp, p, s), 0.5, 0.25, 0.1, 0.9 * s));
    // smoke: a puff of release gas, the drone's faint exhaust, the missile's trail
    if (w > 0 && w < 1.2) for (let j = 0; j < 14; j++) { const age = w - j * 0.02; if (age < 0) continue; smoke.push(toWorld(fighterPose(w - age), D_ATTACH.clone().add(V3(-0.6 + rand(j, 5), -0.3, (rand(j, 6) - 0.5) * 0.8))), 0.6 + 1.6 * age, 0.25 * (1 - age / 1.2), rand(j, 7)); }
    if (eo > 0.01 && tac < 0.5) for (let j = 0; j < 24; j++) { const age = j * 0.05 + (((ft / 0.05) % 1 + 1) % 1) * 0.05; const pb = dronePose(w - age); if (w - age < 0.45) continue; smoke.push(toWorld(pb, V3(-3.8 - 2 * age, 0, 0)), 0.3 + 1.4 * age, 0.07 * (1 - age / 1.2), rand(j, 8)); }
    if (w > W_IGN) missileTrail(w0 => missilePose(w0).pos.add(V3(0, D_ATTACH.y * (s - 1), 0)), w, W_IGN, Math.max(1, s * 0.5));
    // threat zone, reach ring (drawn on in the problem beat; around the drone at the end of 04)
    const ringOn = t < 10 ? tac : t < SPLIT0 ? smooth(span(t, 19.6, 20.4)) : 0;
    reach.visible = ringOn > 0.01 && !split;
    if (reach.visible) {
      const around = t < 10 ? fp.pos : dpS.pos;
      reach.position.set(around.x, 0, around.z);
      reachLine.material.uniforms.uAmt.value = 0.85 * ringOn; reachFill.material.uniforms.uAmt.value = 0.08 * ringOn;
      const sw = t < 10 ? smooth(span(t, 4.0, 4.9)) : smooth(span(t, 19.7, 20.4));
      reachLine.material.uniforms.uSweep.value = reachFill.material.uniforms.uSweep.value = sw;
    }

    // camera
    camera.up.copy(C.up); camera.position.copy(C.pos).add(C.sk); camera.lookAt(C.look);
    const near = camL > 600 || split ? 40 : 0.3; if (camera.near !== near) { camera.near = near; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
    [fighter, drone, missile].forEach(o => o.updateMatrixWorld(true));
    smoke.done(); glows.done();
    // shadows follow the subject (only the close shots need them)
    const subj = t >= 7.9 && !isHook(t) ? dpS.pos : fp.pos;
    sun.target.position.copy(subj); sun.position.copy(subj).addScaledVector(SUN_DIR, 100);
    sun.castShadow = s < 1.5 || split;
    bgMat.uniforms.uCamPos.value.copy(camera.position);
    vhs.uniforms.uAmt.value = pulse(t, REW0 - 0.04, REW0 + 0.06, REW1 - 0.1, REW1);
    vhs.uniforms.uTime.value = t;

    // anchors for the chips
    anchors.fighter = toWorld(fp, V3(1, 0.6, 0), s);
    anchors.drone = toWorld(dpS, V3(1.5, 0.2, 0), s);
    anchors.bay = toWorld(dpS, V3(0.5, -0.12, 0), s);
    anchors.engine = toWorld(dpS, V3(-2.7, 0.05, 0), s);
    anchors.wing = toWorld(dpS, V3(-0.4, 0.3, -1.8), s);
    anchors.zone = t < 10 ? V3(DOME_EDGE_X + 600, 2500, -3000) : V3(DOME_EDGE_X + 200, 600, -1800);

    // readouts
    const dist = split ? distDisplay(10.3) : distDisplay(w), shown = Math.round(dist);
    let stage = '', bay = '', status = 'JET SAFE';
    if (isHook(t)) { stage = w < 0 ? 'CARRY' : 'LAUNCH'; bay = 'CLOSED'; }
    else if (t < REW1) { stage = 'REWIND'; bay = '—'; status = '—'; }
    else if (split) { stage = 'COMPARE'; bay = '—'; status = 'SEE BOTH'; }
    else {
      stage = w < 0 ? 'CARRY' : w < 2 ? 'LAUNCH' : w < W_DOORS ? 'CRUISE' : 'RELEASE';
      bay = w < W_DOORS ? 'CLOSED' : w < W_DROP + 0.2 ? 'OPEN' : 'EMPTY';
    }

    // overlay
    const sc = SCENES.find(x => t < x.b) || SCENES[SCENES.length - 1];
    const hard = [0, SPLIT0, FINAL0];
    const fadeIn = hard.includes(sc.a) ? 1 : smooth(span(t, sc.a, sc.a + 0.25));
    const fadeOut = (sc.b > DURATION || sc.b === REW0 || sc.b === SPLIT0 || sc.b === FINAL0) ? 1 : 1 - smooth(span(t, sc.b - 0.2, sc.b));
    setText(ui.step, sc.step); ui.step.classList.toggle('x', !!sc.x && X > 0.5);
    setText(ui.caption, sc.cap); ui.caption.classList.toggle('huge', !!sc.huge); ui.caption.classList.toggle('big', !!sc.big);
    ui.step.style.opacity = ui.caption.style.opacity = (fadeIn * fadeOut).toFixed(3);
    ui.sub.style.opacity = (t < REW0 ? smooth(span(t, 0.8, 1.1)) : 0).toFixed(3);
    ui.teaser.style.opacity = pulse(t, 13.4, 13.7, 14.75, 14.95).toFixed(3);
    ui.badge.style.opacity = (smooth(span(t, 10.15, 10.5)) * (1 - smooth(span(t, 14.5, 14.8)))).toFixed(3);
    ui.rewind.style.opacity = (t >= REW0 && t < REW1 ? (Math.floor(t * 6) % 2 ? 1 : 0.55) : 0).toFixed(2);
    ui.rewind.style.transform = `translate(0px, ${headBottom() + 6}px)`;
    setText(ui.timerV, String(shown).padStart(2, '0'));
    setText(ui.stage, stage); setText(ui.dist, String(shown)); setText(ui.bay, bay); setText(ui.status, status);
    const so = split ? smooth(span(t, SPLIT0, SPLIT0 + 0.3)) : 0, labY = headBottom() + 4;
    [ui.halfL, ui.halfR].forEach(el => { el.style.opacity = so.toFixed(3); el.style.transform = `translate(0px, ${labY}px)`; });
    ui.divider.style.opacity = so.toFixed(3);
    updateCallouts(t, X);
    // the comparison's chips, projected through the split camera with each half's view offset
    const sCam = splitCam;
    SPLIT_CHIPS.forEach(c => {
      const o = split ? smooth(span(t, SPLIT0 + 0.5, SPLIT0 + 0.8)) : 0;
      c.el.style.opacity = o.toFixed(3); if (o <= 0.001) return;
      c.el.classList.toggle('fuel', !!c.red);
      sCam.setViewOffset(360, 640, c.side === 'without' ? 90 : -90, 0, 360, 640); sCam.updateMatrixWorld();
      tmpV.copy(c.at(splitS(t))).project(sCam);
      const px = (tmpV.x * 0.5 + 0.5) * 360, py = (-tmpV.y * 0.5 + 0.5) * 640;
      const w = c.tag.offsetWidth, h = c.tag.offsetHeight, lo = c.side === 'without' ? 8 : 188, hi = c.side === 'without' ? 172 : 352;
      const cx = clamp(px + c.dx - w / 2, lo, hi - w), cy = clamp(py + c.dy - h / 2, headBottom() + 26, 430 - h);
      c.el.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
      c.tag.style.transform = `translate(${(cx - px).toFixed(1)}px, ${(cy - py).toFixed(1)}px)`;
      const ex = clamp(px, cx, cx + w), ey = clamp(py, cy, cy + h), lx = ex - px, ly = ey - py;
      c.line.style.width = Math.hypot(lx, ly).toFixed(1) + 'px'; c.line.style.transform = `rotate(${Math.atan2(ly, lx)}rad)`;
    });
    frameState.split = split; frameState.t = t;
  }
  const frameState = { split: false, t: 0 };

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
  // the split screen: one tactical camera, the replay "without" on the left half and "with" on the right half
  const SPLIT_POS = V3(-22000, 14500, 3000), SPLIT_LOOK = V3(11000, 300, 0);
  const splitCam = camera.clone(); splitCam.near = 40; splitCam.position.copy(SPLIT_POS); splitCam.lookAt(SPLIT_LOOK); splitCam.updateProjectionMatrix();
  class StagePass extends T.Pass {
    constructor() { super(); this.needsSwap = false; }
    render(r, writeBuffer, readBuffer) {
      const target = this.renderToScreen ? null : readBuffer;
      r.setRenderTarget(target); r.clear();
      if (!frameState.split) { r.render(scene, camera); return; }
      const s = splitS(frameState.t), Wt = readBuffer.width, Ht = readBuffer.height, half = Math.round(Wt / 2);
      camera.up.copy(UP_Y); camera.position.copy(SPLIT_POS); camera.lookAt(SPLIT_LOOK); camera.updateMatrixWorld();
      bgMat.uniforms.uCamPos.value.copy(camera.position); bgMat.uniforms.uCamWorld.value.copy(camera.matrixWorld);
      sun.castShadow = false;
      [['without', 90, 0], ['with', -90, half]].forEach(([side, off, x0]) => {
        poseSplit(side, s);
        camera.setViewOffset(360, 640, off, 0, 360, 640); camera.updateMatrixWorld();
        bgMat.uniforms.uInvProj.value.copy(camera.projectionMatrixInverse);
        readBuffer.scissor.set(x0, 0, half, Ht); readBuffer.scissorTest = true; r.setRenderTarget(readBuffer);
        r.render(scene, camera);
      });
      readBuffer.scissorTest = false; r.setRenderTarget(readBuffer);
      camera.clearViewOffset(); void Ht;
    }
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
  function draw(t) {
    tNow = t; update(t);
    bgMat.uniforms.uInvProj.value.copy(camera.projectionMatrixInverse);
    bgMat.uniforms.uCamWorld.value.copy(camera.matrixWorld);
    composer.render();
  }
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

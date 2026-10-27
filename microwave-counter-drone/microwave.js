/* Microwave Counter-Drone · NovexDynamics
   Procedural Three.js (r128) scene. Everything on screen is a pure function of the time t (0–26 s):
   window.__render(t) draws one frame, window.__ready turns true once fonts and the first frame are done.
   Units are metres; y is up. The beam trailer stands at the origin with its panel facing +z, over a flat field at dusk.
   The hook (0–2 s) and the final shot (24–26 s) share one swarm clock h, so the last frame runs straight into the first.
   The microwave beam is invisible in reality: the cone, wavefronts and energy streaks are drawn as a visualization. */
(() => {
  'use strict';
  const T = THREE, PI = Math.PI, TAU = PI * 2;
  const DURATION = 26, G = 9.81;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const smooth = k => { k = clamp(k); return k * k * (3 - 2 * k); };
  const span = (t, a, b) => clamp((t - a) / (b - a));
  const pulse = (t, a, b, c, d) => smooth(span(t, a, b)) * (1 - smooth(span(t, c, d)));
  const rand = (i, j) => { const x = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return x - Math.floor(x); };
  const RENDER = new URLSearchParams(location.search).has('render');
  const V3 = (x, y, z) => new T.Vector3(x, y, z);
  const deg = d => d * PI / 180;
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

  // ---------------------------------------------------------------- page frame + renderer
  const frameEl = document.getElementById('frame'), stage = document.getElementById('stage');
  const renderer = new T.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.autoClear = false;
  stage.appendChild(renderer.domElement);
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(36, 360 / 640, 0.05, 3000);
  const HAZE = new T.Color(0.2, 0.13, 0.2), NAVY = new T.Color(0.006, 0.014, 0.034);
  scene.fog = new T.Fog(HAZE.clone(), 80, 1500);
  const rtOpts = { minFilter: T.LinearFilter, magFilter: T.LinearFilter, format: T.RGBAFormat, type: T.HalfFloatType };
  let rt;
  if (renderer.capabilities.isWebGL2) { rt = new T.WebGLMultisampleRenderTarget(360, 640, rtOpts); rt.samples = 4; }
  else rt = new T.WebGLRenderTarget(360, 640, Object.assign(rtOpts, { type: T.UnsignedByteType }));
  const composer = new T.EffectComposer(renderer, rt);

  // ---------------------------------------------------------------- environment + lights (sun just below the horizon, toward +z)
  const SUN_DIR = V3(-0.35, 0.1, 1.0).normalize();
  {
    const env = new T.Scene();
    const basic = c => new T.MeshBasicMaterial({ color: c, side: T.DoubleSide });
    env.add(new T.Mesh(new T.SphereGeometry(50, 32, 16), new T.MeshBasicMaterial({ color: new T.Color(0.07, 0.07, 0.16), side: T.BackSide })));
    const band = new T.Mesh(new T.CylinderGeometry(48, 48, 6, 32, 1, true), basic(new T.Color(0.42, 0.24, 0.26))); band.position.y = 1; env.add(band);
    const gnd = new T.Mesh(new T.CircleGeometry(49, 32), basic(new T.Color(0.04, 0.035, 0.04))); gnd.rotation.x = -PI / 2; gnd.position.y = -3; env.add(gnd);
    const glow = new T.Mesh(new T.PlaneGeometry(26, 7), basic(new T.Color(2.4, 1.1, 0.5))); glow.position.copy(SUN_DIR).multiplyScalar(44).setY(2); glow.lookAt(0, 0, 0); env.add(glow);
    scene.environment = new T.PMREMGenerator(renderer).fromScene(env, 0.03).texture;
  }
  const sun = new T.DirectionalLight(0xffb27a, 1.5);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 200 });
  sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const hemi = new T.HemisphereLight(0x6f72b8, 0x241a18, 0.75); scene.add(hemi);
  const fill = new T.DirectionalLight(0x8aa0ff, 0.35); scene.add(fill, fill.target);
  const rim = new T.DirectionalLight(0x7fd8ff, 0); rim.position.set(1, 2, -1.5); scene.add(rim);

  // ---------------------------------------------------------------- sky (dusk) + X-ray grid, analytic background
  const bgMat = new T.ShaderMaterial({
    uniforms: { uX: { value: 0 }, uRes: { value: new T.Vector2(1080, 1920) }, uInvProj: { value: new T.Matrix4() }, uCamWorld: { value: new T.Matrix4() }, uSun: { value: SUN_DIR.clone() } },
    vertexShader: 'varying vec2 vNdc; void main(){ vNdc = position.xy; gl_Position = vec4(position.xy, 0.9999, 1.0); }',
    fragmentShader: `
      varying vec2 vNdc; uniform float uX; uniform vec2 uRes; uniform mat4 uInvProj; uniform mat4 uCamWorld; uniform vec3 uSun;
      float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float h1(float x){ return fract(sin(x * 127.1) * 43758.5453); }
      float n1(float x){ float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h1(i), h1(i + 1.0), f); }
      void main(){
        vec4 v = uInvProj * vec4(vNdc, 1.0, 1.0);
        vec3 d = normalize((uCamWorld * vec4(v.xyz / v.w, 0.0)).xyz);
        vec2 hz = normalize(d.xz + 1e-5), sz = normalize(uSun.xz);
        float toward = 0.5 + 0.5 * dot(hz, sz);                       // 1 facing the sunset, 0 away from it
        float e = d.y;
        vec3 horizon = mix(vec3(0.34, 0.2, 0.32), vec3(1.0, 0.5, 0.24), pow(clamp(toward, 0.0, 1.0), 3.0));
        vec3 mid = mix(vec3(0.16, 0.11, 0.27), vec3(0.42, 0.2, 0.3), pow(clamp(toward, 0.0, 1.0), 4.0));
        vec3 top = vec3(0.025, 0.035, 0.1);
        vec3 sky = mix(horizon, mid, smoothstep(0.0, 0.12, e));
        sky = mix(sky, top, smoothstep(0.08, 0.6, e));
        sky += vec3(1.0, 0.55, 0.25) * pow(max(dot(d, normalize(vec3(uSun.x, -0.02, uSun.z))), 0.0), 40.0) * 0.6;
        vec3 sc = floor(d * 400.0); float st = hash(sc);
        sky += vec3(0.8, 0.85, 1.0) * step(0.9975, st) * (st - 0.9975) * 140.0 * smoothstep(0.3, 0.7, e);
        // tree line and low hills on the horizon, then the dark field beyond the ground mesh
        float az = atan(d.z, d.x);
        float sil = 0.004 + 0.01 * n1(az * 9.0) + 0.012 * pow(max(n1(az * 31.0 + 4.0), 0.0), 3.0) + 0.006 * n1(az * 70.0);
        vec3 land = mix(vec3(0.03, 0.025, 0.035), vec3(0.09, 0.05, 0.07), pow(clamp(toward, 0.0, 1.0), 3.0) * 0.6);
        vec3 col = e < sil ? mix(land, horizon * 0.35, smoothstep(-0.02, sil, e) * 0.5) : sky;
        if (e < 0.0) col = mix(vec3(0.025, 0.022, 0.03), horizon * 0.4, exp(e * 60.0));
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
    uniforms: { uAmt: { value: 0 }, uCol: { value: new T.Color(0.75, 0.85, 1.0) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'varying vec2 vUv; uniform float uAmt; uniform vec3 uCol; void main(){ float v = 1.0 - 0.6 * length(vUv - vec2(0.5, 0.45)); gl_FragColor = vec4(uCol * uAmt * v, 1.0); }',
    transparent: true, depthWrite: false, depthTest: false, blending: T.AdditiveBlending
  });
  const flash = new T.Mesh(new T.PlaneGeometry(2, 2), flashMat); flash.frustumCulled = false; flash.renderOrder = 100; scene.add(flash);

  // ---------------------------------------------------------------- helpers + materials
  const merge = geos => T.BufferGeometryUtils.mergeBufferGeometries(geos.map(g => g.index ? g : g));
  const canvasTex = (w, h, draw, srgb = true) => {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h);
    const t = new T.CanvasTexture(cv); t.wrapS = t.wrapT = T.RepeatWrapping; if (srgb) t.encoding = T.sRGBEncoding; t.anisotropy = 4; return t;
  };
  const std = (color, metalness, roughness, extra = {}) => { const m = new T.MeshStandardMaterial(Object.assign({ color, metalness, roughness }, extra)); m.color.convertSRGBToLinear(); return m; };
  const DS = { side: T.DoubleSide };
  const box = (w, h, d, x = 0, y = 0, z = 0) => new T.BoxGeometry(w, h, d).translate(x, y, z);
  const cyl = (rt, rb, h, seg, x = 0, y = 0, z = 0) => new T.CylinderGeometry(rt, rb, h, seg).translate(x, y, z);
  const NOISE = `
    float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
                 mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
    float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * n3(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }`;

  const carbonTex = canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = '#222326'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) { x.fillStyle = (i + j) % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)'; x.fillRect(i * 16, j * 16, 16, 16); }
  });
  carbonTex.repeat.set(3, 3);
  const carbonMat = std(0xffffff, 0.35, 0.45, { map: carbonTex });
  const shellMat = std(0x2c2f34, 0.15, 0.55);
  const motorMat = std(0x7a7f87, 0.85, 0.32);
  const propMat = std(0x2e3034, 0.1, 0.6, DS);
  const steelMat = std(0xb8bdc4, 0.9, 0.28);
  const battMat = std(0x1d2026, 0.2, 0.6);
  const spoolMat = std(0xd8dadc, 0.05, 0.5);
  const fiberCoilMat = std(0x8c8674, 0.0, 0.4);
  const copperMat = std(0xb46a32, 0.9, 0.35);
  const wireMats = [std(0xb2282a, 0.1, 0.5), std(0x1b1b1d, 0.1, 0.5), std(0xd0a428, 0.1, 0.5)];
  const darkMat = std(0x101113, 0.3, 0.5);

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
  const xShell = xrayMat(0x5fd8ff, 0.012, 2.4, 0.5);
  const xParts = xrayMat(0x5fd8ff, 0.03, 1.8, 0.6);
  const shells = [];
  const fadeMats = [carbonMat, shellMat, motorMat, propMat, battMat, spoolMat];
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
  function tube(pts, r, mat, parent) {
    const curve = new T.CatmullRomCurve3(pts.map(p => V3(...p)));
    return solid(new T.TubeGeometry(curve, 40, r, 6, false), mat, parent);
  }

  // ---------------------------------------------------------------- field
  const grassTex = canvasTex(1024, 1024, (x, w, h) => {
    x.fillStyle = '#2a2a1f'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 500; i++) { x.fillStyle = `rgba(${rand(i, 1) < 0.5 ? '20,22,14' : '58,54,36'},${0.08 + rand(i, 2) * 0.12})`; x.beginPath(); x.ellipse(rand(i, 3) * w, rand(i, 4) * h, 20 + rand(i, 5) * 90, 10 + rand(i, 6) * 40, rand(i, 7) * PI, 0, TAU); x.fill(); }
    for (let i = 0; i < 26000; i++) { x.fillStyle = rand(i, 8) < 0.5 ? `rgba(14,16,10,${0.3 + rand(i, 9) * 0.3})` : `rgba(80,76,52,${0.2 + rand(i, 9) * 0.3})`; x.fillRect(rand(i, 10) * w, rand(i, 11) * h, 1 + rand(i, 12) * 2, 2 + rand(i, 13) * 5); }
  });
  grassTex.repeat.set(220, 220);
  const fieldMat = std(0xffffff, 0, 0.95, { map: grassTex, envMapIntensity: 0.5 });
  fieldMat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vGW;').replace('#include <project_vertex>', '#include <project_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec2 vGW;
      float gh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float gn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(gh(i), gh(i + vec2(1, 0)), f.x), mix(gh(i + vec2(0, 1)), gh(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <map_fragment>', '#include <map_fragment>\nfloat gv = gn(vGW / 60.0) * 0.6 + gn(vGW / 14.0 + 7.0) * 0.4;\ndiffuseColor.rgb *= 0.7 + 0.6 * gv;');
  };
  const field = new T.Mesh(new T.PlaneGeometry(4000, 4000).rotateX(-PI / 2), fieldMat); field.receiveShadow = true; scene.add(field);
  const world = new T.Group(); scene.add(world);          // everything that disappears in the X-ray scenes

  // ---------------------------------------------------------------- drone geometry (local: +z forward, y up; ~0.37 m motor to motor)
  const ARM = 0.13;
  const MOTORS = [[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([sx, sz]) => V3(sx * ARM, 0, sz * ARM));
  const armGeo = (sx, sz) => { const g = box(0.024, 0.008, 0.19); g.rotateY(Math.atan2(sx, sz)); g.translate(sx * ARM * 0.52, 0, sz * ARM * 0.52); return g; };
  const bodyParts = () => [
    box(0.1, 0.007, 0.17, 0, 0, 0), box(0.085, 0.005, 0.13, 0, 0.036, 0),
    box(0.078, 0.032, 0.115, 0, 0.019, 0.004),                          // canopy
    box(0.026, 0.026, 0.024, 0, 0.018, 0.087),                          // camera
    box(0.042, 0.03, 0.095, 0, 0.055, -0.004),                          // battery on top
    cyl(0.024, 0.024, 0.052, 16, 0, -0.018, -0.075).rotateZ(0),          // fiber spool (axis rotated below)
    cyl(0.0022, 0.0022, 0.05, 6, 0.018, 0.064, -0.055), cyl(0.012, 0.012, 0.006, 14, 0.018, 0.092, -0.055)   // GPS mast + puck
  ];
  const swBodyGeo = (() => {
    const parts = bodyParts();
    parts[5] = new T.CylinderGeometry(0.024, 0.024, 0.052, 16).rotateZ(PI / 2).translate(0, -0.02, -0.078);
    MOTORS.forEach(m => parts.push(armGeo(Math.sign(m.x), Math.sign(m.z))));
    return merge(parts.map(g => g.toNonIndexed()));
  })();
  const swMotorGeo = merge(MOTORS.map(m => cyl(0.017, 0.017, 0.02, 14, m.x, 0.014, m.z).toNonIndexed()));
  const bladeGeo = (() => {
    const gs = [0, 1, 2].map(k => { const g = new T.BoxGeometry(0.088, 0.0016, 0.016); g.translate(0.048, 0, 0); g.rotateX(0.18); g.rotateY(k * TAU / 3); return g.toNonIndexed(); });
    gs.push(cyl(0.008, 0.008, 0.008, 10).toNonIndexed());
    return merge(gs);
  })();
  const discGeo = new T.CircleGeometry(0.095, 32).rotateX(-PI / 2);
  const LEDS = [{ p: V3(ARM, -0.008, ARM), c: [0.4, 3.0, 1.0] }, { p: V3(-ARM, -0.008, ARM), c: [0.4, 3.0, 1.0] }, { p: V3(ARM, -0.008, -ARM), c: [3.2, 0.25, 0.2] }, { p: V3(-ARM, -0.008, -ARM), c: [3.2, 0.25, 0.2] }];
  const SPOOL_LOCAL = V3(0, -0.02, -0.1);

  // ---------------------------------------------------------------- glow billboards (LEDs, sparks) and puffs
  function glowSystem(n) {
    const g = new T.InstancedBufferGeometry(), base = new T.PlaneGeometry(1, 1);
    g.setIndex(base.index); g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
    const pos = new T.InstancedBufferAttribute(new Float32Array(n * 3), 3), col = new T.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    pos.setUsage(T.DynamicDrawUsage); col.setUsage(T.DynamicDrawUsage); g.setAttribute('aPos', pos); g.setAttribute('aCol', col); g.instanceCount = n;
    const m = new T.ShaderMaterial({
      vertexShader: `attribute vec3 aPos; attribute vec4 aCol; varying vec2 vUv; varying vec4 vCol;
        void main(){ vUv = uv; vCol = aCol;
          vec4 mv = viewMatrix * vec4(aPos, 1.0);
          float s = aCol.a > 0.0 ? 1.0 : 0.0;
          mv.xy += position.xy * abs(aCol.a) * s;
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec2 vUv; varying vec4 vCol;
        void main(){ float r = length(vUv - 0.5) * 2.0; float a = exp(-r * r * 5.0) + 0.6 * exp(-r * r * 40.0); if (a < 0.004) discard; gl_FragColor = vec4(vCol.rgb * a, a); }`,
      transparent: true, depthWrite: false, blending: T.AdditiveBlending
    });
    const mesh = new T.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 9; scene.add(mesh);
    let k = 0;
    return {
      mesh, n, reset() { k = 0; },
      push(p, r, gr, b, size) { if (k >= n) return; pos.setXYZ(k, p.x, p.y, p.z); col.setXYZW(k, r, gr, b, size); k++; },
      done() { for (let i = k; i < n; i++) col.setXYZW(i, 0, 0, 0, 0); pos.needsUpdate = col.needsUpdate = true; }
    };
  }
  const glows = glowSystem(520);
  function puffSystem(n, color) {
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
          gl_FragColor = vec4(uBase * (0.75 + 0.5 * n), a); }`,
      transparent: true, depthWrite: false
    });
    const mesh = new T.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 7; scene.add(mesh);
    let k = 0;
    return {
      reset() { k = 0; },
      push(p, size, alpha, seed) { if (k >= n) return; pos.setXYZ(k, p.x, p.y, p.z); dat.setXYZW(k, size, alpha, 0, seed); k++; },
      done() { for (let i = k; i < n; i++) dat.setXYZW(i, 0, 0, 0, 0); pos.needsUpdate = dat.needsUpdate = true; }
    };
  }
  const dust = puffSystem(160, new T.Color(0.2, 0.18, 0.15));

  // ---------------------------------------------------------------- screen-space ribbons (optical fibers)
  function ribbonSet(nLines, nPts, color, widthPx, alpha) {
    const N = nLines * nPts, pos = new Float32Array(N * 2 * 3), prev = new Float32Array(N * 2 * 3), next = new Float32Array(N * 2 * 3), side = new Float32Array(N * 2), uu = new Float32Array(N * 2), idx = [];
    for (let l = 0; l < nLines; l++) for (let i = 0; i < nPts; i++) {
      const v = (l * nPts + i) * 2; side[v] = -1; side[v + 1] = 1; uu[v] = uu[v + 1] = i / (nPts - 1);
      if (i < nPts - 1) idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }
    const g = new T.BufferGeometry();
    const aPos = new T.BufferAttribute(pos, 3), aPrev = new T.BufferAttribute(prev, 3), aNext = new T.BufferAttribute(next, 3);
    [aPos, aPrev, aNext].forEach(a => a.setUsage(T.DynamicDrawUsage));
    g.setAttribute('position', aPos); g.setAttribute('aPrev', aPrev); g.setAttribute('aNext', aNext);
    g.setAttribute('aSide', new T.BufferAttribute(side, 1)); g.setAttribute('aU', new T.BufferAttribute(uu, 1)); g.setIndex(idx);
    const m = new T.ShaderMaterial({
      uniforms: { uRes: { value: new T.Vector2(1080, 1920) }, uWidth: { value: widthPx }, uColor: { value: color }, uAlpha: { value: alpha }, uFade: { value: 0.0 } },
      vertexShader: `attribute vec3 aPrev; attribute vec3 aNext; attribute float aSide; attribute float aU; uniform vec2 uRes; uniform float uWidth; varying float vU; varying float vSide;
        void main(){
          vec4 c = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(aPrev, 1.0);
          vec4 n = projectionMatrix * modelViewMatrix * vec4(aNext, 1.0);
          vec2 sp = p.xy / max(p.w, 1e-3), sn = n.xy / max(n.w, 1e-3);
          vec2 dir = (sn - sp) * uRes; float L = length(dir); dir = L > 1e-5 ? dir / L : vec2(1.0, 0.0);
          vec2 nrm = vec2(-dir.y, dir.x);
          c.xy += nrm * aSide * uWidth * 2.0 / uRes * c.w;
          vU = aU; vSide = aSide; gl_Position = c; }`,
      fragmentShader: `varying float vU; varying float vSide; uniform vec3 uColor; uniform float uAlpha; uniform float uFade;
        void main(){ float a = uAlpha * (1.0 - abs(vSide) * 0.35) * (1.0 - smoothstep(1.0 - uFade, 1.0, vU) * step(0.001, uFade)); gl_FragColor = vec4(uColor, a); }`,
      transparent: true, depthWrite: false, side: T.DoubleSide
    });
    const mesh = new T.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 6;
    return {
      mesh, m,
      set(l, pts) {
        for (let i = 0; i < nPts; i++) {
          const a = pts[i], b = pts[Math.max(0, i - 1)], c = pts[Math.min(nPts - 1, i + 1)];
          for (let s = 0; s < 2; s++) { const v = ((l * nPts + i) * 2 + s) * 3; pos[v] = a.x; pos[v + 1] = a.y; pos[v + 2] = a.z; prev[v] = b.x; prev[v + 1] = b.y; prev[v + 2] = b.z; next[v] = c.x; next[v + 1] = c.y; next[v + 2] = c.z; }
        }
      },
      commit() { aPos.needsUpdate = aPrev.needsUpdate = aNext.needsUpdate = true; }
    };
  }
  const FIB_PTS = 28;
  const swarmFibers = ribbonSet(49, FIB_PTS, new T.Color(0.95, 0.85, 0.8), 0.6, 0.1); swarmFibers.m.uniforms.uFade.value = 0.5; world.add(swarmFibers.mesh);
  const heroFiber = ribbonSet(1, 48, new T.Color(1.0, 0.96, 0.9), 1.6, 0.85); heroFiber.m.uniforms.uFade.value = 0.25; world.add(heroFiber.mesh);
  // a fiber path: from the spool, sagging down behind the drone onto the ground and back toward the far end
  const fiberPath = (spool, back, far, n, sagLen) => {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1), d = Math.pow(k, 1.6);
      const p = spool.clone().lerp(far, d);
      const air = Math.exp(-d * (far.distanceTo(spool) / sagLen));
      p.addScaledVector(back, 0.0);
      p.y = Math.max(0.03, spool.y * air + 0.03 * (1 - air));
      pts.push(p);
    }
    return pts;
  };

  // ---------------------------------------------------------------- the swarm (49 instanced drones)
  const NSW = 49;
  const swBody = new T.InstancedMesh(swBodyGeo, carbonMat, NSW), swMotor = new T.InstancedMesh(swMotorGeo, motorMat, NSW);
  const swBlades = new T.InstancedMesh(bladeGeo, propMat, NSW * 4);
  const swDiscMat = new T.MeshBasicMaterial({ color: new T.Color(0.32, 0.3, 0.34), transparent: true, opacity: 0.22, depthWrite: false, side: T.DoubleSide });
  const swDisc = new T.InstancedMesh(discGeo, swDiscMat, NSW * 4);
  [swBody, swMotor, swBlades, swDisc].forEach(m => { m.instanceMatrix.setUsage(T.DynamicDrawUsage); m.frustumCulled = false; m.castShadow = m !== swDisc; world.add(m); });
  const SW = [...Array(NSW)].map((_, i) => {
    const r = Math.floor(i / 7), c = i % 7;
    return {
      off: V3((c - 3) * 1.55 + (rand(i, 1) - 0.5) * 0.8, 2.6 + rand(i, 2) * 4.4 + r * 0.35, r * 2.4 + (rand(i, 3) - 0.5) * 1.4),
      ph: rand(i, 4) * TAU, axis: V3(rand(i, 5) - 0.5, rand(i, 6) - 0.5, rand(i, 7) - 0.5).normalize(), trate: 3 + 5 * rand(i, 8),
      farEnd: V3((rand(i, 9) - 0.5) * 140, 0, 240 + rand(i, 10) * 140), lagLed: rand(i, 11) * 0.04
    };
  });
  const VSW = 11;
  const swAlive = (i, c, z0) => { const s = SW[i]; return V3(s.off.x + 0.22 * Math.sin(c * 1.3 + s.ph), s.off.y + 0.16 * Math.sin(c * 2.1 + s.ph * 1.7), z0 + s.off.z - VSW * c); };
  // state of drone i at swarm clock c, when it is hit at ch (Infinity = never)
  const qTmp = new T.Quaternion(), qTmp2 = new T.Quaternion(), eTmp = new T.Euler();
  function swState(i, c, ch, z0) {
    const s = SW[i];
    const dt = c - ch;
    const base = new T.Quaternion().setFromEuler(eTmp.set(deg(14) + 0.05 * Math.sin(c * 1.7 + s.ph), PI, 0.08 * Math.sin(c * 1.1 + s.ph), 'YXZ'));
    if (!(dt > 0)) return { p: swAlive(i, c, z0), q: base, spin: 1, lit: 1, dt: -1 };
    const p0 = swAlive(i, ch, z0), tl = Math.sqrt(2 * Math.max(0.01, p0.y - 0.06) / G), tt = Math.min(dt, tl);
    const p = V3(p0.x, Math.max(0.06, p0.y - 0.5 * G * tt * tt), p0.z - VSW * 0.75 * (1 - Math.exp(-tt / 0.75)));
    const q = base.clone().premultiply(qTmp.setFromAxisAngle(s.axis, s.trate * tt * 0.6 + (dt > tl ? 0.4 : 0)));
    const lit = dt < s.lagLed ? 1 : (dt < s.lagLed + 0.05 ? (Math.floor(dt * 90) % 2 ? 0.6 : 0.1) : 0);
    return { p, q, spin: Math.exp(-dt / 0.25), lit, dt, tl };
  }
  const mtx = new T.Matrix4(), mtx2 = new T.Matrix4(), vS = new T.Vector3(), ONE = V3(1, 1, 1), SWS = V3(1.35, 1.35, 1.35);
  function drawSwarm(c, hitFn, z0, show, fibers) {
    [swBody, swMotor, swBlades, swDisc].forEach(m => { m.visible = show; });
    swarmFibers.mesh.visible = show && fibers;
    if (!show) return 0;
    let active = 0;
    for (let i = 0; i < NSW; i++) {
      const ch = hitFn(i), st = swState(i, c, ch, z0);
      if (st.dt < 0) active++;
      mtx.compose(st.p, st.q, SWS);
      swBody.setMatrixAt(i, mtx); swMotor.setMatrixAt(i, mtx);
      MOTORS.forEach((m, k) => {
        const ang = (k % 2 ? -1 : 1) * (st.spin > 0.02 ? (c * 7.3 * st.spin + k) : (1.3 * k + i)) + (st.dt > 0 ? (1 - st.spin) * 2.5 * (k % 2 ? -1 : 1) : 0);
        mtx2.compose(V3(m.x, 0.028, m.z), qTmp2.setFromAxisAngle(V3(0, 1, 0), ang), ONE);
        swBlades.setMatrixAt(i * 4 + k, mtx.clone().multiply(mtx2));
        mtx2.compose(V3(m.x, 0.03, m.z), qTmp2.identity(), vS.setScalar(st.spin > 0.05 ? 1 : 0.0001));
        swDisc.setMatrixAt(i * 4 + k, mtx.clone().multiply(mtx2));
      });
      // nav lights, the hit spark, ground dust
      if (st.lit > 0) LEDS.forEach(L => { const p = L.p.clone().multiplyScalar(1.35).applyQuaternion(st.q).add(st.p); glows.push(p, L.c[0] * st.lit, L.c[1] * st.lit, L.c[2] * st.lit, 0.2); });
      if (st.dt > 0 && st.dt < 0.25) { const k = Math.exp(-st.dt / 0.035) * (0.55 + 0.45 * Math.sin(st.dt * 310 + i)); glows.push(st.p.clone().add(V3(0, 0.04, 0)), 0.7 * k, 1.0 * k, 2.2 * k, 0.32); }
      if (st.dt > st.tl) { const age = st.dt - st.tl; if (age < 2.5) for (let j = 0; j < 3; j++) dust.push(V3(st.p.x + (rand(i, 20 + j) - 0.5) * (0.3 + age), 0.12 + age * 0.25 + j * 0.05, st.p.z + (rand(i, 30 + j) - 0.5) * (0.3 + age)), 0.4 + age * 0.9, 0.5 * Math.exp(-age / 0.9) * smooth(age / 0.05), rand(i, 40 + j)); }
      if (fibers) {
        const spool = SPOOL_LOCAL.clone().multiplyScalar(1.35).applyQuaternion(st.q).add(st.p);
        swarmFibers.set(i, fiberPath(spool, V3(0, 0, 1), V3(SW[i].farEnd.x, 0, st.p.z + SW[i].farEnd.z), FIB_PTS, 22));
      }
    }
    [swBody, swMotor, swBlades, swDisc].forEach(m => { m.instanceMatrix.needsUpdate = true; });
    if (fibers) swarmFibers.commit();
    return active;
  }

  // ---------------------------------------------------------------- the hero drone (detailed; X-ray ready)
  const hero = new T.Group(); scene.add(hero);
  const heroParts = {};
  {
    const bp = bodyParts();
    part(bp[0], carbonMat, xShell, hero); part(bp[1], carbonMat, xShell, hero);
    heroParts.canopy = part(bp[2], shellMat, xShell, hero);
    part(bp[3], darkMat, xParts, hero);
    solid(new T.CylinderGeometry(0.008, 0.009, 0.01, 16).rotateX(PI / 2).translate(0, 0.018, 0.1), std(0x0b0c0e, 0.4, 0.2), hero);    // lens
    part(bp[4], battMat, xShell, hero);
    MOTORS.forEach(m => part(armGeo(Math.sign(m.x), Math.sign(m.z)), carbonMat, xShell, hero));
    // spool on the back, with a coil of fiber inside
    const spool = new T.Group(); spool.position.copy(SPOOL_LOCAL); hero.add(spool);
    part(new T.CylinderGeometry(0.026, 0.026, 0.056, 24, 1, true).rotateZ(PI / 2), spoolMat, xShell, spool);
    [-1, 1].forEach(sg => part(new T.CylinderGeometry(0.03, 0.03, 0.003, 24).rotateZ(PI / 2).translate(sg * 0.029, 0, 0), spoolMat, xShell, spool));
    solid(new T.CylinderGeometry(0.023, 0.023, 0.05, 24).rotateZ(PI / 2), fiberCoilMat, spool);
    heroParts.spool = spool;
    // GPS mast (the receive antenna) and its cable down to the flight controller
    heroParts.mast = solid(cyl(0.0022, 0.0022, 0.05, 8, 0.018, 0.064, -0.055), steelMat, hero);
    heroParts.puck = solid(cyl(0.012, 0.012, 0.006, 18, 0.018, 0.092, -0.055), std(0xd9dce0, 0.2, 0.5), hero);
    tube([[0.018, 0.04, -0.055], [0.016, 0.032, -0.04], [0.008, 0.027, -0.018], [0.004, 0.026, -0.006]], 0.0012, wireMats[1], hero);
    // stack: ESC (motor controller) below, flight controller above, on standoffs
    [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(([sx, sz]) => solid(cyl(0.0018, 0.0018, 0.03, 6, sx * 0.0153, 0.019, sz * 0.0153), steelMat, hero));
    heroParts.motors = MOTORS.map((m, k) => {
      const g = new T.Group(); g.position.set(m.x, 0, m.z); hero.add(g);
      part(new T.CylinderGeometry(0.017, 0.017, 0.016, 20, 1, true).translate(0, 0.018, 0), motorMat, xParts, g);   // bell
      part(new T.CylinderGeometry(0.017, 0.017, 0.002, 20).translate(0, 0.026, 0), motorMat, xParts, g);
      solid(cyl(0.0125, 0.0125, 0.012, 12, 0, 0.016, 0), copperMat, g);                                            // stator windings
      solid(cyl(0.006, 0.0075, 0.006, 12, 0, 0.007, 0), motorMat, g);
      const shaft = solid(cyl(0.0022, 0.0022, 0.016, 8, 0, 0.03, 0), steelMat, g);
      const prop = new T.Group(); prop.position.y = 0.036; g.add(prop);
      part(bladeGeo, propMat, xParts, prop);
      const disc = new T.Mesh(discGeo, new T.MeshBasicMaterial({ color: new T.Color(0.32, 0.3, 0.34), transparent: true, opacity: 0.2, depthWrite: false, side: T.DoubleSide })); disc.position.y = 0.037; g.add(disc);
      // three-phase leads from the motor along the arm to the ESC
      const dir = V3(-m.x, 0, -m.z).normalize();
      [-1, 0, 1].forEach((o, j) => {
        const perp = V3(dir.z, 0, -dir.x).multiplyScalar(0.0022 * o);
        tube([[perp.x, 0.004, perp.z], [dir.x * 0.04 + perp.x, 0.006, dir.z * 0.04 + perp.z], [dir.x * 0.1 + perp.x, 0.008, dir.z * 0.1 + perp.z], [dir.x * (Math.hypot(m.x, m.z) - 0.022) + perp.x, 0.009, dir.z * (Math.hypot(m.x, m.z) - 0.022) + perp.z]], 0.0009, wireMats[j], g);
      });
      return { g, prop, disc, shaft };
    });
  }
  // printed circuit boards with a trace network; surges run along the traces in a shader
  function pcbTexture(seed, chips, edgeStarts) {
    return canvasTex(512, 512, (x, w, h) => {
      x.fillStyle = 'rgb(0,0,0)'; x.fillRect(0, 0, w, h);
      x.lineCap = 'round'; x.lineJoin = 'round';
      let id = 1;
      edgeStarts.forEach((st, si) => {
        const chip = chips[si % chips.length];
        const tx = (chip[0] + (rand(seed, si) - 0.5) * chip[2] * 0.8) * w, ty = (chip[1] + (rand(seed + 1, si) - 0.5) * chip[3] * 0.8) * h;
        const sx = st[0] * w, sy = st[1] * h;
        const mx = Math.abs(tx - sx) > Math.abs(ty - sy) ? sx + Math.sign(tx - sx) * Math.abs(ty - sy) : sx, my = Math.abs(tx - sx) > Math.abs(ty - sy) ? ty : sy + Math.sign(ty - sy) * Math.abs(tx - sx);
        const pts = [[sx, sy], [mx, my], [tx, ty]];
        const L = Math.hypot(mx - sx, my - sy) + Math.hypot(tx - mx, ty - my) + 1e-3;
        let acc = 0;
        for (let k = 0; k < 2; k++) {
          const [ax, ay] = pts[k], [bx, by] = pts[k + 1], segL = Math.hypot(bx - ax, by - ay), steps = Math.max(1, Math.ceil(segL / 4));
          for (let q = 0; q < steps; q++) {
            const u0 = q / steps, u1 = (q + 1) / steps;
            x.strokeStyle = `rgb(255,${Math.round(255 * clamp((acc + segL * u0) / L))},${id})`; x.lineWidth = 4;
            x.beginPath(); x.moveTo(ax + (bx - ax) * u0, ay + (by - ay) * u0); x.lineTo(ax + (bx - ax) * u1, ay + (by - ay) * u1); x.stroke();
          }
          acc += segL;
        }
        x.fillStyle = `rgb(255,0,${id})`; x.beginPath(); x.arc(sx, sy, 6, 0, TAU); x.fill();
        id++;
      });
    }, false);
  }
  const boardMats = [];
  function pcbMat(tex) {
    const m = new T.ShaderMaterial({
      uniforms: { uMap: { value: tex }, uTime: { value: 0 }, uSurge: { value: 0 }, uLight: { value: V3(0.3, 1, 0.4).normalize() } },
      vertexShader: 'varying vec2 vUv; varying vec3 vN; void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec2 vUv; varying vec3 vN; uniform sampler2D uMap; uniform float uTime; uniform float uSurge; uniform vec3 uLight;
        void main(){
          vec4 m = texture2D(uMap, vUv); float tr = m.r, g = m.g, id = floor(m.b * 255.0 + 0.5);
          float lit = 0.45 + 0.55 * max(dot(normalize(vN), uLight), 0.0);
          vec3 col = mix(vec3(0.02, 0.1, 0.07), vec3(0.5, 0.38, 0.14), tr * 0.85) * lit;
          float sp = 0.9 + fract(id * 0.618) * 0.9;
          float ph = fract(g - uTime * sp - fract(id * 0.37));
          float d1 = (ph - 0.5) * 9.0, d2 = (fract(ph + 0.5) - 0.5) * 12.0; float slug = exp(-d1 * d1) + 0.6 * exp(-d2 * d2);
          col += vec3(0.55, 0.85, 1.7) * tr * slug * uSurge * 1.5 + vec3(0.1, 0.22, 0.4) * tr * uSurge * 0.12;
          gl_FragColor = vec4(col, 1.0);
        }`
    });
    boardMats.push(m); return m;
  }
  const chipList = [];
  function chip(parent, w, h, d, x, y, z, failAt, label) {
    const mat = std(0x0e0f11, 0.3, 0.45, { emissive: new T.Color(0.55, 0.85, 1.6), emissiveIntensity: 0, toneMapped: false });
    const m = solid(box(w, h, d), mat, parent, [x, y, z]);
    chipList.push({ m, mat, failAt, label }); return m;
  }
  const FC_Y = 0.028, ESC_Y = 0.011;
  const fc = new T.Group(); fc.position.y = FC_Y; hero.add(fc);
  const esc = new T.Group(); esc.position.y = ESC_Y; hero.add(esc);
  {
    // flight controller: MCU, IMU, regulator, OSD, receiver-less (fiber) video bridge; 30.5 mm board
    const chipsN = [[0.5, 0.5, 0.26, 0.26], [0.22, 0.25, 0.1, 0.1], [0.78, 0.25, 0.14, 0.1], [0.24, 0.76, 0.12, 0.14], [0.76, 0.76, 0.16, 0.12]];
    const starts = []; for (let i = 0; i < 26; i++) { const e = i % 4, u = 0.08 + 0.84 * rand(i, 50); starts.push(e === 0 ? [u, 0.03] : e === 1 ? [0.97, u] : e === 2 ? [u, 0.97] : [0.03, u]); }
    const fcTex = pcbTexture(3, chipsN, starts);
    const S = 0.03;
    solid(box(S, 0.0016, S), std(0x0b1a12, 0.2, 0.6), fc);
    const top = new T.Mesh(new T.PlaneGeometry(S, S).rotateX(-PI / 2), pcbMat(fcTex)); top.position.y = 0.00082; fc.add(top);
    const at = (u, v) => [(u - 0.5) * S, (v - 0.5) * S];
    let [cx, cz] = at(0.5, 0.5); chip(fc, 0.0075, 0.0012, 0.0075, cx, 0.0014, cz, 16.9, 'MCU');
    [cx, cz] = at(0.22, 0.25); chip(fc, 0.003, 0.001, 0.003, cx, 0.0013, cz, 16.3, 'IMU');
    [cx, cz] = at(0.78, 0.25); chip(fc, 0.004, 0.0012, 0.003, cx, 0.0014, cz, 16.6, 'REG');
    [cx, cz] = at(0.24, 0.76); chip(fc, 0.0035, 0.001, 0.004, cx, 0.0013, cz, 17.2, 'OSD');
    [cx, cz] = at(0.76, 0.76); chip(fc, 0.0045, 0.0011, 0.0035, cx, 0.0013, cz, 17.5, 'VID');
    heroParts.fcTop = top;
  }
  {
    // ESC (4-in-1 motor controller): a MOSFET bank per motor along the edges, a bulk capacitor, motor pads in the corners
    const S = 0.036;
    const corners = [[0.9, 0.9], [0.1, 0.9], [0.9, 0.1], [0.1, 0.1]];
    const chipsE = [[0.5, 0.5, 0.18, 0.18]].concat(corners.map(([u, v]) => [lerp(0.5, u, 0.6), lerp(0.5, v, 0.6), 0.16, 0.08]));
    const starts = []; for (let i = 0; i < 24; i++) { const c = corners[i % 4]; starts.push([c[0] + (rand(i, 60) - 0.5) * 0.08, c[1] + (rand(i, 61) - 0.5) * 0.08]); }
    const escTex = pcbTexture(9, chipsE, starts);
    solid(box(S, 0.0016, S), std(0x0b1a12, 0.2, 0.6), esc);
    const top = new T.Mesh(new T.PlaneGeometry(S, S).rotateX(-PI / 2), pcbMat(escTex)); top.position.y = 0.00082; esc.add(top);
    const at = (u, v) => [(u - 0.5) * S, (v - 0.5) * S];
    corners.forEach(([u, v], k) => {
      const [cx, cz] = at(lerp(0.5, u, 0.78), lerp(0.5, v, 0.78));
      const tang = Math.abs(u - 0.5) > 0 ? V3(Math.sign(u - 0.5), 0, -Math.sign(v - 0.5)).normalize() : V3(1, 0, 0);
      [-1, 0, 1].forEach(o => chip(esc, 0.0034, 0.0011, 0.0032, cx + tang.x * o * 0.0042, 0.0013, cz + tang.z * o * 0.0042, 17.9 + k * 0.18 + (o + 1) * 0.05, 'FET'));
      const [px, pz] = at(u, v); solid(cyl(0.0022, 0.0022, 0.0008, 12, px, 0.0012, pz), copperMat, esc);
    });
    const [ex, ez] = at(0.5, 0.5); chip(esc, 0.006, 0.0012, 0.006, ex, 0.0014, ez, 17.7, 'DRV');
    solid(cyl(0.004, 0.004, 0.009, 16, 0.0, 0, 0).rotateZ(PI / 2).translate(0, -0.004, -0.02), std(0x1a1d22, 0.4, 0.4), esc);
    heroParts.escTop = top;
  }
  const heroLeds = LEDS.map(L => L.p.clone());

  // ---------------------------------------------------------------- the beam trailer (flat phased-array panel)
  const trailer = new T.Group(); world.add(trailer);
  const PANEL_C = V3(0.9, 2.55, 0.35), PANEL_TILT = deg(-8);
  const tileMat = new T.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uAmt: { value: 0 }, uDir: { value: new T.Vector2(1, 0) }, uIdle: { value: 0.15 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec2 vUv; uniform float uTime; uniform float uAmt; uniform vec2 uDir; uniform float uIdle;
      void main(){
        float N = 12.0; vec2 g = vUv * N, cell = floor(g), f = fract(g);
        float edge = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
        float frame = smoothstep(0.035, 0.075, edge);
        float ph = dot(cell - 5.5, uDir) / 5.0;                          // phase step across the array sets the beam direction
        float band = fract(ph * 0.5 - uTime * 1.4);
        float seq = pow(max(0.5 + 0.5 * cos(band * 6.2832), 0.0), 6.0);
        float h = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
        vec3 base = mix(vec3(0.028, 0.032, 0.042), vec3(0.045, 0.05, 0.062), h);
        vec3 glow = vec3(0.35, 0.75, 1.5) * (uIdle * 0.04 + uAmt * (0.04 + 1.7 * seq));
        float dome = 1.0 - 0.5 * length(f - 0.5);
        gl_FragColor = vec4(mix(vec3(0.015), base + glow * dome, frame), 1.0);
      }`
  });
  {
    const steel = std(0x2b2e33, 0.6, 0.45), olive = std(0x3a3f35, 0.3, 0.6), black = std(0x121315, 0.3, 0.6), rubber = std(0x101010, 0, 0.9);
    solid(box(4.4, 0.18, 1.9, 0, 0.72, 0), steel, trailer);                                          // deck
    solid(box(0.12, 0.12, 0.12, 0, 0.6, 0).scale(1, 1, 1), steel, trailer);
    solid(box(1.6, 0.08, 0.08, -2.9, 0.62, 0), steel, trailer);                                      // drawbar
    [[-0.55, 1], [0.55, 1], [-0.55, -1], [0.55, -1]].forEach(([x, s]) => { solid(cyl(0.36, 0.36, 0.24, 24, 0, 0, 0).rotateX(PI / 2).translate(x, 0.36, s * 1.08), rubber, trailer); solid(cyl(0.2, 0.2, 0.26, 18).rotateX(PI / 2).translate(x, 0.36, s * 1.08), steel, trailer); });
    [[-2.05, -0.8], [-2.05, 0.8], [2.05, -0.8], [2.05, 0.8]].forEach(([x, z]) => solid(cyl(0.05, 0.05, 0.7, 10, x, 0.35, z), steel, trailer));    // leveling jacks
    solid(box(1.5, 1.15, 1.5, -1.25, 1.39, 0), olive, trailer);                                      // power + cooling unit
    for (let i = 0; i < 7; i++) solid(box(0.02, 0.8, 1.2, -1.95 + i * 0.12, 1.4, 0), black, trailer);
    solid(box(0.5, 0.75, 0.5, 0.9, 1.18, 0.0), steel, trailer);                                      // pedestal
    const panel = new T.Group(); panel.position.copy(PANEL_C); panel.rotation.x = PANEL_TILT; trailer.add(panel);
    solid(box(2.3, 2.3, 0.24, 0, 0, -0.12), olive, panel);
    for (let i = 0; i < 9; i++) solid(box(2.2, 0.03, 0.06, 0, -1.0 + i * 0.25, -0.27), black, panel);
    const face = new T.Mesh(new T.PlaneGeometry(2.18, 2.18), tileMat); face.position.z = 0.002; panel.add(face);
    solid(box(2.36, 0.06, 0.05, 0, 1.16, 0.0), steel, panel); solid(box(2.36, 0.06, 0.05, 0, -1.16, 0.0), steel, panel);
    solid(box(0.06, 2.36, 0.05, 1.16, 0, 0.0), steel, panel); solid(box(0.06, 2.36, 0.05, -1.16, 0, 0.0), steel, panel);
    tube([[-0.6, 1.95, 0.5], [-0.1, 2.1, 0.2], [0.5, 1.6, -0.1], [0.9, 1.3, -0.2]], 0.035, black, trailer);
    tube([[-0.6, 1.6, -0.5], [0.0, 1.75, -0.4], [0.6, 1.45, -0.25], [0.85, 1.2, -0.2]], 0.03, black, trailer);
  }
  // the beam: a translucent cone from the whole panel face with rippling wavefronts (visualization only)
  const BEAM_L = 70, BEAM_HALF = deg(10.5);
  const beamMat = new T.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uAmt: { value: 0 }, uL: { value: BEAM_L } },
    vertexShader: 'varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vP = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: NOISE + `varying vec3 vP; varying vec3 vN; varying vec3 vV; uniform float uTime; uniform float uAmt; uniform float uL;
      void main(){
        float d = vP.y, k = d / uL, ang = atan(vP.z, vP.x);
        float rip = fbm(vec3(ang * 2.5, d * 0.08 - uTime * 0.6, 1.0));
        float wave = pow(max(0.5 + 0.5 * sin(d * 0.42 - uTime * 7.0 + rip * 2.5), 0.0), 6.0);
        float f = pow(max(1.0 - abs(dot(normalize(vN), normalize(vV))), 0.0), 1.6);
        float a = uAmt * (0.03 + 0.2 * wave + 0.12 * f * (0.5 + wave)) * smoothstep(0.015, 0.16, k) * (1.0 - smoothstep(0.55, 1.0, k));
        vec3 col = mix(vec3(0.55, 0.75, 1.25), vec3(0.85, 0.7, 1.35), rip);
        gl_FragColor = vec4(col, a);
      }`,
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide
  });
  const beam = new T.Group(); world.add(beam);
  const R0 = 1.15, R1 = R0 + Math.tan(BEAM_HALF) * BEAM_L;
  const beamCone = new T.Mesh(new T.CylinderGeometry(R1, R0, BEAM_L, 64, 30, true).translate(0, BEAM_L / 2, 0), beamMat); beamCone.renderOrder = 8; beam.add(beamCone);
  const wfMat = new T.ShaderMaterial({
    uniforms: { uAmt: { value: 0 }, uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: NOISE + `varying vec2 vUv; uniform float uAmt; uniform float uTime;
      void main(){ vec2 c = vUv - 0.5; float r = length(c) * 2.0; float n = fbm(vec3(c * 5.0, uTime * 0.7));
        float dr = (r - 0.9) * 9.0; float a = uAmt * (smoothstep(1.0, 0.75, r) * (0.03 + 0.06 * n) + 0.08 * exp(-dr * dr));
        gl_FragColor = vec4(vec3(0.6, 0.78, 1.3), a); }`,
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide
  });
  const wavefronts = [0, 1, 2, 3, 4].map(() => { const m = new T.Mesh(new T.CircleGeometry(1, 48).rotateX(-PI / 2), wfMat.clone()); m.renderOrder = 8; beam.add(m); return m; });
  function setBeam(az, el, amt, tm) {
    beam.visible = amt > 0.003;
    if (!beam.visible) return;
    const dir = V3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    beam.position.copy(PANEL_C).add(V3(0, 0, 0.05));
    beam.quaternion.setFromUnitVectors(V3(0, 1, 0), dir);
    beamMat.uniforms.uAmt.value = amt; beamMat.uniforms.uTime.value = tm;
    wavefronts.forEach((w, k) => {
      const d = ((tm * 9 + k * BEAM_L / 5) % (BEAM_L * 0.8)) + 1.5;
      w.position.set(0, d, 0); w.scale.setScalar(R0 + Math.tan(BEAM_HALF) * d);
      w.material.uniforms.uAmt.value = amt * smooth(span(d, 3, 12)) * (1 - smooth(span(d, BEAM_L * 0.45, BEAM_L * 0.8)));
      w.material.uniforms.uTime.value = tm + k;
    });
    tileMat.uniforms.uDir.value.set(1.3 + 5.0 * Math.sin(az), 0.55 - 3.0 * Math.sin(el - deg(2)));
  }
  // the hook's wave: a visualized wavefront rolling out from behind the camera across the swarm
  const ringMat = new T.ShaderMaterial({
    uniforms: { uR: { value: 0 }, uAmt: { value: 0 }, uC: { value: new T.Vector2() } },
    vertexShader: 'varying vec3 vW; void main(){ vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }',
    fragmentShader: NOISE + `varying vec3 vW; uniform float uR; uniform float uAmt; uniform vec2 uC;
      void main(){ float d = length(vW.xz - uC); float w = 0.8 + uR * 0.03;
        float n = fbm(vec3(vW.xz * 0.15, uR * 0.05));
        float b1 = (d - uR + (n - 0.5) * 2.0) / w, b2 = (d - uR + 3.0) / (w * 2.5); float band = exp(-b1 * b1) + 0.35 * exp(-b2 * b2);
        float a = uAmt * band * (1.0 - smoothstep(30.0, 70.0, uR));
        gl_FragColor = vec4(vec3(0.55, 0.8, 1.5) * a, a); }`,
    transparent: true, depthWrite: false, blending: T.AdditiveBlending
  });
  const ring = new T.Mesh(new T.PlaneGeometry(220, 220).rotateX(-PI / 2), ringMat); ring.position.y = 0.06; ring.renderOrder = 6; world.add(ring);
  const shellMatW = new T.ShaderMaterial({
    uniforms: { uAmt: { value: 0 }, uT: { value: 0 } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vP = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: NOISE + `varying vec3 vN; varying vec3 vV; varying vec3 vP; uniform float uAmt; uniform float uT;
      void main(){ float n = fbm(vec3(vP * 4.0 + uT)); float f = pow(max(1.0 - abs(dot(normalize(vN), normalize(vV))), 0.0), 2.0);
        float a = uAmt * (0.07 + 0.2 * n + 0.5 * f) * smoothstep(0.0, 0.12, vP.y);
        gl_FragColor = vec4(vec3(0.6, 0.82, 1.4), a); }`,
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide
  });
  const waveShell = new T.Mesh(new T.SphereGeometry(1, 64, 24, 0, TAU, 0, PI / 2), shellMatW); waveShell.renderOrder = 6; world.add(waveShell);

  // ---------------------------------------------------------------- jammer, red radio waves, operator station
  const jammer = new T.Group(); world.add(jammer);
  const JAM_POS = V3(1.25, 0, 4.9);
  {
    jammer.position.copy(JAM_POS); jammer.rotation.y = -0.3;
    const blk = std(0x1c1e21, 0.4, 0.5), sand = std(0x5c5440, 0.3, 0.6);
    [0, 1, 2].forEach(k => { const a = k * TAU / 3; solid(cyl(0.02, 0.02, 1.25, 8).translate(0, 0.62, 0).rotateZ(0.32).rotateY(a), blk, jammer); });
    solid(box(0.5, 0.36, 0.34, 0, 1.3, 0), sand, jammer);
    solid(box(0.44, 0.44, 0.06, 0, 1.75, 0.12).rotateX(-0.25), blk, jammer);
    [-0.16, 0, 0.16].forEach(x => solid(cyl(0.008, 0.008, 0.62, 6, x, 1.78, -0.1), blk, jammer));
  }
  const JAM_SRC = V3(1.25, 1.78, 5.05);
  const radioMat = new T.ShaderMaterial({
    uniforms: { uAmt: { value: 0 } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying vec3 vN; varying vec3 vV; uniform float uAmt; void main(){ float f = pow(max(1.0 - abs(dot(normalize(vN), normalize(vV))), 0.0), 3.0); gl_FragColor = vec4(vec3(1.6, 0.18, 0.15), uAmt * (0.03 + 0.9 * f)); }',
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide
  });
  const RADIO_HALF = 9;
  const arcMat = new T.ShaderMaterial({
    uniforms: { uRs: { value: [0, 0, 0, 0, 0] }, uAs: { value: [0, 0, 0, 0, 0] }, uBs: { value: [0, 0, 0, 0, 0] }, uBa: { value: [0, 0, 0, 0, 0] }, uDir: { value: new T.Vector2(0, 1) }, uHit: { value: new T.Vector2(0, 5) }, uHalf: { value: RADIO_HALF } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec2 vUv; uniform float uRs[5]; uniform float uAs[5]; uniform float uBs[5]; uniform float uBa[5]; uniform vec2 uDir; uniform vec2 uHit; uniform float uHalf;
      void main(){
        vec2 p = (vUv - 0.5) * 2.0 * uHalf; float r = length(p);
        float cone = smoothstep(0.8, 0.93, dot(p / max(r, 1e-3), uDir));
        vec2 q = p - uHit; float rq = length(q);
        float back = smoothstep(0.3, 0.6, dot(q / max(rq, 1e-3), -uDir));
        float a = 0.0, b = 0.0;
        for (int k = 0; k < 5; k++) {
          float e1 = (r - uRs[k]) / 0.035, e2 = (rq - uBs[k]) / 0.03;
          a += uAs[k] * exp(-e1 * e1) * exp(-uRs[k] / 5.0);
          b += uBa[k] * exp(-e2 * e2);
        }
        float v = a * cone * smoothstep(0.15, 0.4, r) * (1.0 - smoothstep(length(uHit) - 0.25, length(uHit) + 0.05, r)) + b * back * smoothstep(0.12, 0.25, rq);
        gl_FragColor = vec4(vec3(1.7, 0.22, 0.18) * v, v);
      }`,
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide
  });
  const radioArcs = new T.Mesh(new T.PlaneGeometry(RADIO_HALF * 2, RADIO_HALF * 2), arcMat); radioArcs.renderOrder = 7; radioArcs.frustumCulled = false; world.add(radioArcs);
  const radioRings = [];
  const station = new T.Group(); world.add(station);
  const STATION_POS = V3(-34, 0, 78);
  {
    station.position.copy(STATION_POS); station.rotation.y = 0.6;
    const caseM = std(0x30343a, 0.3, 0.55);
    solid(box(0.7, 0.32, 0.5, 0, 0.16, 0), caseM, station);
    solid(box(0.7, 0.45, 0.04, 0, 0.53, -0.25).rotateX(-0.25), caseM, station);
    const scr = new T.Mesh(new T.PlaneGeometry(0.58, 0.34), new T.MeshBasicMaterial({ color: new T.Color(0.5, 1.1, 1.6), toneMapped: false })); scr.position.set(0, 0.53, -0.22); scr.rotation.x = -0.25; station.add(scr);
    solid(cyl(0.12, 0.12, 0.16, 18, 0.5, 0.08, 0.1), std(0xd8dadc, 0.05, 0.5), station);
  }

  // ---------------------------------------------------------------- energy streaks (X-ray: coupling through the gaps)
  const streakMat = new T.ShaderMaterial({
    vertexShader: 'attribute vec4 aCol; varying vec2 vUv; varying vec4 vCol; void main(){ vUv = uv; vCol = aCol; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec2 vUv; varying vec4 vCol; void main(){ float along = pow(clamp(vUv.x, 0.0, 1.0), 1.6) * (1.0 - smoothstep(0.8, 1.0, vUv.x)); float across = 1.0 - abs(vUv.y * 2.0 - 1.0); across *= across; float a = along * across * vCol.a; if (a < 0.003) discard; gl_FragColor = vec4(vCol.rgb * a, a); }',
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide
  });
  const streakGeo = new T.BufferGeometry();
  streakGeo.setAttribute('position', new T.Float32BufferAttribute([-1, -0.5, 0, 0, -0.5, 0, 0, 0.5, 0, -1, 0.5, 0, -1, 0, -0.5, 0, 0, -0.5, 0, 0, 0.5, -1, 0, 0.5], 3));
  streakGeo.setAttribute('uv', new T.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1], 2));
  streakGeo.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  const NSTREAK = 300, stCol = new T.InstancedBufferAttribute(new Float32Array(NSTREAK * 4), 4); stCol.setUsage(T.DynamicDrawUsage);
  const stGeo = streakGeo.clone(); stGeo.setAttribute('aCol', stCol);
  const streaks = new T.InstancedMesh(stGeo, streakMat, NSTREAK); streaks.instanceMatrix.setUsage(T.DynamicDrawUsage); streaks.frustumCulled = false; streaks.renderOrder = 10; hero.add(streaks);
  // entry paths in hero-local coordinates: antenna → cable → flight controller; seams → stack; motor shafts → leads → ESC
  const PATHS = [];
  const addPath = (pts, w) => { const c = new T.CatmullRomCurve3(pts.map(p => V3(...p))); PATHS.push({ pts: c.getSpacedPoints(80), w }); };
  addPath([[0.018, 0.16, -0.055], [0.018, 0.1, -0.055], [0.018, 0.064, -0.055], [0.018, 0.04, -0.055], [0.012, 0.03, -0.03], [0.004, FC_Y + 0.002, -0.006], [0, FC_Y + 0.002, 0]], 1.4);
  addPath([[-0.14, 0.03, 0.01], [-0.06, 0.024, 0.006], [-0.039, 0.02, 0.004], [-0.015, FC_Y + 0.001, 0.003], [0, FC_Y + 0.002, 0]], 1.0);
  addPath([[0.14, 0.026, -0.02], [0.06, 0.02, -0.012], [0.039, 0.016, -0.01], [0.012, ESC_Y + 0.002, -0.004], [0, ESC_Y + 0.002, 0]], 1.0);
  addPath([[0.0, 0.03, 0.2], [0.0, 0.026, 0.11], [0.0, 0.024, 0.064], [0.0, FC_Y + 0.001, 0.012], [0, FC_Y + 0.002, 0]], 0.9);
  MOTORS.forEach(m => {
    const dir = V3(-m.x, 0, -m.z).normalize(), L = Math.hypot(m.x, m.z);
    addPath([[m.x, 0.11, m.z], [m.x, 0.05, m.z], [m.x, 0.036, m.z], [m.x, 0.012, m.z], [m.x + dir.x * 0.04, 0.007, m.z + dir.z * 0.04], [m.x + dir.x * 0.1, 0.009, m.z + dir.z * 0.1], [m.x + dir.x * (L - 0.016), ESC_Y + 0.002, m.z + dir.z * (L - 0.016)]], 1.1);
  });
  const ENTRY = { antenna: V3(0.018, 0.095, -0.055) };

  // ---------------------------------------------------------------- shots, clocks and the story
  const HOOK_WAVE = 0.12, WAVE_V = 120, WAVE_C = V3(0, 1.5, -3);
  const REW0 = 2.0, REW1 = 2.6, END_CUT = 25.6;
  const isHook = t => t < REW0 || t >= 24.0;
  const hookH = t => (t >= 24.0 ? t - DURATION : t);
  const Z0_HOOK = 17, Z0_SWARM = 30;
  const hookHit = (() => { const a = []; for (let i = 0; i < NSW; i++) a.push(HOOK_WAVE + swAlive(i, 0.4, Z0_HOOK).distanceTo(WAVE_C) / WAVE_V); return a; })();
  // beat 05: the cone sweeps left to right; a drone drops when the cone's edge reaches it
  const SWEEP_A = 0.45, SWEEP_B = 1.5, SW_AZ0 = deg(-24), SW_AZ1 = deg(24);
  const sweepAz = c => lerp(SW_AZ0, SW_AZ1, smooth(span(c, SWEEP_A, SWEEP_B)));
  const swarmHit = (() => {
    const a = [];
    for (let i = 0; i < NSW; i++) {
      const p = swAlive(i, 1.0, Z0_SWARM), az = Math.atan2(p.x - PANEL_C.x, p.z - PANEL_C.z) - deg(8.5);
      let c = SWEEP_A + 0.05;
      if (az > sweepAz(c)) { let lo = SWEEP_A, hi = SWEEP_B; for (let k = 0; k < 30; k++) { const mid = (lo + hi) / 2; if (sweepAz(mid) >= az) hi = mid; else lo = mid; } c = hi; }
      a.push(c + rand(i, 70) * 0.04);
    }
    return a;
  })();
  const c5 = monotone([20.0, 20.6, 23.2, 24.0], [0.0, 0.42, 1.5, 2.15]);
  const xrayAmt = t => smooth(span(t, 10.0, 10.45)) * (1 - smooth(span(t, 19.9, 20.0)));
  const hookC = t => isHook(t) ? hookH(t) : (t < REW1 ? lerp(2.0, -0.5, 1 - Math.pow(1 - smooth(span(t, REW0, REW1 - 0.05)), 2)) : null);

  const shake = (t, amp) => [amp * (Math.sin(t * 37.1) + 0.6 * Math.sin(t * 53.7 + 1.3)), amp * (Math.sin(t * 41.9 + 2.1) + 0.6 * Math.sin(t * 61.3 + 0.2)), amp * 0.7 * Math.sin(t * 47.3 + 0.9)];
  const HERO1 = u => V3(-1.1 + 0.75 * u, 2.85 + 0.05 * Math.sin(u * 2.3), 7.4);
  const HERO_X = V3(60, 18, -40);
  let camNear = 0.05, camFar = 3000;
  function setCam(pos, look, near, far, sk) {
    camera.position.copy(pos).add(V3(sk[0], sk[1], sk[2]));
    camera.lookAt(look.x + sk[0] * 0.3, look.y + sk[1] * 0.3, look.z);
    if (near !== camNear || far !== camFar) { camNear = near; camFar = far; camera.near = near; camera.far = far; camera.updateProjectionMatrix(); }
    return look;
  }
  const orbit = (look, az, el, d) => look.clone().add(V3(d * Math.sin(az) * Math.cos(el), d * Math.sin(el), d * Math.cos(az) * Math.cos(el)));

  // ---------------------------------------------------------------- UI
  const $ = id => document.getElementById(id);
  const ui = { step: $('step'), caption: $('caption'), sub: $('sub'), teaser: $('teaser'), badge: $('badge'), timer: $('timer'), timerV: $('timerV'), rewind: $('rewind'), blocked: $('blocked'), stage: $('vStage'), drones: $('vDrones'), beam: $('vBeam'), status: $('vStatus') };
  const SCENES = [
    { a: 0, b: 2.0, step: '', huge: true, cap: 'You can’t jam this drone.' },
    { a: 2.0, b: 2.6, step: '', cap: '' },
    { a: 2.6, b: 6.0, step: '01 · Why jamming fails', cap: 'Jammers cut radio links. This drone has none.' },
    { a: 6.0, b: 10.0, step: '02 · The weapon', cap: 'A flat panel shapes an invisible microwave beam.' },
    { a: 10.0, b: 15.0, step: '03 · Inside', x: true, cap: 'The energy sneaks in through tiny gaps.' },
    { a: 15.0, b: 20.0, step: '04 · Overload', x: true, cap: 'Surges overload the circuits. The motors stop.' },
    { a: 20.0, b: 24.0, step: '05 · The swarm', cap: 'No shot. No signal. Power gone.' },
    { a: 24.0, b: END_CUT, step: '', big: true, cap: 'Silent. Invisible. Wide.' },
    { a: END_CUT, b: 26.5, step: '', huge: true, cap: 'You can’t jam this drone.' }
  ];
  const setText = (el, s) => { if (el.textContent !== s) el.textContent = s; };
  let anchors = {};
  const CALLOUTS = [
    { text: 'FIBER-OPTIC LINE', on: [[3.0, 5.7]], at: () => anchors.fiber, dx: -70, dy: 60 },
    { text: 'FLAT PANEL', on: [[6.4, 8.1]], at: () => anchors.panel, dx: -60, dy: -70 },
    { text: 'MICROWAVE BEAM', sub: 'VISUALIZATION · INVISIBLE IN REALITY', on: [[8.3, 9.95]], at: () => anchors.beam, dx: -40, dy: 70 },
    { text: 'ANTENNA', on: [[11.0, 12.9]], at: () => anchors.antenna, dx: -80, dy: -40 },
    { text: 'CIRCUIT BOARD', on: [[15.7, 17.3]], at: () => anchors.board, dx: -70, dy: 60 },
    { text: 'MOTOR CONTROLLER', on: [[17.4, 19.2]], at: () => anchors.esc, dx: -50, dy: 70 }
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
      cx = clamp(cx, 20, 340 - w); cy = clamp(cy, capBottom, 448 - h);
      c.el.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
      c.tag.style.transform = `translate(${(cx - px).toFixed(1)}px, ${(cy - py).toFixed(1)}px)`;
      const ex = clamp(px, cx, cx + w), ey = clamp(py, cy, cy + h);
      const lx = ex - px, ly = ey - py, len = Math.hypot(lx, ly);
      c.line.style.width = len.toFixed(1) + 'px';
      c.line.style.transform = `rotate(${Math.atan2(ly, lx)}rad)`;
    });
  }

  // ---------------------------------------------------------------- per-frame update
  const vA = new T.Vector3(), vB = new T.Vector3(), qa = new T.Quaternion(), X1 = V3(1, 0, 0);
  function update(t) {
    t = clamp(t, 0, DURATION - 1e-4);
    const X = xrayAmt(t);
    glows.reset(); dust.reset();
    shells.forEach(sh => { sh.solid.visible = X < 0.995; sh.ghost.visible = X > 0.005; sh.solid.castShadow = X < 0.5; });
    fadeMats.forEach(m => { m.transparent = X > 0.005; m.opacity = 1 - X; m.depthWrite = X < 0.6; });
    xrayMats.forEach(m => { m.uniforms.uOpacity.value = X; });
    bgMat.uniforms.uX.value = X; rim.intensity = 1.2 * X;
    world.visible = X < 0.5; field.visible = X < 0.5;
    scene.fog.color.copy(HAZE).lerp(NAVY, X);

    let active = 49, stageTxt = '', beamTxt = '', statusTxt = '', look;
    let beamOn = 0, beamAz = 0, beamEl = deg(4), shakeAmt = 0;
    const h = hookC(t);
    // swarm: hook / rewind / final share the hook clock; beat 05 runs its own slowed clock
    if (h !== null) {
      active = drawSwarm(h, i => hookHit[i], Z0_HOOK, true, true);
      const wr = (h - HOOK_WAVE) * WAVE_V;
      ringMat.uniforms.uR.value = Math.max(0, wr); ringMat.uniforms.uC.value.set(WAVE_C.x, WAVE_C.z);
      ringMat.uniforms.uAmt.value = h > HOOK_WAVE ? 0.85 : 0;
      waveShell.visible = h > HOOK_WAVE && wr < 80; waveShell.position.set(WAVE_C.x, 0, WAVE_C.z); waveShell.scale.setScalar(Math.max(0.1, wr));
      shellMatW.uniforms.uAmt.value = 0.9 * (1 - smooth(span(wr, 40, 80))); shellMatW.uniforms.uT.value = h;
      ring.visible = h > HOOK_WAVE;
      const hs = h > HOOK_WAVE ? Math.exp(-(h - HOOK_WAVE) / 0.35) : 0;
      shakeAmt = 0.035 * hs + 0.006;
      flashMat.uniforms.uAmt.value = 0.12 * Math.exp(-Math.pow((h - HOOK_WAVE - 0.03) / 0.05, 2));
      look = setCam(V3(0.4, 1.3, -1.5), V3(0, 4.0, 24), 0.05, 3000, shake(h, shakeAmt));
      stageTxt = h < HOOK_WAVE ? 'INBOUND' : 'BEAM HIT'; beamTxt = h < HOOK_WAVE ? 'READY' : 'ON';
      statusTxt = active === 49 ? 'FLYING' : active > 0 ? 'DROPPING' : 'ALL DOWN';
    } else if (t >= 20.0) {
      const c = c5(t);
      active = drawSwarm(c, i => swarmHit[i], Z0_SWARM, true, true);
      ring.visible = waveShell.visible = false;
      beamOn = 0.6 * smooth(span(c, SWEEP_A - 0.1, SWEEP_A)); beamAz = sweepAz(c); beamEl = deg(5);
      const fire = Math.exp(-Math.max(0, c - SWEEP_A + 0.1) / 0.5) * (c > SWEEP_A - 0.1 ? 1 : 0);
      shakeAmt = 0.06 * fire + 0.012 * beamOn;
      flashMat.uniforms.uAmt.value = 0.06 * Math.exp(-Math.pow((c - SWEEP_A + 0.08) / 0.06, 2));
      const k = smooth(span(t, 20.0, 24.0));
      look = setCam(V3(lerp(0.2, 0.45, k), lerp(4.6, 4.4, k), lerp(-5.6, -5.0, k)), V3(lerp(0.4, 0.7, k), 3.35, 26), 0.05, 3000, shake(t * 0.8, shakeAmt));
      stageTxt = 'SWARM'; beamTxt = beamOn > 0.3 ? 'SWEEP' : 'READY'; statusTxt = active === 49 ? 'INBOUND' : active > 0 ? 'DROPPING' : 'ALL DOWN';
    } else {
      drawSwarm(0, () => Infinity, Z0_HOOK, false, false);
      ring.visible = waveShell.visible = false;
      flashMat.uniforms.uAmt.value = 0;
    }
    swarmFibers.m.uniforms.uRes.value.set(renderer.domElement.width, renderer.domElement.height);
    heroFiber.m.uniforms.uRes.value.set(renderer.domElement.width, renderer.domElement.height);

    // hero drone (beats 01, 03, 04)
    const heroOn = (t >= REW1 && t < 6.0) || (t >= 10.0 && t < 20.0);
    hero.visible = heroOn; heroFiber.mesh.visible = heroOn && t < 6.0;
    jammer.visible = station.visible = t >= REW1 && t < 6.0;
    radioArcs.visible = false;
    ui.blocked.style.opacity = 0;
    trailer.visible = (t >= 6.0 && t < 10.0) || (t >= 20.0 && t < 24.0);
    let spin = 1, ledLit = 1, surge = 0, coupling = 0;
    if (heroOn && t < 6.0) {
      // 01 · why jamming fails: fiber-guided drone, a jammer firing red radio waves that find nothing to break
      const u = t - REW1, P = HERO1(u);
      hero.position.copy(P); hero.quaternion.setFromEuler(eTmp.set(deg(12), PI / 2, 0.04 * Math.sin(u * 1.7), 'YXZ'));
      hero.updateMatrixWorld(true);
      const spool = SPOOL_LOCAL.clone().applyMatrix4(hero.matrixWorld);
      const fpts = fiberPath(spool, V3(-1, 0, 0), STATION_POS.clone().add(V3(0.4, 0.15, 0.1)), 48, 26);
      heroFiber.set(0, fpts); heroFiber.commit();
      const k1 = smooth(span(u, 1.05, 1.9));
      const closeCam = orbit(P, deg(222), deg(14), 1.35), wideCam = V3(0.6 + 0.1 * u, 1.2, 0.0);
      const camP = closeCam.clone().lerp(wideCam, k1), lookP = P.clone().add(V3(0.05, -0.02, 0)).lerp(V3(0.1 + 0.25 * (P.x + 1.1), 2.25, 7.5), k1);
      look = setCam(camP, lookP, 0.02, 3000, shake(t, 0.002));
      camera.updateMatrixWorld();
      // radio arcs from the jammer: they reach the drone and glance off, because there is no radio link to jam
      const ARC_V = 6.5, A_EVERY = 0.36, A_START = 1.55, right = V3(1, 0, 0).applyQuaternion(camera.quaternion), up = V3(0, 1, 0).applyQuaternion(camera.quaternion);
      const rel = P.clone().sub(JAM_SRC), hit2 = new T.Vector2(rel.dot(right), rel.dot(up)), dHero = hit2.length();
      radioArcs.visible = u > A_START; radioArcs.position.copy(JAM_SRC); radioArcs.quaternion.copy(camera.quaternion);
      arcMat.uniforms.uHit.value.copy(hit2); arcMat.uniforms.uDir.value.copy(hit2).normalize();
      let glance = 0;
      for (let k = 0; k < 5; k++) {
        const age = u - A_START - k * A_EVERY, rad = age * ARC_V;
        arcMat.uniforms.uRs.value[k] = rad; arcMat.uniforms.uAs.value[k] = age > 0 ? 1.0 : 0;
        const ba = age - dHero / ARC_V;
        arcMat.uniforms.uBs.value[k] = Math.max(0, ba) * ARC_V * 0.55; arcMat.uniforms.uBa.value[k] = ba > 0 ? 0.8 * Math.exp(-ba / 0.25) : 0;
        if (ba > 0) glance = Math.max(glance, Math.exp(-ba / 0.12));
      }
      glows.push(P, 1.8 * glance, 0.2 * glance, 0.16 * glance, 0.45);
      glows.push(STATION_POS.clone().add(V3(0, 0.55, 0)), 0.5, 1.0, 1.5, 1.6);
      const firstHit = A_START + dHero / ARC_V;
      const [bx, by] = toScreenLater(P);
      ui.blocked.style.opacity = (smooth(span(u, firstHit, firstHit + 0.2)) * (1 - smooth(span(t, 5.75, 5.95)))).toFixed(3);
      ui.blocked.style.transform = `translate(${clamp(bx - 50, 24, 230).toFixed(1)}px, ${clamp(by - 52, 180, 440).toFixed(1)}px) scale(${(1 + 0.12 * glance).toFixed(3)})`;
      stageTxt = 'JAMMING'; beamTxt = 'OFF'; statusTxt = u < firstHit ? 'FIBER LINK' : 'NO EFFECT';
      anchors.fiber = fpts[5];
    } else if (heroOn) {
      // 03 · inside / 04 · overload: X-ray, the beam washes over one drone
      hero.position.copy(HERO_X).add(V3(0, 0.03 * Math.sin(t * 1.3), 0)); hero.quaternion.setFromEuler(eTmp.set(deg(4), 0, deg(2) * Math.sin(t * 0.9), 'YXZ'));
      hero.updateMatrixWorld(true);
      coupling = smooth(span(t, 10.5, 11.2)) * (1 - smooth(span(t, 18.6, 19.4)));
      surge = smooth(span(t, 15.0, 15.6)) * (1 - smooth(span(t, 18.4, 19.0)));
      spin = 1 - smooth(span(t, 18.6, 19.7));
      ledLit = t < 17.9 ? 1 : (t < 18.1 ? (Math.floor(t * 40) % 2 ? 1 : 0.2) : 0);
      const W = v => v.clone().applyMatrix4(hero.matrixWorld);
      const fcW = W(V3(0, FC_Y, 0)), escW = W(V3(0, ESC_Y, 0));
      if (t < 15.0) {
        const k = smooth(span(t, 10.0, 15.0));
        look = setCam(orbit(W(V3(0, 0.02, 0)), lerp(deg(38), deg(62), k), lerp(deg(34), deg(40), k), lerp(1.25, 1.05, k)), W(V3(0, 0.025, 0)), 0.01, 200, shake(t, 0.0008));
      } else {
        const kIn = smooth(span(t, 15.0, 15.9)), kEsc = smooth(span(t, 17.1, 17.9)), kOut = smooth(span(t, 18.6, 19.8));
        const tgt = fcW.clone().lerp(W(V3(0.0105, ESC_Y + 0.001, -0.0105)), kEsc).lerp(W(MOTORS[0].clone().setY(0.02)), kOut);
        const d = lerp(lerp(1.05, 0.105, kIn), 0.5, kOut) * (1 - 0.1 * smooth(span(t, 15.9, 17.0)));
        const el = lerp(lerp(deg(40), deg(58), kIn) - deg(26) * kEsc, deg(30), kOut);
        const az = lerp(deg(62), deg(30), kIn) + deg(12) * smooth(span(t, 15.9, 17.1)) + deg(55) * kEsc - deg(40) * kOut;
        look = setCam(orbit(tgt, az, el, d), tgt, 0.004, 120, shake(t, 0.00025 * (1 - kOut)));
      }
      stageTxt = t < 15 ? 'COUPLING' : 'OVERLOAD'; beamTxt = 'ON';
      statusTxt = t < 15 ? 'ENERGY IN' : t < 17.0 ? 'SURGE' : t < 18.6 ? 'CHIPS DOWN' : 'MOTORS OFF';
      // the beam's wavefronts sweeping through, drawn as streaks flowing inward through the gaps
      for (let i = 0; i < NSTREAK; i++) {
        const P = PATHS[i % PATHS.length], n = P.pts.length;
        const ph = (rand(i, 81) + t * (0.45 + 0.25 * rand(i, 82))) % 1, f = ph * (n - 1), j = Math.min(n - 2, Math.floor(f));
        vA.copy(P.pts[j]).lerp(P.pts[j + 1], f - j);
        const back = Math.max(0, j - 3); vB.copy(P.pts[back]);
        const dir = vA.clone().sub(vB), len = Math.max(1e-4, dir.length());
        qa.setFromUnitVectors(X1, dir.divideScalar(len));
        mtx.compose(vA, qa, V3(len * 1.2, 0.0016 * P.w, 0.0016 * P.w)); streaks.setMatrixAt(i, mtx);
        const a = coupling * smooth(span(ph, 0.0, 0.12)) * (1 - smooth(span(ph, 0.86, 1.0))) * (0.6 + 0.4 * rand(i, 83));
        stCol.setXYZW(i, 1.3, 1.6, 3.0, a);
      }
      streaks.instanceMatrix.needsUpdate = stCol.needsUpdate = true;
      anchors.antenna = W(ENTRY.antenna); anchors.board = W(V3(-0.011, FC_Y + 0.001, 0.011)); anchors.esc = W(V3(0.0112, ESC_Y + 0.0016, -0.0112));
    }
    streaks.visible = heroOn && t >= 10.0;
    boardMats.forEach(m => { m.uniforms.uSurge.value = surge; m.uniforms.uTime.value = t; });
    chipList.forEach(c => {
      const pre = smooth(span(t, c.failAt - 0.9, c.failAt)) * surge, fl = Math.exp(-Math.pow((t - c.failAt) / 0.07, 2));
      c.mat.emissiveIntensity = t < c.failAt ? 0.3 * pre + 6.0 * fl : 6.0 * fl;
      c.mat.color.setRGB(t > c.failAt + 0.1 ? 0.004 : 0.008, t > c.failAt + 0.1 ? 0.004 : 0.008, t > c.failAt + 0.1 ? 0.005 : 0.01);
    });
    heroParts.motors.forEach((m, k) => {
      const dirn = k % 2 ? -1 : 1;
      m.prop.rotation.y = dirn * (t * 9.1 * (spin > 0.02 ? spin : 0) + k + (1 - spin) * 3.0);
      m.disc.visible = spin > 0.4 && X < 0.5; m.disc.material.opacity = 0.2 * spin;
    });
    if (heroOn && X < 0.5) LEDS.forEach((L, k) => { const p = heroLeds[k].clone().applyMatrix4(hero.matrixWorld); glows.push(p, L.c[0] * ledLit, L.c[1] * ledLit, L.c[2] * ledLit, 0.05); });
    if (heroOn && X > 0.5 && ledLit > 0) LEDS.forEach((L, k) => { const p = heroLeds[k].clone().applyMatrix4(hero.matrixWorld); glows.push(p, L.c[0] * 0.5 * ledLit, L.c[1] * 0.5 * ledLit, L.c[2] * 0.5 * ledLit, 0.02); });

    // 02 · the weapon: panel tiles phase up, the cone forms and sweeps with no moving parts
    if (t >= 6.0 && t < 10.0) {
      const on = smooth(span(t, 7.1, 7.6));
      beamOn = on; beamAz = deg(14) * Math.sin((t - 7.3) * 1.4) * smooth(span(t, 7.6, 8.4)); beamEl = deg(5);
      tileMat.uniforms.uIdle.value = 1; tileMat.uniforms.uAmt.value = smooth(span(t, 6.3, 7.1));
      if (t < 8.2) look = setCam(V3(3.9, 2.0, 3.2).lerp(V3(3.5, 2.2, 2.7), smooth(span(t, 6.0, 8.2))), V3(0.6, 2.45, 0.2), 0.05, 3000, shake(t, 0.003 + 0.02 * Math.exp(-Math.max(0, t - 7.2) / 0.4) * (t > 7.2 ? 1 : 0)));
      else { const k = smooth(span(t, 8.2, 10.0)); look = setCam(V3(lerp(-2.7, -2.2, k), lerp(6.4, 6.8, k), lerp(-12.5, -11.6, k)), V3(0.8, 1.6, 16), 0.05, 3000, shake(t, 0.004)); }
      stageTxt = 'STEERING'; beamTxt = on > 0.5 ? 'SWEEP' : 'OFF'; statusTxt = 'NO MOVING PARTS';
      anchors.panel = PANEL_C.clone().add(V3(-0.8, 0.85, 0.1)); anchors.beam = PANEL_C.clone().add(V3(Math.sin(beamAz) * 16, 1.4, Math.cos(beamAz) * 16));
    } else if (t >= 20.0 && t < 24.0) {
      tileMat.uniforms.uIdle.value = 1; tileMat.uniforms.uAmt.value = beamOn / 0.6;
    } else { tileMat.uniforms.uIdle.value = 0; tileMat.uniforms.uAmt.value = 0; }
    tileMat.uniforms.uTime.value = t;
    setBeam(beamAz, beamEl, beamOn * (X < 0.5 ? 1 : 0), t);
    if (!look) look = V3(0, 2, 10);
    if (t >= REW0 && t < REW1) { stageTxt = 'REWIND'; beamTxt = '—'; statusTxt = '—'; }
    camera.updateMatrixWorld();
    glows.done(); dust.done();

    // lights follow the shot
    sun.target.position.copy(look); sun.position.copy(look).addScaledVector(SUN_DIR, 60);
    fill.target.position.copy(look); fill.position.copy(camera.position).add(V3(0, 2, 0));
    fill.intensity = t >= REW1 && t < 6.0 ? 0.9 : 0.35;
    const scaleShadow = heroOn && t >= 10 ? 0.6 : (t >= 2.6 && t < 6 ? 4 : 16);
    Object.assign(sun.shadow.camera, { left: -scaleShadow, right: scaleShadow, top: scaleShadow, bottom: -scaleShadow }); sun.shadow.camera.updateProjectionMatrix();
    bgMat.uniforms.uInvProj.value.copy(camera.projectionMatrixInverse);
    bgMat.uniforms.uCamWorld.value.copy(camera.matrixWorld);
    vhs.uniforms.uAmt.value = pulse(t, REW0 - 0.04, REW0 + 0.06, REW1 - 0.1, REW1);
    vhs.uniforms.uTime.value = t;
    const hh = hookC(t);
    vhs.uniforms.uHaze.value = hh !== null ? pulse(hh, HOOK_WAVE - 0.02, HOOK_WAVE + 0.06, 0.42, 0.62) : 0;
    vhs.uniforms.uHazeY.value = hh !== null ? clamp((hh - HOOK_WAVE) / 0.35) * 0.75 : 0;
    if (t >= 2.6 && t < 6.0 && anchors.fiber === undefined) anchors.fiber = null;

    // overlay
    const sc = SCENES.find(x => t < x.b) || SCENES[SCENES.length - 1];
    const hard = [0, 24.0, END_CUT];
    const fadeIn = hard.includes(sc.a) ? 1 : smooth(span(t, sc.a, sc.a + 0.25));
    const fadeOut = (sc.b > 26 || sc.b === 2.0 || sc.b === 24.0 || sc.b === END_CUT) ? 1 : 1 - smooth(span(t, sc.b - 0.2, sc.b));
    setText(ui.step, sc.step); ui.step.classList.toggle('x', !!sc.x);
    setText(ui.caption, sc.cap); ui.caption.classList.toggle('huge', !!sc.huge); ui.caption.classList.toggle('big', !!sc.big);
    ui.step.style.opacity = ui.caption.style.opacity = (fadeIn * fadeOut).toFixed(3);
    ui.sub.style.opacity = (t < REW0 ? smooth(span(t, 0.75, 1.05)) : 0).toFixed(3);
    ui.teaser.style.opacity = pulse(t, 13.4, 13.7, 14.8, 15.0).toFixed(3);
    ui.badge.style.opacity = (smooth(span(t, 10.05, 10.4)) * (1 - smooth(span(t, 19.7, 19.95)))).toFixed(3);
    ui.rewind.style.opacity = (t >= REW0 && t < REW1 ? (Math.floor(t * 6) % 2 ? 1 : 0.55) : 0).toFixed(2);
    ui.rewind.style.transform = `translate(0px, ${headBottom() + 6}px)`;
    setText(ui.timerV, String(active));
    ui.timer.classList.toggle('zero', active === 0);
    setText(ui.stage, stageTxt); setText(ui.drones, String(active)); setText(ui.beam, beamTxt); setText(ui.status, statusTxt);
    updateCallouts(t, X);
  }
  function toScreenLater(p) { camera.updateMatrixWorld(); return toScreen(p); }

  // ---------------------------------------------------------------- post: VHS rewind
  const vhs = new T.ShaderPass({
    uniforms: { tDiffuse: { value: null }, uAmt: { value: 0 }, uTime: { value: 0 }, uHaze: { value: 0 }, uHazeY: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uAmt; uniform float uTime; uniform float uHaze; uniform float uHazeY; varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        vec2 uv = vUv;
        if (uHaze > 0.001) {
          float band = exp(-pow(abs(vUv.y - uHazeY) / 0.16, 2.0));
          uv += vec2(sin(vUv.y * 140.0 - uTime * 90.0) * 0.0035, sin(vUv.x * 90.0 + uTime * 70.0) * 0.0025) * uHaze * (0.35 + band);
        }
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

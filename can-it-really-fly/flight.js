/* Can It Really Fly? · NovexDynamics
   Procedural Three.js (r128) scene. Everything on screen is a pure function of the time t (0–27 s):
   window.__render(t) draws one frame, window.__ready turns true once fonts and the first frame are done.
   Units are metres; y is up. The hook's flip happens over five parked vehicles at the origin (the car travels along +x);
   the studio shots sit 70 m away at z = -70. The hook (0–2 s) and the final shot (25–27 s) share one flight clock, so
   the last frame runs straight into the first. Specs on screen are the manufacturer's claims; the air left is illustrative. */
(() => {
  'use strict';
  const T = THREE, PI = Math.PI, TAU = PI * 2;
  const DURATION = 27, G = 9.81;
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

  // ---------------------------------------------------------------- environment + lights (dusk over a dark stage, soft spotlights)
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
  const sun = new T.DirectionalLight(0xffb27a, 0.5); scene.add(sun, sun.target);
  const hemi = new T.HemisphereLight(0x6f72b8, 0x1c1618, 0.5); scene.add(hemi);
  const rim = new T.DirectionalLight(0x7fd8ff, 0); rim.position.set(1, 2, -1.5); scene.add(rim);
  const STUDIO = V3(0, 0, -70);
  const spots = [];
  function spot(pos, target, color, intensity, angle, shadow) {
    const s = new T.SpotLight(color, intensity, 0, angle, 0.85, 1.0);
    s.position.copy(pos); s.target.position.copy(target); scene.add(s, s.target);
    if (shadow) { s.castShadow = true; s.shadow.mapSize.set(2048, 2048); s.shadow.bias = -0.0004; s.shadow.normalBias = 0.02; s.shadow.radius = 4; s.shadow.camera.near = 3; s.shadow.camera.far = 70; }
    spots.push(s); return s;
  }
  spot(V3(-8, 17, -11), V3(0, 2.5, 0), 0xfff1e0, 1.8, 0.62, true);
  spot(V3(10, 14, 9), V3(1, 1, 0), 0xffd8b0, 1.2, 0.6, false);
  spot(STUDIO.clone().add(V3(1.5, 12, 4)), STUDIO.clone().add(V3(0, 0.3, 0)), 0xfff3e6, 1.45, 0.42, true);
  spot(STUDIO.clone().add(V3(-7, 8, -6)), STUDIO.clone().add(V3(0, 0.8, 0)), 0x9ec8ff, 1.7, 0.4, false);
  spot(STUDIO.clone().add(V3(-2, 12, 7)), STUDIO.clone(), 0xffe2c4, 0.9, 0.5, false);
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

  // ---------------------------------------------------------------- materials
  const paint = new T.MeshPhysicalMaterial({ color: new T.Color(0x7a0c12).convertSRGBToLinear(), metalness: 0.55, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.22 });
  const glassM = new T.MeshPhysicalMaterial({ color: new T.Color(0x06070a), metalness: 0.3, roughness: 0.06, clearcoat: 1.0, clearcoatRoughness: 0.03 });
  const rubber = std(0x111214, 0, 0.85), rimM = std(0x6a6e75, 0.9, 0.3), trim = std(0x0c0d0f, 0.4, 0.5), steelM = std(0xb8bdc4, 0.9, 0.28);
  const vesselTex = canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = '#2a2d31'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 32; i++) { x.fillStyle = i % 2 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.18)'; x.fillRect(0, i * 8, w, 4); }
    for (let i = 0; i < 16; i++) { x.fillStyle = 'rgba(255,255,255,0.04)'; x.fillRect(i * 16, 0, 2, h); }
  });
  const vesselM = std(0xffffff, 0.3, 0.45, { map: vesselTex });
  const seatM = std(0x1d1f23, 0.1, 0.7);
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
  const fadeMats = [paint, glassM, rubber, rimM, trim];
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

  // ---------------------------------------------------------------- the stage floor
  const floorTex = canvasTex(1024, 1024, (x, w, h) => {
    x.fillStyle = '#1b1c20'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(${rand(i, 1) < 0.5 ? '12,12,14' : '60,60,64'},${0.05 + rand(i, 2) * 0.08})`; x.beginPath(); x.ellipse(rand(i, 3) * w, rand(i, 4) * h, 20 + rand(i, 5) * 80, 10 + rand(i, 6) * 40, rand(i, 7) * PI, 0, TAU); x.fill(); }
    for (let i = 0; i < 20000; i++) { x.fillStyle = rand(i, 8) < 0.5 ? `rgba(10,10,12,${0.25 + rand(i, 9) * 0.3})` : `rgba(90,90,96,${0.15 + rand(i, 9) * 0.25})`; x.fillRect(rand(i, 10) * w, rand(i, 11) * h, 1 + rand(i, 12) * 2, 1 + rand(i, 13) * 2); }
    x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(0, 0, w, 3); x.fillRect(0, 0, 3, h);
  });
  floorTex.repeat.set(500, 500);
  const floorM = std(0xffffff, 0.0, 0.86, { map: floorTex, envMapIntensity: 0.2 });
  floorM.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vGW;').replace('#include <project_vertex>', '#include <project_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec2 vGW;
      float gh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float gn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(gh(i), gh(i + vec2(1, 0)), f.x), mix(gh(i + vec2(0, 1)), gh(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <map_fragment>', '#include <map_fragment>\nfloat gv = gn(vGW / 40.0) * 0.6 + gn(vGW / 9.0 + 7.0) * 0.4;\ndiffuseColor.rgb *= 0.75 + 0.5 * gv;');
  };
  const floor = new T.Mesh(new T.PlaneGeometry(4000, 4000).rotateX(-PI / 2), floorM); floor.receiveShadow = true; scene.add(floor);
  const world = new T.Group(); scene.add(world);              // exterior-only dressing (vehicles, light cones)
  // soft visible cones under the spotlights
  const coneMat = new T.ShaderMaterial({
    uniforms: { uAmt: { value: 1 } },
    vertexShader: 'varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vP = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying vec3 vP; varying vec3 vN; varying vec3 vV; uniform float uAmt; void main(){ float f = pow(abs(dot(normalize(vN), normalize(vV))), 2.0); float along = clamp(-vP.y, 0.0, 1.0); gl_FragColor = vec4(vec3(1.0, 0.92, 0.8), uAmt * 0.05 * f * (1.0 - 0.6 * along)); }',
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide
  });
  spots.forEach((s, i) => {
    if (i === 1 || i === 4) return;
    const d = s.target.position.clone().sub(s.position), L = d.length() * 1.05, r = Math.tan(s.angle) * L * 0.8;
    const g = new T.CylinderGeometry(0.15, r, 1, 40, 1, true).translate(0, -0.5, 0).scale(1, 1, 1);
    const m = new T.Mesh(g, coneMat); m.scale.set(1, L, 1); m.position.copy(s.position);
    m.quaternion.setFromUnitVectors(V3(0, -1, 0), d.normalize()); m.renderOrder = 4; world.add(m);
  });
  // an X-ray floor grid, so the hover height still reads on the navy background
  const xFloorMat = new T.ShaderMaterial({
    uniforms: { uAmt: { value: 0 } },
    vertexShader: 'varying vec2 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: 'varying vec2 vW; uniform float uAmt; void main(){ vec2 g = abs(fract(vW * 2.0) - 0.5); float l = 1.0 - smoothstep(0.0, 0.03, min(g.x, g.y)); float fade = 1.0 - smoothstep(3.0, 9.0, length(vW - vec2(0.0, -70.0))); gl_FragColor = vec4(vec3(0.3, 0.75, 1.0) * l * fade * uAmt * 0.35, 1.0); }',
    transparent: true, depthWrite: false, blending: T.AdditiveBlending
  });
  const xFloor = new T.Mesh(new T.PlaneGeometry(24, 24).rotateX(-PI / 2), xFloorMat); xFloor.position.copy(STUDIO).setY(0.003); xFloor.renderOrder = 3; scene.add(xFloor);

  // ---------------------------------------------------------------- the five parked vehicles (generic silhouettes, no markings)
  function profileGeo(pts, width, bevel = 0.05) {
    const s = new T.Shape(); s.moveTo(pts[0][0], pts[0][1]); pts.slice(1).forEach(p => s.lineTo(p[0], p[1]));
    const g = new T.ExtrudeGeometry(s, { depth: width - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 6 });
    g.translate(0, 0, -(width - 2 * bevel) / 2); return g;
  }
  const VEH = [
    { w: 1.85, col: 0x3b4250, body: [[-2.35, 0.32], [-2.35, 0.78], [-1.85, 0.96], [-1.05, 1.42], [0.45, 1.45], [1.15, 1.0], [2.3, 0.84], [2.35, 0.45], [2.25, 0.3], [-2.25, 0.3]], glass: [[-1.68, 0.98], [-1.02, 1.37], [0.42, 1.4], [1.05, 1.0]], wheels: [[-1.45, 0.33], [1.45, 0.33]] },
    { w: 1.95, col: 0x55585e, body: [[-2.45, 0.38], [-2.45, 2.1], [-2.3, 2.2], [1.0, 2.2], [1.6, 1.46], [2.4, 1.12], [2.45, 0.5], [2.35, 0.36], [-2.35, 0.36]], glass: [[0.42, 1.3], [0.42, 1.96], [1.0, 2.02], [1.5, 1.42]], wheels: [[-1.6, 0.34], [1.6, 0.34]] },
    { w: 2.5, col: 0x232a3b, body: [[-3.2, 0.55], [-3.2, 1.2], [-1.6, 1.2], [-1.6, 3.6], [-1.4, 3.85], [0.2, 3.85], [0.35, 3.4], [0.5, 2.4], [2.9, 2.15], [3.2, 1.9], [3.2, 0.65], [3.0, 0.5], [-3.0, 0.5]], glass: [[-0.18, 2.55], [-0.18, 3.3], [0.3, 3.3], [0.46, 2.55]], wheels: [[2.2, 0.52], [-1.9, 0.52], [-2.95, 0.52]], stacks: true },
    { w: 2.0, col: 0x2f3a33, body: [[-2.8, 0.5], [-2.8, 1.12], [-0.62, 1.12], [-0.55, 1.88], [0.75, 1.9], [1.35, 1.3], [2.75, 1.18], [2.8, 0.55], [2.7, 0.42], [-2.7, 0.42]], glass: [[-0.46, 1.2], [-0.46, 1.82], [0.72, 1.84], [1.25, 1.26]], wheels: [[-1.8, 0.42], [1.8, 0.42]] },
    { w: 1.9, col: 0x4a403a, body: [[-2.3, 0.4], [-2.3, 1.02], [-2.12, 1.6], [0.3, 1.7], [1.2, 1.16], [2.25, 0.96], [2.3, 0.5], [2.2, 0.38], [-2.2, 0.38]], glass: [[-2.08, 1.12], [-1.97, 1.56], [0.26, 1.65], [1.1, 1.16]], wheels: [[-1.4, 0.38], [1.4, 0.38]] }
  ];
  const vehicles = new T.Group(); world.add(vehicles);
  {
    const gap = 0.75, total = VEH.reduce((a, v) => a + v.w, 0) + gap * (VEH.length - 1);
    let x = -total / 2;
    VEH.forEach((v, i) => {
      const g = new T.Group(); g.position.set(x + v.w / 2, 0, (i % 2 ? 0.35 : -0.25)); g.rotation.y = -PI / 2; vehicles.add(g);
      solid(profileGeo(v.body, v.w), std(v.col, 0.35, 0.55), g);
      solid(profileGeo(v.glass, v.w + 0.04, 0.02), std(0x07080b, 0.4, 0.15), g);
      v.wheels.forEach(([wx, r]) => [-1, 1].forEach(s => solid(new T.CylinderGeometry(r, r, 0.26, 24).rotateX(PI / 2).translate(wx, r, s * (v.w / 2 - 0.1)), rubber, g)));
      if (v.stacks) [-1, 1].forEach(s => solid(cyl(0.07, 0.07, 3.2, 12, -1.5, 2.6, s * 1.0), steelM, g));
      v.x = x + v.w / 2; x += v.w + gap;
    });
  }

  // ---------------------------------------------------------------- the hypercar (local: +x forward, y up, ground contact at y = 0)
  const CG = 0.55;
  const car = new T.Group(); scene.add(car);
  const carBody = new T.Group(); carBody.position.y = -CG; car.add(carBody);
  const bodyGeo = (() => {
    const s = new T.Shape();
    s.moveTo(-2.14, 0.36); s.lineTo(-1.96, 0.26);
    s.absarc(-1.38, 0.26, 0.48, PI, 0, true);
    s.lineTo(0.9, 0.26);
    s.absarc(1.38, 0.26, 0.48, PI, 0, true);
    s.lineTo(2.02, 0.26);
    s.quadraticCurveTo(2.23, 0.28, 2.22, 0.41);
    s.quadraticCurveTo(1.7, 0.6, 0.72, 0.8);
    s.lineTo(-1.55, 0.86);
    s.quadraticCurveTo(-1.95, 0.86, -2.14, 0.76);
    s.lineTo(-2.14, 0.36);
    const g = new T.ExtrudeGeometry(s, { depth: 1.72, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.08, bevelSegments: 5, curveSegments: 28 });
    g.translate(0, 0, -0.86);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, p.getZ(i) * (1 - 0.16 * smooth((x - 1.3) / 0.9) - 0.06 * smooth((y - 0.62) / 0.22) - 0.06 * smooth((0.44 - y) / 0.16))); }
    g.computeVertexNormals(); return g;
  })();
  const canopyGeo = (() => {
    const s = new T.Shape();
    s.moveTo(0.8, 0.78); s.quadraticCurveTo(0.25, 1.1, -0.2, 1.14); s.lineTo(-0.8, 1.13); s.quadraticCurveTo(-1.35, 1.08, -1.75, 0.84); s.lineTo(-1.75, 0.78); s.lineTo(0.8, 0.78);
    const g = new T.ExtrudeGeometry(s, { depth: 1.0, bevelEnabled: true, bevelThickness: 0.16, bevelSize: 0.08, bevelSegments: 5, curveSegments: 24 });
    g.translate(0, 0, -0.5);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setZ(i, p.getZ(i) * (1 - 0.2 * smooth((y - 0.9) / 0.24))); }
    g.computeVertexNormals(); return g;
  })();
  part(bodyGeo, paint, xShell, carBody);
  part(canopyGeo, glassM, xShell, carBody);
  const lightMat = (c) => new T.MeshBasicMaterial({ color: new T.Color(...c), toneMapped: false });
  const carLights = [solid(box(0.03, 0.035, 1.42, 2.18, 0.47, 0), lightMat([2.2, 2.25, 2.5]), carBody), solid(box(0.03, 0.045, 1.6, -2.15, 0.7, 0), lightMat([3.0, 0.16, 0.12]), carBody)];
  [-1, 1].forEach(sg => { part(box(0.5, 0.15, 0.03, -0.72, 0.5, sg * 0.975), trim, xParts, carBody); });
  for (let i = 0; i < 5; i++) part(box(0.35, 0.12, 0.02, -2.0, 0.33, -0.6 + i * 0.3), trim, xParts, carBody);
  const wheels = [[1.38, 0.84], [1.38, -0.84], [-1.38, 0.84], [-1.38, -0.84]].map(([x, z]) => {
    const g = new T.Group(); g.position.set(x, 0.36, z); carBody.add(g);
    part(new T.CylinderGeometry(0.36, 0.36, 0.3, 36).rotateX(PI / 2), rubber, xParts, g);
    const rimG = merge([new T.CylinderGeometry(0.255, 0.255, 0.305, 28).rotateX(PI / 2).toNonIndexed()].concat([...Array(10)].map((_, k) => new T.BoxGeometry(0.2, 0.03, 0.02).translate(0.13, 0, 0.16 * Math.sign(z)).rotateZ(k * TAU / 10).toNonIndexed())));
    part(rimG, rimM, xParts, g);
    return g;
  });
  // ten nozzles: six facing down along the sills, two out the back, two out the front (positions are illustrative)
  const NOZ = [
    [2.02, 0.27, 0.7, 0, -1, 0], [2.02, 0.27, -0.7, 0, -1, 0], [0.15, 0.27, 0.86, 0, -1, 0], [0.15, 0.27, -0.86, 0, -1, 0], [-2.0, 0.29, 0.7, 0, -1, 0], [-2.0, 0.29, -0.7, 0, -1, 0],
    [-2.15, 0.48, 0.42, -1, 0, 0], [-2.15, 0.48, -0.42, -1, 0, 0], [2.2, 0.35, 0.48, 1, 0, 0], [2.2, 0.35, -0.48, 1, 0, 0]
  ].map(a => ({ p: V3(a[0], a[1], a[2]), d: V3(a[3], a[4], a[5]) }));
  const nozMat = std(0x8d939b, 0.9, 0.3);
  NOZ.forEach(n => {
    const g = new T.Group(); g.position.copy(n.p); g.quaternion.setFromUnitVectors(V3(0, 1, 0), n.d); carBody.add(g);
    solid(new T.CylinderGeometry(0.05, 0.035, 0.07, 18, 1, true).translate(0, -0.02, 0), nozMat, g);
    solid(new T.TorusGeometry(0.05, 0.01, 8, 20).rotateX(PI / 2), nozMat, g);
    n.g = g;
  });

  // ---------------------------------------------------------------- inside: two pressure vessels, air lines, valves (solid in the X-ray)
  const inside = new T.Group(); carBody.add(inside);
  const VESS = [{ x: 0.62, y: 0.53 }, { x: -0.82, y: 0.58 }];
  const VR = 0.27, VL = 0.95;
  VESS.forEach(v => {
    const g = new T.Group(); g.position.set(v.x, v.y, 0); inside.add(g);
    solid(new T.CylinderGeometry(VR, VR, VL, 32).rotateX(PI / 2), vesselM, g);
    [-1, 1].forEach(sg => {
      solid(new T.SphereGeometry(VR, 32, 16, 0, TAU, 0, PI / 2).rotateX(sg * PI / 2).translate(0, 0, sg * VL / 2), vesselM, g);
      solid(new T.CylinderGeometry(0.045, 0.045, 0.08, 16).rotateX(PI / 2).translate(0, 0, sg * (VL / 2 + VR + 0.02)), steelM, g);
    });
    v.g = g;
  });
  [-1, 1].forEach(sg => {
    solid(box(0.42, 0.06, 0.4, -0.3, 0.33, sg * 0.36), seatM, inside);
    solid(box(0.08, 0.5, 0.4, -0.52, 0.6, sg * 0.36).rotateZ(0), seatM, inside);
  });
  // flow along the lines: bright slugs running from the vessel to the nozzle while the valve is open
  const lineMats = [], valveMats = [], LINES = [];
  NOZ.forEach((n, k) => {
    const v = k < 4 || k >= 8 ? VESS[0] : VESS[1], sz = Math.sign(n.p.z) || 1;
    const boss = V3(v.x, v.y, sz * (VL / 2 + VR + 0.05));
    const valve = n.p.clone().add(V3(-0.16 * Math.sign(n.d.x || 0) * (n.d.x ? 1 : 0), n.d.y ? 0.1 : 0, -sz * (n.d.y ? 0.12 : 0.02)));
    const pts = [boss, boss.clone().add(V3(0, -0.12, sz * 0.03)), boss.clone().lerp(valve, 0.5).setY(Math.min(boss.y, valve.y) + 0.05), valve, n.p.clone().addScaledVector(n.d, -0.02)];
    const m = new T.ShaderMaterial({
      uniforms: { uFlow: { value: 0 }, uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying vec2 vUv; uniform float uFlow; uniform float uTime; void main(){ float s = smoothstep(0.55, 0.95, fract(vUv.x * 7.0 - uTime * 3.2)); gl_FragColor = vec4(vec3(0.45, 0.55, 0.62) * 0.6 + vec3(0.8, 1.7, 2.4) * s * uFlow, 1.0); }'
    });
    lineMats.push(m);
    solid(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 48, 0.017, 8, false), m, inside);
    const vm = new T.MeshBasicMaterial({ color: new T.Color(0.25, 0.05, 0.05), toneMapped: false }); valveMats.push(vm);
    const vg = new T.Group(); vg.position.copy(valve); inside.add(vg);
    solid(box(0.08, 0.06, 0.06), std(0x5c6168, 0.7, 0.4), vg); solid(cyl(0.028, 0.028, 0.07, 14, 0, 0.06, 0), std(0x2b2e33, 0.5, 0.5), vg);
    solid(new T.TorusGeometry(0.03, 0.008, 8, 18).rotateX(PI / 2).translate(0, 0.1, 0), vm, vg);
    LINES.push({ mid: pts[2].clone(), valve: valve.clone() });
  });
  // the gas inside each vessel, drawn as bright motes that thin out as the air leaves
  const MOTES = 150;
  const moteMesh = new T.InstancedMesh(new T.SphereGeometry(0.012, 6, 4), new T.MeshBasicMaterial({ color: new T.Color(0.7, 1.8, 2.6), toneMapped: false }), MOTES * 2);
  moteMesh.instanceMatrix.setUsage(T.DynamicDrawUsage); moteMesh.frustumCulled = false; inside.add(moteMesh);
  const moteHome = [...Array(MOTES * 2)].map((_, i) => { const v = VESS[i < MOTES ? 0 : 1]; const a = rand(i, 61) * TAU, r = Math.sqrt(rand(i, 62)) * (VR - 0.04); return V3(v.x + Math.cos(a) * r, v.y + Math.sin(a) * r, (rand(i, 63) - 0.5) * (VL + VR * 1.2)); });
  const gasMat = new T.ShaderMaterial({
    uniforms: { uAmt: { value: 0 } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying vec3 vN; varying vec3 vV; uniform float uAmt; void main(){ float f = abs(dot(normalize(vN), normalize(vV))); gl_FragColor = vec4(vec3(0.3, 0.8, 1.2) * uAmt * (0.25 + 0.5 * f), 1.0); }',
    transparent: true, depthWrite: false, blending: T.AdditiveBlending
  });
  VESS.forEach(v => { const m = new T.Mesh(new T.CylinderGeometry(VR - 0.03, VR - 0.03, VL + VR * 1.1, 24).rotateX(PI / 2), gasMat); m.position.set(v.x, v.y, 0); m.renderOrder = 6; inside.add(m); });
  // arrows for the push: air goes one way, the car is pushed the other
  function arrow(color, L) {
    const s = new T.Shape(); s.moveTo(-0.04, 0); s.lineTo(0.04, 0); s.lineTo(0.04, L - 0.2); s.lineTo(0.13, L - 0.2); s.lineTo(0, L); s.lineTo(-0.13, L - 0.2); s.lineTo(-0.04, L - 0.2); s.lineTo(-0.04, 0);
    const g = new T.Group(); const m = new T.Mesh(new T.ShapeGeometry(s), new T.MeshBasicMaterial({ color: new T.Color(...color), toneMapped: false, transparent: true, side: T.DoubleSide, depthTest: false }));
    m.renderOrder = 20; g.add(m); scene.add(g); g.userData.m = m; return g;
  }
  const airArrow = arrow([0.9, 1.25, 1.5], 0.95), pushArrow = arrow([1.35, 0.68, 0.18], 1.05);

  // ---------------------------------------------------------------- air jets: hot white cores, fast puffs, streaks, ground blast
  const jetMats = NOZ.map(() => new T.ShaderMaterial({
    uniforms: { uAmt: { value: 0 }, uTime: { value: 0 } },
    vertexShader: 'varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vP = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: NOISE + `varying vec3 vP; varying vec3 vN; varying vec3 vV; uniform float uAmt; uniform float uTime;
      void main(){
        float k = clamp(vP.y, 0.0, 1.0), ang = atan(vP.z, vP.x);
        float n = fbm(vec3(ang * 2.0, vP.y * 6.0 - uTime * 30.0, 1.0));
        float f = pow(abs(dot(normalize(vN), normalize(vV))), 1.3);
        float a = uAmt * (1.0 - smoothstep(0.15, 1.0, k)) * (0.35 + 0.9 * n) * f;
        vec3 col = mix(vec3(1.7, 1.9, 2.2), vec3(0.7, 0.82, 1.05), smoothstep(0.0, 0.45, k));
        gl_FragColor = vec4(col * a, a);
      }`,
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide
  }));
  const jetGeo = new T.CylinderGeometry(0.34, 0.045, 1, 24, 6, true).translate(0, 0.5, 0);
  const jetCores = NOZ.map((n, k) => { const m = new T.Mesh(jetGeo, jetMats[k]); m.renderOrder = 9; m.position.copy(n.p); m.quaternion.setFromUnitVectors(V3(0, 1, 0), n.d); carBody.add(m); return m; });
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
  const glows = glowSystem(64);
  const puffs = puffSystem(320, new T.Color(0.92, 0.96, 1.0));
  const STREAK_N = 100;
  const streakMat = new T.ShaderMaterial({
    vertexShader: 'attribute vec4 aCol; varying vec2 vUv; varying vec4 vCol; void main(){ vUv = uv; vCol = aCol; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec2 vUv; varying vec4 vCol; void main(){ float along = pow(clamp(vUv.x, 0.0, 1.0), 1.4) * (1.0 - smoothstep(0.85, 1.0, vUv.x)); float across = 1.0 - abs(vUv.y * 2.0 - 1.0); across *= across; float a = along * across * vCol.a; if (a < 0.003) discard; gl_FragColor = vec4(vCol.rgb * a, a); }',
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide
  });
  const streakGeo = new T.BufferGeometry();
  streakGeo.setAttribute('position', new T.Float32BufferAttribute([-1, -0.5, 0, 0, -0.5, 0, 0, 0.5, 0, -1, 0.5, 0, -1, 0, -0.5, 0, 0, -0.5, 0, 0, 0.5, -1, 0, 0.5], 3));
  streakGeo.setAttribute('uv', new T.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1], 2));
  streakGeo.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  const stCol = new T.InstancedBufferAttribute(new Float32Array(STREAK_N * 4), 4); stCol.setUsage(T.DynamicDrawUsage);
  const stGeo = streakGeo.clone(); stGeo.setAttribute('aCol', stCol);
  const streaks = new T.InstancedMesh(stGeo, streakMat, STREAK_N); streaks.instanceMatrix.setUsage(T.DynamicDrawUsage); streaks.frustumCulled = false; streaks.renderOrder = 10; scene.add(streaks);

  // ---------------------------------------------------------------- clocks, poses and the story
  const REW0 = 2.0, REW1 = 2.6, FINAL0 = 25.0, END_CUT = 26.6, HOOK_RATE = 0.35;
  const VX = 7.0, APEX = 5.6, T_LAND = Math.sqrt(2 * APEX / G);
  const isHook = t => t < REW0 || t >= FINAL0;
  const hookH = t => (t >= FINAL0 ? t - DURATION : t);
  // flight clock T (real seconds, 0 = the apex over the middle vehicle); the hook plays it at 0.35×
  const flightT = t => isHook(t) ? HOOK_RATE * hookH(t) : (t < REW1 ? lerp(HOOK_RATE * REW0, -1.45, 1 - Math.pow(1 - smooth(span(t, REW0, REW1 - 0.05)), 2)) : null);
  function poseHook(f) {
    const fc = clamp(f, -T_LAND, T_LAND), yb = Math.max(0, APEX - 0.5 * G * fc * fc);
    return { pos: V3(VX * f, yb + CG, 0), q: new T.Quaternion().setFromAxisAngle(V3(1, 0, 0), TAU * smooth(span(f, -1.0, 1.05))) };
  }
  function poseMain(t) {
    let y = 0, w = 0;
    if (t >= 6.0 && t < 10.0) y = 0.35 * smooth(span(t, 6.75, 7.6));
    else if (t >= 10.0 && t < 15.0) { y = 0.7; w = 1; }
    else if (t >= 15.0 && t < 21.0) { y = 0.7 - 0.45 * smooth(span(t, 18.8, 21.0)); w = 1 - span(t, 18.8, 21.0); }
    else if (t >= 21.0) y = 0.25 * (1 - smooth(span(t, 21.0, 21.75)));
    y += w * 0.03 * Math.sin(t * 2.1);
    const bump = t >= 21.6 ? deg(0.6) * Math.exp(-(t - 21.75) / 0.25) * Math.sin((t - 21.75) * 18) * (t > 21.75 ? 1 : 0) : 0;
    return { pos: STUDIO.clone().add(V3(0, y + CG, 0)), q: new T.Quaternion().setFromEuler(new T.Euler(deg(0.6) * w * Math.sin(t * 1.7), 0, deg(0.5) * w * Math.sin(t * 1.3 + 1) + bump)) };
  }
  const airAt = t => {
    if (isHook(t)) return 62 - 13.5 * flightT(t);
    if (t < REW1) return lerp(62 - 13.5 * HOOK_RATE * REW0, 100, smooth(span(t, 2.05, 2.55)));
    if (t < 6.6) return 100;
    if (t < 10.0) return 100 - 5 * smooth(span(t, 6.7, 9.8));
    if (t < 15.0) return 95 - 33 * span(t, 10.2, 15.0);
    if (t < 21.0) return 62 * Math.pow(1 - span(t, 15.1, 20.6), 1.5);
    return 9 * smooth(span(t, 22.2, 25.0));
  };
  const isDown = k => k < 6;
  function jetHook(f, k) { return pulse(f, -1.5, -1.3, 1.2, 1.35) * (isDown(k) ? 1.0 : k < 8 ? 0.75 : 0.35) * (0.85 + 0.15 * Math.sin(f * 47 + k * 1.7)); }
  function jetMain(t, k) {
    if (t < 6.0) return 0;
    if (t < 10.0) return isDown(k) ? 0.8 * smooth(span(t, 6.68, 6.85)) * (1 - smooth(span(t, 9.75, 9.95))) : 0;
    if (t < 15.0) return isDown(k) ? 0.72 * (1 + 0.06 * Math.sin(t * 31 + k)) : 0;
    if (t < 21.0) {
      const a = airAt(t), p = Math.pow(clamp(a / 22), 0.7), sput = a < 22 ? (rand(Math.floor(t * 14), k) > 0.4 * (1 - a / 22) ? 1 : 0.15) : 1;
      return (isDown(k) ? 1.0 : 0.25) * p * sput * smooth(span(t, 15.0, 15.25));
    }
    return isDown(k) ? 0.22 * (1 - smooth(span(t, 21.0, 21.75))) * (0.6 + 0.4 * rand(Math.floor(t * 14), k)) : 0;
  }
  const xrayAmt = t => smooth(span(t, 6.0, 6.35)) * (1 - smooth(span(t, 9.85, 10.0))) + smooth(span(t, 15.0, 15.35)) * (1 - smooth(span(t, 20.85, 21.0)));
  const shake = (t, amp) => [amp * (Math.sin(t * 37.1) + 0.6 * Math.sin(t * 53.7 + 1.3)), amp * (Math.sin(t * 41.9 + 2.1) + 0.6 * Math.sin(t * 61.3 + 0.2)), amp * 0.7 * Math.sin(t * 47.3 + 0.9)];
  const orbit = (look, az, el, d) => look.clone().add(V3(d * Math.sin(az) * Math.cos(el), d * Math.sin(el), d * Math.cos(az) * Math.cos(el)));
  let camNear = 0.05;
  function setCam(pos, look, near, sk) {
    camera.position.copy(pos).add(V3(sk[0], sk[1], sk[2]));
    camera.lookAt(look.x + sk[0] * 0.3, look.y + sk[1] * 0.3, look.z);
    if (near !== camNear) { camNear = near; camera.near = near; camera.updateProjectionMatrix(); }
    return look;
  }
  const HOOK_CAM = V3(14.0, 1.4, -8.0);
  const nozWorld = (pose, k) => ({ p: NOZ[k].p.clone().add(V3(0, -CG, 0)).applyQuaternion(pose.q).add(pose.pos), d: NOZ[k].d.clone().applyQuaternion(pose.q) });

  // ---------------------------------------------------------------- UI
  const $ = id => document.getElementById(id);
  const ui = { step: $('step'), caption: $('caption'), sub: $('sub'), ctag: $('ctag'), teaser: $('teaser'), badge: $('badge'), timer: $('timer'), timerV: $('timerV'), rewind: $('rewind'), twr: $('twr'), barT: $('barT'), barW: $('barW'), hoverLine: $('hoverLine'), est: $('est'), refill: $('refill'), refillBar: $('refillBar'), stage: $('vStage'), air: $('vAir'), thrust: $('vThrust'), status: $('vStatus') };
  const HOOK_CAP = 'It hovered... on compressed air.';
  const SCENES = [
    { a: 0, b: 2.0, step: '', huge: true, cap: HOOK_CAP },
    { a: 2.0, b: 2.6, step: '', cap: '' },
    { a: 2.6, b: 6.0, step: '01 · The claim', cap: 'Claimed: 250 kg of compressed air, 10 nozzles.' },
    { a: 6.0, b: 10.0, step: '02 · The push', x: true, cap: 'Air shoots out. The car gets pushed the other way.' },
    { a: 10.0, b: 15.0, step: '03 · The catch', cap: 'To hover, thrust must match its whole weight.' },
    { a: 15.0, b: 21.0, step: '04 · The limit', x: true, cap: 'Air is a weak fuel. The tank runs dry fast.' },
    { a: 21.0, b: 25.0, step: '05 · The verdict', cap: 'Hops and flips: yes. Real flight: not on air alone.' },
    { a: 25.0, b: END_CUT, step: '', big: true, cap: 'Claimed. Cool. Limited.' },
    { a: END_CUT, b: 27.5, step: '', huge: true, cap: HOOK_CAP }
  ];
  const setText = (el, s) => { if (el.textContent !== s) el.textContent = s; };
  let anchors = {};
  const CALLOUTS = [
    { text: '~250 KG OF AIR', sub: 'CLAIMED', cl: true, on: [[3.0, 5.85]], at: () => anchors.c250, dx: -40, dy: -70 },
    { text: '~600 L OF PRESSURE VESSELS', sub: 'CLAIMED', cl: true, on: [[3.6, 5.85]], at: () => anchors.c600, dx: -30, dy: 70 },
    { text: '10 NOZZLES', sub: 'CLAIMED', cl: true, on: [[4.2, 5.85]], at: () => anchors.c10, dx: 50, dy: 60 },
    { text: 'PRESSURE VESSELS', on: [[6.35, 7.8], [15.9, 17.6]], at: () => anchors.vessel, dx: -70, dy: -50 },
    { text: 'AIR LINES', on: [[6.9, 8.2]], at: () => anchors.line, dx: 70, dy: 40 },
    { text: 'VALVES', on: [[7.4, 8.7]], at: () => anchors.valve, dx: -60, dy: 50 },
    { text: 'NOZZLES', on: [[8.1, 9.95]], at: () => anchors.nozzle, dx: 70, dy: 50 },
    { text: 'AIR OUT', on: [[8.4, 9.95]], at: () => anchors.airTip, dx: -55, dy: 18 },
    { text: 'CAR PUSHED UP', on: [[8.4, 9.95]], at: () => anchors.pushTip, dx: 55, dy: -18 }
  ];
  const calloutRoot = $('callouts');
  CALLOUTS.forEach(c => {
    c.el = document.createElement('div'); c.el.className = 'callout';
    c.el.innerHTML = '<span class="line"></span><span class="dot"></span><span class="tag"></span>';
    c.line = c.el.querySelector('.line'); c.tag = c.el.querySelector('.tag'); c.tag.textContent = c.text;
    if (c.sub) { const s = document.createElement('small'); s.textContent = c.sub; if (c.cl) s.className = 'cl'; c.tag.appendChild(s); }
    calloutRoot.appendChild(c.el);
  });
  const tmpV = new T.Vector3();
  const toScreen = p => { tmpV.copy(p).project(camera); return [(tmpV.x * 0.5 + 0.5) * 360, (-tmpV.y * 0.5 + 0.5) * 640, tmpV.z]; };
  const headBottom = () => { const els = [ui.teaser, ui.sub, ui.caption].filter(e => +e.style.opacity > 0.01); const el = els[0] || ui.caption; return el.offsetTop + el.offsetHeight + el.offsetParent.offsetTop + 10; };
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
      cx = clamp(cx, 20, (twrOn ? 210 : 340) - w); cy = clamp(cy, capBottom, 420 - h);
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
  function update(t) {
    t = clamp(t, 0, DURATION - 1e-4);
    const X = xrayAmt(t);
    glows.reset(); puffs.reset();
    shells.forEach(sh => { sh.solid.visible = X < 0.995; sh.ghost.visible = X > 0.005; sh.solid.castShadow = X < 0.5; });
    fadeMats.forEach(m => { m.transparent = X > 0.005; m.opacity = 1 - X; m.depthWrite = X < 0.6; });
    xrayMats.forEach(m => { m.uniforms.uOpacity.value = X; });
    bgMat.uniforms.uX.value = X; rim.intensity = 1.2 * X;
    world.visible = X < 0.5; floor.visible = X < 0.5; xFloorMat.uniforms.uAmt.value = X; xFloor.visible = X > 0.01;
    scene.fog.color.copy(HAZE).lerp(NAVY, X);
    inside.visible = X > 0.02; carLights.forEach(m => { m.visible = X < 0.5; });
    vesselM.transparent = X > 0.01; vesselM.opacity = 1 - 0.55 * X; vesselM.depthWrite = X < 0.5;

    // where the car is, and which clock its jets run on
    const T_ = flightT(t), hook = T_ !== null;
    const pose = hook ? poseHook(T_) : poseMain(t);
    car.position.copy(pose.pos); car.quaternion.copy(pose.q);
    const jetAt = (c, k) => hook ? jetHook(c, k) : jetMain(c, k);
    const poseAt = c => hook ? poseHook(c) : poseMain(c);
    const clock = hook ? T_ : t, LIFE = hook ? 0.32 : 0.45;
    const air = Math.max(0, airAt(t));
    let jetSum = 0;
    NOZ.forEach((n, k) => {
      const a = jetAt(clock, k); jetSum += a;
      jetCores[k].visible = a > 0.01; jetCores[k].scale.set(0.8 + 0.5 * a, (hook ? 1.6 : 1.0) * (0.35 + 1.25 * a), 0.8 + 0.5 * a);
      jetMats[k].uniforms.uAmt.value = a * (1 - 0.45 * X); jetMats[k].uniforms.uTime.value = clock;
      lineMats[k].uniforms.uFlow.value = Math.min(1, a * 1.2); lineMats[k].uniforms.uTime.value = t;
      const open = clamp(a * 3); valveMats[k].color.setRGB(lerp(0.25, 0.6, open), lerp(0.05, 1.8, open), lerp(0.05, 2.4, open));
      // puffs leave the nozzle in world space, so they trail behind a moving, rolling car
      for (let j = 0; j < 22; j++) {
        const ph = rand(k * 31 + j, 7), age = (((clock / LIFE + ph) % 1) + 1) % 1 * LIFE, birth = clock - age, ab = jetAt(birth, k);
        if (ab < 0.02) continue;
        const nw = nozWorld(poseAt(birth), k), dist = (hook ? 7.0 : 5.0) * 0.16 * (1 - Math.exp(-age / 0.16));
        const spread = V3(rand(k, j + 40) - 0.5, rand(k, j + 50) - 0.5, rand(k, j + 60) - 0.5).multiplyScalar(0.5 * age);
        puffs.push(nw.p.clone().addScaledVector(nw.d, dist + 0.05).add(spread), (0.12 + 1.5 * age * (0.7 + 0.6 * ab)) * (1 - 0.35 * X), 0.42 * ab * Math.pow(1 - age / LIFE, 1.5) * (1 - 0.65 * X), rand(k, j));
      }
      const now = nozWorld(pose, k);
      if (a > 0.01) glows.push(now.p.clone().addScaledVector(now.d, 0.06), 0.8 * a, 0.95 * a, 1.2 * a, 0.16 + 0.1 * a);
      // the blast spreading across the stage under the down-facing nozzles
      if (isDown(k) && a > 0.02 && now.p.y < 1.9 && X < 0.5) {
        const near = clamp((1.9 - now.p.y) / 1.2);
        for (let j = 0; j < 9; j++) {
          const L = 0.8, ph = rand(k * 17 + j, 9), age = (((clock / L + ph) % 1) + 1) % 1 * L, ang = rand(k, j + 70) * TAU;
          const r = 0.2 + 2.0 * (1 - Math.exp(-age / 0.3));
          puffs.push(V3(now.p.x + Math.cos(ang) * r, 0.06 + 0.12 * age, now.p.z + Math.sin(ang) * r), 0.25 + 1.1 * age, 0.3 * a * near * (1 - age / L), rand(k, j + 90));
        }
      }
    });
    // fast streaks inside the jets
    for (let i = 0; i < STREAK_N; i++) {
      const k = i % NOZ.length, a = jetAt(clock, k), L = hook ? 0.12 : 0.18, age = (((clock / L + rand(i, 5)) % 1) + 1) % 1 * L;
      const nw = nozWorld(pose, k), off = V3(rand(i, 6) - 0.5, rand(i, 8) - 0.5, rand(i, 9) - 0.5).multiplyScalar(0.12);
      const head = nw.p.clone().add(off).addScaledVector(nw.d, 0.1 + age * 9), len = 0.25 + 0.35 * a;
      qa.setFromUnitVectors(X1, nw.d); mtx.compose(head, qa, V3(len, 0.02, 0.02)); streaks.setMatrixAt(i, mtx);
      stCol.setXYZW(i, 1.0, 1.2, 1.5, a * (1 - age / L));
    }
    streaks.instanceMatrix.needsUpdate = stCol.needsUpdate = true;
    // the gas in the vessels thins out with the air left
    const nm = Math.round(MOTES * air / 100);
    for (let i = 0; i < MOTES * 2; i++) {
      const hmt = moteHome[i], vis = (i % MOTES) < nm;
      const jit = V3(Math.sin(t * 7.1 + i) * 0.02, Math.sin(t * 6.3 + i * 1.7) * 0.02, Math.sin(t * 5.7 + i * 2.3) * 0.03);
      mtx.compose(hmt.clone().add(jit), qa.identity(), vis ? ONE : V3(0.0001, 0.0001, 0.0001)); moteMesh.setMatrixAt(i, mtx);
    }
    moteMesh.instanceMatrix.needsUpdate = true;
    gasMat.uniforms.uAmt.value = X * (0.15 + 0.85 * air / 100);
    const flowing = jetSum / NOZ.length;

    // camera
    let look, sk = [0, 0, 0], near = 0.05;
    if (hook) {
      const p = pose.pos;
      sk = shake(t * 0.6, 0.02 + 0.03 * flowing);
      look = setCam(HOOK_CAM, V3(0.4, 6.2, 0).lerp(p, 0.3), near, sk);
    } else if (t < 6.0) {
      const k = smooth(span(t, 2.6, 6.0));
      look = setCam(orbit(STUDIO.clone().add(V3(0, 0.6, 0)), deg(lerp(58, 72, k)), deg(13), lerp(9.8, 9.0, k)), STUDIO.clone().add(V3(0.1, 0.75, 0)), near, shake(t, 0.002));
    } else if (t < 10.0) {
      const k = smooth(span(t, 6.0, 10.0)), c = pose.pos.clone();
      const kick = Math.exp(-Math.max(0, t - 6.7) / 0.4) * (t > 6.7 ? 1 : 0);
      look = setCam(orbit(c, deg(lerp(258, 274, k)), deg(lerp(46, 40, k)), lerp(7.2, 6.8, k)), c.clone().add(V3(0.2, -0.15, 0)), near, shake(t, 0.002 + 0.03 * kick));
    } else if (t < 15.0) {
      const k = smooth(span(t, 10.0, 15.0)), c = pose.pos.clone();
      const cp = orbit(c, deg(lerp(142, 132, k)), deg(lerp(8, 10, k)), lerp(14.0, 13.2, k));
      const fwd = c.clone().sub(cp).normalize(), right = fwd.clone().cross(V3(0, 1, 0)).normalize();
      look = setCam(cp, c.clone().addScaledVector(right, 0.45).add(V3(0, 0.1, 0)), near, shake(t, 0.004));
    } else if (t < 21.0) {
      const k = smooth(span(t, 15.0, 21.0)), c = pose.pos.clone();
      look = setCam(orbit(c.clone().setY(lerp(c.y, 0.5, 0.5)), deg(lerp(262, 280, k)), deg(lerp(40, 30, k)), lerp(6.8, 7.4, k)), c.clone().setY(lerp(c.y, 0.5, 0.5)), near, shake(t, 0.008 * (air / 62)));
    } else {
      const k = smooth(span(t, 21.0, 25.0));
      const bump = Math.exp(-Math.max(0, t - 21.75) / 0.2) * (t > 21.75 ? 1 : 0);
      look = setCam(orbit(STUDIO.clone().add(V3(0, 0.55, 0)), deg(lerp(58, 46, k)), deg(9), lerp(10.5, 9.2, k)), STUDIO.clone().add(V3(0.2, 0.65, 0)), near, shake(t, 0.002 + 0.01 * bump));
    }
    camera.updateMatrixWorld();
    car.updateMatrixWorld(true);
    glows.done(); puffs.done();

    // the push arrows (02)
    const arrK = smooth(span(t, 7.9, 8.3)) * (1 - smooth(span(t, 9.8, 9.95))) * (t >= 6 && t < 10 ? 1 : 0);
    [airArrow, pushArrow].forEach(g => { g.visible = arrK > 0.01; g.userData.m.material.opacity = arrK; });
    if (arrK > 0.01) {
      const nw = nozWorld(pose, 4), top = pose.pos.clone().add(V3(-0.2, 0.75, 0));
      airArrow.position.copy(nw.p).add(V3(0, -0.08, 0)); airArrow.rotation.set(0, Math.atan2(camera.position.x - nw.p.x, camera.position.z - nw.p.z), PI); airArrow.scale.set(1, 0.3 + 0.7 * arrK, 1);
      pushArrow.position.copy(top); pushArrow.rotation.set(0, Math.atan2(camera.position.x - top.x, camera.position.z - top.z), 0); pushArrow.scale.set(1, 0.3 + 0.7 * arrK, 1);
      anchors.airTip = nw.p.clone().add(V3(0, -0.08 - 0.95 * (0.3 + 0.7 * arrK), 0)); anchors.pushTip = top.clone().add(V3(0, 1.05 * (0.3 + 0.7 * arrK), 0));
    }

    // lights and background follow the shot
    sun.target.position.copy(look); sun.position.copy(look).addScaledVector(SUN_DIR, 60);
    bgMat.uniforms.uInvProj.value.copy(camera.projectionMatrixInverse);
    bgMat.uniforms.uCamWorld.value.copy(camera.matrixWorld);
    vhs.uniforms.uAmt.value = pulse(t, REW0 - 0.04, REW0 + 0.06, REW1 - 0.1, REW1);
    vhs.uniforms.uTime.value = t; vhs.uniforms.uHaze.value = 0;
    flashMat.uniforms.uAmt.value = 0.05 * Math.exp(-Math.pow((t - 6.72) / 0.05, 2));

    // anchors for the chips
    const W = v => v.clone().applyMatrix4(carBody.matrixWorld);
    anchors.c250 = W(V3(0.1, 1.05, 0)); anchors.c600 = W(V3(-1.2, 0.86, -0.3)); anchors.c10 = W(NOZ[2].p.clone());
    anchors.vessel = W(V3(VESS[0].x, VESS[0].y + VR, 0.2)); anchors.line = W(LINES[2].mid); anchors.valve = W(LINES[0].valve); anchors.nozzle = W(NOZ[0].p);

    // readouts
    let stage = '', thrust = '', status = '';
    if (hook) { stage = 'STUNT'; thrust = 'FULL'; status = 'FLIPPING'; }
    else if (t < 6.0) { stage = 'PARKED'; thrust = 'OFF'; status = 'CLAIMED SPECS'; }
    else if (t < 10.0) { stage = 'THE PUSH'; thrust = flowing > 0.05 ? 'BURST' : 'OFF'; status = flowing > 0.05 ? 'VALVES OPEN' : 'VALVES SHUT'; }
    else if (t < 15.0) { stage = 'HOVER'; thrust = '= WEIGHT'; status = 'HOVERING'; }
    else if (t < 21.0) { stage = 'THE LIMIT'; thrust = air > 22 ? 'FULL' : air > 3 ? 'FADING' : 'SPUTTER'; status = air > 0.5 ? 'DRAINING' : 'EMPTY'; }
    else { stage = 'LANDED'; thrust = 'OFF'; status = t > 22.2 ? 'RECHARGING' : 'TOUCHDOWN'; }
    if (t >= REW0 && t < REW1) { stage = 'REWIND'; thrust = '—'; status = '—'; }

    // overlay
    const sc = SCENES.find(x => t < x.b) || SCENES[SCENES.length - 1];
    const hard = [0, FINAL0, END_CUT];
    const fadeIn = hard.includes(sc.a) ? 1 : smooth(span(t, sc.a, sc.a + 0.25));
    const fadeOut = (sc.b > 27 || sc.b === 2.0 || sc.b === FINAL0 || sc.b === END_CUT) ? 1 : 1 - smooth(span(t, sc.b - 0.2, sc.b));
    setText(ui.step, sc.step); ui.step.classList.toggle('x', !!sc.x);
    setText(ui.caption, sc.cap); ui.caption.classList.toggle('huge', !!sc.huge); ui.caption.classList.toggle('big', !!sc.big);
    ui.step.style.opacity = ui.caption.style.opacity = (fadeIn * fadeOut).toFixed(3);
    ui.ctag.style.opacity = (t < REW0 || t >= END_CUT) ? '1' : '0';
    ui.sub.style.opacity = (t < REW0 ? smooth(span(t, 0.75, 1.05)) : 0).toFixed(3);
    ui.teaser.style.opacity = pulse(t, 13.4, 13.7, 14.8, 15.0).toFixed(3);
    ui.badge.style.opacity = (smooth(span(t, 6.05, 6.4)) * (1 - smooth(span(t, 9.7, 9.95))) + smooth(span(t, 15.05, 15.4)) * (1 - smooth(span(t, 20.7, 20.95)))).toFixed(3);
    ui.rewind.style.opacity = (t >= REW0 && t < REW1 ? (Math.floor(t * 6) % 2 ? 1 : 0.55) : 0).toFixed(2);
    ui.rewind.style.transform = `translate(0px, ${headBottom() + 6}px)`;
    const shown = Math.round(air);
    setText(ui.timerV, String(shown)); ui.timer.classList.toggle('zero', shown === 0);
    setText(ui.stage, stage); setText(ui.air, shown + '%'); setText(ui.thrust, thrust); setText(ui.status, status);
    // weight vs thrust (03)
    const tw = pulse(t, 10.3, 10.6, 14.75, 14.95);
    ui.twr.style.opacity = tw.toFixed(3);
    if (tw > 0.001) {
      const unit = 72, ratio = smooth(span(t, 10.35, 10.95)) * (1 + 0.015 * Math.sin(t * 9));
      ui.barW.style.height = unit + 'px'; ui.barT.style.height = (ratio * unit).toFixed(1) + 'px';
      ui.hoverLine.style.bottom = unit + 'px';
      ui.twr.style.transform = `translate(0px, ${Math.max(headBottom() + 4, 196)}px)`;
    }
    ui.est.style.opacity = pulse(t, 17.3, 17.6, 20.7, 20.95).toFixed(3);
    ui.est.style.transform = 'translate(0px, 398px)';
    ui.refill.style.opacity = pulse(t, 22.2, 22.5, 24.75, 24.95).toFixed(3);
    ui.refill.style.transform = 'translate(0px, 432px)';
    ui.refillBar.style.width = (100 * air / 100).toFixed(1) + '%';
    updateCallouts(t, X);
  }


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


# Revolver X-Ray

A looping 3D animation of how a double-action revolver works, built with three.js in a single HTML file (`revolver.html`).

What it shows, on a 29-second loop:

1. Trigger pull: the hammer cocks and the cylinder indexes 60° in one motion.
2. X-ray slow motion: the hand, cylinder stop, mainspring and firing pin; primer ignition, gas pressure, the bullet spinning through the rifling, muzzle flash and cylinder-gap flash.
3. Real-time and rapid fire with recoil and smoke.
4. Reload: the cylinder swings out, the ejector clears the empties, six fresh rounds slide in.

Controls: play/pause (Space), timeline scrubber, X-ray Auto/On/Off (X), speed 1× / ½× / ¼×, and drag to orbit the camera freely (the Camera button returns to the directed shots).

Open `revolver.html` in a browser. Libraries load from cdnjs and jsDelivr.

# RPG-7 X-Ray

`rpg7.html` uses the same format for the RPG-7 on a 34-second loop:

1. Loading and cocking the hammer.
2. X-ray slow motion: trigger → sear → hammer → firing pin → booster primer; booster burn and backblast (the recoilless principle); fins opening; rocket motor ignition about 11 m out; the piezo fuze and shaped-charge warhead; impact and the copper jet.
3. A real-time launch seen from behind the shooter.

`rpg7-short.mp4` is the matching 1080×1920 YouTube Shorts render with synthesized sound. `revolver-short.mp4` is the same for the revolver.

# Mortar Trajectory X-Ray

`mortar.html` follows one 81 mm mortar round on a 36-second loop: drop and firing in x-ray (firing pin, ignition cartridge, propellant charges, obturating band), launch, the full ballistic arc drawn live with range markers and readouts (altitude, speed, range, time of flight), a second x-ray pass on the fuze during descent, and the impact. The readouts use vacuum ballistics at 200 m/s and 60°. `mortar-short.mp4` is the 1080×1920 Shorts render.

# Abrams Drone Tank

`tank.html` is our own AbramsX-style tank with a PERCH drone launcher, on a 118-second loop:

- **Breakdown:** an exploded view, then x-ray passes through the three-person crew capsule in the front hull, the unmanned turret and its cassette autoloader, the turret roof (30 mm remote cannon, sights, active protection), the hybrid diesel-electric drive, and the running gear.
- **PERCH:** sits folded on the turret roof (rear left) and carries three Switchblade 300s and one Switchblade 600.
- **Switchblade close-up:** folded wings, fins and propeller, and how they deploy.
- **Demo:** a slow-motion chase of an APFSDS round from the 120 mm gun into the first shed, then four drones launch forward from PERCH, loiter with a drone-camera view, and each destroys its own shed.

`tank-short.mp4` is the 1080×1920 Shorts render.

# SIG XM250 X-Ray

`xm250.html` covers the XM250 light machine gun on a 56-second loop: the bipod deploying; a full reload (feed cover, 100-round pouch, belt on the feed tray, charging handle locking the open bolt back); an x-ray slow-motion firing cycle (sear, recoil spring, bolt carrier stripping and chambering a round, short-stroke gas piston, ejection and belt advance); the 6.8×51 hybrid case; full-auto bursts at a plastic range dummy; and a slow-motion bullet chase. `xm250-short.mp4` is the 1080×1920 Shorts render.

# Mk 2 Grenade X-Ray

`grenade.html` uses the textured “Grenade” model by [Kyle Shotter](https://sketchfab.com/3d-models/grenade-5c3805309abc4b1ebf8ca9bd3f836615) (CC BY 4.0), embedded in the page with its textures downsized. It runs on a 58-second loop:

- **Outside:** the cast-iron body, the fuze, the safety lever ("spoon"), the safety pin and the pull ring.
- **X-ray:** the TNT filler, the cocked striker and its spring, the primer, the delay column and the detonator.
- **Arming:** a gloved hand grips the lever, then the other hand pulls the pin.
- **Throw (slow motion, x-ray):** the striker throws the lever off and fires the primer, which lights the delay.
- **Flight and delay:** a real-time flight and roll, then an x-ray close-up as the delay burns down to the detonator.
- **Detonation:** a high-speed-camera view of the burst, with fragments hitting a range dummy and two plywood targets.

`grenade-short.mp4` is the 1080×1920 Shorts render.

# V-22 Osprey

`osprey.html` uses the “Bell Boeing V22 Osprey” model by [helijah](https://sketchfab.com/3d-models/bell-boeing-v22-osprey-cd5134ab74404e54bc548e381d09ad56) (Sketchfab Standard license). We split its merged meshes into the fuselage, the tilting nacelles, the proprotors, the rear ramp and the landing gear, then repainted it. It runs on a 35-second loop:

- **Takeoff:** a helicopter-mode takeoff with rotor-wash dust.
- **Conversion:** the gear retracts and the nacelles tilt from 90° to 0°. An x-ray pass shows the engines, the proprotor gearboxes, the interconnect driveshaft through the wing and the mid-wing gearbox.
- **Cruise:** airplane-mode flight.
- **Airdrop:** the rear ramp lowers and an A-22 cargo bundle rolls out. Its pilot chute pulls out the main canopy, and the load lands.

`osprey-short.mp4` is the 1080×1920 Shorts render.

# SM.79 vs P-40

`dogfight.html` uses helijah's “Savoia Marchetti SM 79 Sparviero” and “Curtiss P-40 Warhawk” models (Sketchfab Standard license). We split out the props and removed the landing gear. The SM.79's engine detail was also trimmed so both models fit in one page. It runs on a 40-second loop:

- An SM.79 bombs a desert airfield, and the hangars and fuel tanks burn.
- A P-40 closes from behind.
- **Cockpit view:** through the P-40's reflector gunsight as it fires its six .50s.
- **Slow motion:** rounds tear into the bomber's right engine and wing, leaving holes, sparks and debris and pulling a panel off.
- The engine catches fire. The bomber trails smoke, rolls into a dive and explodes on impact.

`dogfight-short.mp4` is the 1080×1920 Shorts render.

# Torpedo Attack

`torpedo.html` is built entirely in code (no downloaded models) and runs on a 53-second loop:

- **The ship:** a destroyer whose hull is lofted from station sections, with gun houses, a bridge, funnels, masts and boats.
- **The plane:** an Avenger-style torpedo bomber carrying a torpedo with contra-rotating screws.
- **The ocean:** a Gerstner-wave shader with ripples, sky reflection, sun glint and foam drawn live on a canvas (ship wake, Kelvin arms, the torpedo's bubble trail, splashes).
- **The attack:**
  - a low attack run and the drop
  - an underwater chase of the torpedo
  - the hit: a water column, spray and a torn hole
- **The sinking:**
  - an x-ray cutaway with flood jets pouring through the hole as compartments fill one after another
  - the ship lists, settles and plunges bow-first

`torpedo-short.mp4` is the 1080×1920 Shorts render.

# AK-47 X-Ray

`ak47.html` uses the “Low Poly AK47” model by [AdamKokrito](https://sketchfab.com/3d-models/low-poly-ak47-54b71f2d288d4c9692269fb56a5874da) (Sketchfab Standard license), whose magazine, charging handle, trigger and safety come as separate parts. It runs on a 20-second loop:

- **Reload:** the empty magazine rocks out and drops, and a new one hooks in at the front and rocks back.
- **Charge and fire:** the rifle is charged, then fires five rounds at a steel plate, with brass ejecting.
- **X-ray slow-motion cycle:**
  1. the hammer falls
  2. the bullet and gas travel down the bore, and gas goes up the port
  3. the long-stroke piston drives the carrier back
  4. the rotating bolt unlocks, the case ejects, and the spring feeds the next round

`ak47-short.mp4` is the 1080×1920 Shorts render.

# Fire FX: Molotov and Napalm

`fire.html` rebuilds our fire using the technique from the supplied fire reference. Flames are made of layered tongue meshes in three layers: an orange outer, a gold inner and a pale core. Scrolling 3D noise drives their opacity, and the tips bend and lick. Around them are flickering point lights, embers, and noise-edged soot smoke lit from below. The flames are graded white-yellow at the base and deep red at the tips, so they don't blow out to white.

It runs on a 20-second loop at dusk:

- **Molotov:** a thrown bottle (slow-motion shatter and fuel spray) produces a vapour whoosh, a spreading pool fire and burning crates.
- **Napalm:** a jet drops two canisters on a base. A rolling wall of fire runs along a 125 m swath, followed by a long, smoky burn.

`fire-short.mp4` is the 1080×1920 Shorts render.

# Cabin Fire

`cabinfire.html` uses the same fire system as `fire.html`. A Molotov hits the base of a code-built wooden cabin, made of about 130 individual boards, posts and roof strips. The fire climbs the wall and spreads around the cabin and onto the roof.

A char shader blackens each board in noisy patches from its ignition time and height, with glowing ember cracks. As flames burn out an area they move upward, leaving the blackened wood visible. The roof sags, then every board falls into a burning heap.

The loop is 15 seconds: a real-time throw, a slow-motion smash, then a time-lapse burn with roughly one second of video per minute of fire. `cabinfire-short.mp4` is the 1080×1920 Shorts render.

# Turbofan Jet Engine

`jet-engine/` is a 40-second vertical explainer for *Inside the Mechanism*. It is a procedural Three.js scene (r128, installed from npm), and every piece of geometry is built in code. The engine is a two-spool turbofan on a test stand on a desert floor. Its main parts:

- a 22-blade wide-chord fan with a spiral-painted spinner, plus outlet guide vanes
- a 3-stage booster
- a 9-stage HP compressor whose blades shrink toward the back
- an annular combustor with 18 fuel nozzles, cut away on the near side
- 2 HP and 4 LP turbine stages
- concentric HP and LP shafts and a tail cone

In X-ray the casings turn to cyan fresnel glass with edge lines, while the rotating parts stay solid. Instanced streaks show the airflow: pale blue for bypass and core air, turning orange to yellow-white after ignition. The overlay is HTML: title, specs line, step label and caption, callout chips, and a stats bar showing stage, HP RPM, air temperature and thrust (approximate values only).

Everything is a pure function of the time `t`, so any frame can be rendered on its own:

```bash
cd jet-engine
npm install                 # three@0.128.0
npm run stills              # 4 approval stills → stills/
bash render-all.sh          # 1200 PNG frames → frames/, silent MP4, then sound → /output/jet-engine.mp4
bash add-audio.sh           # redo only the sound on /output/jet-engine-silent.mp4
```

`render.js` drives the pre-installed Playwright Chromium (SwiftShader WebGL) at 360×640 CSS px ×3. It waits two animation frames before each screenshot. `check-frames.py` re-renders any frame where the overlay didn't paint. Opening `index.html` through any local web server plays the loop live (space or click to pause, ←/→ to seek). Fonts are Barlow Condensed and IBM Plex Mono, served locally under the SIL Open Font License.

`audio.py` synthesizes the sound with numpy from the same timeline:

- desert wind and a starter hiss
- a turbine whine and fan buzz that follow the HP RPM, plus intake rush that is muffled in X-ray
- a scan whoosh when X-ray turns on and off, and UI ticks on step changes and callouts
- fuel hiss, the ignition whoomp and a combustion rumble
- jet roar with crackle for the thrust shot
- a low hit with a reverb tail on the final card

`add-audio.sh` normalizes the sound to -14 LUFS / -1 dBTP and muxes it as AAC. `jet-engine-short.mp4` is the 1080×1920 render with sound.

# Rocket Engine

`rocket-engine/` is the matching *Inside the Mechanism* explainer: 45 seconds, 1080×1920. It reuses the jet engine's overlay, fonts, X-ray look and Playwright pipeline. Everything is procedural geometry for a liquid-fuel engine on a vertical test stand:

- a regeneratively cooled chamber and a Rao-style bell nozzle (lathe contour, tube-wall texture, hat-band stiffeners)
- an injector dome
- a turbopump with oxidizer pump, fuel pump and turbine on one shaft, plus a gas generator and turbine exhaust duct
- feed lines, gimbal actuators, and a stage with RP-1 and LOX tanks

The video follows the beats below:

- **Hook (0:00):** ignition, seen looking up into the bell.
- **Hero (0:03):** the engine firing on the stand.
- **X-ray walk-through (0:08–0:34):** tanks, then pumps, then combustion with a flash and slow motion, then throat and nozzle with a Mach 1 marker and a live gas-speed chip.
- **The push (0:34):** action/reaction arrows, then an Earth vs vacuum split screen. In vacuum the plume balloons out with no shock diamonds.
- **Loop:** the final shot returns to the hook camera before ignition. Both shots share one ignition clock (s = t, or t − 45), so the last frame flows into the first.

```bash
cd rocket-engine
npm install                 # three@0.128.0
npm run stills              # 5 approval stills → stills/
bash render-all.sh          # 1350 PNG frames → frames/ (4 interleaved processes), checks, silent MP4, then sound → /output/rocket-engine.mp4
bash add-audio.sh           # redo only the sound on /output/rocket-engine-silent.mp4
```

`audio.py` synthesizes the sound from the same timeline:

- cryogenic pings, LOX venting and the turbopump spin-up
- ignition crack and whump, then the roar with crackle
- a tape-stop rewind into X-ray, tank gurgle and pump whine
- a teaser riser, a flash-cut boom with a slow-motion low end, and a rising nozzle whoosh with a Mach 1 crack
- the push, then the split screen, where the roar moves to the Earth side and the vacuum side keeps only a felt rumble

The final shot and the opening are cut from one continuous ignition buffer, the filters are circular, and the track has no fades, so the sound loops seamlessly too. `master.py` sets loudness with a fixed gain and a memoryless soft clip (about -15 LUFS, -1 dBFS peak) rather than a time-varying limiter, which would shift the seam.

All readouts are approximate and are not tied to any real engine. `rocket-engine-short.mp4` is the render with sound.

# Ejection Seat

`ejection-seat/` is a 22-second *Inside the Mechanism* explainer, built on the same pipeline, overlay, fonts and X-ray look as the jet and rocket engines. Everything is procedural:

- a generic, unmarked jet with an open cockpit and a jettisonable canopy
- a stylized pilot whose limbs are posed every frame from joint positions
- a rocket-assisted seat on rails, with a telescoping catapult, a rocket motor under the pan, and drogue and main parachutes in the headbox

A small flight model drives the motion and the readouts. It integrates in the jet's frame at 150 m/s, 150 m up, and covers:

- a 15 g catapult stroke and a rocket burn
- airflow drag on the seat
- drogue stabilization
- seat-man separation
- the main canopy opening

The seat clears the jet at about 0.3 s, and the canopy is full at about 2.9 s.

A big timer shows real time since the handle pull. The video plays that clock at different speeds: 1/5× in the hook, a real-time cockpit beat, about 1/30× to 1/20× for the canopy, catapult and rocket, then a ramp back to real time. The TIME readout shows the playback speed.

The hook (0–2 s) opens mid-ejection, then a VHS-style rewind takes the story back to the pull. The last 0.4 s cut back to the hook camera on the same clock, so the video loops. `audio.py` builds sound on the same timing curve:

- cockpit rumble, a caution tone and oxygen-mask breaths
- the handle click
- slow-motion canopy and catapult booms and the rocket roar
- timer ticks that speed up with the clock
- the drogue pop, separation, the chute snap and a calm descent

As with the rocket, the sound is loop-safe and has no fades.

```bash
cd ejection-seat
npm install                 # three@0.128.0
npm run stills              # 4 approval stills → stills/
bash render-all.sh          # 660 frames → frames/, checks, silent MP4, then sound → /output/ejection-seat.mp4
bash add-audio.sh           # redo only the sound on /output/ejection-seat-silent.mp4
```

All readouts are approximate and are not tied to any real seat or aircraft. `ejection-seat-short.mp4` is the render with sound.

# Booster Landing

`booster-landing/` is a 24-second NovexDynamics explainer, built on the same pipeline, overlay, fonts and X-ray look as the jet engine, rocket engine and ejection seat. Everything is procedural:

- a generic, unmarked reusable first stage with nine engines, four lattice grid fins and four landing legs with struts
- an upper stage that separates and flies on under its own engine
- a sky shader that draws the curved planet, limb glow and stars from orbit and fades to pale blue near the ground, plus a flat desert and a concrete landing pad

A small flight profile drives the motion and the readouts:

- separation at about 70 km, a cold-gas flip and a boostback burn on three engines
- an apogee of about 100 km, with the grid fins deployed after the boostback
- a fall through thickening air at up to about 4,300 km/h
- a single-engine landing burn at constant deceleration (14 m/s², about 2.4× the booster's weight)

That burn takes the speed from about 970 km/h to exactly 0 at leg contact. The engine's minimum throttle (about 1.3× weight) is still above the booster's weight, which is the "it can't hover" point the X-ray thrust-vs-weight panel makes.

The big SPEED counter shows that real speed, and the video plays the flight clock at different rates: slow-motion in the hook, time-lapse through the coast and fall, and close to real time for the burn and touchdown.

The hook (0–2 s) opens on the last seconds of the landing burn at 0.7×. A VHS-style rewind then takes the story back to separation. The last 0.4 s cut back to the hook camera on the same clock, so the video loops. There is no audio.

```bash
cd booster-landing
npm install                 # three@0.128.0
npm run stills              # 4 approval stills → stills/
bash render-all.sh          # 720 frames → frames/, checks, then the silent MP4 → /output/booster-landing.mp4
```

All readouts are approximate and are not tied to any real vehicle. `booster-landing-short.mp4` is the render.

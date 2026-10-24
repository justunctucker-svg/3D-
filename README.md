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

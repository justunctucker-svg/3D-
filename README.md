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

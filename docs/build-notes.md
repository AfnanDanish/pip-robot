# Build notes

These are the notes I keep while building Pip. Mostly they're about why things are the way they
are, because six months from now I won't remember why the lidar sits exactly 15.5 cm off the floor,
and neither will anyone reading the code. Some of it is decided. Some of it is me arguing with
myself. I've left both in.

## 1. The itch

I wanted a robot that lives somewhere. Not a line follower, not an arm bolted to a table. Something
that wakes up on its charger, potters around a home, gets tired, and goes back to bed. WALL-E is
the honest answer to where that came from: a small machine with a job and a personality, where you
can tell what it's feeling from its eyes and a few beeps.

So personality was a requirement from day one, not a coat of paint at the end. That decision
leaks into everything below. It's why there are two screens instead of one, why Pip beeps instead
of talks, and why the mood engine gets its own package instead of being three lines in the
behaviour code.

## 2. Simulation before solder

I'm building this in Pakistan, and right now I don't have the budget to buy parts, break them,
and buy them again. A lidar alone is the most expensive thing on the list. So Pip exists in
simulation first: ROS 2 Jazzy, Gazebo Harmonic, a small apartment with furniture and a charging
dock.

This isn't a compromise I'm embarrassed about. It's how robot teams work anyway. The navigation
stack, the docking logic, the moods, all of it can be built and broken a hundred times for free.
When the parts arrive, the only new problem is the hardware, not everything at once.

There's also a browser version on GitHub Pages. It runs the same algorithms ported to JavaScript,
so someone can watch Pip work without installing ROS. It cheats a little: it knows exactly where
Pip is, where the ROS version has to work that out from its scans.

## 3. Two brains

Pip has a Raspberry Pi 4 and an ESP32, and the split between them is the most important hardware
decision in the project.

The Pi runs Linux and ROS 2: mapping, navigation, docking, the moods, the eyes, the voice. It's
good at all of that. What it's bad at is timing. Linux will happily pause your motor loop for 40 ms
to do something else, and a wheel PID that runs "about" every 10 ms isn't a PID loop anymore.

Worse is what happens when the Pi hangs. If the Pi drives the motors directly and it freezes
mid-command, the last command keeps running. A robot that drives into a wall forever because its
computer froze is the failure I'm most scared of, more than anything else on this list.

So the ESP32 owns the wheels. It runs the PID at 100 Hz or faster, reads the encoders and the IMU,
watches the battery, and listens to the bump and cliff sensors. The Pi sends it wheel speeds 50
times a second. If 200 ms go by with nothing from the Pi, the ESP32 stops the motors on its own.
The Pi can crash however it likes; Pip just stops.

What I considered and didn't pick:

The Pi alone, with a motor HAT. Cheaper and fewer wires, but it brings back both problems above.

A Jetson Nano. More compute, but more money and more power, and Pip has no camera that needs it.
Paying for a GPU to drive two motors and a lidar didn't make sense.

An Arduino Uno. No headroom and no WiFi. I'd outgrow it in a week.

An STM32. Honestly a great fit, and I've used them before. The ESP32 won because I already own a few
from a drone telemetry project, it has two cores, and WiFi is useful for streaming debug logs off
the robot without a cable trailing behind it. If the ESP32's timing ever disappoints me, the STM32
is plan B and the serial protocol won't care.

## 4. Seeing the room

Pip sees with a 360° 2D lidar, an LD06 or something in that class (RPLIDAR C1 and A1 are the
alternatives I'm comparing). One laser spins and reports the distance to everything around it at a
single height, about 10 times a second.

I looked at three other options.

A ring of ultrasonic sensors is the cheap classic. The trouble is that each one sees a wide cone,
not a line, and they lie when they hit a wall at an angle. You can avoid obstacles with them. You
can't build a clean map.

A depth camera sees in 3D, which is better on paper. In practice it needs a lot more compute,
struggles with bright windows and dark corners, and turns every problem into a 3D problem. Pip
lives on a flat floor. A 2D slice of the world is most of what it needs.

A plain camera is cheapest of all, and I want one eventually, but visual SLAM on a Pi 4 alongside
everything else is a fight I'd rather not start yet.

The lidar works in the dark, the math is simple, and it makes docking easy (more on that later).
It sits on top, dead centre, at 15.5 cm. Dead centre is deliberate: the docking code assumes the
lidar and the robot's centre are the same point, which keeps the geometry simple. Move the lidar
and that assumption quietly breaks.

The catch with a 2D lidar is everything below its scan plane. Cables, rug edges, a shoe, and the
one that actually matters, the top of a staircase. Pip can't see any of those. That's why the real
build adds two IR cliff sensors pointing at the floor and a bump switch on the front. The
simulation's furniture is all solid blocks down to the ground, which is a lie a real living room
won't tell.

## 5. Wheels, not treads

This one hurt a bit, because treads are the most WALL-E thing possible.

Treads slip every time they turn. That's how skid steering works. And Pip's last 17 cm onto the
dock are driven blind, on wheel odometry alone, because the lidar can't see anything that close. If
the wheels slip, Pip misses the contacts. So: two geared motors with wheels, differential drive,
and a caster front and back. If I really want the look, treads can be a cosmetic cover later.

The motors must have encoders. That's not negotiable. Without them the robot has no idea how far
it's driven, and every "creep 17 cm forward" becomes a guess.

The wheels are 7 cm across, which should be enough to get over a door threshold. Four contact
points on the floor (two wheels, two casters) is something I'm not fully happy with. On an uneven
floor one wheel can lift and lose grip. A sprung rear caster might fix it. I'll find out when it's
real.

## 6. Power

Three 18650 cells in series (3S, 11.1 V nominal, 12.6 V full) with a proper BMS and an inline fuse.
Not a USB power bank, for two reasons. Most power banks can't charge and power a load at the same
time reliably, and a robot that charges on a dock needs exactly that. And with a power bank I can't
measure the cells, so I can't tell Pip how much battery it really has.

The Pi gets its own 5 V 5 A buck converter. A Pi 4 on a weak supply browns out under load. You get
the little lightning-bolt icon if you're lucky and a corrupted SD card if you're not.

Battery sensing is an open question. The ESP32's ADC is famously non-linear, so reading pack
voltage straight off a divider will be off by a few percent in ways that matter near empty. An
INA219 (a small current and voltage sensor on I2C) would fix that and also tell me how much current
the motors are pulling. It's probably worth the extra part.

## 7. Coming home

Docking is the feature I care about most. A robot that can't charge itself isn't autonomous, it's
just on a long leash.

The dock is deliberately dumb: a flat face 30 cm wide sticking out from the wall, with two spring
contacts on it. No IR beacon, no camera target, no electronics except the charger. A flat face is
exactly what a 2D lidar is good at seeing, so Pip finds it by fitting a straight line to the scan
points near where it expects the dock to be. It uses RANSAC so that the wall corners next to the dock
don't drag the line off, and it only trusts the result if the line comes out about 30 cm long.

The contacts are on Pip's front bumper, so it docks nose-first. Partly that's mechanical, since the
bumper is the sturdiest part of the shell. Partly it's because when Pip is charging, its eyes face
the room, which I like a lot more than a robot that parks with its back to you.

The sequence:

The navigation stack drives Pip to a spot 60 cm in front of the dock. Nav2 is accurate to about
15 cm, which is great for "go to the kitchen" and useless for hitting a pair of contacts.

From there the docking code takes over. It finds the dock's face, and steers toward a point on the
dock's centre line that slides closer to the face as Pip gets closer. That makes it curve onto the
centre line instead of arriving at an angle.

At 28 cm out, if Pip is within 3 cm of the centre line and pointing straight, it creeps the rest of
the way on odometry. The lidar can't measure anything closer than 12 cm anyway.

If the battery doesn't report charging within 3 seconds, it backs off 30 cm and tries again. Three
misses and it gives up and asks for help.

It heads home at 25%, which is enough to cross the apartment twice if the first route is blocked.
It leaves the dock at 90%, not 100%. The last stretch of a Li-ion charge is the slow constant-voltage
part, so waiting for the final 10% costs a lot of time for very little range.

## 8. A face

Two 1.28" round displays (GC9A01, 240×240 pixels each), side by side on the front.

One rectangular OLED would have been easier to wire. But a single screen with two eyes drawn on it
reads as a phone taped to a box. Two round screens read as eyes before anything has even moved. An
LED matrix was cheaper still, but you can't do a sleepy half-closed eye in 8×8 pixels.

There's no mouth. Pixar figured this out long ago: eyes carry nearly all of the emotion, and a mouth
on a small robot tends to look either creepy or like a toy. Pip has 11 moods, and every one of them
is just eye shape: how open, how slanted, whether the lower lid pushes up into a smile.

The blinking is random, between 2.5 and 6 seconds, with an occasional double blink. A robot that
blinks like a metronome looks dead. The eyes also glance around a little on their own and look the
way Pip is turning, which costs nothing and makes it feel like it's paying attention.

The eye renderer draws each eye at exactly 240×240. In simulation those frames go to a window. On
the real robot the same frames go over SPI to the screens.

## 9. A voice

Pip mostly beeps. It has its own small vocabulary of chirps: rising for happy, a wobbly up-and-down
for curious, a long falling slide for sad. They're synthesized on the fly, so there are no sound
files. Words are reserved for the few things worth saying, like "Twenty-five percent. Going home."
or "I'm stuck. Little help?"

Beeps don't need translating, they never fall into the uncanny valley, and every mood fits in under
a second. A robot that talks constantly gets muted within a day.

Everything runs locally. Text-to-speech uses Piper, which was built to run on a Raspberry Pi, and
falls back to espeak-ng. If Pip ever gets real conversation, the language model will run on my
desktop over home WiFi (a Ryzen 5 5600 with 16 GB is plenty for a small quantized model), not in the
cloud. Three reasons: speed, the fact that this thing will have a microphone in someone's home, and
the fact that home internet goes down and a robot shouldn't go dumb when it does.

## 10. Things I'm not sure about yet

Whether four contact points on the floor will rock on real tiles.

LD06 or RPLIDAR. The LD06 is cheaper. The RPLIDAR is better documented.

Whether the ESP32 can hold a clean 100 Hz loop while also running WiFi. If not, the WiFi debug
stream gets throttled or the STM32 comes off the bench.

How hot the Pi gets inside a closed shell. It may need a vent, and a vent needs to look intentional.

How loud cheap gear motors are. A robot that potters around a home has to be quiet, or it becomes
the thing everyone switches off.

## 11. Things that have already gone wrong

The first version of the docking test asserted the wrong sign for the sideways error. The robot was
fine; the test was wrong. Now the code states the convention outright: positive means the dock's
centre line is to the robot's left.

CI failed because `colcon test` treats a package with no tests as an error, and then failed again
because colcon quietly ran one package's tests with unittest instead of pytest. That package's
setup.py never said it used pytest.

Gazebo hasn't run on my own machine yet. Hardware virtualization was switched off in my BIOS, so
WSL couldn't start Linux. CI builds and tests every package in a ROS 2 container, but the first
real launch will almost certainly need fixes.

In the browser version, clicking on the bed made Pip say "Blocked." and give up. The goal was in
the middle of a solid object, and the planner only searched 50 cm around a click for somewhere
reachable. It searches 1.5 m now, so clicking on furniture sends Pip to the nearest spot it can
reach.

The browser map first came out as a noisy starburst. Far-away lidar beams spread out so much that
they painted stripes instead of floor. Capping mapping at 4.5 m fixed it. Real SLAM setups do the
same thing for the same reason.

## 12. What "done" looks like

Not "it works on my desk once." These, measured:

Pip docks itself 50 times in a row, and I log every miss and why.

It runs for a whole day unattended, charging itself whenever it needs to.

The map it builds of a real room matches a tape measure to within a few centimetres.

Wheel odometry, after calibration, drifts less than 5% over a 4 m square. (There's a classic test
for this called UMBmark: drive a square both ways and see where you end up.)

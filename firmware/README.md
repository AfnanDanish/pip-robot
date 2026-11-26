# Firmware

Empty for now. This is where the ESP32 code goes once there's hardware to run it on: the wheel PID
loops, encoders, IMU, battery sensing, bump and cliff sensors, and the serial link to the Pi with its
200 ms motor watchdog.

The protocol is sketched in [docs/hardware.md](../docs/hardware.md), and the reasoning for splitting
the work this way is in section 3 of the [build notes](../docs/build-notes.md).

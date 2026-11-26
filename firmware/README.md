# Firmware

ESP32 firmware for the real-time side of Pip. It covers:
- wheel speed PID loops
- encoders
- the IMU
- battery and dock-contact sensing
- bump and cliff sensors
- the serial protocol to the Raspberry Pi, with a motor watchdog

See [docs/hardware.md](../docs/hardware.md) for the protocol and wiring plan.

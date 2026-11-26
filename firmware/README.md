# Firmware (Phase B)

ESP32 firmware for Pip's real-time side lands here. It covers:
- wheel speed PID loops
- encoders
- the IMU
- battery and dock-contact sensing
- bump and cliff sensors
- the serial protocol to the Raspberry Pi, with a motor watchdog

See [docs/hardware.md](../docs/hardware.md) for the protocol and wiring plan.

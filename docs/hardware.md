# Hardware plan

The simulation in `pip_description` matches this build: a 20 × 16 cm body, 7 cm wheels 19.5 cm apart,
and a lidar scan plane at 15.5 cm.

## Split of work

| Part | Runs | Why |
|---|---|---|
| Raspberry Pi 4 | ROS 2 Jazzy: SLAM, Nav2, docking, behaviour, mood, eyes, beeps, Piper TTS, offline command recognition | Linux and enough CPU for mapping and navigation |
| ESP32 (or STM32) | Wheel PID at 100 Hz+, encoders, IMU, battery sensing, bump and cliff sensors, motor watchdog | Hard real-time; the motors stop if the Pi goes quiet |
| Home PC over WiFi (optional) | Local LLM for conversation (llama.cpp, 3–4B model) | Too heavy for a Pi 4; still fully local, no internet |

## Parts list

Prices vary a lot. Check local shops before buying.

| Part | Suggested | Notes |
|---|---|---|
| Computer | Raspberry Pi 4 (4 GB+) | Already owned |
| Microcontroller | ESP32 dev board | Already owned |
| Lidar | LD06 / LD19, or RPLIDAR C1 / A1 | 360°, 8–12 m. Biggest single cost. |
| Motors | 2 × N20 or JGA25 gear motors **with encoders** | Encoders are not optional; odometry depends on them |
| Motor driver | TB6612FNG | More efficient than an L298N |
| IMU | MPU6050 or ICM-42688 | For heading fusion |
| Displays | 2 × GC9A01 1.28" round 240×240 (SPI) | The eyes |
| Audio | MAX98357A I2S amp, small 3 W speaker, USB mic | |
| Battery | 3 × 18650 (3S) with a 3S BMS and an inline fuse | 11.1 V nominal |
| Power | 5 V / 5 A buck converter for the Pi | A Pi 4 browns out on weak supplies |
| Charging | 12.6 V CC/CV charger, spring or pogo contacts on the bumper and dock | Never charge Li-ion without a BMS |
| Safety | 2 × IR cliff sensors, front bump switch | Stops it driving down stairs |
| Chassis | MDF, acrylic or 3D print, plus casters | |

## Serial protocol (Phase B)

Binary frames between the Pi and the ESP32: `0xA5 | len | type | payload | CRC-16`.
- Pi → ESP32: wheel velocity setpoints at 50 Hz.
- ESP32 → Pi: encoder ticks, IMU, battery voltage and current, dock-contact sense, bump and cliff flags.
- If no setpoint arrives for 200 ms, the ESP32 stops the motors.

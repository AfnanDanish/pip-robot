# Parts

What Pip will be made of. The reasons are in [build-notes.md](build-notes.md); this file is just
the list. The simulated robot in `pip_description` matches it: a 20 × 16 cm body, 7 cm wheels
19.5 cm apart, and the lidar's scan plane 15.5 cm off the floor.

I don't have most of this yet, so prices are guesses. Shop around locally.

| Part | What I'm planning on | Notes |
|---|---|---|
| Main computer | Raspberry Pi 4 (4 GB+) | Already have one |
| Motor controller | ESP32 dev board | Already have a few. STM32 is plan B |
| Lidar | LD06 / LD19, or RPLIDAR C1 / A1 | The expensive bit |
| Motors | 2 × N20 or JGA25 gear motors with encoders | The encoders matter more than the motors |
| Motor driver | TB6612FNG | An L298N wastes too much as heat |
| IMU | MPU6050, or ICM-42688 if I can find one | For heading |
| Battery sense | INA219 | Because the ESP32's ADC isn't linear enough to trust near empty |
| Eyes | 2 × GC9A01 1.28" round, 240×240, SPI | |
| Audio | MAX98357A I2S amp, small 3 W speaker, USB mic | |
| Battery | 3 × 18650 in series, 3S BMS, inline fuse | 11.1 V nominal, 12.6 V full |
| Pi power | 5 V / 5 A buck converter | A Pi 4 browns out on anything weaker |
| Charging | 12.6 V CC/CV charger, spring contacts on the dock and bumper | Never charge Li-ion without a BMS |
| Safety | 2 × IR cliff sensors, front bump switch | The lidar can't see stairs |
| Chassis | MDF or acrylic to start, 3D printed if I get access to a printer | |

## Pi ↔ ESP32 protocol

Binary frames over UART: `0xA5 | length | type | payload | CRC-16`.

The Pi sends wheel speeds 50 times a second. The ESP32 sends back encoder ticks, IMU readings,
battery voltage and current, whether the dock contacts are live, and the bump and cliff flags.

If the ESP32 hears nothing from the Pi for 200 ms, it stops the motors. The Pi is allowed to crash;
Pip is not allowed to keep driving when it does.

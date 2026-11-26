#!/usr/bin/env bash
# Install ROS 2 Jazzy, Gazebo Harmonic, Nav2, slam_toolbox and Pip's runtime dependencies
# on Ubuntu 24.04 (native or WSL2). Run as root:
#   wsl -d Ubuntu-24.04 -u root -- bash scripts/setup_wsl.sh
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y software-properties-common curl ca-certificates locales
locale-gen en_US.UTF-8 >/dev/null
add-apt-repository -y universe

if ! dpkg -s ros2-apt-source >/dev/null 2>&1; then
  version=$(curl -fsSL https://api.github.com/repos/ros-infrastructure/ros-apt-source/releases/latest \
    | grep -F '"tag_name"' | awk -F'"' '{print $4}')
  codename=$(. /etc/os-release && echo "$VERSION_CODENAME")
  curl -fsSL -o /tmp/ros2-apt-source.deb \
    "https://github.com/ros-infrastructure/ros-apt-source/releases/download/${version}/ros2-apt-source_${version}.${codename}_all.deb"
  dpkg -i /tmp/ros2-apt-source.deb
fi

apt-get update
apt-get install -y \
  ros-jazzy-desktop \
  ros-jazzy-ros-gz \
  ros-jazzy-navigation2 \
  ros-jazzy-nav2-bringup \
  ros-jazzy-slam-toolbox \
  ros-jazzy-teleop-twist-keyboard \
  ros-jazzy-xacro \
  python3-colcon-common-extensions \
  python3-pytest \
  python3-numpy \
  python3-pygame \
  espeak-ng \
  pulseaudio-utils \
  alsa-utils

echo
echo "ROS 2 Jazzy + Gazebo Harmonic installed. Next: bash scripts/build.sh (as your normal user)."

#!/usr/bin/env bash
# Start Pip in simulation. Extra arguments go to the launch file, e.g. headless:=true rviz:=false
set -eo pipefail
WS="${PIP_WS:-$HOME/pip_ws}"

# shellcheck disable=SC1091
source /opt/ros/jazzy/setup.bash
# shellcheck disable=SC1091
source "$WS/install/setup.bash"
exec ros2 launch pip_bringup pip.launch.py "$@"

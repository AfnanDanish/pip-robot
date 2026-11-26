#!/usr/bin/env bash
# Build Pip's ROS 2 packages into ~/pip_ws (Linux filesystem, fast) from this repo.
set -eo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WS="${PIP_WS:-$HOME/pip_ws}"

# shellcheck disable=SC1091
source /opt/ros/jazzy/setup.bash
mkdir -p "$WS"
cd "$WS"
colcon build --symlink-install --base-paths "$REPO/src" "$@"
echo
echo "Built into $WS. Start Pip with: bash scripts/run_sim.sh"

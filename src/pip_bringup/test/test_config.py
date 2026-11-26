"""Static checks on Pip's launch files, configs, robot model and world.

These catch broken launch files and geometry that disagrees between packages (spawn pose, dock,
docking parameters) without starting Gazebo.
"""

import ast
import math
from pathlib import Path
import py_compile
import re
import xml.etree.ElementTree as ET

import pytest
import yaml

SRC = Path(__file__).resolve().parents[2]


def test_launch_files_compile():
    files = sorted(SRC.glob('*/launch/*.launch.py'))
    assert len(files) >= 4
    for f in files:
        py_compile.compile(str(f), doraise=True)


def test_yaml_configs_parse():
    nav = yaml.safe_load((SRC / 'pip_navigation/config/nav2.yaml').read_text())
    for key in ('bt_navigator', 'controller_server', 'planner_server', 'behavior_server',
                'velocity_smoother', 'local_costmap', 'global_costmap', 'smoother_server'):
        assert key in nav, key
    slam = yaml.safe_load((SRC / 'pip_navigation/config/slam_toolbox.yaml').read_text())
    assert slam['slam_toolbox']['ros__parameters']['base_frame'] == 'base_footprint'
    bridge = yaml.safe_load((SRC / 'pip_gazebo/config/bridge.yaml').read_text())
    assert {b['ros_topic_name'] for b in bridge} >= {'/clock', '/cmd_vel', '/odom', '/tf', '/scan'}


def test_world_parses_and_dock_matches_spawn_and_docking():
    world = ET.parse(SRC / 'pip_gazebo/worlds/apartment.sdf').getroot()
    dock = next(m for m in world.iter('model') if m.get('name') == 'dock')
    dock_x, dock_y = (float(v) for v in dock.find('pose').text.split()[:2])
    depth = float(dock.find('.//collision/geometry/box/size').text.split()[0])
    face_x = dock_x - depth / 2

    launch = ast.parse((SRC / 'pip_gazebo/launch/sim.launch.py').read_text())
    consts = {}
    for node in launch.body:
        if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Tuple):
            names = [t.id for t in node.targets[0].elts]
            values = [ast.literal_eval(v) for v in node.value.elts]
            consts.update(zip(names, values))
    docking_src = (SRC / 'pip_brain/pip_brain/docking.py').read_text()
    contact_offset = float(re.search(r"'contact_offset', ([0-9.]+)", docking_src).group(1))

    assert consts['SPAWN_YAW'] == 0.0
    assert abs(consts['SPAWN_Y'] - dock_y) < 1e-9
    # Pip spawns docked: its centre sits contact_offset in front of the dock face.
    assert abs((face_x - consts['SPAWN_X']) - contact_offset) < 1e-6


def test_robot_model_expands():
    xacro = pytest.importorskip('xacro')
    doc = xacro.process_file(str(SRC / 'pip_description/urdf/pip.urdf.xacro'))
    robot = ET.fromstring(doc.toxml())
    links = {link.get('name') for link in robot.findall('link')}
    assert {'base_footprint', 'base_link', 'lidar_link', 'left_wheel_link'} <= links
    sep = float(robot.find('.//wheel_separation').text)
    assert math.isclose(sep, 0.195)
    nav = yaml.safe_load((SRC / 'pip_navigation/config/nav2.yaml').read_text())
    radius = nav['local_costmap']['local_costmap']['ros__parameters']['robot_radius']
    assert radius >= math.hypot(0.10, 0.08) + 0.01  # body corners fit inside the footprint

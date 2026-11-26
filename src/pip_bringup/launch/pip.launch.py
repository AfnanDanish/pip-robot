"""Bring Pip to life in simulation: Gazebo, SLAM + Nav2, autonomy, personality and RViz.

    ros2 launch pip_bringup pip.launch.py                 # everything
    ros2 launch pip_bringup pip.launch.py headless:=true  # no Gazebo window
    ros2 launch pip_bringup pip.launch.py rviz:=false voice:=false
"""

import os

from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument, IncludeLaunchDescription, TimerAction
from launch.conditions import IfCondition
from launch.launch_description_sources import PythonLaunchDescriptionSource
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node


def include(package: str, launch_file: str, **arguments):
    path = os.path.join(get_package_share_directory(package), 'launch', launch_file)
    return IncludeLaunchDescription(PythonLaunchDescriptionSource(path),
                                    launch_arguments=arguments.items())


def generate_launch_description():
    headless = LaunchConfiguration('headless')
    rviz = LaunchConfiguration('rviz')
    voice = LaunchConfiguration('voice')
    eyes = LaunchConfiguration('eyes')
    piper_model = LaunchConfiguration('piper_model')
    sim_time = {'use_sim_time': True}
    rviz_config = os.path.join(get_package_share_directory('pip_bringup'), 'rviz', 'pip.rviz')

    autonomy = [
        Node(package='pip_brain', executable='battery_sim', output='screen', parameters=[sim_time]),
        Node(package='pip_brain', executable='docking', output='screen', parameters=[sim_time]),
        Node(package='pip_brain', executable='explorer', output='screen', parameters=[sim_time]),
        Node(package='pip_brain', executable='brain', output='screen', parameters=[sim_time]),
    ]
    personality = [
        Node(package='pip_personality', executable='mood', output='screen'),
        Node(package='pip_personality', executable='eyes', output='screen',
             condition=IfCondition(eyes)),
        Node(package='pip_personality', executable='voice', output='screen',
             parameters=[{'piper_model': piper_model}], condition=IfCondition(voice)),
    ]

    return LaunchDescription([
        DeclareLaunchArgument('headless', default_value='false'),
        DeclareLaunchArgument('rviz', default_value='true'),
        DeclareLaunchArgument('voice', default_value='true'),
        DeclareLaunchArgument('eyes', default_value='true'),
        DeclareLaunchArgument('piper_model', default_value='',
                              description='Path to a Piper .onnx voice (falls back to espeak-ng)'),
        include('pip_gazebo', 'sim.launch.py', headless=headless),
        # Give Gazebo a few seconds to start publishing the clock, scans and odometry.
        TimerAction(period=5.0, actions=[include('pip_navigation', 'navigation.launch.py',
                                                 use_sim_time='true')]),
        TimerAction(period=8.0, actions=autonomy),
        *personality,
        Node(package='rviz2', executable='rviz2', arguments=['-d', rviz_config],
             parameters=[sim_time], condition=IfCondition(rviz), output='log'),
    ])

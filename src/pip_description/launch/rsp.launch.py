"""Publish Pip's robot model (robot_state_publisher)."""

import os

from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import Command, LaunchConfiguration
from launch_ros.actions import Node
from launch_ros.parameter_descriptions import ParameterValue


def generate_launch_description():
    xacro_file = os.path.join(
        get_package_share_directory('pip_description'), 'urdf', 'pip.urdf.xacro')
    use_sim_time = LaunchConfiguration('use_sim_time')
    robot_description = ParameterValue(Command(['xacro ', xacro_file]), value_type=str)

    return LaunchDescription([
        DeclareLaunchArgument('use_sim_time', default_value='true'),
        Node(
            package='robot_state_publisher',
            executable='robot_state_publisher',
            parameters=[{'robot_description': robot_description, 'use_sim_time': use_sim_time}],
            output='screen',
        ),
    ])

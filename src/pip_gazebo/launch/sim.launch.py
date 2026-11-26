"""Start Gazebo with the apartment world, spawn Pip docked, and bridge topics to ROS 2."""

import os

from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument, IncludeLaunchDescription
from launch.launch_description_sources import PythonLaunchDescriptionSource
from launch.substitutions import LaunchConfiguration, PythonExpression
from launch_ros.actions import Node

# Where Pip starts: on its charging dock. Docking and the battery simulator assume this pose is
# the origin of the odom and map frames.
SPAWN_X, SPAWN_Y, SPAWN_YAW = 3.77, -1.0, 0.0


def generate_launch_description():
    gz_share = get_package_share_directory('pip_gazebo')
    world = os.path.join(gz_share, 'worlds', 'apartment.sdf')
    bridge_config = os.path.join(gz_share, 'config', 'bridge.yaml')

    headless = LaunchConfiguration('headless')
    gz_args = PythonExpression([
        "'-r -s --headless-rendering ", world, "' if '", headless, "' == 'true' else '-r ", world, "'",
    ])

    gazebo = IncludeLaunchDescription(
        PythonLaunchDescriptionSource(os.path.join(
            get_package_share_directory('ros_gz_sim'), 'launch', 'gz_sim.launch.py')),
        launch_arguments={'gz_args': gz_args, 'on_exit_shutdown': 'true'}.items(),
    )

    robot_state_publisher = IncludeLaunchDescription(
        PythonLaunchDescriptionSource(os.path.join(
            get_package_share_directory('pip_description'), 'launch', 'rsp.launch.py')),
        launch_arguments={'use_sim_time': 'true'}.items(),
    )

    spawn = Node(
        package='ros_gz_sim',
        executable='create',
        arguments=[
            '-topic', 'robot_description', '-name', 'pip',
            '-x', str(SPAWN_X), '-y', str(SPAWN_Y), '-z', '0.005', '-Y', str(SPAWN_YAW),
        ],
        output='screen',
    )

    bridge = Node(
        package='ros_gz_bridge',
        executable='parameter_bridge',
        parameters=[{'config_file': bridge_config, 'use_sim_time': True}],
        output='screen',
    )

    return LaunchDescription([
        DeclareLaunchArgument('headless', default_value='false',
                              description='Run Gazebo without its GUI window'),
        gazebo,
        robot_state_publisher,
        spawn,
        bridge,
    ])

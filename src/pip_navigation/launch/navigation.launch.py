"""SLAM (slam_toolbox, online mapping) plus the Nav2 navigation stack for Pip."""

import os

from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument, IncludeLaunchDescription
from launch.launch_description_sources import PythonLaunchDescriptionSource
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node

NAV2_NODES = [
    'controller_server',
    'smoother_server',
    'planner_server',
    'behavior_server',
    'bt_navigator',
    'velocity_smoother',
]


def generate_launch_description():
    share = get_package_share_directory('pip_navigation')
    nav_params = os.path.join(share, 'config', 'nav2.yaml')
    slam_params = os.path.join(share, 'config', 'slam_toolbox.yaml')
    use_sim_time = LaunchConfiguration('use_sim_time')
    params = [nav_params, {'use_sim_time': use_sim_time}]

    slam = IncludeLaunchDescription(
        PythonLaunchDescriptionSource(os.path.join(
            get_package_share_directory('slam_toolbox'), 'launch', 'online_async_launch.py')),
        launch_arguments={
            'use_sim_time': use_sim_time,
            'slam_params_file': slam_params,
        }.items(),
    )

    # The controller and recovery behaviours publish to cmd_vel_nav; the velocity smoother
    # turns that into the final /cmd_vel that drives the wheels.
    nav_to_smoother = [('cmd_vel', 'cmd_vel_nav')]
    nodes = [
        Node(package='nav2_controller', executable='controller_server', output='screen',
             parameters=params, remappings=nav_to_smoother),
        Node(package='nav2_smoother', executable='smoother_server', output='screen',
             parameters=params),
        Node(package='nav2_planner', executable='planner_server', output='screen',
             parameters=params),
        Node(package='nav2_behaviors', executable='behavior_server', output='screen',
             parameters=params, remappings=nav_to_smoother),
        Node(package='nav2_bt_navigator', executable='bt_navigator', output='screen',
             parameters=params),
        Node(package='nav2_velocity_smoother', executable='velocity_smoother', output='screen',
             parameters=params,
             remappings=[('cmd_vel', 'cmd_vel_nav'), ('cmd_vel_smoothed', 'cmd_vel')]),
        Node(package='nav2_lifecycle_manager', executable='lifecycle_manager',
             name='lifecycle_manager_navigation', output='screen',
             parameters=[{'use_sim_time': use_sim_time, 'autostart': True,
                          'node_names': NAV2_NODES, 'bond_timeout': 10.0}]),
    ]

    return LaunchDescription([
        DeclareLaunchArgument('use_sim_time', default_value='true'),
        slam,
        *nodes,
    ])

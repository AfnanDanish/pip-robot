from glob import glob

from setuptools import setup

package_name = 'pip_gazebo'

setup(
    name=package_name,
    version='0.1.0',
    packages=[package_name],
    data_files=[
        ('share/ament_index/resource_index/packages', ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
        ('share/' + package_name + '/worlds', glob('worlds/*')),
        ('share/' + package_name + '/config', glob('config/*')),
        ('share/' + package_name + '/launch', glob('launch/*.py')),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='Afnan Ali Danish',
    maintainer_email='pip-robot@users.noreply.github.com',
    description='Gazebo simulation of Pip',
    license='MIT',
)

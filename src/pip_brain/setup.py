from setuptools import setup

package_name = 'pip_brain'

setup(
    name=package_name,
    version='0.1.0',
    packages=[package_name],
    data_files=[
        ('share/ament_index/resource_index/packages', ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='Afnan Ali Danish',
    maintainer_email='pip-robot@users.noreply.github.com',
    description="Pip's autonomy nodes",
    license='MIT',
    tests_require=['pytest'],
    entry_points={
        'console_scripts': [
            'battery_sim = pip_brain.battery_sim:main',
            'docking = pip_brain.docking:main',
            'explorer = pip_brain.explorer:main',
            'brain = pip_brain.brain:main',
            'pipctl = pip_brain.pipctl:main',
        ],
    },
)

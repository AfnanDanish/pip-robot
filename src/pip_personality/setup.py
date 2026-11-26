from setuptools import setup

package_name = 'pip_personality'

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
    description="Pip's personality nodes",
    license='MIT',
    tests_require=['pytest'],
    entry_points={
        'console_scripts': [
            'mood = pip_personality.mood_node:main',
            'eyes = pip_personality.eyes_node:main',
            'voice = pip_personality.voice_node:main',
        ],
    },
)

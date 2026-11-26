"""Pip's voice: plays beeps (pip/sound) and speaks short lines (pip/say), all offline.

Speech uses Piper (natural neural TTS, runs fine on a Raspberry Pi) when a voice model is
configured, otherwise espeak-ng. Audio plays through paplay (PulseAudio, which WSLg provides)
or aplay (ALSA, on the Pi).
"""

import os
import queue
import shutil
import subprocess
import tempfile
import threading

import rclpy
from rclpy.node import Node
from std_msgs.msg import String

from .beeps import synth, write_wav


class VoiceNode(Node):
    def __init__(self):
        super().__init__('voice')
        p = self.declare_parameter
        self.piper_bin = shutil.which(p('piper_bin', 'piper').value)
        self.piper_model = os.path.expanduser(p('piper_model', '').value)
        self.espeak_voice = p('espeak_voice', 'en-us+f3').value
        self.espeak = shutil.which('espeak-ng')
        self.player = shutil.which('paplay') or shutil.which('aplay')
        self.tmp = tempfile.mkdtemp(prefix='pip_voice_')
        self.jobs: queue.Queue = queue.Queue(maxsize=6)

        tts = ('piper' if self.piper_bin and os.path.isfile(self.piper_model)
               else 'espeak-ng' if self.espeak else 'none (lines are only logged)')
        self.get_logger().info(f'voice ready: player={self.player or "none"}, tts={tts}')

        self.create_subscription(String, 'pip/sound', lambda m: self.enqueue('sound', m.data), 10)
        self.create_subscription(String, 'pip/say', lambda m: self.enqueue('say', m.data), 10)
        threading.Thread(target=self.worker, daemon=True).start()

    def enqueue(self, kind: str, payload: str) -> None:
        try:
            self.jobs.put_nowait((kind, payload))
        except queue.Full:
            pass  # drop rather than lag behind what Pip is doing

    def worker(self) -> None:
        path = os.path.join(self.tmp, 'out.wav')
        while True:
            kind, payload = self.jobs.get()
            try:
                if kind == 'sound':
                    write_wav(path, synth(payload))
                elif not self.tts(payload, path):
                    continue
                self.play(path)
            except Exception as exc:  # noqa: BLE001
                self.get_logger().warn(f'voice error: {exc}')

    def tts(self, text: str, path: str) -> bool:
        if self.piper_bin and os.path.isfile(self.piper_model):
            subprocess.run([self.piper_bin, '--model', self.piper_model, '--output_file', path],
                           input=text.encode(), check=True, timeout=20,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return True
        if self.espeak:
            subprocess.run([self.espeak, '-v', self.espeak_voice, '-s', '165', '-p', '72',
                            '-w', path, text], check=True, timeout=20,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return True
        return False

    def play(self, path: str) -> None:
        if self.player:
            subprocess.run([self.player, path], timeout=20,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def main():
    rclpy.init()
    node = VoiceNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.try_shutdown()

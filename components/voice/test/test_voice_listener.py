import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from voice_listener import extract_questions  # noqa: E402


class WakePhraseTests(unittest.TestCase):
    def test_accepts_real_recording_transcription(self):
        transcript = (
            "Bien, entonces hoy es domingo y tengo ahí una pregunta. "
            "Janapai, ¿cuál es el de oro más fuerte en Dota 2? "
            "Janapai, ¿cuál es el contrapick de Crystal Maiden?"
        )
        self.assertEqual(extract_questions(transcript), [
            "cuál es el de oro más fuerte en Dota 2",
            "cuál es el contrapick de Crystal Maiden",
        ])

    def test_ignores_speech_without_wake_word(self):
        self.assertEqual(extract_questions("No hay partida activa"), [])


if __name__ == "__main__":
    unittest.main()

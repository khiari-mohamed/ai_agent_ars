import numpy as np

from scripts.pick_cloning_clips import PEAK_CEILING, normalise


def test_normalise_moves_active_speech_toward_target_rms() -> None:
    sample_rate = 44_100
    time = np.arange(sample_rate * 2, dtype=np.float32) / sample_rate
    audio = (0.01 * np.sin(2 * np.pi * 220 * time)).astype(np.float32)

    normalized = normalise(audio)

    assert normalized.dtype == np.float32
    assert normalized.shape == audio.shape
    rms_db = 20 * np.log10(np.sqrt(np.mean(normalized**2)))
    assert -20.5 <= rms_db <= -19.5


def test_normalise_respects_peak_ceiling() -> None:
    sample_rate = 44_100
    time = np.arange(sample_rate * 2, dtype=np.float32) / sample_rate
    audio = (0.001 * np.sin(2 * np.pi * 220 * time)).astype(np.float32)
    audio[sample_rate] = 0.9

    normalized = normalise(audio)

    assert float(np.max(np.abs(normalized))) <= PEAK_CEILING


def test_normalise_leaves_too_short_audio_unchanged() -> None:
    audio = np.array([0.1, -0.1], dtype=np.float32)

    normalized = normalise(audio)

    np.testing.assert_array_equal(normalized, audio)

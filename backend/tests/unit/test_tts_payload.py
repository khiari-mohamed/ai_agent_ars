from app.core.config import settings
from app.services.tts_service import TTSService


def test_v4_payload_omits_zero_style(monkeypatch) -> None:
    monkeypatch.setattr(settings, "TTS_STYLE", 0.0)

    payload = TTSService()._payload("Bonjour")

    assert payload["model_id"] == "eleven_v4_turbo"
    assert payload["voice_settings"] == {
        "stability": settings.TTS_STABILITY,
        "similarity_boost": settings.TTS_SIMILARITY_BOOST,
        "use_speaker_boost": settings.TTS_USE_SPEAKER_BOOST,
    }


def test_tts_payload_includes_style_when_enabled(monkeypatch) -> None:
    monkeypatch.setattr(settings, "TTS_STYLE", 0.2)

    payload = TTSService()._payload("Bonjour")

    assert payload["voice_settings"]["style"] == 0.2

# Voice WebSocket

Connect to `/ws/voice`. The endpoint creates a `VOIP` conversation, sends the
existing assistant greeting as a `message` event, then attempts to send its audio.
Each JSON event uses the same `{"type": ..., "data": ...}` envelope as `/ws/chat`.

## Client input

For each utterance, send a JSON text frame followed by one or more binary frames,
then another JSON text frame:

```json
{"type":"audio_start","format":"webm"}
```

Supported input formats:

- `container`: complete audio container accepted by faster-whisper/PyAV, encoded
  across the binary frames.
- `webm`: complete WebM/Opus utterance encoded across the binary frames.
- `mp4`: complete MP4/AAC utterance, for example from iOS Safari `MediaRecorder`.
- `pcm16`: little-endian, mono, 16 kHz signed 16-bit PCM, also encoded across
  the binary frames (for telephony gateways).

`container`, `webm`, and `mp4` all use container decoding. For MediaRecorder,
create a new recorder for each utterance or include the initial chunk containing
the container header; do not send a slice from the middle of a continuous recording.

End the utterance with:

```json
{"type":"end_of_speech"}
```

To end the conversation, send `{"type":"close"}`. Binary audio must follow an
`audio_start` control message. The server buffers no more than
`VOICE_MAX_UTTERANCE_BYTES` per utterance. Empty and silent utterances produce a
`no_speech` event and no TTS response.

## Server audio output

The server sends the assistant `message` event before audio. Audio is framed as:

1. JSON `audio_start` event with the configured format, media type, and binary-frame
   count.
2. That many binary WebSocket frames, one per sentence chunk, in sentence order.
   Chunks are synthesized with bounded concurrency.
3. JSON `audio_end` event with `ttsFirstMs` and `totalMs`.

The `audio_start` output event is emitted when the first chunk is ready. If synthesis
fails, an `error` event with code `TTS_ERROR` ends the audio stream early; the text
message has already been delivered. Other `error` events report turn, rate, size, or
control failures. A failed turn does not intentionally close the socket. The endpoint
applies an idle timeout and a per-connection rolling turns-per-minute limit.

The assistant `message` data includes the standard chat fields (`content`,
`conversationId`, `ttsText`, `language`, `ticketId`, and `timestamp`) plus voice
metadata such as sentiment and stage timings. A separate `sentiment` event is also
sent for compatibility with the chat client.

The greeting and assistant text are still available when ElevenLabs is not
configured; in that case the server reports a TTS error and continues the session.

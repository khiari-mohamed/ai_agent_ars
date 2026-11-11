# Step 6 Voice WebSocket — checklist and Claude handoff

Updated: 2026-11-09

This note compares the supplied Step 6 plan with the current repository and the
observed validation history. It separates code presence from runtime verification.
Unknown results are marked unknown rather than inferred.

## Verdict

The backend implementation pieces in the supplied Step 6 plan are present:
configuration, voice-turn metrics, the reusable `VoiceSession`, a `/ws/voice`
router, shared chat/voice conversation helpers, focused tests, and protocol
documentation.

The current focused test suite passes (29 tests), and the focused Ruff check for the
voice router/session and selected tests passes. The full Ruff check still fails with
212 findings. Step 6 is **not fully validated**: Docker's engine did not start and
the configured PostgreSQL port was unreachable, so no `/health` or `/ready`
response is available. No live browser/telephony session or ElevenLabs synthesis
has been performed. A nonempty ElevenLabs key value is now present in local `.env`,
but it was not read, tested, or sent to the provider; the voice ID is blank.

## Step 6 checklist

| Requirement | Current evidence | Status |
|---|---|---|
| Voice abuse/timeout settings | `VOICE_MAX_UTTERANCE_BYTES`, `VOICE_IDLE_TIMEOUT_SECONDS`, `VOICE_MAX_TURNS_PER_MINUTE`, and `VOICE_TTS_CONCURRENCY` are in `app/core/config.py`; corresponding defaults are in `.env.example`. | Present |
| Voice turn histogram | `voice_turn_duration` is registered as `ars_voice_turn_duration_seconds` in `app/core/metrics.py`, with `stage` labels and the planned buckets. STT, LLM, first-audio, and total observations are in `app/services/voice_session.py`. | Present |
| Utterance input and STT | The selected protocol is `audio_start` with `format` `container`, `webm`, `mp4`, or `pcm16`, followed by binary frames and `end_of_speech`. Container formats use `transcribe_bytes`; PCM16 uses `transcribe_pcm16`. | Present in code; unit tested, not exercised against a real client |
| No-speech behavior | Empty buffers and STT results marked `no_speech` emit `no_speech` and skip orchestration/TTS. | Present in code; only fake-based tests exist |
| Orchestrator turn | The voice loop calls `Orchestrator.process(transcription.text, language_hint=transcription.language)`. | Present |
| Text-first response | The `message` event is sent before synthesized audio. The router adapts the service event to the `/ws/chat` `{"type": ..., "data": ...}` envelope and the standard chat message fields. | Present in code; focused protocol test passes |
| Sentence TTS, ordered output | The loop uses `split_for_tts`, starts at most the configured number of synthesis tasks concurrently, and sends the resulting binary frames in sentence order. | Present in code |
| Error/session behavior | Turn/STT/TTS errors are emitted as events; orchestration errors do not deliberately terminate the loop. Idle timeout and terminal conversation states end the session. | Present in code; runtime behavior not verified |
| Shared chat/voice plumbing | `ConversationWebSocketSession` centralizes conversation creation, audit, message payload, best-effort persistence, and close audit. `/ws/chat` was refactored to use it; voice uses channel `VOIP`. | Present |
| Router registration | `app/main.py` includes the `/ws/voice` router. The route-registration test exists. | Present in code; current focused tests pass |
| Documentation | `VOICE-WEBSOCKET.md` describes the selected client framing, supported audio containers, and server event envelope. | Present |
| Focused validation | Focused tests for voice protocol/session, orchestrator states, TTS payload, and clip picker. | 29 passed |
| Ruff | Focused Ruff check passed for voice router/session and selected tests. `ruff check app tests` reports 212 findings. A targeted check of `tts_service.py` and `pick_cloning_clips.py` reports 8 findings, including long lines and missing final newlines. | Partial; full check fails |
| Server health/readiness | PostgreSQL is configured on port 5433, which was unreachable. Docker Desktop was launched, but its Linux engine did not become ready within 60 seconds. No server was started. | Blocked; no response JSON |
| Live voice and ElevenLabs | No live WebSocket audio or ElevenLabs synthesis was run. Local `.env` contains a nonempty key value (not inspected or transmitted); voice ID is blank. | Not checked |

### Wire protocol decision

The original pasted `VoiceSession` draft described binary audio followed by
`end_of_speech` with an `encoding` field, and a `reset` control. Before integration,
the user confirmed the alternate framing below. The implemented loop follows that
confirmed choice; `reset` is not part of this selected protocol.

Client input for each utterance:

```json
{"type":"audio_start","format":"webm"}
```

Then one or more binary frames, followed by:

```json
{"type":"end_of_speech"}
```

The server also accepts `"format":"container"` and `"format":"mp4"`; these, like
WebM, are decoded as complete audio containers. This supports browser recordings
such as iOS Safari MP4/AAC at the server adapter level, but has not been tested
with a real browser. Use a fresh `MediaRecorder` per utterance or retain its
initialization/header chunk. Use `"format":"pcm16"` for little-endian mono 16 kHz
PCM16 input. Close with `{"type":"close"}`. Server JSON events are wrapped in the
same `type`/`data` envelope as `/ws/chat`; audio chunks are binary frames.

## Answers Claude can use

### 1. Do you still need `app/routers/chat.py` pasted?

No. The current file is in `backend/app/routers/chat.py` and was inspected in this
session. It constructs the orchestrator with `session_id`, `conversation_id`, and
`ip_address`, and now uses `ConversationWebSocketSession` for shared session setup,
persistence, events, and audit. The voice router uses the same helper and passes
`channel="VOIP"` to `Orchestrator`.

### 2. Does `orchestrator.greeting()` return the same result shape as `process()`?

The code path shows both methods return the orchestrator's `_result(...)` mapping:
`greeting()` returns `_result(GREETING, session)`, while the successful process path
returns `_result(reply, ...)`. This establishes a shared result producer in code;
it is not a live runtime check.

### 3. Were the Step 6 files applied?

The equivalent implementation is present, but not every line is a verbatim copy of
the initial draft. The repo already had a `VoiceSession` implementation and tests.
After the user selected the `audio_start` protocol, that existing loop was adapted
and the router was connected to the shared chat session helper. The final router
also converts service events into the existing chat JSON envelope. The relevant
files are:

- `backend/app/services/voice_session.py`
- `backend/app/routers/voice.py`
- `backend/app/routers/chat_session.py`
- `backend/app/routers/chat.py`
- `backend/app/core/config.py`
- `backend/app/core/metrics.py`
- `backend/app/main.py`
- `backend/.env.example`
- `backend/tests/unit/test_voice_session.py`
- `backend/tests/unit/test_voice_protocol.py`
- `backend/VOICE-WEBSOCKET.md`

### 4. What test and lint results are verified?

The current focused run completed successfully: 29 passed across
`test_voice_protocol.py`, `test_voice_session.py`, `test_orchestrator_states.py`,
`test_tts_payload.py`, and `test_pick_cloning_clips.py`. The full suite has not
been run. The focused Ruff check for the voice router/session and selected tests
passed. `ruff check app tests` still fails with 212 findings; targeted Ruff on
`tts_service.py` and `pick_cloning_clips.py` reports 8 findings. This is not a
green repository-wide lint result.

### 5. What are `/health` and `/ready` reporting?

No response JSON has been captured. The configured PostgreSQL port (5433) was
unreachable. Docker Desktop was launched, but its Linux engine did not become ready
within 60 seconds, so the backend was not started. Redis port 6379 was reachable,
but that does not establish `/health` or `/ready` status. Resolve the Docker engine
startup and start its configured database, then capture both responses; do not infer
readiness from earlier setup steps.

### 6. Was the separate test database created and the full suite run?

No such completion is recorded. The prior setup report says the separate `_test`
database was not created and the full `pytest --no-cov` run remained pending. Do not
claim either action succeeded.

### 7. What is known about the clone audio?

The earlier, pre-normalization picker run reported 2,269 files / 560.9 minutes
found, 2,088 clips / 530.4 minutes passing its configured signal filters, and
181 selected clips / 45.1 minutes. Five WAV files and `cloning_set/manifest.csv`
were written. The normalization code is present and unit-tested: it targets -20 dB
active-speech RMS and caps sample peak at -3 dBFS. It does not measure true peak.
The requested 120-minute rerun has not been performed, so no normalized 120-minute
output exists yet. The numbers above are script measurements, not a human listening
assessment. The user has not reported listening to the WAVs; review before upload.

### 8. What is the current ElevenLabs preparation status?

The local model setting is `eleven_v4_turbo`; the code sends `style` only if
`TTS_STYLE > 0`, and the default is 0. Provider docs describe `eleven_v4_turbo` as
intended for low-latency conversational/interactive use and say v4 has no Style or
Speed sliders and does not support SSML. Keep `TTS_STYLE=0` for this model. The
focused payload tests pass, but do not validate API acceptance or generated audio.
The docs reviewed do not confirm whether the generic `stability`,
`similarity_boost`, and `use_speaker_boost` request fields are accepted for this
model/voice; only a successful account-backed request can establish that.

The official PVC docs recommend at least 30 minutes, ideally around 2-3 hours,
consistent single-speaker audio, and splitting multi-hour uploads into roughly
30-minute samples. They describe a preferred level around -23 to -18 dB RMS with
-3 dB true peak. The picker targets -20 dB active-speech RMS but only limits
sample peak, not true peak. Provider voice verification should use similar
equipment and tone; the docs say a failed attempt can be retried after 24 hours or
handled through support.

A nonempty value exists for `ELEVENLABS_API_KEY` in the ignored local `.env`; its
value was not displayed, recorded, or sent. Its validity and whether it is the
rotated key are unknown. `ELEVENLABS_VOICE_ID` is empty. Therefore the account-specific
`GET /v1/models`, real synthesis, and the 10-line Arabic Darija audition have not
been run. Do not claim these passed.

The documentation reviewed here does not establish a file-size/file-count limit,
the account's clone-slot entitlement, exact Arabic/Darija availability for this
voice, or a fixed training duration. Confirm those in the account/dashboard or
applicable official docs before relying on them.

Sources reviewed:

- [Professional Voice Cloning](https://elevenlabs.io/docs/eleven-creative/voices/voice-cloning/professional-voice-cloning)
- [Eleven v4](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/eleven-v4)
- [ElevenLabs models](https://elevenlabs.io/docs/overview/models)

## Remaining checklist, in order

- [x] Run focused voice/session/protocol, orchestrator, TTS-payload, and picker tests:
  29 passed.
- [x] Check TTS settings/payload locally: model is configured as `eleven_v4_turbo`,
  default style is zero, and focused payload tests pass.
- [x] Review current official PVC and Eleven v4 documentation; unresolved account-
  specific and upload-limit questions are listed above rather than assumed.
- [ ] Confirm the local key is the rotated key without pasting it into chat; do not
  record it in this handoff. Set `ELEVENLABS_VOICE_ID`.
- [ ] From the user's local environment, query the account's model list and verify
  the model ID; do not send credentials through this assistant session.
- [ ] After voice ID and credential are configured, run `scripts.tts_smoke` on at
  least 10 Arabic-script Darija lines (including French loanwords), save timings,
  and listen to the output with a fluent reviewer.
- [ ] Resolve Docker Desktop engine startup and start the configured PostgreSQL
  service, then start the backend and capture the actual `/health` and `/ready` JSON.
  Confirm what readiness reports about STT instead of assuming it is loaded.
- [x] Re-run Ruff: focused voice router/session and selected test files pass;
  repository-wide Ruff reports 212 findings and the TTS/picker files report 8.
- [ ] Run the 120-minute clip picker only after the health check and without another
  CPU-heavy task at the same time. Review the WAVs before any upload.
  ```powershell
  python -m scripts.pick_cloning_clips --audio-root "C:\Users\LENOVO\Downloads\vocal_data\vocal_data" --target-minutes 120 --chunk-minutes 30 --out-dir cloning_set_120
  ```
- [ ] Create/use a separate database whose name ends in `_test`, set
  `TEST_DATABASE_URL`, and run the requested full `pytest --no-cov`; record failures.
- [ ] Confirm the browser/telephony client sends the selected `audio_start` protocol
  and that each encoded utterance is a complete supported container.
- [ ] Listen to `cloning_01.wav` and review the selected files before any upload.
- [ ] After the authorized clone is ready and the local key/voice ID are configured,
  test live TTS and the voice WebSocket.
- [ ] Keep production performance and real-customer speech accuracy unclaimed until
  measured with the intended GPU/telephony setup and suitable real-call samples.

## Guardrails for the handoff

- Do not rerun the STT transcript dump; it has already been produced.
- Do not describe the closed-set retrieval score as out-of-domain generalization.
- Do not report the no-VAD comparison as completed; it was intentionally skipped.
- Do not equate filter-passing audio minutes with manually approved clone quality.
- Do not invent health/readiness JSON, test-database status, provider requirements,
  live synthesis results, or browser/telephony validation.

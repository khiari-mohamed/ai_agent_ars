# ARS Backend Setup and Evaluation Status

Updated: 2026-11-09

This report records the requested setup sequence and the results observed so far.
No credentials or secret values are included.

## Summary

- The backend changes for the LLM layer, conversation flow, RAG, and STT are in the worktree.
- PostgreSQL and Redis were healthy during the earlier setup. In the latest check, Redis responded on port 6379, but PostgreSQL port 5433 was unreachable and Docker Desktop's engine did not become ready. Alembic was previously at `003_hybrid_kb_bge_m3` (head).
- The knowledge base was ingested successfully: 5,749 active documents and 5,749 chunks.
- Retrieval evaluation completed for both requested query configurations.
- The audio is available under `C:\Users\LENOVO\Downloads\vocal_data\vocal_data`; all 81 paths in the STT evaluation file resolve there after removing their leading `audio/` component.
- The ElevenLabs TTS service and QA endpoint are integrated with `eleven_v4_turbo`; `style` is omitted when set to zero. A nonempty local API-key value is present but was not displayed, transmitted, or tested; the voice ID is blank. Account-specific model-list verification and live synthesis have not been performed.
- The STT evaluation first failed because the installed PyAV 19 removed an argument used by faster-whisper; requirements now cap PyAV below 19, and a real audio clip decodes successfully with PyAV 18.1.0.
- `eval_stt` now supports `--dump-jsonl` to save raw fine-tuned transcripts in `stt_hyp`, and `eval_retrieval` accepts that field as `--query-field`.
- Fine-tuned-transcript retrieval was evaluated both with and without language filtering: both runs achieved 96.3% overall top-1 and 100% Tunisian top-1.
- The clip picker analyzed the confirmed consented recordings and generated 181 selected clips (45.1 minutes) across five WAV files; listening review is still required before upload. Optional gain normalization now targets -20 dB active-speech RMS and caps sample peak at -3 dBFS. The requested 120-minute rerun remains pending.
- The `/ws/voice` backend endpoint and shared `VoiceSession` loop accept complete container/WebM/MP4 and PCM16 utterances, with shared conversation persistence/audit, ordered sentence audio output, and per-connection abuse limits. The current focused tests pass.
- The current focused tests pass (29). The focused Ruff check for voice router/session and selected tests passes; full Ruff reports 212 findings. The full test suite remains pending. Health/readiness could not be checked because the Docker engine was unavailable and PostgreSQL on the configured port was unreachable.

## Setup steps

| Step | Status | Result / notes |
|---|---|---|
| 1. Apply code | Done, not fully validated | The requested backend changes were applied across `main.py`, health/config/exceptions, LLM services and conversation flow; the frontend WebSocket contract was also updated. `tests/unit/test_rag_scoring.py` was deleted. The root `.gitignore` already ignores `.env` and `models/`; current `git check-ignore` confirms `backend/.env` and the converted model are ignored. The initial code-change request deferred builds/tests; the planned full test run is still pending. |
| 2. Prerequisites | Previously used; Docker currently unavailable | Python 3.12 was used by the ingestion process. Docker Desktop was previously used for local services, but its engine did not become ready in the current check. No separate ffmpeg was installed or needed for the planned faster-whisper setup. |
| 3. Virtual environment and dependencies | Done enough to execute pipeline | The backend virtual environment ran ingestion, migration, and retrieval evaluation. During STT, PyAV 19.0.2 proved incompatible with faster-whisper 1.2.1 because PyAV 19 removed `metadata_errors`, which faster-whisper passes to `av.open`. Added `av>=11,<19` to `requirements.txt` and installed PyAV 18.1.0; a real M4A clip now decodes successfully. |
| 4. `.env` configuration | Partially verified | `backend/.env` exists and is ignored by Git; `.env.example` exists. The TTS model setting is `eleven_v4_turbo`; a nonempty key value is present in local `.env`, but its validity and rotation status were not checked. The voice ID is blank. Secret values are intentionally not displayed or recorded. |
| 5. Convert Whisper model | Done | The converted model exists at `backend\models\whisper-ars-ct2\model.bin`; observed size: 483,546,977 bytes. It is ignored by Git. The original `ARS_FINAL` data/model directory remains outside the repository. |
| 6. Start Postgres and Redis | Previously healthy; currently blocked | A prior `docker compose ps` showed `ars-postgres` and `ars-redis` healthy. In the current check, Docker Desktop's engine did not become ready and PostgreSQL port 5433 was unreachable; Redis port 6379 was reachable. |
| 7. Migrate database | Done | `python -m alembic current` reports `003_hybrid_kb_bge_m3 (head)`. |
| 8. Ingest knowledge base | Done | Correct source path: `C:\Users\LENOVO\Downloads\ARS_FINAL\rag\rag_knowledge_base.jsonl` (not the earlier `data` path). Dry run passed with 5,749 records: 2,874 FR and 2,875 TN; 0 skipped. The real run completed in 2,465.7 seconds: 5,749 created, 0 updated, 0 unchanged, 0 skipped, 0 deactivated. A current database check reports 5,749 `knowledge_docs` and 5,749 `knowledge_chunks`. |
| 9. Retrieval/STT calibration | Default STT and transcript retrieval done; no-VAD skipped | All 81 clips were evaluated with VAD on using CPU/int8 at beam sizes 5 and 1. The default beam-5 run also wrote `stt_dump.jsonl` and `stt_clips.csv`. Retrieval using `stt_hyp` succeeded both with and without language filtering: 96.3% overall top-1, 100% Tunisian top-1. The no-VAD comparison was intentionally deferred because this clean read-speech set does not evaluate silence/noise behavior. |
| 9a. Voice-cloning clip selection | 45-minute selection done; 120-minute rerun and listening review pending | On the confirmed consented audio folder, the prior picker run found 2,269 files (560.9 min), with 2,088 passing filters (530.4 min). It selected 181 clips (45.1 min) and wrote `cloning_set\manifest.csv` plus `cloning_01.wav` through `cloning_05.wav`. Optional normalization now targets -20 dB active-speech RMS, capped at -3 dBFS sample peak (not true peak). The requested 120-minute run has not been performed. Listen to the selected audio before uploading anything. |
| 9b. Voice WebSocket | Implemented; focused unit tests pass; live validation pending | Added `/ws/voice` with complete `container`, `webm`, `mp4`, and 16 kHz mono `pcm16` utterance input, existing greeting/orchestrator flow, message-before-audio response, ordered sentence chunks with bounded TTS concurrency, and size/idle/rate limits. Shared chat/voice conversation setup, audit, persistence, and event helpers are in `app/routers/chat_session.py`. Focused tests pass; no live ElevenLabs/browser/telephony session is recorded. |
| 10. Run server and check health | Blocked | PostgreSQL on configured port 5433 was unreachable. Docker Desktop was launched, but its Linux engine did not become ready within 60 seconds. The app was not started; `/health` and `/ready` JSON are unavailable. |
| 11. Run tests | Focused tests pass; full suite pending | The focused command covering voice protocol/session, orchestrator states, TTS payload, and clip picker completed with 29 passed. `ruff check app tests` reports 212 findings; a focused Ruff check for voice router/session and selected test files passed. The full suite remains pending and the separate `_test` database has not been created. |

## Retrieval evaluation results

The test file is `C:\Users\LENOVO\Downloads\ARS_FINAL\data\test.jsonl` and contains
81 evaluation rows. These are closed-set retrieval results against rows represented
in the knowledge base; they do not measure out-of-domain rejection.

### Standard text queries (language filter on)

Command:

```powershell
python -m scripts.eval_retrieval --file "C:\Users\LENOVO\Downloads\ARS_FINAL\data\test.jsonl"
```

| Language | Queries | Top-1 | Top-3 | Top-5 | MRR |
|---|---:|---:|---:|---:|---:|
| French | 62 | 96.8% | 96.8% | 96.8% | 0.968 |
| Tunisian | 19 | 100.0% | 100.0% | 100.0% | 1.000 |
| Overall | 81 | 97.5% | 97.5% | 97.5% | 0.975 |

There were two top-1 misses, both French. The returned records were similar but did
not match the exact expected document.

Exact misses from the evaluation output:

- FR row 285, score 0.97: expected query starts `La nature de l'hospitalisation est une consultation en urgen...`;
  top result was row 283, `La nature de l'hospitalisation est une consultation en urgence dans une clinique`.
- FR row 586, score 0.74: expected query starts `Remboursement de couple assure, conjointe, IMEN, HIFRI, ABT...`;
  top result was row 585, `Conjointe Ilhem Hichri ABT04959`.

These are adjacent row numbers, but that alone does not establish they are
near-duplicates. Inspect the complete source rows before deciding whether either
should be treated as an acceptable match; no retrieval/code change is justified by
the current evidence.

### `whisper_zeroshot` queries (language filter off)

Command:

```powershell
python -m scripts.eval_retrieval --file "C:\Users\LENOVO\Downloads\ARS_FINAL\data\test.jsonl" --query-field whisper_zeroshot --no-language-filter
```

| Language | Queries | Top-1 | Top-3 | Top-5 | MRR |
|---|---:|---:|---:|---:|---:|
| French | 62 | 96.8% | 96.8% | 96.8% | 0.968 |
| Tunisian | 19 | 5.3% | 5.3% | 5.3% | 0.053 |
| Overall | 81 | 75.3% | 75.3% | 75.3% | 0.753 |

There were 20 top-1 misses, predominantly Tunisian. The diagnostic queries are
Arabic-script transcripts while the Tunisian KB examples are largely transliterated;
this is a possible contributor, not a confirmed root cause. Treat this result as a
warning that the tested Tunisian ASR-query path needs investigation, not as the
standard text-query result. `whisper_zeroshot` is not the fine-tuned model's output,
so this result does not by itself establish that production retrieval fails. Do not
add script normalization based on this test alone. First evaluate real
fine-tuned-model transcripts; if those sometimes use Arabic script, then measure
that case and decide whether normalization is needed.

## STT evaluation status

The expected `ARS_FINAL\audio` directory is absent, but the audio is available at
`C:\Users\LENOVO\Downloads\vocal_data\vocal_data`. A UTF-8 path check using Python
confirmed that all 81 `audio/...` entries in `test.jsonl` resolve after stripping
the leading `audio/` path component. The folder layout differs from the JSONL, so
a temporary junction was created at
`%TEMP%\ars-stt-eval-23c49398\audio`, pointing to the supplied audio folder. All
81 JSONL clip paths now resolve through that junction without copying recordings.
No WER/CER, VAD-off, or beam-size-1 results are available yet.

The STT model is configured for automatic device selection; the current workstation
has no CUDA GPU, so evaluation will run on CPU. The evaluation file represents
about 18.6 minutes of audio. Because the workstation has had thermal concerns, run
one evaluation at a time and monitor its temperature; stop if it overheats.

The first default evaluation attempt loaded the model successfully with CPU/int8,
then failed while opening the first M4A: `av.open` rejected `metadata_errors`.
Installed PyAV was 19.0.2, while faster-whisper 1.2.1 still calls
`av.open(..., metadata_errors="ignore")`; PyAV 19 removed that keyword. The backend
now declares `av>=11,<19`, and PyAV 18.1.0 is installed in the virtual environment.
A decode check on `Nouvel enregistrement 2.m4a` passed (170,987 samples at 16 kHz,
approximately 10.69 seconds). The default STT evaluation has since completed successfully on all 81 clips. A
second default run wrote the transcript dump and per-clip CSV; its WER/CER/router
results match the earlier run, while CPU timing varied slightly.

### STT: default (VAD on, beam size 5, CPU/int8)

| Language | Clips | WER | CER | Language router accuracy | Mean inference | P95 inference |
|---|---:|---:|---:|---:|---:|---:|
| French | 62 | 11.9% | 6.2% | 100.0% | 5,529 ms | 7,758 ms |
| Tunisian | 19 | 55.4% | 25.6% | 100.0% | 5,404 ms | 7,242 ms |

These are close to, and slightly better than, the listed Colab reference on this
81-clip evaluation set (FR 13.7% WER / 6.6% CER; TN 58.9% WER / 27.6% CER).
This is a small local evaluation, not a guarantee of production performance.
Both languages routed correctly for all evaluated clips. CPU inference averaged
about 5.4-5.5 seconds per clip; p95 was about 7.2-7.8 seconds.

### STT: VAD on, beam size 1, CPU/int8

| Language | Clips | WER | CER | Language router accuracy | Mean inference | P95 inference |
|---|---:|---:|---:|---:|---:|---:|
| French | 62 | 14.2% | 6.8% | 100.0% | 4,484 ms | 4,994 ms |
| Tunisian | 19 | 56.1% | 27.7% | 100.0% | 4,548 ms | 5,385 ms |

Compared with beam size 5, beam size 1 reduced average inference time by about
19% (FR) and 16% (TN), with modestly higher WER/CER. Router accuracy remained
100% on this set.

The no-VAD comparison has not yet been run.

### Fine-tuned transcript retrieval

`scripts/eval_stt.py` accepts `--dump-jsonl PATH` and writes each original test
row plus the raw fine-tuned transcript in `stt_hyp`. The 81-row dump was generated
and verified; an example Tunisian transcript is Arabizi, consistent with the
fine-tuned model's expected output.

The retrieval evaluator initially computed the metrics but exited while printing
misses because the Windows cp1252 console could not encode a Unicode arrow. Changed
that display separator to ASCII and reran both commands successfully, producing
`stt_retrieval_filtered.csv` and `stt_retrieval_unfiltered.csv`.

| Language | Queries | Top-1 | Top-3 | Top-5 | MRR |
|---|---:|---:|---:|---:|---:|
| French, language filter on | 62 | 95.2% | 96.8% | 96.8% | 0.960 |
| Tunisian, language filter on | 19 | 100.0% | 100.0% | 100.0% | 1.000 |
| Overall, language filter on | 81 | 96.3% | 97.5% | 97.5% | 0.969 |
| French, filter off | 62 | 95.2% | 96.8% | 96.8% | 0.960 |
| Tunisian, filter off | 19 | 100.0% | 100.0% | 100.0% | 1.000 |
| Overall, filter off | 81 | 96.3% | 97.5% | 97.5% | 0.969 |

Both settings return all Tunisian gold documents at rank 1 for these 19 examples.
There are three French top-1 misses; two are the already observed adjacent rows
285/283 and 586/585, and one is row 765 with the correct result at rank 2.
This is promising closed-set evidence that these fine-tuned Tunisian transcripts
retrieve well; it is not an out-of-domain generalization result.

## ElevenLabs TTS preparation

The supplied step-5 implementation is integrated: model/output/voice settings are
in `config.py` and `.env.example`; `TTSError` maps to HTTP 503; TTS duration/cache
metrics are registered; `TTSService`, the authenticated `/api/tts` QA route, and
the smoke script are present; application shutdown closes the TTS client. The
configured model is `eleven_v4_turbo`, and the payload omits `style` when configured
as zero. A nonempty API-key value is in the ignored local `.env`, but it was not read,
sent, or validated; the voice ID is blank. The account's `GET /v1/models` list, API
synthesis, smoke audio, and voice QA therefore remain unverified.
The clip picker has run on the user-confirmed consented audio folder. It selected 181
clips totaling 45.1 minutes and generated five WAVs in `backend/cloning_set`, along
with `manifest.csv`. The picker now supports normalization toward -20 dB active
speech RMS with a -3 dBFS sample-peak cap; it does not measure true peak. The
120-minute run is still pending. The initial run wrote the files before its final
summary print failed on a Unicode arrow unsupported by the Windows cp1252 console.
That print now uses ASCII. Listen to the selected audio before uploading anything.

The official PVC docs recommend at least 30 minutes and ideally around 2-3 hours,
consistent single-speaker material, and roughly 30-minute samples for multi-hour
uploads. They describe -23 to -18 dB RMS and -3 dB true peak as target levels. The
picker targets active-speech RMS and caps sample peak only; it does not calculate
true peak. Eleven v4 documentation describes `eleven_v4_turbo` for low-latency
conversational use and says Style/Speed sliders and SSML are not supported.
Account-specific model availability, voice ID, successful API synthesis, and
audio listening remain unverified.

## Remaining work

1. Listen to `cloning_01.wav` and review the selected audio before uploading anything.
2. Create the Professional Voice Clone in ElevenLabs; Oumaima must complete the
   provider's voice verification herself. Then set the voice ID and model in `.env`.
3. Create `sentences.txt` with Arabic-script Darija test lines and audition them
   with `scripts.tts_smoke`; review audio and timings with a native speaker.
4. Start Docker Desktop and the configured PostgreSQL service, then start the
   backend with `uvicorn app.main:app --reload --port 8000`; capture `/health` and
   `/ready`, then exercise `/ws/voice` with real browser/telephony audio.
5. Create/use a separate database whose name ends in `_test`, set
   `TEST_DATABASE_URL` locally, and run `pytest --no-cov`.

## Operational notes

- The ingestion script commits batches and is safe to rerun against the same source;
  it skips unchanged records. Do not remove/reset the Docker volumes to resume work.
- The correct RAG input is under `ARS_FINAL\rag`, while the evaluation JSONL is under
  `ARS_FINAL\data`.
- `.env` and model files remain local and are ignored by Git. Do not add credentials,
  large models, or the external `ARS_FINAL` folder to the repository.
- The frontend/backend WebSocket contract has changed. Frontend runtime/build
  validation has not been recorded as part of these setup steps.
- `/api/stt` requires an authorized ADMIN, SUPERVISEUR, or AGENT token; an existing
  login/seeded-user flow still needs confirmation before testing that endpoint.

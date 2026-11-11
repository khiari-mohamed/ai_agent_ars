# ARS Agent IA — Master Status & Delivery Plan

**Consolidated:** 10 November 2026 (Tuesday) · **Delivery target:** Friday 13 November 2026
**Merged from:** ChatGPT progress review · Claude engineering handoff · scope-weighted estimate · working-session notes
**Status of this file:** single source of truth going forward. It supersedes the individual notes; where sources disagreed, this document states the discrepancy explicitly instead of averaging it.

**Evidence labels used throughout:**

| Label | Meaning |
|---|---|
| **Implemented** | Exists in code (not necessarily tested) |
| **Unit-tested (fakes)** | Passed focused tests using mocks/fakes, never run against real services |
| **Evaluated (offline)** | Measured on a local evaluation set (STT / retrieval benchmarks) |
| **Mocked** | Logic works against a stand-in; real API spec/credentials missing |
| **Blocked** | Cannot proceed without ARS input or a fixed environment |
| **Not started** | No code exists |

---

## 1. Executive summary

ARS Agent IA is an AI assistant for an insurance company (ARS) that talks to customers in French and Tunisian Arabic (Derja), including Arabizi and mixed FR/Derja conversations. The target product includes web chat, browser voice, RAG-grounded FAQ answers, complaint intake with ticket creation, human escalation, sentiment detection and summaries, and — later — real telephony (VoIP/SIP) connected to ARS's PBX.

**Where the project actually stands:** a real working prototype with a solid architecture, not a scaffold, and not a production system. Backend (FastAPI), frontend (React + Vite), local infra (PostgreSQL/Redis/Docker), and the model runtime are integrated and partially validated. **Nothing is reported above "unit-tested with fakes" except the two offline evaluations (STT and retrieval).** Nothing has been tested against real external services, and nothing is production-ready.

**Reconciled progress:** ≈ **38%** against the corrected (reduced) scope — the honest planning baseline (§2). Today's goal is to reach **≈60% through verified implementation, not re-scoring** (§11). Friday's deliverable is a **web demo**, not production and not live phone calls (§10).

**Biggest remaining gaps:** production voice pipeline and call handling · real external integrations (DigiHealth, CRM, SMS) · model/data quality on real call audio · deployment hardening, monitoring, security and compliance review.

---

## 2. Progress estimate — one number, clearly defined

The old notes contained four incompatible percentages (45%, 42%, 60–70%, 65%). They used **different denominators and definitions**, so they were never comparable:

- **65% / 60–70%** — optimistic assessments mixing "code exists" with "code works", against loosely defined scopes.
- **45%** — against the full original CDC scope (including DigiHealth use cases later dropped).
- **42% / ≈38%** — against the **corrected/reduced scope** (DigiHealth dropped, reduced authentication still counted as incomplete).

**Planning baseline: ≈38% implemented, ≈62% remaining**, weighted by workstream importance. This is a documentation-based estimate — no AI session has audited the actual repository — so treat it as a planning number, not a measurement.

| Workstream | Weight | Est. completion | Weighted |
|---|---:|---:|---:|
| AI core, FAQ & knowledge base | 25% | 75% | 18.8 |
| Backend, conversations & ticketing | 15% | 50% | 7.5 |
| Voice AI (STT, TTS, Tunisian Derja) | 15% | 45% | 6.8 |
| Authentication | 10% | 20% | 2.0 |
| Web chat | 10% | 20% | 2.0 |
| VoIP / Asterisk integration | 10% | 0% | 0.0 |
| Security, deployment & validation | 8% | 10% | 0.8 |
| Admin dashboard & supervision | 7% | 10% | 0.7 |
| **Total** | **100%** | | **≈ 38.5%** |

**Why not further ahead:** AI core and retrieval have real evaluation evidence; ticketing is coded but CRM is a mock; authentication is *reduced*, not complete; chat and widget work exists but hasn't been re-validated end-to-end against the current backend; VoIP hasn't started (blocked on ARS); admin dashboard is an unverified skeleton; security/deployment/monitoring are open.

**Getting from 38% → 60%** requires ~22 points of *verified* progress, prioritized in §11. Progress only counts when a check has actually been run and its output observed.

---

## 3. Status by area (master table)

| Area | Level reached | Evidence | Main gap |
|---|---|---|---|
| STT (fine-tuned Whisper → CTranslate2) | Evaluated (offline) | Real clips: FR WER 11.9%, TN 55.4%, ~5 s/clip on CPU | No GPU numbers; read speech only, no real phone audio |
| RAG / retrieval | Evaluated (offline) | 97.5% closed-set top-1; 96.3% on STT transcripts; TN 19/19 | Closed-set: test queries come from the KB's own rows |
| Backend core (KB, LLM, orchestrator, tickets) | Unit-tested (fakes) | 29 focused tests passing (historical) | Never run with real LLM credentials; full suite never run |
| Chat widget | Implemented | Frontend tests reported for protocol, API, store, components | Not re-run against the current backend |
| Browser voice (WS + TTS) | Implemented | Code integrated; smoke-test procedure defined | Full live test never completed; voice clone unconfirmed |
| CRM ticketing | Mocked | Ticket flow coded and unit-tested | No ARS API spec or credentials |
| Human handover | Implemented | Escalation rules coded | No live agent pool or PBX transfer |
| Sentiment, summary, email draft | Implemented | Coded, part of service logic | No complete live operational validation |
| French + Tunisian STT | Evaluated (offline) | FR WER 11.9% / TN 55.4% (CPU) | TN WER vs CDC target is an open acceptance issue (§7) |
| Admin dashboard | Skeleton exists | Pages and routing present | Unverified against backend contract (§11 files) |
| Database & local infra | Works locally | PostgreSQL + Redis + Alembic set up | Production hardening; `/health`, `/ready` never observed |
| Docker / Compose | Re-test needed | Previously blocked; **Docker Desktop 29.9.2 + Compose 5.6.1 since installed** | Retest engine, then run migrations + health checks |
| VoIP / Asterisk / SIP | Not started | — | Blocked on ARS telephony information (§9.1) |
| Security (TLS, encryption at rest, audit, pentest) | Partial | Roles/audit foundation exists | Review and pentesting required before live rollout |
| High availability / 99.5% SLA / 200 concurrent users | Not started | — | Needs architecture, deployment and load testing |
| Production deployment & monitoring | Not completed | — | GPU server, alerting, backups, rollback, runbooks |
| Notebook / experimentation workflow | Missing | No `.ipynb` in repo | Add dataset, evaluation, RAG-quality, latency notebooks |
| Full test suite, load test, UAT | Incomplete | Focused tests only | Full suite blocked on Docker; UAT not run |

---

## 4. What is implemented, layer by layer

### 4.1 Backend — FastAPI, service-oriented

- App startup and lifecycle management (model load/shutdown in the FastAPI lifespan)
- Router registration, health endpoints, readiness checks for PostgreSQL, Redis, embedder, STT
- Configuration and environment management; centralized exception handling
- Database layer and Alembic migrations; models and schema scaffolding
- Service structure: orchestrator, LLM, RAG, auth, summarizer, sentiment
- WebSocket transport for chat and voice-style sessions (`/ws/chat`, `/ws/voice`)
- Core flows (KB search, LLM, orchestrator, ticket flow) implemented; **unit-tested with fakes only**
- CRM ticketing is a **mock** pending ARS API documentation and credentials

Key paths: `backend/app/main.py`, `backend/app/routers/health.py`, `backend/app/core/config.py`, `backend/app/core/exceptions.py`, `backend/app/services/orchestrator.py`, `backend/app/services/rag_service.py`, `backend/app/services/llm_service.py`

### 4.2 Frontend — React + Vite

- Chat widget: message input, bubble rendering, typing state, sentiment bar; separate **Chat** and **Voix** tabs mapping to `/ws/chat` and `/ws/voice`; no microphone beside the text send button (deliberate)
- API layer and request wrappers; admin dashboard pages and routing; responsive glass-style UI
- WebSocket connection lifecycle and transport-state handling
- Tests cover protocol behavior, API wrappers, stores, widget components, message rendering, sentiment behavior

**Widget fixes already applied:**
- Close vs minimize separated: minimizing no longer sends a server-side close event; a distinct action ends the conversation (minimizing keeps the session alive)
- Switching Chat ↔ Voix remounts the session so transport reconnects correctly; confirmation asked if a message was already sent (each tab = new conversation)
- RTL applied to message text, not the whole row (alignment preserved)
- Reduced-motion styling no longer hides the typing indicator
- Invalid timestamps no longer crash rendering
- Sentiment bar shows no fabricated neutral value; `SentimentPulse` hidden until first sentiment event
- Internal tool messages not rendered in the customer-facing widget

**Known lifecycle caveat:** starting a new conversation or switching tabs drops the socket **without a close event**, so the server may record those sessions as *abandoned* (no summary/email). Demo scripts must end conversations with the explicit end action.

**Browser voice smoke-test procedure (re-run against current code):** 1) start backend, open widget in Chrome → 2) select Voix → 3) tap mic and speak → 4) pause ~1.4 s → 5) client auto-sends, shows transcript, assistant response, plays audio → 6) if autoplay is blocked, an "Écouter la réponse audio" button appears. *This is a test procedure, not a recorded pass.*

Key paths: `ars-agent-ia-frontend/src/App.tsx`, `src/widget/components/ChatWindow.tsx`, `src/widget/components/MessageBubble.tsx`, `src/widget/components/MessageInput.tsx`, `src/lib/hooks/useWebSocket.ts`, `src/lib/ws/protocol.ts`, `src/store/conversationStore.ts`

### 4.3 Database & local infrastructure

- PostgreSQL configuration + Alembic migrations; Redis for caching/sessions
- Docker-oriented local environment; env files and secrets handling; model-folder ignore rules; local start/stop workflow
- **Environment update:** Docker Engine previously blocked all validation; Docker Desktop (**Docker 29.9.2**, **Compose 5.6.1**) has since been installed → **retest the engine instead of assuming it's still blocked**. `/health`, `/ready` and the full backend suite have never been observed running.

Key paths: `backend/docker-compose.yml` (verify it exists), `backend/alembic.ini`, `backend/alembic/env.py`

### 4.4 AI / model runtime

- Fine-tuned **Whisper-small** converted to **CTranslate2** for local inference → `backend/models/whisper-ars-ct2/` (the only runtime dependency; never copy the original model or `ARS_FINAL` into the repo)
- Embedder initialization integrated into backend runtime; RAG service abstraction over knowledge-base ingestion + hybrid retrieval (KB written in **Arabizi**, matching fine-tuned STT output)
- LLM orchestration: multi-turn conversation, tool use, context tracking behind a service abstraction
- Sentiment tracking, message handling and agent-state transitions shared by chat and voice flows
- Language handling for Arabic/Tunisian and French; TTS + audio-response flow at widget level (**ElevenLabs only** — Azure TTS fallback was dropped)
- **No notebooks in the repo.** Fine for a prototype; add notebooks later for dataset inspection, model evaluation, RAG quality and STT latency (§13)

### 4.5 Tests & validation performed so far

- **29 focused backend tests passing** (historical): voice protocol, voice session, orchestrator states, TTS payload, clip picker
- Frontend: TypeScript checks, linting, unit tests run during widget work
- Voice-related files Ruff-clean; full Ruff run = 212 findings (mostly legacy code — **do not** spend the delivery window on these)
- Full backend suite **not yet run** (Docker was down at the time)
- ⚠️ All of the above are historical results from the notes — **re-run before repeating them as current facts**

---

## 5. Offline evaluation results

### 5.1 STT — fine-tuned Whisper (CTranslate2)

| Run | French WER / CER | Tunisian WER / CER | Router | ms/clip |
|---|---|---|---|---|
| Beam 5 (default) | 11.9 / 6.2 | 55.4 / 25.6 | 100% | ~5,500 |
| Beam 1 | 14.2 / 6.8 | 56.1 / 27.7 | 100% | ~4,500 |
| Colab reference | 13.7 / 6.6 | 58.9 / 27.6 | 19/19 | n/a |

**Interpretation recorded at evaluation time:**
- Conversion to CTranslate2 showed **no quality regression**; Beam 5 stays the default (Beam 1 saves ~1 s/clip on CPU but costs ~2 points of French WER)
- CPU inference ≈ **4.5–5.5 s/clip** — **not** a valid basis for GPU-server latency claims; GPU performance is unmeasured until benchmarked on the actual ARS server
- The router's second encoder pass is only worth optimizing if GPU measurements show it's a real bottleneck
- VAD stays enabled: the clean read-speech evaluation set does not test silence/noisy-phone behavior, so a `--no-vad` comparison would prove nothing

### 5.2 RAG / retrieval

- Standard text-query, closed-set: **97.5% top-1**
- Retrieval on transcripts from the fine-tuned STT: **96.3% top-1 overall; Tunisian 19/19**
- Language filter on/off: identical results
- The 3 French top-1 misses (of 62 queries) were adjacent/near-duplicate KB rows (285/283, 586/585) or covered at top-3 — no retrieval change justified by these alone
- The earlier "5.3% Tunisian retrieval" was a **script mismatch bug**: vanilla Whisper Arabic-script output compared against an Arabizi KB. The fine-tuned model emits Arabizi, and retrieval reached 19/19 on those transcripts. No script normalization is justified by current evidence — reconsider only if real-call Arabic-script output fails to match the KB.

Evaluation artifacts: `stt_dump.jsonl`, `stt_clips.csv`. `eval_retrieval` supports `--query-field` — inspect the code before assuming any other interface.

### 5.3 What these results do NOT prove

- **97.5% is closed-set**: test queries originate from the same Excel rows as the KB. It proves ingestion + hybrid search work, not generalization to unseen customer questions.
- CPU timings say nothing about GPU latency, and read-speech clips say nothing about real telephone audio.
- Retrieval success on Tunisian transcripts does **not** make the ASR meet the CDC's Tunisian WER target (§7).

---

## 6. Scope changes vs the original CDC

| Original requirement | Current scope/status |
|---|---|
| Use cases 2 & 4 — consult case file / eligibility via DigiHealth | **Dropped** from current scope |
| Strong authentication (CIN + OTP) | **Reduced** to name + CIN with read-back; tickets flagged `identity_verified=False` |
| Use cases 1 (auth), 3 (complaint), 5 (FAQ), 6 (human handover) | Retained, in reduced form |
| Azure TTS fallback | **Dropped** — ElevenLabs is the only TTS provider |
| Whisper large-v3 | **Replaced** by fine-tuned Whisper-small |

Rules: do not silently reintroduce dropped features; do not assume original CDC requirements are fulfilled; reduced authentication is **not** approved for production without written ARS sign-off; do not represent `identity_verified=False` tickets as strongly authenticated.

---

## 7. KPIs & acceptance criteria — unresolved

| Topic | Conflict | Status |
|---|---|---|
| Voice latency | CDC: < 3 s · implementation plan: < 5 s e2e · measured: CPU-only (4.5–5.5 s STT alone) | No GPU timing exists. Clarify whether latency = first token, first audio, or full response; whether it includes STT + retrieval + LLM + TTS + network; on which hardware |
| Chat latency | CDC: < 2 s | Not measured end-to-end |
| Tunisian WER | CDC target: < 15% · measured: **55.4%** | Open acceptance discussion. The argument that WER is imperfect for non-standard Arabizi (and that retrieval succeeded 19/19 on Tunisian transcripts) does **not** equal meeting the KPI. Settle with ARS in writing |
| Training data | CDC: 10–20 h real anonymized calls · available: ~9 h of scripted reading (Oumaima), no real call audio | Real telephone-domain accuracy is unknown |

Until the KPI definitions are clarified, **no "meets KPI" claim goes into any demo or document.**

---

## 8. Key risks

1. **Voice latency** — STT alone is 4.5–5.5 s/clip on CPU; with LLM + TTS, ~8–10 s e2e on the laptop (estimate, unmeasured). The <3 s CDC target can't be claimed without GPU numbers. The demo needs visible **listening / transcribing / thinking** states.
2. **Arabizi through TTS** — KB and Tunisian STT output are Arabizi; whether ElevenLabs reads digit-letter Darija (`3aslema`, `9lech`) intelligibly is untested. A 10-minute listening test with the real voice decides if Darija voice is demoable; fallback = voice in French, Darija in chat only.
3. **Real data exposure** — names + CIN would go to external providers with no written ARS approval, and OTP is removed (a person could claim another's CIN). **Friday uses synthetic identities only**; no real customer data in any demo, log or credential store.
4. **KPI figures disagree** — authoritative CDC KPI section still needed (§7).
5. **Retrieval numbers are optimistic** — build ~40 paraphrased questions (FR + Darija) and run them through chat before Friday as a realistic preview.
6. **KB content gaps** — ~1,700 of 5,807 docs in the Colab package have no response, and many replies are case-specific (a specific bordereau number/date). Run a SQL check that ingestion skipped empty-response docs; review how the prompt handles case-specific answers.
7. **LLM config** — confirm the configured model ID is one the API actually serves (previous notes listed `claude-sonnet-5-5` / `claude-haiku-5-5`). Check whether sentiment is a separate LLM call per message; if so, move it to a lighter model or run concurrently.
8. **Conversation-end accounting** — tab switches / new conversations drop the socket without a close event → sessions may be recorded as abandoned with no summary or email (§4.2).

---

## 9. Blockers

### 9.1 Waiting on ARS (shape what we claim, not what we build)

| Domain | Needed |
|---|---|
| Telephony / VoIP | PBX type/vendor (Asterisk, FreePBX, 3CX, Cisco…); SIP trunk provider; whether live call audio can be forked/streamed (AudioSocket, ARI/ExternalMedia, RTP, SIPREC); codec (G.711, G.729); human-transfer mechanism (queue, extension, SIP REFER…) |
| GPU server & deployment | GPU model + VRAM; `nvidia-smi` output; OS + access level; Docker + NVIDIA Container Toolkit; RAM/disk; network path to PBX; reachability of external providers |
| External services | CRM API documentation + credentials; SMS provider details; SMTP config for summaries; approved bulletin/knowledge data source; approved API credentials for LLM/STT/TTS |
| Approvals | **Written** ARS approval for sending customer names/CIN to external AI providers (providers, processing, data residency); written sign-off for the reduced identity flow (OTP removed); authoritative KPI definitions (§7); real anonymized call audio |

Do not fabricate any of these values or build integrations against guessed interfaces.

### 9.2 In our control (code / local)

| Item | Action |
|---|---|
| Docker / WSL2 | Retest engine (Docker 29.9.2 installed); then Postgres + Redis up, migrations, observe `/health` and `/ready` |
| LLM / TTS never run with live credentials | One real chat turn with a real key; TTS playback test |
| Voice path never fully run | End-to-end browser voice test (§11, Thursday) |
| Admin contract unverified | Validate `src/lib/api-admin.ts`, `useAdminSocket.ts`, `authStore.ts`, `types/admin.ts`, `types/auth.ts`, `types/ticket.ts` against backend schemas/routers (verify actual paths first) |
| Full backend suite never run | Run once Docker works |

---

## 10. Friday 13 November — demo definition

**The realistic target is a web demo — not production delivery, not live phone calls.**

**In scope:**
- Browser chat in French and Darija with RAG-grounded FAQ answers
- Complaint intake creating a **mock** ticket (synthetic identity, `identity_verified=False`)
- Escalation shown as a transfer message (no agent pool behind it)
- Sentiment, summary and email draft visible in the admin
- Browser voice **only if** it passes the smoke test by Thursday noon — with a pre-recorded successful run as backup

**Explicitly out (say so up front):** DigiHealth integration · SIP/PBX live calls · real CRM ticket creation · production human-agent transfer · any SLA, concurrency, latency or WER-target claims.

---

## 11. Plan — reach ≈60% verified by end of day, then demo-ready by Friday

**Goal:** from ≈38% to ≈60% **through actual implementation and verification, not re-scoring** (~22 points). Every item only counts when its narrowest check has been run and the output observed.

**Priority order (what moves the number):**

| # | Workstream | What counts as progress |
|---|---|---|
| 1 | Backend runtime | Docker + PostgreSQL + Redis up, migrations run, `/health` and `/ready` observed |
| 2 | Chat | Real end-to-end conversation with backend + LLM (FR and Darija, RAG answer) |
| 3 | Authentication | Auth flow working and tested against its (reduced) requirements |
| 4 | Ticketing | Complete ticket creation, validation, conversation association |
| 5 | Admin supervision | Dashboard connected to real backend data |
| 6 | Voice | Complete browser voice test: STT → response → TTS playback |

VoIP/Asterisk stays important but depends on ARS PBX/SIP info — prepare what we can without pretending phone integration is complete.

**Tuesday (today, 10 Nov)**
1. Repo snapshot + source zip (Appendix A) so the code can actually be read and audited
2. Retest Docker/WSL2 → Postgres + Redis up → migrations → observe `/health`, `/ready`
3. Start backend + frontend; run one real chat turn with a real LLM key and a RAG answer in FR and Darija
4. Auth flow test (priority 3) if time allows

**Wednesday (11 Nov)**
- Complaint → mock ticket; then escalation; then sentiment, summary, email states
- Admin routes against the backend contract (§9.2 file list)
- Paraphrase smoke test (~40 questions, FR + Darija)
- Backend focused tests + full suite (now that Docker works); frontend typecheck + lint + tests

**Thursday (12 Nov)**
- Voice end-to-end: mic capture → STT → LLM → TTS → playback, plus reconnect and failure states
- Arabizi TTS listening test (10 min, real voice) + laptop latency measurements
- **Noon: feature freeze** — bug fixes only after this point
- Demo script, checklist, backup recording

**Friday (13 Nov)**
- Rehearsal only. No new changes after the morning run-through.

**Working rule for every session:** nothing counts as verified until it has been run and the output pasted/reported. After each change: run the narrowest relevant test first, then broader checks; report exact files changed, commands run, outcomes, and remaining blockers. Distinguish at all times: implemented in code · unit-tested with mocks · tested end-to-end locally · tested against real services · production-ready.

---

## 12. Reference — file & data locations

| What | Where |
|---|---|
| Converted STT runtime model | `backend/models/whisper-ars-ct2/` |
| Original model / datasets / audio (**outside repo — do not copy in**) | `C:\Users\LENOVO\Downloads\ARS_FINAL` |
| RAG knowledge base | `ARS_FINAL\data\rag_knowledge_base.jsonl` |
| STT evaluation set | `ARS_FINAL\data\test.jsonl` |
| Audio evaluation material | `ARS_FINAL\audio\...` folders |
| Conversion input (original Whisper) | `ARS_FINAL\model\whisper_final` |
| STT eval artifacts | `stt_dump.jsonl`, `stt_clips.csv` |
| Backend entry points | `backend/app/main.py`, `routers/health.py`, `core/config.py`, `core/exceptions.py` |
| Core services | `services/orchestrator.py`, `services/rag_service.py`, `services/llm_service.py` |
| Frontend core | `src/App.tsx`, `src/widget/components/*`, `src/lib/hooks/useWebSocket.ts`, `src/lib/ws/protocol.ts`, `src/store/conversationStore.ts` |
| Admin contract files (verify paths first) | Backend: `app/schemas/*.py`, routers for conversations/tickets/KB/users/audit/dashboard/settings, any `admin*.py` · Frontend: `src/lib/api-admin.ts`, `src/lib/hooks/useAdminSocket.ts`, `src/store/authStore.ts`, `src/types/admin.ts`, `src/types/auth.ts`, `src/types/ticket.ts` |
| Infra | `backend/docker-compose.yml` (verify exists), `backend/alembic.ini`, `backend/alembic/env.py` |

---

## 13. Later milestones (post-demo)

**Short-term (next milestone after Friday)**
- Stabilize voice + WebSocket flow against real backend behavior; widget end-to-end in browser
- Real knowledge-base ingestion flow with chunk-quality review
- Add notebook-based experimentation (dataset inspection, model evaluation, RAG/embedding quality, STT latency)

**Medium-term**
- Real external integrations (CRM, SMS/SMTP) as ARS provides specs/credentials
- Security review and environment hardening; production monitoring + alerting
- Improve sentiment and escalation logic with real data

**Long-term**
- Full telecom / SIP integration on the real PBX
- ASR tuning on real Tunisian Arabic call corpora (close the 55.4% → <15% WER question)
- Production deployment with staging, rollback pipeline, HA/SLA work

---

## Appendix A — Repo snapshot script (first step of the plan)

Run from the repo root (the folder containing `backend\` and `ars-agent-ia-frontend\`):

```powershell
$o = "repo_snapshot.txt"
function Sec($t) { "`n=== $t ===" | Out-File $o -Append -Encoding utf8 }
"ARS repo snapshot $(Get-Date -Format s)" | Out-File $o -Encoding utf8

Sec "GIT"
git status --short --branch 2>&1 | Out-File $o -Append -Encoding utf8
git log --oneline -15       2>&1 | Out-File $o -Append -Encoding utf8
git stash list              2>&1 | Out-File $o -Append -Encoding utf8

Sec "FILES (tracked + untracked, .gitignore respected)"
git ls-files -co --exclude-standard | Out-File $o -Append -Encoding utf8

Sec "MODEL DIR"
Get-ChildItem backend\models -Recurse -ErrorAction SilentlyContinue |
  Select-Object FullName, Length | Out-File $o -Append -Encoding utf8

Sec "RUNTIME"
python --version 2>&1 | Out-File $o -Append -Encoding utf8
node --version   2>&1 | Out-File $o -Append -Encoding utf8
docker version   2>&1 | Out-File $o -Append -Encoding utf8

# Source archive without secrets, weights or audio. Open files.txt and check it before sharing.
git ls-files -co --exclude-standard |
  Where-Object { (Test-Path -LiteralPath $_) -and
    $_ -notmatch '(^|/)\.env($|\.(local|dev|development|prod|production)$)' -and
    $_ -notmatch '\.(safetensors|bin|pt|onnx|ckpt|wav|mp3|m4a|zip|log|db|sqlite)$' } |
  Set-Content files.txt -Encoding ascii
tar -a -c -f ars_repo_src.zip -T files.txt
```

Then upload `repo_snapshot.txt` and `ars_repo_src.zip` (includes uncommitted work; excludes `.env`, model weights, audio). Never send API keys or real customer data. If Docker still fails, also paste `docker version` and `wsl --status`.
# `build_plan.md` — Master Development Plan
## Agent IA Conversationnel Multicanal — ARS Tunisie (Département Maladie)

> **Audience :** Équipe de développement (Lead Backend, Lead Frontend, Lead AI/NLP, DevOps, QA)
> **Basé sur :** `Agent_IA_ARS_Departement_Maladie.docx` · `Cahier_des_Charges_Applicatif_Agent_IA_ARS_Tunisie.docx` · `Demande_Informations_Client_Specifications_Techniques_ARS_Tunisie.docx`
> **Version :** 1.0 — Juin 2026 | **Statut :** DRAFT — En attente validation prérequis client

---

## Table des Matières

1. [MVP Scope Definition](#1-mvp-scope-definition)
2. [Full Project Directory Tree](#2-full-project-directory-tree)
3. [Step-by-Step Build Plan (Phases & Milestones)](#3-step-by-step-build-plan-phases--milestones)
4. [AI & Model Strategy](#4-ai--model-strategy)
5. [Challenges and Mitigations](#5-challenges-and-mitigations)
6. [Recommended Technology Stack](#6-recommended-technology-stack)

---

## 1. MVP Scope Definition

### Philosophie du MVP

L'objectif du MVP est de livrer une version fonctionnelle, sécurisée et démontrable du système dans les meilleurs délais, en se concentrant sur la chaîne de valeur principale : **un assuré peut appeler ou chatter, s'authentifier, consulter son dossier, déposer une réclamation, et le système crée automatiquement un ticket avec résumé.** Tout le reste est itératif.

La sélection du périmètre MVP repose sur trois critères issus des documents :
- **Criticité métier** : ce que l'ARS attend en priorité (réduction de la charge du centre d'appels).
- **Dépendances externes** : ce qui peut être développé sans attendre les prérequis client (credentials DigiHealth, données vocales).
- **Risque technique** : les composants à fort risque (STT/TTS Derja) sont mûris en parallèle mais pas bloquants pour le MVP.

---

### MVP — Fonctionnalités INCLUSES (Phase 1 à 3)

| # | Fonctionnalité | Justification |
|---|---------------|---------------|
| 1 | **Canal Chat Web uniquement** | Pas de dépendance aux données vocales ou à l'intégration VoIP. Livrable immédiatement. |
| 2 | **Authentification assuré** (CIN + OTP SMS) | Prérequis absolu à toute consultation de données personnelles. Exigence #1 du CDC. |
| 3 | **Consultation de dossier DigiHealth** | Cas d'utilisation le plus fréquent. Dépend uniquement des credentials DigiHealth (prérequis P1). |
| 4 | **Vérification d'éligibilité DigiHealth** | Très demandé selon le contexte ARS. Même endpoint que la consultation dossier. |
| 5 | **Dépôt de réclamation** | Cas d'utilisation prioritaire. Génère un ticket CRM automatiquement. |
| 6 | **Création automatique de ticket CRM** | Valeur métier immédiate. Dépend du prérequis P3 (credentials CRM). |
| 7 | **Résumé automatique de conversation** | Fonctionnalité différenciante, réalisable dès la Phase 2 (LLM disponible). |
| 8 | **Génération automatique d'email** | Basé sur le résumé, marginal à implémenter une fois le résumé en place. |
| 9 | **Escalade vers agent humain (1-clic)** | Mécanisme simple de transfert de conversation au dashboard agent. |
| 10 | **Base de connaissances (RAG) — FAQ basique** | Permet de répondre aux questions générales sans DigiHealth. Rapide à initialiser. |
| 11 | **Tableau de bord admin — version basique** | Suivi des conversations, tickets, KPIs essentiels. |
| 12 | **Journalisation et audit logs** | Non négociable. Exigence de sécurité et conformité dès J+1. |
| 13 | **Notifications SMS/email assuré** | Confirmation de ticket créé. Faible effort, haute valeur perçue. |

---

### Fonctionnalités DIFFÉRÉES (Phase 4 et au-delà)

| # | Fonctionnalité | Raison du report |
|---|---------------|-----------------|
| 1 | **Canal VoIP (Agent Vocal)** | Dépend des données vocales Derja (10-20h d'appels), du fine-tuning STT, du clonage voix TTS, et de l'intégration Asterisk/SIP. Délai de collecte données : 5-6 semaines minimum. |
| 2 | **STT / TTS Arabe Tunisien** | Dépend de la livraison des données vocales ARS (prérequis P5 critique). Fine-tuning : 3-4 semaines supplémentaires. |
| 3 | **Analyse de sentiment temps réel** | Amélioration itérative après MVP. Peut être ajoutée en post-processing sans impact sur le flux principal. |
| 4 | **Détection d'urgence automatique** | Algorithme affiné après collecte de données réelles de production. |
| 5 | **Historique multi-sessions** | Interface assuré avancée. La base de données conserve les données dès le MVP, l'UI est différée. |
| 6 | **Export PDF/Excel des rapports** | Dashboard admin Phase 2. Fonctionnalité de confort. |
| 7 | **Pièces jointes (upload documents)** | Complexité de gestion des fichiers (scan antivirus, stockage chiffré). Phase 4. |
| 8 | **Variations régionales accent Derja** | Fine-tuning avancé ASR post-production. |
| 9 | **Dashboard analytique avancé** (Grafana public) | Opérationnel mais nécessite des données de production pour être pertinent. |

---

### Critères de Sortie du MVP

Le MVP est considéré prêt pour la mise en production lorsque :
- ✅ Taux de résolution automatique (chat) > 60% en recette UAT
- ✅ Latence de réponse LLM < 3 secondes (p95) en conditions de charge simulée
- ✅ Zéro vulnérabilité critique détectée au pentest
- ✅ Audit trail complet pour 100% des interactions
- ✅ API DigiHealth intégrée et testée sur environnement staging
- ✅ Recette UAT validée par l'équipe ARS Tunisie sur les 6 cas d'utilisation du CDC

---

## 2. Full Project Directory Tree

> **Convention :** Chaque ligne de description suit le format `→ [description courte du rôle du fichier/dossier]`

```
ars-agent-ia/
│
├── README.md                                → Point d'entrée du projet : setup rapide, liens docs, statut du build
├── .gitignore                               → Exclusions Git (venvs, .env, __pycache__, node_modules, etc.)
├── .env.example                             → Template des variables d'environnement (jamais commité avec valeurs réelles)
├── docker-compose.yml                       → Orchestration locale de tous les services (dev / test)
├── docker-compose.prod.yml                  → Surcharge pour l'environnement de production
├── Makefile                                 → Commandes de shortcut (make dev, make test, make migrate, make lint)
│
├── docs/                                    → Documentation technique du projet
│   ├── archi.md                             → Architecture de référence (Single Source of Truth)
│   ├── build_plan.md                        → Ce fichier — Plan de développement master
│   ├── api/                                 → Spécifications OpenAPI générées et manuelles
│   │   ├── internal_api.yaml                → API REST interne Backend ↔ Frontend
│   │   └── digihealth_api.yaml              → Copie de la spec Swagger DigiHealth (fournie par ARS)
│   ├── adr/                                 → Architecture Decision Records (décisions techniques documentées)
│   │   ├── ADR-001-llm-choice.md            → Justification du choix LLM (Claude vs OpenAI vs open-source)
│   │   ├── ADR-002-stt-strategy.md          → Décision STT (cloud vs fine-tune Whisper)
│   │   ├── ADR-003-tts-strategy.md          → Décision TTS (ElevenLabs vs Azure Neural)
│   │   ├── ADR-004-orchestration.md         → Décision orchestration (LangGraph vs state machine custom)
│   │   └── ADR-005-database-strategy.md     → Choix des bases de données (PostgreSQL + Redis + pgvector)
│   └── runbooks/                            → Procédures opérationnelles (déploiement, rollback, incident)
│       ├── deployment.md                    → Procédure de déploiement en production
│       ├── rollback.md                      → Procédure de rollback en cas d'incident
│       └── incident-response.md             → Gestion des incidents (qui appeler, quels logs consulter)
│
├── backend/                                 → Application Python (FastAPI) — cœur du système
│   ├── Dockerfile                           → Image Docker du backend (multi-stage build)
│   ├── requirements.txt                     → Dépendances Python de production
│   ├── requirements-dev.txt                 → Dépendances de développement (pytest, black, ruff, mypy)
│   ├── alembic.ini                          → Configuration de l'outil de migration de base de données Alembic
│   │
│   ├── alembic/                             → Migrations de base de données versionnées
│   │   ├── env.py                           → Environnement Alembic (connexion DB, import des modèles)
│   │   └── versions/                        → Fichiers de migration générés automatiquement
│   │       ├── 001_create_conversations.py  → Migration initiale : tables conversations, messages
│   │       ├── 002_create_tickets.py        → Migration : table tickets CRM
│   │       └── 003_create_audit_logs.py     → Migration : table audit_events (append-only)
│   │
│   ├── app/                                 → Package principal de l'application FastAPI
│   │   ├── __init__.py
│   │   ├── main.py                          → Point d'entrée FastAPI : création de l'app, inclusion des routers, lifespan
│   │   ├── config.py                        → Chargement et validation des variables d'environnement (Pydantic Settings)
│   │   │
│   │   ├── routers/                         → Définition de tous les endpoints API REST
│   │   │   ├── __init__.py
│   │   │   ├── chat.py                      → WebSocket endpoint pour le chat web (/ws/chat/{session_id})
│   │   │   ├── voip.py                      → Endpoints pour l'intégration Asterisk AGI/AMI (Phase 4)
│   │   │   ├── auth.py                      → Endpoints d'authentification assuré (/auth/initiate, /auth/verify-otp)
│   │   │   ├── conversations.py             → CRUD conversations et messages (lecture admin, export)
│   │   │   ├── tickets.py                   → Endpoints de gestion des tickets (status, update, list)
│   │   │   ├── knowledge_base.py            → Upload et gestion des documents de la base de connaissances
│   │   │   ├── admin.py                     → Endpoints du tableau de bord admin (stats, users, config)
│   │   │   ├── health.py                    → Endpoint de health check (/health, /ready) pour le load balancer
│   │   │   └── webhooks.py                  → Réception des webhooks entrants (CRM, SMS gateway)
│   │   │
│   │   ├── models/                          → Modèles de données SQLAlchemy (ORM) et schémas Pydantic
│   │   │   ├── __init__.py
│   │   │   ├── db/                          → Modèles SQLAlchemy (mapping base de données)
│   │   │   │   ├── base.py                  → Classe de base SQLAlchemy avec champs communs (id, created_at, updated_at)
│   │   │   │   ├── conversation.py          → Modèle Conversation (id, channel, assure_id, status, sentiment_score...)
│   │   │   │   ├── message.py               → Modèle Message (id, conversation_id, role, content, timestamp, tokens)
│   │   │   │   ├── ticket.py                → Modèle Ticket (id, crm_id, category, priority, status, email_draft...)
│   │   │   │   ├── audit_event.py           → Modèle AuditEvent (append-only, hmac_signature, immutable triggers)
│   │   │   │   ├── user.py                  → Modèle User (agents ARS internes : nom, rôle, email, hash_mdp)
│   │   │   │   └── knowledge_doc.py         → Modèle KnowledgeDoc (titre, source_url, statut_indexation, chunk_count)
│   │   │   └── schemas/                     → Schémas Pydantic (validation requêtes/réponses API)
│   │   │       ├── conversation.py          → ConversationCreate, ConversationRead, ConversationSummary
│   │   │       ├── message.py               → MessageCreate, MessageRead
│   │   │       ├── ticket.py                → TicketCreate, TicketRead, TicketUpdate, EmailDraft
│   │   │       ├── auth.py                  → AuthInitiateRequest, OTPVerifyRequest, AuthResponse (JWT payload)
│   │   │       ├── assure.py                → AssureProfile (réponse DigiHealth normalisée)
│   │   │       └── admin.py                 → DashboardStats, UserCreate, UserUpdate
│   │   │
│   │   ├── services/                        → Logique métier pure (indépendante du transport HTTP/WS)
│   │   │   ├── __init__.py
│   │   │   ├── orchestrator.py              → Machine à états conversationnelle (INIT→AUTH→CLASSIFY→QUERY→RESPOND→CLOSE)
│   │   │   ├── llm_service.py               → Client LLM unifié (Claude primary, OpenAI fallback, retry, streaming)
│   │   │   ├── rag_service.py               → Service RAG : query vectorielle, ranking, injection contexte LLM
│   │   │   ├── auth_service.py              → Logique d'authentification assuré (génération OTP, vérification, lockout)
│   │   │   ├── summarizer.py                → Workflow génération résumé structuré + email professionnel via LLM
│   │   │   ├── sentiment_service.py         → Analyse de sentiment par message (appel LLM ou modèle dédié)
│   │   │   ├── escalation_service.py        → Évaluation des règles d'escalade (6 règles définies dans archi.md)
│   │   │   ├── notification_service.py      → Envoi SMS (via gateway) et emails (SMTP / SendGrid)
│   │   │   └── admin_service.py             → Calcul des KPIs, agrégation des statistiques pour le dashboard
│   │   │
│   │   ├── integrations/                    → Adaptateurs vers les systèmes externes (pattern Adapter)
│   │   │   ├── __init__.py
│   │   │   ├── digihealth/                  → Client DigiHealth API
│   │   │   │   ├── __init__.py
│   │   │   │   ├── client.py                → Client HTTP async (httpx) avec auth, retry, circuit breaker
│   │   │   │   ├── models.py                → Modèles Pydantic pour les réponses DigiHealth (Assure, Dossier, etc.)
│   │   │   │   └── mock.py                  → Mock DigiHealth pour les tests (utilisé quand credentials absents)
│   │   │   ├── crm/                         → Client CRM/Ticketing
│   │   │   │   ├── __init__.py
│   │   │   │   ├── client.py                → Client HTTP async, création et mise à jour de tickets
│   │   │   │   ├── models.py                → Modèles Pydantic pour le CRM (TicketPayload, TicketResponse)
│   │   │   │   └── mock.py                  → Mock CRM pour les tests
│   │   │   ├── sms_gateway/                 → Client passerelle SMS
│   │   │   │   ├── __init__.py
│   │   │   │   └── client.py                → Envoi SMS OTP et notifications via API SMS tunisienne
│   │   │   ├── stt/                         → Adaptateurs STT (abstraction pour switcher de fournisseur)
│   │   │   │   ├── __init__.py
│   │   │   │   ├── base.py                  → Interface abstraite STTProvider (transcribe(audio_bytes) → str)
│   │   │   │   ├── whisper_client.py        → Implémentation Whisper (self-hosted, fine-tuned)
│   │   │   │   └── google_stt_client.py     → Implémentation Google Cloud STT (fallback cloud)
│   │   │   ├── tts/                         → Adaptateurs TTS (abstraction pour switcher de fournisseur)
│   │   │   │   ├── __init__.py
│   │   │   │   ├── base.py                  → Interface abstraite TTSProvider (synthesize(text) → bytes)
│   │   │   │   ├── elevenlabs_client.py     → Implémentation ElevenLabs (voix "ARS Voice" clonée)
│   │   │   │   └── azure_tts_client.py      → Implémentation Azure Neural TTS (fallback)
│   │   │   └── voip/                        → Intégration Asterisk/FreeSWITCH (Phase 4)
│   │   │       ├── __init__.py
│   │   │       ├── asterisk_agi.py          → Handler AGI (Asterisk Gateway Interface) pour les appels entrants
│   │   │       └── asterisk_ami.py          → Client AMI pour le contrôle programmatique (transfert d'appel)
│   │   │
│   │   ├── core/                            → Utilitaires transversaux (sécurité, logging, cache, exceptions)
│   │   │   ├── __init__.py
│   │   │   ├── security.py                  → Génération/validation JWT, hachage MDP (bcrypt), RBAC decorators
│   │   │   ├── logging.py                   → Configuration du logger structuré JSON (structlog)
│   │   │   ├── audit.py                     → Écriture des événements d'audit (append-only, HMAC-SHA256)
│   │   │   ├── cache.py                     → Interface Redis (get/set/delete session, conversation state)
│   │   │   ├── exceptions.py                → Exceptions métier custom (AuthFailure, DigiHealthUnavailable, etc.)
│   │   │   ├── circuit_breaker.py           → Implémentation du pattern Circuit Breaker pour les appels externes
│   │   │   ├── rate_limiter.py              → Rate limiting par IP et par session (protection contre les abus)
│   │   │   └── secrets.py                   → Client Secret Manager (HashiCorp Vault ou AWS Secrets Manager)
│   │   │
│   │   └── db/                              → Couche d'accès aux données
│   │       ├── __init__.py
│   │       ├── session.py                   → Création de la session SQLAlchemy async + pool de connexions
│   │       └── repositories/                → Pattern Repository (abstraction des requêtes DB)
│   │           ├── __init__.py
│   │           ├── conversation_repo.py     → CRUD Conversation et Message
│   │           ├── ticket_repo.py           → CRUD Ticket
│   │           ├── audit_repo.py            → Insert-only AuditEvent (pas de update/delete)
│   │           ├── user_repo.py             → CRUD Users (agents ARS)
│   │           └── knowledge_repo.py        → Gestion des documents et statut d'indexation
│   │
│   └── tests/                               → Suite de tests backend
│       ├── conftest.py                      → Fixtures pytest partagées (DB de test, mocks, client HTTP de test)
│       ├── unit/                            → Tests unitaires (logique métier isolée, sans I/O)
│       │   ├── test_orchestrator.py         → Tests de la machine à états (chaque transition d'état)
│       │   ├── test_auth_service.py         → Tests logique OTP (génération, validation, lockout)
│       │   ├── test_summarizer.py           → Tests génération résumé (mocked LLM)
│       │   ├── test_escalation_service.py   → Tests règles d'escalade (chaque règle individuellement)
│       │   └── test_sentiment_service.py    → Tests analyse sentiment
│       ├── integration/                     → Tests d'intégration (avec DB de test, mocks externes)
│       │   ├── test_digihealth_client.py    → Tests client DigiHealth (avec mock server)
│       │   ├── test_crm_client.py           → Tests client CRM (avec mock server)
│       │   ├── test_chat_flow.py            → Test du flux complet de conversation via WebSocket
│       │   └── test_auth_flow.py            → Test du flux d'authentification complet
│       └── e2e/                             → Tests end-to-end (contre environnement staging complet)
│           ├── test_full_conversation.py    → Scénario complet : auth → consultation → ticket → résumé
│           └── test_escalation.py           → Scénario escalade complète avec transfert dashboard
│
├── frontend/                                → Applications React (Chat Widget + Admin Dashboard)
│   ├── package.json                         → Dépendances npm (React, Vite, TailwindCSS, socket.io-client...)
│   ├── package-lock.json                    → Lock file npm (versions exactes pour builds reproductibles)
│   ├── vite.config.ts                       → Configuration Vite (bundler) : alias, proxy dev, variables env
│   ├── tailwind.config.ts                   → Configuration TailwindCSS (thème ARS : couleurs, typographie)
│   ├── tsconfig.json                        → Configuration TypeScript strict
│   ├── Dockerfile                           → Build multi-stage : build React → nginx pour servir les assets
│   ├── nginx.conf                           → Configuration nginx pour servir le SPA + proxy API
│   │
│   ├── src/
│   │   ├── main.tsx                         → Point d'entrée React : montage de l'app, providers globaux
│   │   ├── App.tsx                          → Composant racine : routing (React Router), thème global
│   │   │
│   │   ├── widget/                          → Application Chat Widget (à embarquer sur le portail ARS)
│   │   │   ├── index.tsx                    → Point d'entrée du widget (export pour intégration externe)
│   │   │   ├── Widget.tsx                   → Composant racine du widget : bouton flottant + panneau de chat
│   │   │   ├── components/
│   │   │   │   ├── ChatWindow.tsx           → Fenêtre de conversation (liste des messages, zone de saisie)
│   │   │   │   ├── MessageBubble.tsx        → Bulle de message (user vs agent, horodatage, état livraison)
│   │   │   │   ├── TypingIndicator.tsx      → Animation "Agent est en train de répondre..."
│   │   │   │   ├── AuthForm.tsx             → Formulaire d'authentification (CIN, OTP) intégré au chat
│   │   │   │   ├── FileUpload.tsx           → Zone de drag-and-drop pour pièces jointes (Phase 4)
│   │   │   │   └── FeedbackButtons.tsx      → Boutons satisfaction (👍/👎) en fin de conversation
│   │   │   ├── hooks/
│   │   │   │   ├── useWebSocket.ts          → Hook de gestion de la connexion WebSocket (connect, reconnect, send)
│   │   │   │   ├── useConversation.ts       → Hook état de la conversation (messages, statut, session_id)
│   │   │   │   └── useAuth.ts               → Hook authentification assuré (état, actions, erreurs)
│   │   │   └── utils/
│   │   │       ├── rtl.ts                   → Utilitaires RTL/LTR (détection langue arabe, classe CSS dir)
│   │   │       └── format.ts                → Formatage de dates, montants en Dinars, numéros
│   │   │
│   │   ├── admin/                           → Application Dashboard Admin (accès agents ARS internes)
│   │   │   ├── index.tsx                    → Point d'entrée de l'admin app
│   │   │   ├── AdminApp.tsx                 → Layout admin : sidebar + header + zone de contenu
│   │   │   ├── pages/
│   │   │   │   ├── Dashboard.tsx            → Page principale : KPIs, graphiques temps réel, alertes
│   │   │   │   ├── Conversations.tsx        → Liste et recherche des conversations (filtres : date, canal, statut)
│   │   │   │   ├── ConversationDetail.tsx   → Vue détaillée : transcript, résumé, email draft, actions
│   │   │   │   ├── Tickets.tsx              → Gestion des tickets CRM (vue Kanban + liste)
│   │   │   │   ├── KnowledgeBase.tsx        → Upload, prévisualisation et gestion de la base de connaissances
│   │   │   │   ├── AuditLogs.tsx            → Consultation des journaux d'audit (lecture seule, filtres)
│   │   │   │   ├── Users.tsx                → Gestion des utilisateurs ARS (CRUD, rôles, MFA)
│   │   │   │   ├── Settings.tsx             → Configuration du système (règles escalade, seuils sentiment)
│   │   │   │   └── Login.tsx                → Page de connexion admin (email + mot de passe + TOTP MFA)
│   │   │   ├── components/
│   │   │   │   ├── KPICard.tsx              → Carte de métrique individuelle (valeur, tendance, couleur seuil)
│   │   │   │   ├── ConversationTable.tsx    → Tableau de conversations avec pagination et tri
│   │   │   │   ├── TicketKanban.tsx         → Vue Kanban des tickets (drag-and-drop, couleurs priorité)
│   │   │   │   ├── SentimentBadge.tsx       → Badge coloré d'état émotionnel (vert/jaune/rouge)
│   │   │   │   ├── LiveFeed.tsx             → Flux temps réel des conversations actives
│   │   │   │   ├── EmailPreview.tsx         → Prévisualisation de l'email auto-généré avec bouton "Envoyer"
│   │   │   │   └── Charts/
│   │   │   │       ├── VolumeChart.tsx      → Graphique volume d'interactions par heure/jour
│   │   │   │       ├── ResolutionRate.tsx   → Graphique taux de résolution dans le temps
│   │   │   │       └── SentimentTrend.tsx   → Évolution du sentiment moyen dans le temps
│   │   │   └── hooks/
│   │   │       ├── useAdminSocket.ts        → WebSocket admin pour les mises à jour temps réel du dashboard
│   │   │       └── useKPIs.ts               → Fetch et mise à jour des KPIs (polling ou SSE)
│   │   │
│   │   ├── shared/                          → Composants et utilitaires partagés entre widget et admin
│   │   │   ├── components/
│   │   │   │   ├── Button.tsx               → Composant Button (variantes : primary, secondary, danger)
│   │   │   │   ├── Input.tsx                → Composant Input avec gestion d'erreurs et aria-labels
│   │   │   │   ├── Modal.tsx                → Composant Modal réutilisable
│   │   │   │   ├── Toast.tsx                → Notifications toast (succès, erreur, info)
│   │   │   │   └── Spinner.tsx              → Indicateur de chargement (accessible)
│   │   │   ├── api/
│   │   │   │   ├── client.ts                → Client HTTP axios/fetch configuré (base URL, interceptors JWT)
│   │   │   │   ├── auth.ts                  → Appels API d'authentification
│   │   │   │   ├── conversations.ts         → Appels API conversations
│   │   │   │   └── tickets.ts               → Appels API tickets
│   │   │   └── store/
│   │   │       ├── authStore.ts             → État global d'authentification (Zustand)
│   │   │       └── conversationStore.ts     → État global de la conversation active (Zustand)
│   │   │
│   │   └── types/                           → Définitions TypeScript partagées
│   │       ├── conversation.ts              → Types Conversation, Message, ConversationStatus
│   │       ├── ticket.ts                    → Types Ticket, EmailDraft, TicketPriority
│   │       └── assure.ts                    → Type AssureProfile (données DigiHealth côté frontend)
│   │
│   └── tests/                               → Tests frontend
│       ├── unit/                            → Tests unitaires composants (Vitest + Testing Library)
│       │   ├── ChatWindow.test.tsx          → Rendu et interactions du composant chat
│       │   ├── AuthForm.test.tsx            → Validation formulaire authentification
│       │   └── useWebSocket.test.ts         → Tests du hook WebSocket (connexion, reconnexion, messages)
│       └── e2e/                             → Tests end-to-end navigateur (Playwright)
│           ├── chat-flow.spec.ts            → Parcours complet : ouverture widget → auth → question → réponse
│           └── admin-dashboard.spec.ts      → Parcours admin : connexion → consultation → action sur ticket
│
├── ai/                                      → Tout ce qui concerne les modèles IA custom (STT, TTS)
│   ├── README.md                            → Guide de la section AI : prérequis, workflows d'entraînement
│   │
│   ├── data/                                → Données d'entraînement (structure, jamais les fichiers raw en Git)
│   │   ├── README.md                        → Instructions pour récupérer les données depuis le stockage sécurisé
│   │   ├── raw/                             → (gitignored) Données brutes fournies par ARS (appels, enregistrements)
│   │   ├── processed/                       → (gitignored) Données après nettoyage et normalisation
│   │   └── splits/                          → (gitignored) Splits train/validation/test (ratios 80/10/10)
│   │
│   ├── asr/                                 → Fine-tuning du modèle ASR (Speech Recognition — Derja)
│   │   ├── data_preparation/
│   │   │   ├── anonymize.py                 → Script d'anonymisation des enregistrements d'appels (NER + masquage)
│   │   │   ├── convert_audio.py             → Conversion audio vers WAV 16kHz mono (standard Whisper)
│   │   │   ├── transcription_validator.py   → Validation des transcriptions (longueur, caractères invalides)
│   │   │   └── build_dataset.py             → Construction du dataset HuggingFace (AudioDataset + metadata)
│   │   ├── training/
│   │   │   ├── config.yaml                  → Hyperparamètres : learning rate, batch size, epochs, warmup steps
│   │   │   ├── train_whisper.py             → Script fine-tuning Whisper large-v3 sur données ARS Derja
│   │   │   └── evaluate.py                  → Calcul WER sur le split de test avec exemples d'erreurs
│   │   ├── evaluation/
│   │   │   ├── benchmark_ars_scenarios.py   → Évaluation sur les 50-100 scénarios types ARS (scripts de test)
│   │   │   └── domain_vocab_analysis.py     → Analyse des erreurs sur vocabulaire métier (CIN, remboursement...)
│   │   └── models/                          → (gitignored) Checkpoints et modèles entraînés
│   │
│   ├── tts/                                 → Création et évaluation de la voix "ARS Voice"
│   │   ├── data_preparation/
│   │   │   ├── validate_recordings.py       → Validation qualité audio (SNR, fréquence, durée)
│   │   │   ├── segment_audio.py             → Découpage des longues sessions en segments de 5-30 secondes
│   │   │   └── build_voice_dataset.py       → Construction du dataset pour clonage (ElevenLabs ou CoquiTTS)
│   │   ├── cloning/
│   │   │   ├── elevenlabs_voice_clone.py    → Script d'upload et clonage de voix via ElevenLabs API
│   │   │   └── generate_test_samples.py     → Génération d'échantillons de la voix ARS pour validation
│   │   └── evaluation/
│   │       ├── mos_evaluation.py            → Framework d'évaluation Mean Opinion Score (MOS)
│   │       └── domain_terms_test.py         → Test de prononciation des 50-100 termes métier ARS
│   │
│   └── rag/                                 → Indexation et gestion de la base de connaissances RAG
│       ├── indexer.py                       → Pipeline : chargement document → chunking → embedding → upsert vector store
│       ├── chunker.py                       → Stratégie de découpage (512 tokens, overlap 50, respect des sections)
│       ├── embedder.py                      → Client embedding (OpenAI text-embedding-3-large ou équivalent)
│       ├── query.py                         → Fonction de recherche vectorielle (top-k, threshold, reranking)
│       └── initial_docs/                    → Documents initiaux à indexer (FAQ ARS, procédures, réglementation)
│           ├── faq_ars.pdf                  → FAQ officielle ARS Tunisie
│           ├── procedures_remboursement.pdf → Procédures de remboursement
│           └── guide_reclamation.pdf        → Guide de dépôt de réclamation
│
├── infra/                                   → Infrastructure as Code
│   ├── terraform/                           → Provisioning de l'infrastructure cloud (si applicable)
│   │   ├── main.tf                          → Ressources principales (VMs, LB, VPC, Security Groups)
│   │   ├── variables.tf                     → Variables Terraform (region, instance_type, env)
│   │   └── outputs.tf                       → Outputs (IPs, DNS, endpoints)
│   ├── kubernetes/                          → Manifestes Kubernetes (si déploiement K8s)
│   │   ├── namespace.yaml                   → Namespace "ars-agent"
│   │   ├── backend-deployment.yaml          → Déploiement du backend (replicas, ressources, liveness probes)
│   │   ├── frontend-deployment.yaml         → Déploiement du frontend nginx
│   │   ├── redis-statefulset.yaml           → StatefulSet Redis Cluster
│   │   ├── postgres-statefulset.yaml        → StatefulSet PostgreSQL avec PVC
│   │   ├── ingress.yaml                     → Ingress nginx (TLS termination, routage /api, /ws, /)
│   │   └── hpa.yaml                         → HorizontalPodAutoscaler (backend et frontend)
│   ├── monitoring/                          → Configuration de l'observabilité
│   │   ├── prometheus/
│   │   │   └── prometheus.yml               → Config Prometheus (scrape_configs, alerting rules)
│   │   ├── grafana/
│   │   │   └── dashboards/
│   │   │       ├── ars_agent_overview.json  → Dashboard Grafana principal (KPIs, latences, volumes)
│   │   │       └── ars_security.json        → Dashboard sécurité (tentatives auth, lockouts, anomalies)
│   │   └── alerts/
│   │       └── alert_rules.yaml             → Règles d'alerte (latence LLM, erreur DigiHealth, uptime VoIP)
│   └── asterisk/                            → Configuration Asterisk (Canal VoIP — Phase 4)
│       ├── extensions.conf                  → Dial plan : règles de routage des appels vers l'AGI
│       ├── sip.conf                         → Configuration SIP trunk et peers
│       └── agi-bin/                         → Scripts AGI Python appelés par Asterisk
│           └── agent_handler.py             → Point d'entrée AGI : appel Asterisk → Backend AI
│
└── .github/                                 → Configuration GitHub Actions (CI/CD)
    └── workflows/
        ├── ci.yml                           → Pipeline CI : lint, type-check, tests unitaires et intégration
        ├── cd-staging.yml                   → Déploiement automatique sur staging (merge sur develop)
        └── cd-prod.yml                      → Déploiement en production (tag release, approbation manuelle)
```

---

## 3. Step-by-Step Build Plan (Phases & Milestones)

### Vue d'ensemble du Planning

```
TIMELINE GLOBALE (MVP + Phase VoIP)
────────────────────────────────────────────────────────────────────────────────
Semaine :  1    2    3    4    5    6    7    8    9   10   11   12   13   14   15   16+
           │────────────────────────────────────────────────────────────────────│
Phase 0 :  ████ ██                                                              Setup & Infra
Phase 1 :       ████ ████ ████                                                  Core Backend API
Phase 2 :            ████ ████ ████                                             AI Integration
Phase 3 :                      ████ ████ ████                                   Frontend + Dashboard
Phase 4 :                                  ████ ████                            Tests & Sécurité
Phase 5 :                                            ████ ████                  MVP Go-Live
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 [Parallèle] Collecte données vocales ARS :
           ████ ████ ████ ████ ████                                             Semaines 1-6
 [Parallèle] Fine-tuning STT + Clonage TTS :
                                ████ ████ ████ ████                             Semaines 5-10
Phase VoIP :                                         ████ ████ ████ ████ ████   Semaines 11-16
────────────────────────────────────────────────────────────────────────────────
```

---

### Phase 0 : Setup & Infrastructure (Semaines 1-2)

**Objectif :** Mettre en place tous les fondamentaux techniques et organisationnels qui permettront à toutes les équipes de travailler en parallèle dès la Phase 1.

#### Livrables

- [ ] Dépôt Git créé avec la structure de répertoires complète (Section 2)
- [ ] Environnements configurés : `dev`, `staging`, `prod`
- [ ] Docker Compose fonctionnel localement (PostgreSQL + Redis + Backend + Frontend)
- [ ] Pipeline CI/CD GitHub Actions opérationnel (lint, tests, deploy staging)
- [ ] Secrets Manager configuré (HashiCorp Vault ou équivalent) avec rotation des clés
- [ ] Bases de données initialisées (PostgreSQL + extensions pgvector) avec migrations Alembic
- [ ] Variables d'environnement documentées (`.env.example` exhaustif)
- [ ] Accès SSH/VPN aux environnements de développement distribués à toute l'équipe
- [ ] Documentation ADR initiales rédigées (ADR-001 à ADR-005)
- [ ] **Mock DigiHealth opérationnel** (ne pas bloquer Phase 1 en attendant les credentials ARS)
- [ ] **Mock CRM opérationnel** (idem)

#### Dépendances

- **Internes :** Aucune — c'est la phase fondatrice
- **Externes :** Décision sur le choix d'hébergement ARS (on-premise vs cloud) pour configurer l'infra cible

#### Durée estimée : 2 semaines

#### Critères de succès

- `docker-compose up` démarre tous les services sans erreur en < 60 secondes sur un poste de développeur
- Le pipeline CI exécute les tests et déploie sur staging en < 10 minutes
- Chaque membre de l'équipe peut créer une branche, pousser du code et voir le déploiement en staging automatiquement

#### Travaux parallèles

Dès la Semaine 1 : **Lancer la demande de données vocales ARS** (prérequis P5). C'est le chemin critique le plus long du projet.

---

### Phase 1 : Core Backend API (Semaines 2-5)

**Objectif :** Construire toute la plomberie backend — authentification, modèles de données, intégrations (avec mocks), machine à états conversationnelle de base.

#### Livrables

- [ ] **Endpoint WebSocket** `/ws/chat/{session_id}` opérationnel (connexion, envoi/réception de messages, déconnexion)
- [ ] **Modèles de données complets** (SQLAlchemy) + migrations Alembic pour Conversation, Message, Ticket, AuditEvent, User
- [ ] **Service d'authentification** complet : initiation (envoi OTP SMS), vérification OTP, gestion du lockout (3 tentatives), génération JWT
- [ ] **Machine à états** de base (Orchestrateur) : INIT → AUTHENTICATE → CLASSIFY_INTENT → RESPOND → CLOSE
- [ ] **Client DigiHealth** (contre le mock en Phase 1, contre l'API réelle dès réception des credentials) : endpoints dossier, réclamations, remboursements, éligibilité
- [ ] **Client CRM** (contre le mock) : création de ticket avec schéma JSON complet
- [ ] **Service d'audit** : écriture de tous les événements avec HMAC-SHA256, API de lecture (admin uniquement)
- [ ] **Cache Redis** opérationnel : session state, conversation context, cache DigiHealth (TTL 5 min)
- [ ] **Circuit Breaker** sur tous les appels externes (DigiHealth, CRM, SMS Gateway)
- [ ] **Endpoints admin** de base : liste conversations, détail conversation, stats quotidiennes
- [ ] **Tests unitaires et d'intégration** : couverture > 80% sur les services

#### Dépendances

- **Internes :** Phase 0 terminée (infra, mocks disponibles)
- **Externes :**
  - Credentials DigiHealth (P1) → intégration réelle dès disponibilité, mock en attendant
  - Credentials CRM (P3) → intégration réelle dès disponibilité, mock en attendant
  - Credentials SMS Gateway → intégration OTP réelle (mock email pour les tests)

#### Durée estimée : 3 semaines (Semaines 2-5)

#### Critères de succès

- Un client WebSocket peut se connecter, s'authentifier (via OTP mocké), et recevoir une réponse statique de l'orchestrateur
- Les événements d'audit sont écrits pour 100% des actions (vérifiable par requête SQL)
- Tous les appels DigiHealth (mockés) passent par le circuit breaker et sont tracés dans les logs
- `pytest` passe avec > 80% de couverture sur les modules `services/` et `integrations/`

---

### Phase 2 : AI Integration (Semaines 3-6)

**Objectif :** Brancher le LLM sur la machine à états, intégrer le RAG, implémenter le résumé et la génération d'email.

> Note : La Phase 2 démarre à la Semaine 3, **en parallèle** avec la Phase 1. Les deux phases partagent l'interface de l'Orchestrateur comme point de rencontre à la Semaine 5.

#### Livrables

- [ ] **LLM Service** opérationnel : client Claude API (Anthropic) avec fallback OpenAI, retry (3x), streaming, gestion des tokens
- [ ] **Tool Use / Function Calling** configuré : 8 outils définis (authenticate_user, query_digihealth_*, create_crm_ticket, query_knowledge_base, generate_summary, generate_email)
- [ ] **System Prompt de production** rédigé et validé : rôle ARS, règles de conduite, instructions multilingues (FR + Derja romanisé)
- [ ] **Pipeline RAG** complet : indexation des documents initiaux ARS, query vectorielle, injection contexte LLM
- [ ] **Intent Classification** : le LLM classifie correctement les 6 intents définis dans le CDC (seuil > 85% sur jeu de test)
- [ ] **Workflow de résumé** : génération du résumé JSON structuré en < 5 secondes après fin de conversation
- [ ] **Workflow d'email** : génération du brouillon d'email professionnel en français à partir du résumé
- [ ] **Analyse de sentiment** : score -1 à +1 calculé à chaque message (via LLM ou modèle léger)
- [ ] **Règles d'escalade** implémentées : les 6 règles évaluées à chaque tour, déclenchement du workflow d'escalade
- [ ] **Tests** : 20+ scénarios de conversation couvrant les 6 cas d'utilisation du CDC

#### Dépendances

- **Internes :** WebSocket et machine à états de base (Phase 1 — Semaine 4)
- **Externes :**
  - Validation écrite ARS pour l'API Claude (P4) — obligatoire avant déploiement en production
  - Validation écrite ARS pour l'API OpenAI (P4) — idem

#### Durée estimée : 3 semaines (Semaines 3-6)

#### Critères de succès

- Un assuré fictif peut passer un flux complet (auth → consultation dossier DigiHealth mocké → réponse LLM en français) en < 5 secondes de latence totale
- Le résumé généré est structurellement valide (validation Pydantic) pour 100% des conversations
- L'intent "DEPOT_RECLAMATION" déclenche systématiquement la création d'un ticket CRM

---

### Phase 3 : Frontend Chat Widget & Admin Dashboard (Semaines 5-8)

**Objectif :** Construire les deux interfaces utilisateur : le widget de chat pour le portail ARS et le tableau de bord admin.

> Phase démarrant à la Semaine 5, en parallèle avec la fin de la Phase 2.

#### Livrables

**Chat Widget :**
- [ ] Widget React intégrable (script tag) avec bouton flottant et panneau de chat
- [ ] Connexion WebSocket avec reconnexion automatique (backoff exponentiel)
- [ ] Affichage des messages avec streaming (affichage progressif de la réponse LLM)
- [ ] Formulaire d'authentification intégré (CIN + OTP)
- [ ] Support RTL/LTR dynamique (arabe/français)
- [ ] Boutons de satisfaction en fin de conversation
- [ ] Indicateur "Agent est en train de répondre..."
- [ ] Responsive mobile (< 768px)

**Dashboard Admin :**
- [ ] Page de connexion sécurisée (email + MDP + TOTP MFA)
- [ ] Dashboard principal : KPIs temps réel (conversations actives, taux résolution, sentiment moyen)
- [ ] Liste des conversations avec filtres (date, canal, statut, CIN assuré)
- [ ] Détail conversation : transcript complet + résumé + prévisualisation email
- [ ] Bouton "Valider et envoyer l'email" sur l'email auto-généré
- [ ] Vue tickets (liste + statut)
- [ ] Interface de gestion de la base de connaissances (upload PDF, statut indexation)
- [ ] Flux temps réel des conversations actives (LiveFeed via WebSocket admin)

#### Dépendances

- **Internes :** Backend WebSocket (Phase 1) + LLM Integration (Phase 2)
- **Externes :** Aucune dépendance externe bloquante (peut avancer avec mocks)

#### Durée estimée : 3 semaines (Semaines 5-8)

#### Critères de succès

- Le widget s'intègre sur une page HTML statique avec une seule balise `<script>`
- Un agent ARS peut consulter, commenter et envoyer l'email généré directement depuis le dashboard
- Le dashboard se charge en < 2 secondes (LCP) sur une connexion 4G
- Tests Playwright : les 2 parcours e2e (chat + admin) passent sans erreur

---

### Phase 4 : Testing & Security Hardening (Semaines 8-10)

**Objectif :** Valider la sécurité, les performances et la conformité avant la mise en production.

#### Livrables

- [ ] **Tests de charge** : simulation de 200 conversations WebSocket simultanées (outils : Locust ou k6). Valider latence < 3s p95
- [ ] **Pentest** : test de pénétration externe sur l'application complète (OWASP Top 10 minimum)
- [ ] **Revue de sécurité des secrets** : audit des variables d'environnement, rotation des clés, vérification que aucun secret n'est commité en Git
- [ ] **Validation de l'audit trail** : vérification manuelle que 100% des événements définis sont enregistrés
- [ ] **Tests UAT (User Acceptance Testing)** : validation par l'équipe ARS Tunisie sur les 6 cas d'utilisation du CDC
- [ ] **Test de bascule** : simulation d'une panne DigiHealth → vérification que le circuit breaker s'active et que l'assuré reçoit une réponse gracieuse
- [ ] **Test de fallback LLM** : simulation de panne Claude API → vérification que OpenAI prend le relais automatiquement
- [ ] **Conformité RGPD-like** : vérification des policies de rétention, des droits d'accès, de l'anonymisation
- [ ] **Documentation de production** : runbooks d'exploitation, procédure d'incident, playbooks Grafana

#### Dépendances

- **Internes :** Phases 1, 2 et 3 complètes
- **Externes :** Disponibilité de l'équipe ARS Tunisie pour les sessions UAT (planifier en Semaine 7)

#### Durée estimée : 2 semaines (Semaines 8-10)

#### Critères de succès

- Zéro vulnérabilité critique ou haute au rapport de pentest
- Taux de résolution > 60% lors des tests UAT ARS
- Latence WebSocket p95 < 3 secondes sous 200 utilisateurs simultanés
- Validation écrite formelle par le chef de projet ARS Tunisie

---

### Phase 5 : MVP Go-Live (Semaines 10-11)

**Objectif :** Déploiement en production et stabilisation.

#### Livrables

- [ ] Déploiement en production avec migration DB zero-downtime
- [ ] Activation du monitoring Prometheus/Grafana avec alertes configurées
- [ ] Activation du widget sur le portail ARS (d'abord en mode "soft launch" sur 10% du trafic)
- [ ] Runbook de rollback testé et approuvé
- [ ] Formation des agents ARS sur le dashboard admin (1 session de 2 heures)
- [ ] Bilan de lancement J+7 (métriques, incidents, axes d'amélioration)

#### Durée estimée : 1-2 semaines

---

### Phase VoIP : Canal Téléphonique (Semaines 11-16, parallèle à la stabilisation MVP)

> Cette phase démarre uniquement lorsque les données vocales ARS sont livrées (prérequis P5) ET que le MVP chat est stabilisé.

#### Jalons de la Phase VoIP

**Jalon VoIP-1 (Semaines 7-10, parallèle à Phase 4 MVP) : Fine-tuning modèles**
- Fine-tuning Whisper sur données ASR ARS (après réception Semaines 5-6)
- Clonage voix "ARS Voice" via ElevenLabs
- Benchmark WER et MOS — Go/No-Go sur la qualité

**Jalon VoIP-2 (Semaines 11-13) : Intégration Asterisk**
- Configuration Asterisk/FreeSWITCH selon specs ARS (IP SIP, trunk, codecs)
- Implémentation du handler AGI Python (intégration STT → Orchestrateur → TTS)
- Tests en appel interne (équipe dev appelle le numéro de test)

**Jalon VoIP-3 (Semaines 13-15) : Tests utilisateurs VoIP**
- Tests UAT vocal avec agents ARS
- Ajustement des prompts pour le canal vocal (reformulations plus courtes, pauses)
- Tests de charge appels simultanés (k6 avec simulation SIP)

**Jalon VoIP-4 (Semaine 16) : Go-Live VoIP**
- Activation sur le numéro ARS (soft launch)
- Monitoring temps réel du WER et du taux d'escalade

---

## 4. AI & Model Strategy

### 4.1 Speech-to-Text (STT) / Automatic Speech Recognition (ASR)

#### Décision : Fine-tuning Whisper large-v3 (self-hosted) avec fallback Google Cloud STT

**Justification détaillée :**

Le CDC (Section 7 — Exigences en Données Vocales) et la Demande d'Informations Client (Partie 7) documentent explicitement le problème de l'arabe tunisien (Derja) comme une "low-resource language". L'analyse des corpus disponibles démontre qu'aucune ressource open source ne couvre le vocabulaire métier ARS (CIN, remboursement, éligibilité, DigiHealth, mutuelle). Un service cloud générique (Google STT, Azure) avec le code `ar-TN` donnera des résultats insuffisants sur ce vocabulaire spécialisé.

**Pourquoi Whisper large-v3 et non un modèle cloud ?**

| Critère | Whisper fine-tuné (self-hosted) | Google Cloud STT / Azure |
|---------|--------------------------------|--------------------------|
| **Support Derja contexte ARS** | ✅ Excellent après fine-tuning sur données ARS | ⚠️ Médiocre sur vocabulaire métier |
| **Vocabulaire spécialisé** | ✅ Le fine-tuning intègre les termes ARS | ❌ Pas de customisation sans "Speech Adaptation" coûteux |
| **Contrôle des données** | ✅ Données jamais envoyées à un tiers | ⚠️ Audio envoyé à Google/Microsoft (compliance ARS?) |
| **Coût à l'échelle** | ✅ Coût fixe (serveur GPU) | ❌ Coût variable par minute (peut exploser à grande échelle) |
| **Latence** | ✅ < 1s si GPU dédié (A100 ou L4) | ✅ < 1s via API |
| **Maintenance** | ⚠️ Nécessite GPU et MLOps | ✅ Géré par le fournisseur |
| **WER sur Derja ARS cible (< 15%)** | ✅ Atteignable avec 15-20h de données | ❌ WER estimé 30-40% sans adaptation |

Le choix de Whisper self-hosted est donc **imposé par les contraintes du projet** (qualité sur Derja ARS + conformité données potentielle) et non par idéologie.

**Architecture STT retenue :**

```
Architecture à deux niveaux :
1. PRIMAIRE : Whisper large-v3 fine-tuné sur données ARS
   → Hébergé sur GPU dédié (A100 ou RTX 4090 selon budget)
   → Streaming audio via WebSocket (faster-whisper pour la latence)
   → WER cible : < 15% sur scénarios ARS

2. FALLBACK : Google Cloud Speech-to-Text
   → Activé si le serveur Whisper est indisponible
   → Langue : ar-TN avec Speech Adaptation sur vocabulaire ARS
   → Accepté comme solution dégradée (WER supérieur)

3. DÉTECTION DE LANGUE : 3 premières secondes d'audio
   → Whisper embarque nativement la détection de langue
   → Routing : Derja → modèle fine-tuné | Français → Whisper sans adaptation
```

**Données d'entraînement requises (tirées du CDC Section 7.3) :**

| Type | Volume minimum | Format | Source |
|------|---------------|--------|--------|
| Enregistrements d'appels réels anonymisés | 10-20 heures | WAV 16kHz 16bit mono | Centre d'appels ARS |
| Transcriptions associées | 100% des enregistrements | UTF-8 txt ou Excel | Agents ARS (annotation) |
| Scripts de test (scénarios types) | 50-100 phrases/scénarios | CSV colonnes [audio, transcription] | ARS + équipe dev |
| Guide phonétique termes métier | 50-100 termes | PDF/Excel | ARS |
| Échantillons régionaux (recommandé) | 2-3 heures | WAV 16kHz | ARS (régions diverses) |

**Timeline fine-tuning :**
- Semaines 1-4 : Collecte et annotation par ARS
- Semaines 5-6 : Livraison données à l'équipe dev
- Semaines 7-9 : Préparation dataset + fine-tuning (3 runs d'entraînement avec benchmark)
- Semaine 10 : Évaluation WER + validation ARS
- Semaine 11 : Intégration en production VoIP

---

### 4.2 Text-to-Speech (TTS)

#### Décision : ElevenLabs Voice Cloning (primaire) + Azure Neural TTS (fallback)

**Justification :**

La TTS est le visage sonore de l'ARS Tunisie. Le CDC (Section 3.1.1) est explicite : "voix naturelle, claire et au ton professionnel et rassurant, représentant l'image de l'ARS". Cette exigence qualitative élimine d'emblée les TTS génériques qui produiraient une voix robotique sur la Derja.

| Critère | ElevenLabs Voice Cloning | Azure Neural TTS | CoquiTTS (open-source) |
|---------|--------------------------|------------------|------------------------|
| **Naturalité voix Derja** | ✅ Excellente (SOTA 2025) | ⚠️ Bonne sur ar-TN si voix neurale disponible | ⚠️ Correcte mais inférieure |
| **Temps de mise en place** | ✅ 1-2 semaines (upload + clonage) | ✅ Rapide (voix pré-existante ar-TN-Hedi) | ❌ 4-8 semaines (entraînement) |
| **Données nécessaires** | 5-10h audio studio | 0 (voix pré-existante) | 5-20h audio studio |
| **Personnalisation voix ARS** | ✅ Voix unique ARS (brand identity) | ⚠️ Voix générique partagée | ✅ Voix unique si entraînée |
| **Coût** | 💰 Moyen (abonnement + usage) | 💰 Faible (pay-per-character) | ✅ Gratuit (infra GPU) |
| **SSML** | ✅ Support complet | ✅ Support complet | ⚠️ Partiel |
| **Latence (streaming)** | ✅ < 300ms 1ère syllabe | ✅ < 400ms | ⚠️ 500ms-1s |
| **Compliance données** | ⚠️ Audio envoyé à ElevenLabs | ⚠️ Audio envoyé à Microsoft | ✅ Self-hosted |

**Décision finale :** ElevenLabs primaire car la qualité de la voix est directement liée à la confiance des assurés envers l'agent. La propriété de la "ARS Voice" (brand identity sonore) est une valeur à long terme. Azure Neural TTS activé en fallback automatique si ElevenLabs est indisponible.

**Note compliance :** L'envoi du texte des réponses à ElevenLabs doit être validé par ARS. Les textes de réponse ne contiennent jamais de données personnelles (CIN, nom) — ces données restent dans le backend. Le texte TTS contient uniquement la réponse formulée ("Votre remboursement de 45 dinars a été traité le 3 juin.").

---

### 4.3 Large Language Model (LLM) — Moteur de Raisonnement

#### Décision : Claude API (Anthropic) primaire + OpenAI GPT-4o fallback

**Justification :**

| Critère | Claude (Anthropic) | GPT-4o (OpenAI) | Llama 3 (self-hosted) |
|---------|-------------------|----------------|----------------------|
| **Compréhension Derja/Arabe** | ✅ Excellente (claude-opus-4) | ✅ Excellente | ⚠️ Correcte (dépend du modèle) |
| **Qualité des Tool Calls** | ✅ Très fiable (structured outputs) | ✅ Très fiable | ⚠️ Variable selon la version |
| **Qualité de rédaction FR** | ✅ Très haute | ✅ Très haute | ⚠️ Bonne |
| **Fenêtre de contexte** | ✅ 200K tokens | ✅ 128K tokens | ⚠️ 8K-128K selon modèle |
| **Latence streaming** | ✅ < 1s 1er token | ✅ < 1s 1er token | ⚠️ > 2s si GPU partagé |
| **Compliance / confidentialité** | ✅ Data Privacy Addendum disponible | ✅ Enterprise Agreement disponible | ✅ Self-hosted = 0 fuite |
| **Coût** | 💰 Moyen-élevé | 💰 Moyen-élevé | ✅ Coût fixe GPU |
| **Fiabilité SLA** | ✅ 99.9% (Anthropic Enterprise) | ✅ 99.9% (OpenAI Enterprise) | ⚠️ Dépend de l'infra interne |
| **Maintenance** | ✅ Aucune | ✅ Aucune | ❌ MLOps, mises à jour modèles |

**Pourquoi pas Llama 3 self-hosted ?** La complexité du projet (Derja, Tool Use précis, rédaction administrative de qualité) impose une fiabilité maximale sur le raisonnement et la génération. Un LLM self-hosted introduit une charge MLOps significative et des performances inférieures sur les Tool Calls qui sont critiques pour l'intégration DigiHealth. Le gain de coût ne justifie pas le risque sur ce projet.

**Stratégie multilingue LLM :**
```
System Prompt structure :
1. Instructions en FRANÇAIS (langue de l'interface admin et des emails)
2. Section dédiée aux instructions pour le canal DERJA :
   "Quand l'utilisateur s'exprime en arabe tunisien (Derja), réponds en Derja
    romanisé ou en arabe standard tunisien. Utilise 'Ahla' pour accueillir,
    'Tawwa nakhoudhak' pour initier une action. Les termes métier s'écrivent
    toujours en français : CIN, remboursement, DigiHealth."
3. Exemples few-shot : 3 exemples de conversations Derja → réponse agent
4. Instructions de fallback : "Si tu n'es pas certain de la langue, réponds
    en français et demande à l'assuré de confirmer la langue préférée."
```

---

### 4.4 Agentic vs. Deterministic Workflow

#### Décision : Architecture Hybride — State Machine déterministe + LLM Agentic dans l'état RESPOND

**Justification :**

La question fondamentale est : confier-on au LLM le contrôle de TOUT le workflow (full agentic), ou maintient-on un contrôle programmatique des transitions critiques (state machine) et n'utilisons-nous le LLM que pour la génération des réponses et la sélection des outils dans un périmètre délimité ?

| Approche | Avantages | Inconvénients | Recommandation |
|----------|-----------|---------------|----------------|
| **Full Agentic (LangGraph)** | Très flexible, s'adapte à des scénarios imprévus, moins de code de gestion d'état | Imprévisible sur les transitions critiques (auth, escalade), difficile à déboguer, risque de "hallucination" sur les actions, coût tokens élevé | ❌ Trop risqué pour un contexte santé/assurance |
| **State Machine pure** | Très prédictible, auditée, déterministe, facile à tester | Rigide, nécessite de prévoir tous les scénarios, n'exploite pas la puissance du LLM | ❌ Sous-exploite l'IA, difficile à maintenir pour les cas complexes |
| **Hybride** ✅ | Déterministe sur les étapes critiques (auth, escalade, création ticket), LLM agentic pour la compréhension et la réponse | Complexité architecturale légèrement supérieure | ✅ **RECOMMANDÉ** |

**Architecture hybride retenue :**

```
DÉTERMINISTE (Orchestrateur Python — code pur) :
├── Transitions d'état : INIT → AUTH → CLASSIFY → RESPOND → CLOSE
├── Règles d'escalade : évaluées par code Python (pas par LLM)
├── Gestion des erreurs et retries : code Python
├── Création de ticket CRM : déclenchée par code Python sur trigger intent
├── Génération résumé/email : déclenchée par code Python en fin de session
└── Audit logging : 100% déterministe

AGENTIC (LLM avec Tool Use — dans l'état RESPOND) :
├── Compréhension de l'intention utilisateur (classification libre)
├── Sélection et paramétrage des outils DigiHealth à appeler
├── Reformulation des données techniques en langage naturel
├── Gestion du dialogue multi-tours dans un scénario donné
└── Génération du texte de réponse (résumé, email, réponse conversationnelle)
```

**Implémentation :** Pas de LangGraph dans un premier temps (surcharge pour le MVP). L'Orchestrateur est une classe Python avec une machine à états implémentée manuellement. LangGraph peut être introduit en Phase itérative si la complexité des scénarios l'exige.

---

## 5. Challenges and Mitigations

### Challenge 1 : Arabe Tunisien (Derja) — Langue à Faibles Ressources

**Impact :** 🔴 CRITIQUE — Le canal vocal est inutilisable si le STT/TTS n'est pas de qualité suffisante. Un WER > 25% génère un taux d'escalade > 50%, annulant tous les bénéfices du projet. La voix robotique nuit à l'image institutionnelle de l'ARS.

**Probabilité sans mitigation :** Très élevée (tous les corpus open source sont documentés comme insuffisants dans le CDC Section 7).

**Mitigations :**

| Action | Responsable | Délai | Indicateur de succès |
|--------|------------|-------|---------------------|
| Lancer immédiatement la demande de données vocales à ARS (Partie 7 du RFI) | Chef de projet ARS | J+3 | Réponse ARS avec planning de livraison |
| Organiser un atelier de collecte de données vocales avec ARS (proposé dans le RFI) | Chef de projet prestataire | Semaine 1 | Atelier planifié et daté |
| Démarrer le fine-tuning STT avec les données partielles dès leur réception | Lead AI | Semaine 6 | 1er modèle entraîné et benchmarké |
| Utiliser le boost lexical (vocabulary bias) sur Google STT en attendant le fine-tuning | Lead AI | Semaine 2 | Réduction WER de 30% sur termes métier |
| Définir un critère Go/No-Go quantitatif : WER < 15% sur scénarios ARS avant intégration prod | Architecte | Semaine 1 | Critère documenté et signé par ARS |
| Planifier la Phase VoIP APRÈS la stabilisation MVP Chat | Architecte | Phase 0 | Planning validé par toutes les parties |

---

### Challenge 2 : Intégration VoIP — Latence et Compatibilité

**Impact :** 🔴 CRITIQUE — Le pipeline STT → LLM → TTS doit s'exécuter en < 1,5 seconde pour ne pas créer de silence gênant dans la conversation téléphonique. Chaque milliseconde compte.

**Décomposition de la latence cible (1500 ms totaux) :**
```
STT (Whisper streaming)    : 400-600 ms
Transmission Backend       : 50 ms
LLM (1er token streaming)  : 300-500 ms
Génération réponse complète: 400-600 ms (dépend de la longueur)
TTS (1ère syllabe ElevenLabs): 200-300 ms
──────────────────────────
TOTAL ESTIMÉ               : 1350-1650 ms (LIMITE)
```

**Mitigations :**

- **Streaming end-to-end** : Le TTS commence à parler dès la réception de la 1ère phrase complète du LLM (pas d'attente de la réponse entière). Ce seul optimisation réduit la latence perçue de ~40%.
- **GPU dédié pour Whisper** : Un GPU A100 ou RTX 4090 réduit la latence STT de 800 ms à 400 ms vs. un GPU partagé.
- **Caching LLM** : Les réponses aux questions fréquentes et figées (heures d'ouverture, procédures standard) sont mises en cache Redis pour contourner l'appel LLM.
- **Déploiement co-localisé** : Backend, Whisper et le gateway VoIP dans le même datacenter ARS pour minimiser la latence réseau.
- **Codec Opus** : Privilégier Opus à G.711/G.729 si le réseau le permet — meilleure qualité sonore perçue même à latence identique.
- **Test de latence en boucle** : Automatiser des appels synthétiques quotidiens mesurant la latence bout-en-bout et alertant si > 1200 ms.

---

### Challenge 3 : Sécurité et Conformité — Données de Santé

**Impact :** 🔴 CRITIQUE — Une fuite de données de santé ou d'assurance est un incident majeur pour l'ARS, avec des conséquences légales (loi tunisienne n° 2004-63) et réputationnelles graves.

**Mitigations :**

- **Pentest obligatoire** avant tout déploiement en production (Phase 4). Réalisé par un prestataire de sécurité externe indépendant.
- **Principe du moindre privilège** : Le LLM ne reçoit jamais le CIN ou les données médicales brutes — il reçoit uniquement ce dont il a besoin pour formuler la réponse (ex. : "remboursement de 45 DT le 3 juin" et non "CIN 12345678, dossier #XYZ").
- **TLS 1.3 partout** : Aucune communication en clair, y compris sur les réseaux internes (zero-trust network).
- **Rotation automatique des secrets** : Tous les credentials (JWT signing key, API keys, DB password) rotent automatiquement toutes les 90 jours via HashiCorp Vault.
- **Audit trail immutable** : Chaque accès à une donnée sensible est enregistré avec signature HMAC. Test hebdomadaire automatisé de l'intégrité des logs.
- **Anonymisation avant envoi externe** : Les textes envoyés au LLM et au TTS ne contiennent jamais de données directement identifiantes. L'identité de l'assuré est remplacée par "l'assuré" ou son prénom uniquement.
- **Data residency** : Valider avec ARS si les données doivent rester en Tunisie → dans ce cas, LLM self-hosted ou accord de localisation des données avec Anthropic Enterprise.

---

### Challenge 4 : Intégration DigiHealth — API Legacy Inconnue

**Impact :** 🔴 CRITIQUE — Sans accès à DigiHealth, les cas d'utilisation les plus importants (consultation dossier, éligibilité) sont bloqués. L'API peut être instable, lente, ou mal documentée.

**Mitigations :**

- **Mock DigiHealth complet** dès le Jour 1 du projet. Le développement n'attend jamais les credentials. Le mock simule les réponses attendues, les erreurs HTTP (404, 429, 503) et les lenteurs (timeout 5s).
- **Contrat d'interface documenté** : Rédiger le schéma JSON attendu pour chaque endpoint DigiHealth (Section 3.1.4 de archi.md) et le soumettre à ARS pour validation avant le développement.
- **Circuit Breaker** : Si DigiHealth répond en > 5s ou retourne 3 erreurs consécutives, le circuit s'ouvre automatiquement. L'agent IA informe l'assuré ("difficulté technique") et propose un rappel.
- **Cache agressif** : Les données peu volatiles (profil assuré, droits d'éligibilité annuels) sont mises en cache Redis 5-15 minutes pour réduire la dépendance à DigiHealth.
- **Environment staging obligatoire** : Obtenir un accès à l'environnement de staging DigiHealth avant de se connecter à la production. Ne jamais tester sur la production.
- **SLA DigiHealth** : Demander à ARS le SLA de DigiHealth et adapter le circuit breaker en conséquence.

---

### Challenge 5 : Scalabilité sous Charge VoIP et Chat

**Impact :** 🟠 ÉLEVÉ — Lors de pics d'activité (campagnes de vaccination, déclarations de maladie saisonnières), le volume d'appels et de chats peut multiplier par 5-10 le trafic normal.

**Mitigations :**

- **Auto-scaling horizontal** : Le backend FastAPI est déployé derrière un Kubernetes HPA. Trigger : CPU > 70% OU conversations actives > N. Délai de scaling < 90 secondes.
- **Redis Cluster** : Passage de Redis standalone à Redis Cluster au-delà de 5 000 sessions simultanées. Architecture préparée dès le début (pas de refactoring nécessaire).
- **LLM Rate Limits** : Surveiller les quotas Anthropic Enterprise (Requests Per Minute). Implémenter une queue de requêtes LLM avec priorisation par ancienneté de conversation.
- **STT Workers Pool** : Les workers Whisper sont dans un pool scalable. En cas de pic, activer le fallback Google STT automatiquement si la queue Whisper dépasse 10 requêtes en attente.
- **Tests de charge réguliers** : Exécuter des tests de charge simulant 300% du trafic normal avant chaque événement prévisible à fort impact.
- **Capacity Planning** : Définir avec ARS le volume moyen et le pic estimé (champ "Volume d'activité" de la Partie 1 du RFI) pour dimensionner l'infrastructure dès le départ.

---

### Challenge 6 : Qualité et Fiabilité des Tool Calls LLM

**Impact :** 🟠 ÉLEVÉ — Si le LLM appelle le mauvais endpoint DigiHealth, ou passe des paramètres incorrects, ou hallucine des données, les conséquences pour l'assuré peuvent être sérieuses (mauvaises informations médicales/financières).

**Mitigations :**

- **Schémas JSON stricts** : Tous les Tool Call schemas sont définis avec JSON Schema validation. Le backend valide la sortie du LLM avant d'exécuter l'outil.
- **Validation Pydantic** : Chaque réponse DigiHealth est validée via un modèle Pydantic strict. Si la réponse ne matche pas, le LLM reçoit un message d'erreur et peut reformuler.
- **Température basse** : 0.2-0.3 pour les Tool Calls (réduction des hallucinations).
- **Confirmation utilisateur** : Pour les actions irréversibles (dépôt de réclamation), le LLM présente toujours un résumé à l'assuré et demande une confirmation avant l'exécution.
- **Tests de régression automatisés** : 20+ scénarios de conversation testés automatiquement à chaque merge (Phase CI). Détection rapide des régressions de qualité LLM.

---

### Challenge 7 : Adoption par les Agents ARS et Changement Organisationnel

**Impact :** 🟡 MODÉRÉ — Un dashboard admin non utilisé ou mal compris réduit la valeur du système (emails non envoyés, tickets non traités).

**Mitigations :**

- **Formation obligatoire** (1 session de 2h) avant le go-live pour tous les agents ARS.
- **Interface admin co-conçue** : Impliquer 2-3 agents ARS dans les tests UX de la Phase 3 (tests utilisateurs avec agents réels, pas des développeurs).
- **Quick Wins visibles** : Le dashboard montre immédiatement "X tickets créés automatiquement aujourd'hui" pour démontrer la valeur.
- **Support dédié J+30** : Période de stabilisation avec un accès direct au chef de projet du prestataire.

---

## 6. Recommended Technology Stack

### Backend

| Composant | Technologie recommandée | Raison |
|-----------|------------------------|--------|
| **Framework principal** | **FastAPI (Python 3.12)** | Performances async natives (ASGI/uvicorn), typage fort avec Pydantic, WebSocket natif, OpenAPI auto-générée, large écosystème ML/AI Python. Idéal pour le projet car le code AI (Whisper, LangChain, HuggingFace) est en Python. |
| **Serveur ASGI** | **Uvicorn + Gunicorn** | Uvicorn pour les performances async, Gunicorn comme process manager pour la production (gestion des workers, restart). |
| **ORM** | **SQLAlchemy 2.0 (async)** | ORM Python le plus mature, support async natif en v2, Alembic pour les migrations. Compatible PostgreSQL. |
| **Migrations DB** | **Alembic** | Outil standard associé à SQLAlchemy. Migrations versionnées, reproductibles, rollbackables. |
| **Validation** | **Pydantic v2** | Validation ultra-rapide (Rust core), intégration native FastAPI, typage strict, idéal pour valider les réponses DigiHealth. |
| **Client HTTP async** | **httpx** | Client HTTP async Python moderne, compatible avec asyncio, support des retries, timeouts, HTTP/2. Utilisé pour les appels DigiHealth et CRM. |
| **Cache / Session State** | **Redis 7.2** | Standard pour le session store conversationnel. Pub/Sub pour les notifications temps réel. TTL natif pour la gestion des sessions. |
| **Queue de messages** | **Redis Streams** (ou **Celery + Redis** si besoin de workers dédiés) | Tâches asynchrones post-conversation (génération résumé, création ticket, envoi email). Redis Streams pour la simplicité en Phase MVP, Celery si les workers AI nécessitent une isolation. |
| **Secret Management** | **HashiCorp Vault** | Gestion centralisée des secrets, rotation automatique, audit trail des accès aux secrets. |

---

### Frontend

| Composant | Technologie recommandée | Raison |
|-----------|------------------------|--------|
| **Framework UI** | **React 18 + TypeScript** | Framework le plus adopté, large écosystème, support RTL pour l'arabe, typage fort pour la maintenabilité, concurrent mode pour les performances de streaming. |
| **Build tool** | **Vite 5** | Build 10-100x plus rapide que Webpack, HMR instantané, idéal pour le développement rapide du MVP. |
| **CSS Framework** | **TailwindCSS 3** | Classes utilitaires, responsive natif, RTL support via plugin, thème personnalisable aux couleurs ARS. Évite d'écrire du CSS custom. |
| **State Management** | **Zustand** | Bibliothèque de state management légère (2KB), API simple, pas de boilerplate Redux. Idéal pour les états de conversation et d'authentification. |
| **WebSocket** | **socket.io-client** | Reconnexion automatique, namespaces, fallback HTTP long-polling si WebSocket indisponible. Correspondance avec socket.io côté FastAPI (ou websockets natifs). |
| **Charts / Dataviz** | **Recharts** | Bibliothèque de graphiques React, responsive, accessible, couvre les besoins du dashboard (volume, taux résolution, sentiment). |
| **Tests unitaires** | **Vitest + Testing Library** | Vitest est le runner de tests natif Vite (très rapide), Testing Library encourage les bonnes pratiques de test composants. |
| **Tests E2E** | **Playwright** | Support multi-navigateurs, réseau conditionnable, screenshots automatiques, idéal pour tester les parcours chat et admin. |

---

### Base de Données

| Usage | Technologie | Raison |
|-------|-------------|--------|
| **Base principale** (conversations, tickets, audit, users) | **PostgreSQL 16 + pgvector** | ACID compliance, requêtes analytiques (dashboard), extensions puissantes, **pgvector pour le RAG évite une base de données vectorielle séparée en Phase MVP**, trigger BEFORE UPDATE/DELETE pour l'immutabilité des audit logs. |
| **Cache et sessions** | **Redis 7.2 Cluster** | TTL natif, structures de données riches (Hash pour session state, Stream pour les queues), pub/sub pour les notifications. |
| **Base vectorielle** (KnowledgeBase RAG) | **pgvector (extension PostgreSQL)** en MVP → **Qdrant** si volume > 1M vecteurs | pgvector simplifie l'infrastructure en MVP (pas de base séparée), Qdrant offre de meilleures performances à grande échelle. La migration est simple car le code RAG est abstrait derrière une interface. |
| **Stockage fichiers** | **MinIO** (self-hosted S3-compatible) ou **AWS S3** | Stockage des pièces jointes (Phase 4) et des enregistrements audio VoIP. MinIO pour l'hébergement on-premise ARS, S3 pour le cloud. |

---

### Téléphonie / VoIP

| Composant | Technologie | Raison |
|-----------|-------------|--------|
| **PBX / Call Manager** | **Asterisk 20** | Open-source, mature, grande communauté, support AGI Python natif pour l'intégration de l'AI. Compatible SIP/SDP/RTP. ARS mentionne Asterisk dans ses documents. |
| **Interface AGI** | **Asterisk AGI Python** (bibliothèque `asterisk-agi`) | Permet à un script Python de contrôler le flux d'un appel Asterisk en temps réel. Intégration directe avec le backend FastAPI. |
| **Interface AMI** | **panoramisk** (client AMI Python async) | Contrôle programmatique d'Asterisk (originate, transfer, hangup) depuis le backend. Nécessaire pour les transferts d'appel vers agents humains. |
| **SIP Load Balancer** | **Kamailio** | Distribue les appels SIP entrants entre plusieurs instances Asterisk. Nécessaire pour la haute disponibilité et le scaling du canal vocal. |
| **Traitement audio** | **FFmpeg** | Conversion entre formats audio (G.711 ↔ PCM ↔ WAV) pour l'interface entre Asterisk et Whisper. Standard de l'industrie. |

---

### AI / ML

| Composant | Technologie / Service | Raison |
|-----------|----------------------|--------|
| **LLM primaire** | **Claude API (Anthropic)** — `claude-sonnet-4` | Meilleur rapport qualité/coût pour les Tool Calls précis et le multilinguisme FR/Derja. |
| **LLM fallback** | **OpenAI API** — `gpt-4o` | Fallback automatique si Claude indisponible. Performances similaires. |
| **STT** | **Whisper large-v3** (fine-tuné, self-hosted via `faster-whisper`) | Voir Section 4.1. faster-whisper offre une latence 2-4x inférieure à l'implémentation OpenAI officielle. |
| **TTS** | **ElevenLabs API** (voix clonée "ARS Voice") | Voir Section 4.2. |
| **Framework AI** | **LangChain** (pour les composants RAG uniquement) | Abstractions pour le RAG (document loaders, text splitters, retrievers). Pas utilisé pour l'orchestration (State Machine custom à la place). |
| **Embeddings** | **OpenAI text-embedding-3-large** | Meilleur modèle d'embedding disponible via API, supporte le français et l'arabe. 3072 dimensions. |
| **Fine-tuning STT** | **HuggingFace Transformers + Datasets** | Framework standard pour le fine-tuning de Whisper sur des données custom. `Seq2SeqTrainer` pour l'entraînement. |
| **Voice Cloning** | **ElevenLabs Voice Cloning API** | Upload des enregistrements studio → génération de la voix clonée. API simple, qualité SOTA. |

---

### DevOps & Infrastructure

| Composant | Technologie | Raison |
|-----------|-------------|--------|
| **Conteneurisation** | **Docker + Docker Compose** | Environnement reproductible local et CI. Images multi-stage (build + runtime allégé). |
| **Orchestration** | **Kubernetes (K8s)** ou **Docker Swarm** selon capacité ARS | K8s pour les déploiements cloud ou on-premise avancés. Docker Swarm si l'équipe IT ARS est moins expérimentée. Decision finale après confirmation hébergement ARS (prérequis P6). |
| **CI/CD** | **GitHub Actions** | Intégration native avec GitHub, large marketplace d'actions, gratuit pour les repos privés jusqu'à un certain volume. |
| **Infrastructure as Code** | **Terraform** | Provisioning reproductible de l'infrastructure (VMs, réseau, sécurité). État versionné. |
| **Registry d'images** | **GitHub Container Registry (ghcr.io)** | Intégré avec GitHub Actions, accès privé, gratuit. |
| **Secret Rotation** | **HashiCorp Vault** | Gestion centralisée des secrets avec rotation automatique et audit trail. |

---

### Monitoring & Observabilité

| Composant | Technologie | Raison |
|-----------|-------------|--------|
| **Métriques** | **Prometheus + Grafana** | Standard industrie open-source. Prometheus scrape toutes les métriques applicatives, Grafana les visualise. Alertes natives via Grafana AlertManager. |
| **Logs structurés** | **structlog (Python) → Elasticsearch + Kibana** | Logs JSON corrélés par `conversation_id`. Kibana pour la recherche et l'analyse des logs. |
| **Traces distribuées** | **OpenTelemetry + Jaeger** | Traçage end-to-end d'une requête de l'ingress au retour client. Identification des goulots d'étranglement dans le pipeline AI. |
| **Logs STT/TTS** | **Custom metrics Prometheus** | Métriques dédiées : latence_stt_ms, wer_estimate, latence_tts_ms, tts_characters_per_second. |
| **Uptime monitoring** | **Uptime Kuma** (self-hosted) | Monitoring de disponibilité des endpoints publics (chat, API health) avec alertes SMS/email. |
| **Application Performance** | **Sentry** | Tracking des erreurs applicatives en temps réel avec stack traces. Essentiel pour détecter les régressions en production. |

---

### Matrice de Décision Résumée

```
┌─────────────────────┬──────────────────────────────────┬──────────────┐
│ Couche              │ Technologie retenue               │ Criticité    │
├─────────────────────┼──────────────────────────────────┼──────────────┤
│ API Backend         │ FastAPI (Python 3.12)             │ 🔴 Core      │
│ ORM + Migrations    │ SQLAlchemy 2.0 async + Alembic   │ 🔴 Core      │
│ Base principale     │ PostgreSQL 16 + pgvector          │ 🔴 Core      │
│ Cache / Sessions    │ Redis 7.2                         │ 🔴 Core      │
│ Frontend Widget     │ React 18 + TypeScript + Vite     │ 🔴 Core      │
│ Frontend Admin      │ React 18 + TailwindCSS            │ 🟠 Important │
│ LLM Principal       │ Claude API (Anthropic)            │ 🔴 Core      │
│ LLM Fallback        │ OpenAI GPT-4o                    │ 🟠 Important │
│ STT Primaire        │ Whisper large-v3 (fine-tuned)     │ 🔴 Core (VoIP│
│ STT Fallback        │ Google Cloud STT                  │ 🟠 Important │
│ TTS Primaire        │ ElevenLabs (voix "ARS Voice")     │ 🔴 Core (VoIP│
│ TTS Fallback        │ Azure Neural TTS                  │ 🟠 Important │
│ VoIP / PBX          │ Asterisk 20                       │ 🔴 Core (VoIP│
│ Embeddings RAG      │ OpenAI text-embedding-3-large     │ 🟠 Important │
│ CI/CD               │ GitHub Actions                    │ 🟠 Important │
│ Monitoring          │ Prometheus + Grafana + Sentry     │ 🟠 Important │
│ Secrets             │ HashiCorp Vault                   │ 🔴 Core      │
│ Conteneurs          │ Docker + Kubernetes               │ 🟠 Important │
│ Logs                │ structlog + Elasticsearch         │ 🟡 Utile     │
│ Traces              │ OpenTelemetry + Jaeger            │ 🟡 Utile     │
└─────────────────────┴──────────────────────────────────┴──────────────┘
```

---

*Document généré à partir de l'analyse croisée des trois documents sources ARS Tunisie — Juin 2026.*
*Version suivante : `build_plan_v2.md` — À émettre après validation des prérequis client et confirmation du choix d'hébergement.*
*Toutes les décisions techniques (ADR-001 à ADR-005) doivent être formellement validées par l'Architecte Solution et le Chef de projet ARS avant le démarrage de la Phase 1.*

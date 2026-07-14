# archi.md — Architecture de Référence
## Agent IA Conversationnel Multicanal — ARS Tunisie (Département Maladie)
## khiari mohamed
> **Single Source of Truth** pour l'équipe de développement.  
> Synthèse de : `Agent_IA_ARS_Departement_Maladie.docx` · `Cahier_des_Charges_Applicatif_Agent_IA_ARS_Tunisie.docx` · `Demande_Informations_Client_Specifications_Techniques_ARS_Tunisie.docx`  
> Version : 1.0 — Juin 2026 | Statut : **DRAFT — En attente des prérequis client**

---

## Table des Matières

1. [Project Overview & Context](#1-project-overview--context)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Detailed System Architecture](#3-detailed-system-architecture)
4. [Logic Flow & Advanced Feature Implementation](#4-logic-flow-user-journey--advanced-feature-implementation)
5. [Data Flow & Schema](#5-data-flow--schema)
6. [Security & Compliance Architecture](#6-security--compliance-architecture)
7. [Infrastructure & Deployment Considerations](#7-infrastructure--deployment-considerations)
8. [Conclusion & Next Steps](#8-conclusion--next-steps)

---

## 1. Project Overview & Context

### 1.1 Objective

ARS Tunisie (Caisse Nationale d'Assurance Maladie) souhaite déployer un **Agent IA Conversationnel Multicanal** disponible **24h/24 et 7j/7**, accessible par deux canaux :

- **Canal Vocal (VoIP)** : Traitement des appels téléphoniques entrants en **arabe tunisien (Derja)** et en français, via une plateforme SIP/Asterisk.
- **Canal Textuel (Chat Web)** : Widget de conversation intégré au portail web ARS, supportant le français et l'arabe tunisien.

Le système doit automatiser le traitement des demandes courantes des assurés (suivi de dossier, réclamations, éligibilité, information générale), réduire la charge opérationnelle des centres d'appels et améliorer la qualité du service citoyen, en s'appuyant sur le système d'information existant exposé via l'**API DigiHealth**.

**SLA cible :** > 99,5 % de disponibilité. **Taux de résolution automatique cible :** > 70 %.

---

### 1.2 Core Challenges

| # | Défi | Criticité | Détail |
|---|------|-----------|--------|
| 1 | **Arabe Tunisien (Derja) — Langue à faibles ressources** | 🔴 CRITIQUE | Le Derja est une *low-resource language*. Les corpus open source disponibles (TunArTTS ~3h, TuniSpeech-21h bruyant, LDC2022E01 sans vocabulaire métier) sont insuffisants pour un service de niveau production. Des données vocales spécifiques ARS sont **impératives**. |
| 2 | **Intégration VoIP temps réel** | 🔴 CRITIQUE | Le pipeline vocal (STT → LLM → TTS) doit maintenir une latence bout-en-bout < 1,5 s pour préserver la fluidité conversationnelle. Chaque composant doit opérer en **streaming**. |
| 3 | **Sécurité des données de santé** | 🔴 CRITIQUE | Les données manipulées (CIN, dossiers médicaux, remboursements) sont sensibles. L'ensemble du système doit respecter la loi tunisienne n° 2004-63 et les politiques internes ARS. |
| 4 | **Disponibilité API DigiHealth** | 🔴 CRITIQUE | Toute la valeur métier du projet repose sur l'accès à cette API. Son absence bloque la phase de développement des intégrations. |
| 5 | **Gestion de l'état conversationnel multicanal** | 🟠 ÉLEVÉE | L'orchestrateur doit maintenir un contexte cohérent entre les tours de dialogue, gérer les interruptions (VoIP), les reconnexions (chat web) et les transferts vers un agent humain. |
| 6 | **Modération & Escalade intelligente** | 🟠 ÉLEVÉE | L'analyse de sentiment en temps réel et la détection d'urgence doivent être suffisamment fiables pour ne pas générer de faux positifs (escalade inutile) ou de faux négatifs (situation critique manquée). |
| 7 | **Génération automatique d'email professionnel** | 🟡 MODÉRÉE | Le résumé et l'email générés par le LLM doivent être de qualité rédactionnelle suffisante pour être utilisés sans modification manuelle lourde. |

---

### 1.3 Key Stakeholders

| Partie prenante | Rôle | Points de contact clés |
|----------------|------|------------------------|
| **ARS Tunisie** (Client) | Maître d'ouvrage. Fournit les accès API, les données vocales, les règles métier et valide les livrables. | DSI, Responsable Sécurité, Chef de projet ARS, Équipe CRM |
| **Équipe de Développement** (Prestataire) | Maître d'œuvre. Conception, développement, intégration, tests et déploiement de la solution. | Architecte Solution, Lead Backend, Lead AI/NLP, DevOps |
| **Assurés** (Utilisateurs finaux) | Citoyens tunisiens assurés sociaux. Interagissent avec l'agent via téléphone ou chat web. | N/A (représentés par les scénarios de test UAT) |
| **Agents ARS** (Utilisateurs internes) | Conseillers recevant les escalades. Utilisent le tableau de bord d'administration. | Superviseurs, Équipe qualité |

---

## 2. High-Level Architecture

### 2.1 Conceptual Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            UTILISATEURS FINAUX                              │
│                                                                             │
│    ┌──────────────────┐                  ┌──────────────────────────────┐   │
│    │   ASSURÉ (VoIP)  │                  │     ASSURÉ (Chat Web)        │   │
│    │  Appel téléphone │                  │  Navigateur / Mobile         │   │
│    └────────┬─────────┘                  └──────────────┬───────────────┘   │
└─────────────┼──────────────────────────────────────────┼───────────────────┘
              │ SIP / RTP                                 │ WSS / HTTPS
              ▼                                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         COUCHE D'INGRESS / CANAUX                           │
│                                                                             │
│  ┌───────────────────────────┐       ┌─────────────────────────────────┐   │
│  │   VoIP GATEWAY            │       │   WEB CHAT WIDGET               │   │
│  │   (Asterisk / FreeSWITCH) │       │   (React / JS — WebSocket)      │   │
│  │   STT ──────────────────► │       │   Gestion sessions / uploads    │   │
│  │   TTS ◄────────────────── │       └──────────────────┬──────────────┘   │
│  └──────────────┬────────────┘                          │                   │
└─────────────────┼──────────────────────────────────────┼───────────────────┘
                  │ Text (transcribed)                    │ Text (typed)
                  ▼                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AGENT CORE (BACKEND)                                │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    AGENT ORCHESTRATOR                               │   │
│  │   State Machine :                                                   │   │
│  │   INIT → AUTHENTICATE → CLASSIFY_INTENT → QUERY → RESPOND          │   │
│  │                      ↘ ESCALATE → SUMMARIZE → CLOSE                │   │
│  └───────────────────────────────┬─────────────────────────────────────┘   │
│                                  │                                          │
│  ┌───────────────────────────────▼─────────────────────────────────────┐   │
│  │                     LLM ENGINE                                      │   │
│  │   Claude API (Anthropic) — Primary                                  │   │
│  │   OpenAI API — Fallback                                             │   │
│  │   Tool Use / Function Calling activé                                │   │
│  └───────────────────────────────┬─────────────────────────────────────┘   │
│                                  │                                          │
│  ┌───────────┐  ┌───────────┐  ┌─▼────────────┐  ┌────────────────────┐   │
│  │  RAG /    │  │ Sentiment │  │  Auth        │  │  Summarizer /      │   │
│  │  KB Query │  │ Analyzer  │  │  Module      │  │  Email Generator   │   │
│  └───────────┘  └───────────┘  └──────────────┘  └────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                  │            │              │              │
    ┌─────────────▼──┐  ┌──────▼──────┐  ┌───▼──────┐  ┌──▼───────────────┐
    │  DigiHealth    │  │  CRM /      │  │  SMS /   │  │  Audit Log DB    │
    │  API           │  │  Ticketing  │  │  Email   │  │  (Immutable)     │
    │  (REST/JSON)   │  │  API        │  │  Gateway │  │                  │
    └────────────────┘  └─────────────┘  └──────────┘  └──────────────────┘
                                                                │
                                                    ┌───────────▼────────────┐
                                                    │  ADMIN DASHBOARD       │
                                                    │  (Agents ARS internes) │
                                                    └────────────────────────┘
```

---

### 2.2 Architectural Principles

#### Omnicanalité & Cohérence de l'Expérience
Le système doit offrir une expérience utilisateur **identique sur les deux canaux**. Un assuré commençant une interaction par téléphone et poursuivant par chat web doit retrouver son contexte. L'orchestrateur est le seul point de gestion de l'état conversationnel, indépendant du canal d'entrée.

#### Security by Design
La sécurité n'est pas une couche ajoutée en fin de projet mais une contrainte architecturale dès la conception. Chaque interface de communication est chiffrée (TLS 1.3), chaque accès à une donnée sensible est authentifié et tracé, et le principe du moindre privilège est appliqué à tous les composants.

#### Modularité & Extensibilité
Chaque composant (LLM, STT, TTS, CRM, DigiHealth) est découplé via des interfaces contractuelles (API REST / adaptateurs). Le remplacement d'un fournisseur (ex. : passer de ElevenLabs à Azure TTS) ne doit impacter aucun autre composant. Les nouvelles fonctionnalités s'ajoutent comme de nouveaux "outils" (tools) dans le LLM.

#### Observabilité
Tout événement système doit être observable : logs structurés (JSON), métriques temps réel (Prometheus), traces distribuées (OpenTelemetry), alertes automatiques (Grafana AlertManager). Aucune erreur silencieuse n'est acceptable en production.

---

## 3. Detailed System Architecture

### 3.1 Component Stack & Specifications

---

#### 3.1.1 Presentation Layer / Channels

##### Canal Web Chat

| Élément | Spécification |
|---------|---------------|
| **Framework** | React.js (widget embarquable via `<script>` tag ou iFrame) |
| **Protocole temps réel** | WebSocket sécurisé (`wss://`) — bibliothèque `socket.io` ou native WS API |
| **Gestion des sessions** | JWT stocké en mémoire (jamais en localStorage pour éviter les attaques XSS). Refresh token via cookie `HttpOnly; Secure; SameSite=Strict`. |
| **Responsive UI** | CSS Flexbox/Grid — Breakpoints : Mobile (< 768px), Tablet, Desktop. Compatible : Chrome 90+, Firefox 88+, Safari 14+, Edge 90+. |
| **Pièces jointes** | Upload via `multipart/form-data` limité à 10 Mo par fichier. Types acceptés : PDF, JPG, PNG. Scan antivirus avant stockage. |
| **Reconnexion** | Stratégie de reconnexion automatique avec backoff exponentiel (1s → 2s → 4s → max 30s). Le contexte de conversation est restauré depuis le serveur. |
| **Accessibilité** | Conformité WCAG 2.1 niveau AA. Attributs ARIA sur tous les éléments interactifs. |
| **Internationalisation** | Support RTL (arabe) et LTR (français) via `dir` HTML attribute switché dynamiquement. |

##### Canal VoIP Téléphonique

| Élément | Spécification |
|---------|---------------|
| **Plateforme** | Asterisk 20+ ou FreeSWITCH 1.10+. Déploiement on-premise chez ARS ou hébergé selon contraintes client. |
| **Protocole de signalisation** | SIP (RFC 3261). Port standard : 5060 (UDP/TCP), 5061 (TLS-SIP). |
| **Protocole média** | RTP (RFC 3550) pour le flux audio. SRTP recommandé pour le chiffrement en transit. |
| **Codecs supportés** | G.711 µ-law / a-law (largeur de bande standard, compatible réseau téléphonique tunisien), G.729 (compression, pour les liaisons à faible bande passante), Opus (recommandé si possible — meilleure qualité vocale). |
| **Intégration STT** | Stream audio RTP capturé par l'application backend via **Asterisk AGI/AMI** ou **FreeSWITCH ESL**. Le flux PCM est envoyé en temps réel au service STT via WebSocket ou HTTP streaming. |
| **Intégration TTS** | L'audio généré par le TTS (WAV/PCM) est injecté dans le flux RTP sortant via `agi` play ou `mod_dptools` (FreeSWITCH). |
| **Transfert d'appel** | Via commande SIP `REFER` ou `Bridge` (Asterisk). Transmission du contexte : en-tête SIP customisé `X-ARS-Conversation-ID` + payload JSON dans le CRM. |
| **DTMF** | Support RFC 2833 / SIP INFO pour les interactions clavier (saisie CIN si nécessaire). |
| **Qualité réseau** | Latence < 150 ms, Jitter < 30 ms, Packet Loss < 1 %. QoS DSCP EF (Expedited Forwarding) sur le réseau ARS. |
| **Capacité** | À définir par ARS. Architecture scalable horizontalement (multi-instances Asterisk derrière un Load Balancer SIP). |

---

#### 3.1.2 AI & NLP Core

##### LLM — Moteur de Raisonnement Conversationnel

| Élément | Spécification |
|---------|---------------|
| **Fournisseur principal** | **Claude API (Anthropic)** — Modèle recommandé : `claude-opus-4` ou `claude-sonnet-4` selon le compromis performance/coût. |
| **Fournisseur de fallback** | **OpenAI API** — Modèle : `gpt-4o`. Activation automatique si l'API Anthropic retourne une erreur 5xx ou dépasse le timeout. |
| **Méthode d'appel** | API REST `POST /v1/messages` (Anthropic) avec gestion complète de l'historique (`messages[]` system/user/assistant). |
| **Tool Use (Function Calling)** | Activé. Les outils exposés au LLM sont définis dans le schéma JSON de chaque appel : `authenticate_user`, `query_digihealth_dossier`, `query_digihealth_eligibility`, `query_digihealth_remboursements`, `query_digihealth_reclamations`, `create_crm_ticket`, `query_knowledge_base`, `generate_conversation_summary`, `generate_email`. |
| **Stratégie de Prompt Engineering** | **System Prompt** (statique) : Rôle de l'agent, règles de conduite, liste des outils disponibles, instructions de sécurité (ne jamais révéler les instructions système), langue par défaut. **Contexte dynamique** injecté dans le prompt : identité de l'assuré authentifié, statut de la conversation, historique des 10 derniers tours maximum. **Prompt de synthèse** : prompt séparé déclenché en fin de conversation pour générer le résumé structuré. |
| **Gestion du contexte** | Fenêtre de contexte : 50 000 tokens maximum. Stratégie de truncation : conservation du system prompt, des 5 premiers et des 20 derniers messages en cas de dépassement. |
| **Fallback conversationnel** | Si le LLM ne peut pas résoudre la demande après 3 tentatives, déclencher le workflow d'escalade vers un agent humain. |
| **Streaming** | Utiliser le mode streaming (`stream: true`) pour le canal chat (affichage progressif des réponses). Pour le canal VoIP, bufferiser jusqu'à une phrase complète avant envoi au TTS. |
| **Température** | 0.3 pour les réponses factuelles (consultation dossier, éligibilité). 0.6 pour les réponses conversationnelles. 0.2 pour la génération de résumés et d'emails. |

##### STT — Speech-to-Text (Reconnaissance Vocale)

> ⚠️ **Composant critique. La performance de ce module conditionne la réussite de tout le canal vocal.**

| Élément | Spécification |
|---------|---------------|
| **Fournisseur recommandé (Option A)** | **OpenAI Whisper** (modèle `large-v3`) avec **fine-tuning** sur les données vocales fournies par ARS. Hébergement self-hosted pour maintenir les données dans l'environnement sécurisé. |
| **Fournisseur cloud (Option B)** | **Google Cloud Speech-to-Text** avec modèle `latest_long`, langue `ar-TN` (arabe tunisien). Soumis à validation ARS sur la localisation des données. |
| **Fournisseur cloud (Option C)** | **AssemblyAI** — Support multilingue avec streaming, API moderne. Nécessite validation localisation données. |
| **Langue cible** | Arabe tunisien (Derja) — **code `ar-TN`** (Google). Français — `fr-FR`. Détection automatique de langue sur les 3 premières secondes d'audio. |
| **Mode de transcription** | **Streaming temps réel** (WebSocket). Résultats intermédiaires (`is_final: false`) pour affichage visuel si applicable. Résultat final (`is_final: true`) envoyé au LLM. |
| **Format audio d'entrée** | PCM 16 bits, 16 kHz mono (standard VoIP). Conversion depuis G.711 si nécessaire (sox ou ffmpeg). |
| **WER cible** | Word Error Rate (WER) < 15 % sur les scénarios ARS réels. < 10 % sur le vocabulaire métier (CIN, remboursement, éligibilité, DigiHealth). |
| **Latence cible** | Transcription complète d'un énoncé de 5 secondes en < 800 ms (streaming). |
| **Exigence CRITIQUE — Données d'entraînement** | Un fine-tuning sur les données vocales ARS (min. 10 à 20 heures d'appels anonymisés) est **indispensable** pour atteindre le WER cible. Voir Section 7.3 pour les détails. |
| **Vocabulaire de domaine** | Boost lexical sur les termes métier : CIN, رمبورسومان (remboursement), إيليجيبيليتي (éligibilité), DigiHealth, ڤنيات, prestataire, mutuelle. |

##### TTS — Text-to-Speech (Synthèse Vocale)

> ⚠️ **La voix de l'agent est l'identité sonore de l'ARS. Elle doit être professionnelle, rassurante et naturelle.**

| Élément | Spécification |
|---------|---------------|
| **Fournisseur recommandé** | **ElevenLabs** — Meilleure qualité de voix neurale pour les langues semitiques. Support du clonage de voix (Voice Cloning) à partir des enregistrements fournis par ARS. |
| **Alternative** | **Azure Cognitive Services Neural TTS** — Voix `ar-TN-HediNeural` (arabe tunisien) si disponible. Fallback : `ar-SA` avec adaptation phonétique. |
| **Personnalité vocale "ARS Voice"** | À définir avec ARS Tunisie : **genre** (recommandation : voix féminine pour le sentiment de chaleur et de confiance), **ton** (formel mais accessible, rassurant), **débit** (légèrement ralenti pour la clarté des termes techniques), **accent** (tunisien standard, non régional). |
| **Langues** | Arabe tunisien (Derja) pour le canal VoIP. Français pour le canal chat et certaines interactions VoIP. |
| **Format audio de sortie** | WAV PCM 16 bits, 22 kHz (ou 44.1 kHz si la bande passante le permet). Compatible injection dans flux RTP via transcodage ffmpeg. |
| **Latence cible** | Première syllabe audio générée en < 300 ms après envoi du texte (mode streaming TTS). |
| **Gestion SSML** | Utiliser SSML pour contrôler la prononciation des termes métier (`<say-as interpret-as="characters">CIN</say-as>`), les pauses et l'intonation. |
| **Exigence CRITIQUE — Données d'entraînement** | Clonage de la voix ARS nécessite min. 5 à 10 heures d'enregistrements audio de qualité studio du/de la locuteur(trice) choisi(e). Voir Section 7.3. |

---

#### 3.1.3 Backend & Orchestration

##### Agent Orchestrator

L'Orchestrateur est le composant central du système. Il implémente une **machine à états finis** qui gère le cycle de vie complet de chaque conversation.

```
┌─────────────┐
│    INIT     │ ← Nouvelle connexion (Web ou VoIP)
└──────┬──────┘
       │
       ▼
┌─────────────┐    Échec 3x     ┌──────────────┐
│ AUTHENTICATE│─────────────────► ESCALATE      │
└──────┬──────┘                 └──────┬───────┘
       │ Succès                        │
       ▼                               │
┌─────────────────┐                    │
│ CLASSIFY_INTENT │                    │
└───────┬─────────┘                    │
        │                              │
   ┌────┴──────────────────────────────────────────────────────────────┐
   │                                                                   │
   ▼                    ▼                    ▼                    ▼   │
┌──────────┐       ┌──────────┐       ┌──────────┐       ┌──────────┐│
│  QUERY   │       │   FAQ    │       │  ROUTE   │       │  CLAIM   ││
│DigiHealth│       │   RAG    │       │ SERVICE  │       │DOSSIER   ││
└────┬─────┘       └────┬─────┘       └────┬─────┘       └────┬─────┘│
     │                  │                  │                  │      │
     └──────────────────┴──────────────────┴──────────────────┘      │
                                  │                                   │
                                  ▼                                   │
                        ┌─────────────────┐   Urgence / Sentiment ───┘
                        │    RESPOND      │──────────────────────────►
                        └────────┬────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │   SUMMARIZE     │
                        └────────┬────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │  EMAIL_GENERATE │
                        └────────┬────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │     CLOSE       │ → Journalisation, ticket CRM, notification SMS/email
                        └─────────────────┘
```

**Responsabilités de l'Orchestrateur :**
- Maintien du state de la conversation en mémoire (Redis) avec TTL de 30 minutes
- Transmission du contexte complet à chaque appel LLM (historique, état, données assuré)
- Exécution des outils (tool calls) retournés par le LLM
- Déclenchement des workflows post-conversation (résumé, email, ticket, log)
- Gestion des timeouts (inactivité > 5 minutes → alerte → fermeture)

**Stack technique :**
```
- Langage : Node.js (TypeScript) ou Python (FastAPI) — TBD
- State Store : Redis 7+ (conversation state, session cache)
- Message Queue : RabbitMQ ou AWS SQS (pour les tâches asynchrones : résumé, email, ticket)
- Framework : LangChain ou LlamaIndex (gestion du pipeline LLM + Tool Use)
```

##### Integration API Gateway

Composant intermédiaire entre l'Orchestrateur et les systèmes externes. Ses responsabilités :

- **Gestion des credentials** : Récupération des clés API depuis le Secret Manager (jamais en dur dans le code)
- **Routage** : `digihealth/*`, `crm/*`, `notifications/*`
- **Rate Limiting** : Respect des quotas DigiHealth (à définir par ARS)
- **Circuit Breaker** : Pattern Hystrix — si DigiHealth est indisponible, retourner une réponse dégradée gracieuse et escalader
- **Retry** : Backoff exponentiel (1s, 2s, 4s, max 3 tentatives) pour les erreurs transitoires (5xx, timeout)
- **Cache** : Cache Redis TTL 5 minutes pour les données peu volatiles (profil assuré, droits d'éligibilité)
- **Logging** : Chaque appel sortant est loggué (timestamp, endpoint, durée, code HTTP) pour l'audit

---

#### 3.1.4 Data & Integration Layer

##### Intégration DigiHealth API

> ⚠️ **Prérequis bloquant — Sans accès à cette API, le développement des intégrations ne peut pas démarrer.**

| Paramètre | Valeur attendue (à compléter par ARS) |
|-----------|--------------------------------------|
| **Base URL (Production)** | `https://api.digihealth.ars.tn/v1` *(à confirmer)* |
| **Base URL (Staging)** | `https://staging-api.digihealth.ars.tn/v1` *(à confirmer)* |
| **Méthode d'authentification** | OAuth 2.0 (recommandé) / API Key / JWT *(à confirmer par ARS)* |
| **Documentation** | Swagger / OpenAPI 3.0 *(à fournir par ARS)* |
| **Format des échanges** | JSON / UTF-8 |

**Endpoints requis (à confirmer avec ARS) :**

```yaml
# Endpoints DigiHealth requis

GET  /assures/{cin_or_id}
     # Consultation du dossier assuré
     # Params : cin (string) | numero_assure (string)
     # Returns : Assuré { nom, prenom, cin, numero_assure, statut, couverture }

GET  /assures/{id}/reclamations
     # Historique des réclamations
     # Params : page, limit, date_debut, date_fin
     # Returns : Reclamation[] { id, date, motif, statut, montant }

GET  /assures/{id}/remboursements
     # Détail des remboursements
     # Params : page, limit, annee
     # Returns : Remboursement[] { id, date, montant, statut, prestataire }

GET  /assures/{id}/eligibilite
     # Vérification d'éligibilité
     # Params : type_prestation (string)
     # Returns : Eligibilite { eligible (bool), plafond, exclusions[], validite }

POST /reclamations
     # Création d'une réclamation depuis l'agent IA
     # Body : { assure_id, motif, description, pieces_jointes[] }
     # Returns : Reclamation { id, reference, statut }
```

##### Intégration CRM / Ticketing

| Paramètre | Valeur attendue (à compléter par ARS) |
|-----------|--------------------------------------|
| **Solution CRM** | À confirmer (Zendesk / Salesforce / Solution propriétaire) |
| **API de création de ticket** | À documenter par ARS |
| **Authentification** | API Key / OAuth 2.0 (à confirmer) |

**Schéma de ticket à créer automatiquement :**

```json
{
  "source": "AGENT_IA",
  "channel": "VOIP | CHAT_WEB",
  "assure_cin": "string",
  "assure_id": "string",
  "assure_nom_complet": "string",
  "conversation_id": "uuid",
  "category": "RECLAMATION | INFORMATION | ELIGIBILITE | AUTRE",
  "priority": "LOW | MEDIUM | HIGH | URGENT",
  "subject": "string (généré par LLM)",
  "description": "string (résumé de conversation — généré par LLM)",
  "email_draft": "string (email professionnel — généré par LLM)",
  "attachments": ["url1", "url2"],
  "sentiment_score": -1.0,
  "escalation_reason": "string | null",
  "created_at": "ISO8601"
}
```

##### Conversation History Store

```
Technologie recommandée : PostgreSQL 15+ (relationnel, requêtes analytiques, conformité)
Alternative : MongoDB (schéma flexible si les métadonnées varient fortement)

Schéma simplifié :
- conversations (id, channel, assure_id, started_at, ended_at, status, sentiment_score, summary)
- messages (id, conversation_id, role, content, timestamp, tokens)
- attachments (id, conversation_id, filename, url, size, mime_type)
- audit_events (id, conversation_id, event_type, details, timestamp, user_id)
```

##### Knowledge Base (RAG — Retrieval-Augmented Generation)

```
Technologie :
- Vector Store : Pinecone / Qdrant / pgvector (PostgreSQL extension)
- Embedding Model : text-embedding-3-large (OpenAI) ou equivalent
- Chunking Strategy : 512 tokens, overlap 50 tokens
- Indexation : Documents ARS (PDF procédures, FAQ, réglementation) → chunked → embedded → stored

Workflow de requête RAG :
1. Question de l'assuré → embedding
2. Recherche vectorielle (top-k = 5, similarity threshold = 0.75)
3. Chunks récupérés injectés dans le contexte LLM
4. LLM génère une réponse basée sur les chunks + historique

Administration : Interface admin pour upload, suppression et prévisualisation des documents indexés.
```

##### Audit Logs

```
Technologie : Base de données append-only (PostgreSQL avec trigger BEFORE UPDATE/DELETE désactivé)
             ou service dédié (Elasticsearch avec ILM policies)

Propriétés des logs :
- Immutabilité : Les logs ne peuvent pas être modifiés ou supprimés via l'application
- Horodatage : UTC, précision milliseconde
- Non-répudiabilité : Signature HMAC de chaque entrée de log
- Rétention : Minimum 5 ans (à confirmer selon politique ARS)
- Contenu minimal par événement :
  { timestamp, event_type, actor_type (USER|AGENT|SYSTEM), actor_id,
    conversation_id, action, resource, result, ip_address, details }
```

---

#### 3.1.5 Administration & Observability

##### Dashboard Administrateur

```
Stack : React.js (frontend) + Node.js/Express ou FastAPI (API backend admin)
Authentification : SSO ARS ou authentification locale MFA obligatoire

Fonctionnalités :
┌─────────────────────────────────────────────────────────────────────┐
│  Tableau de bord temps réel                                         │
│  ├─ Conversations actives (VoIP / Chat) — compteur live             │
│  ├─ KPIs du jour : volume, taux résolution, taux escalade, CSAT     │
│  ├─ Sentiment moyen des conversations en cours                      │
│  └─ Alertes système (services dégradés, erreurs critiques)          │
│                                                                     │
│  Gestion des conversations                                          │
│  ├─ Liste des conversations (filtres : date, canal, statut, assuré) │
│  ├─ Détail conversation : transcript complet, résumé, email draft   │
│  ├─ Écoute/lecture des enregistrements VoIP (si consentement)       │
│  └─ Actions manuelles : clôture, réouverture, escalade manuelle     │
│                                                                     │
│  Gestion des tickets                                                │
│  ├─ Vue Kanban des tickets (Nouveau → En cours → Résolu → Fermé)    │
│  └─ Synchronisation temps réel avec le CRM                         │
│                                                                     │
│  Base de Connaissances                                              │
│  ├─ Upload de documents (PDF, Word, Excel)                          │
│  ├─ Prévisualisation des chunks indexés                             │
│  └─ Suppression / mise à jour des documents                         │
│                                                                     │
│  Rapports & Exports                                                 │
│  ├─ Rapports périodiques (J, S, M) : KPIs, satisfaction, volumes    │
│  └─ Export PDF et Excel                                             │
│                                                                     │
│  Administration                                                     │
│  ├─ Gestion des utilisateurs (agents, superviseurs, admins)         │
│  ├─ Configuration des règles d'escalade                             │
│  └─ Journaux d'audit (lecture seule)                                │
└─────────────────────────────────────────────────────────────────────┘
```

##### Monitoring Stack

```
Métriques applicatives    : Prometheus + Grafana
  - Latence LLM (p50, p95, p99)
  - Latence STT, TTS
  - Taux d'erreur par composant
  - Nombre de conversations actives
  - Utilisation des tokens LLM

Logs structurés          : ELK Stack (Elasticsearch + Logstash + Kibana)
  - Tous les logs applicatifs en JSON
  - Recherche et corrélation par conversation_id

Traces distribuées       : OpenTelemetry + Jaeger
  - Traçage end-to-end d'une requête de l'ingress au retour client
  - Identification des goulots d'étranglement

Alertes                  : Grafana AlertManager → Slack / Email / SMS (on-call)
  - Latence LLM > 5s → WARNING
  - Taux d'erreur DigiHealth > 10% → CRITICAL
  - Disponibilité VoIP Gateway < 99% → CRITICAL
  - File d'attente de messages > 1000 → WARNING
```

---

## 4. Logic Flow (User Journey) & Advanced Feature Implementation

### 4.1 End-to-End Flow Diagram

```
CANAL WEB                          CANAL VOIP
┌────────────┐                    ┌────────────────────────────────┐
│ Assuré     │                    │  Assuré appelle le numéro ARS  │
│ ouvre chat │                    │  → Asterisk reçoit l'appel SIP │
└─────┬──────┘                    │  → Audio RTP capturé           │
      │ WebSocket connect         │  → STT stream → Texte          │
      ▼                           └──────────────┬─────────────────┘
┌─────────────────────────────────────────────────────────────────────────┐
│                         [1] INITIATION                                  │
│  Orchestrateur : Création session, génération conversation_id           │
│  LLM Prompt : Message d'accueil (FR ou AR selon détection langue)       │
│  → "Bonjour, bienvenue à l'ARS Tunisie. Pour vous aider, j'ai besoin   │
│     de vérifier votre identité. Quel est votre numéro de CIN ?"        │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      [2] AUTHENTICATION                                 │
│                                                                         │
│  Assuré fournit : CIN + (date de naissance OU code OTP SMS/email)      │
│                                                                         │
│  Tool Call → authenticate_user({ cin: "...", otp: "..." })             │
│  → API DigiHealth : GET /assures/{cin}                                  │
│                                                                         │
│  ✅ Succès → State = AUTHENTICATED. Profil assuré chargé.              │
│             Stocker en contexte : nom, prénom, id, numéro_assure        │
│                                                                         │
│  ❌ Échec 1 → "Je n'ai pas trouvé ce numéro. Pouvez-vous le vérifier?" │
│  ❌ Échec 2 → "Tentative incorrecte. Il vous reste 1 essai."            │
│  ❌ Échec 3 → State = ESCALATE (raison: auth_failure)                   │
│             → Transfert agent humain avec contexte                      │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │ Authentifié
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                   [3] INTENT CLASSIFICATION                             │
│                                                                         │
│  LLM analyse la demande de l'assuré et sélectionne l'intent :          │
│                                                                         │
│  ┌─────────────────────┬──────────────────────────────────────────┐    │
│  │ Intent              │ Action déclenchée                         │    │
│  ├─────────────────────┼──────────────────────────────────────────┤    │
│  │ CONSULT_DOSSIER     │ Tool: query_digihealth_dossier            │    │
│  │ CONSULT_REMB.       │ Tool: query_digihealth_remboursements     │    │
│  │ CHECK_ELIGIBILITE   │ Tool: query_digihealth_eligibilite        │    │
│  │ DEPOT_RECLAMATION   │ Workflow Réclamation → Tool: create_ticket│    │
│  │ INFO_GENERALE       │ Tool: query_knowledge_base (RAG)          │    │
│  │ ORIENTATION         │ Route vers service compétent              │    │
│  │ INCONNU             │ Clarification → 3 tentatives → ESCALATE   │    │
│  └─────────────────────┴──────────────────────────────────────────┘    │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    [4] DIGIHEALTH API QUERY                             │
│                                                                         │
│  Backend → Integration Gateway → DigiHealth API                        │
│  (Auth via OAuth Token / API Key depuis Secret Manager)                 │
│                                                                         │
│  Exemples :                                                             │
│  GET /assures/{id}/reclamations → Liste réclamations                    │
│  GET /assures/{id}/remboursements → Détail remboursements               │
│  GET /assures/{id}/eligibilite?type=hospitalisation → Droits            │
│                                                                         │
│  ✅ Réponse reçue → Données injectées dans contexte LLM                │
│  ❌ Timeout / Erreur → Circuit Breaker → Réponse dégradée gracieuse     │
│     "Je rencontre une difficulté technique. Un conseiller va vous       │
│      rappeler dans les 2 heures."                                       │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    [5] RESPONSE GENERATION (AI)                         │
│                                                                         │
│  LLM génère la réponse en langage naturel à partir des données          │
│  DigiHealth + contexte conversationnel + base de connaissances          │
│                                                                         │
│  Canal Chat → Texte streamé vers le widget WebSocket                   │
│  Canal VoIP → Texte envoyé au TTS → Audio PCM → Flux RTP               │
│                                                                         │
│  Analyse de sentiment en parallèle (voir section 4.2)                  │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │ Si réclamation détectée
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     [6] TICKET CREATION (CRM)                           │
│                                                                         │
│  Workflow déclenché si l'intent est DEPOT_RECLAMATION ou ESCALADE       │
│                                                                         │
│  1. LLM collecte les informations structurées (motif, description,      │
│     pièces jointes) via un workflow de questions guidées                │
│  2. LLM génère un résumé de la réclamation                              │
│  3. Tool Call → create_crm_ticket({ ... payload complet ... })          │
│  4. CRM API retourne ticket_id et référence                             │
│  5. Agent IA confirme à l'assuré : "Votre réclamation a été enregistrée │
│     sous la référence [REF-XXXX]. Vous recevrez une confirmation par    │
│     email dans les 24 heures."                                          │
│  6. Notification SMS/email automatique à l'assuré                      │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│           [7] CONVERSATION SUMMARIZATION & EMAIL GENERATION             │
│                                                                         │
│  Déclenché en fin de chaque conversation (résolution ou escalade)       │
│                                                                         │
│  ÉTAPE A — Résumé :                                                     │
│  Tool Call → generate_conversation_summary()                            │
│  LLM reçoit l'intégralité du transcript et génère :                     │
│  {                                                                      │
│    "assure": "Nom Prénom (CIN: ...)",                                   │
│    "date_heure": "...",                                                 │
│    "canal": "VOIP | CHAT_WEB",                                          │
│    "motif_principal": "...",                                            │
│    "actions_effectuees": ["...", "..."],                                │
│    "resultat": "Résolu | Escaladé | Abandonné",                         │
│    "ticket_ref": "REF-XXXX | null",                                     │
│    "points_attention": ["...", "..."],                                  │
│    "sentiment_final": "Satisfait | Neutre | Insatisfait"               │
│  }                                                                      │
│                                                                         │
│  ÉTAPE B — Email professionnel :                                        │
│  Tool Call → generate_email({ summary: ... })                           │
│  LLM génère un email formaté :                                          │
│  {                                                                      │
│    "subject": "Réclamation REF-XXXX — M./Mme [NOM] — [MOTIF]",        │
│    "to": "service-reclamations@ars.tn",                                 │
│    "cc": "conseiller-referent@ars.tn (si escalade)",                   │
│    "body": "...corps professionnel en français...",                     │
│    "actions_requises": ["...", "..."],                                  │
│    "attachments": [...]                                                 │
│  }                                                                      │
│  → Email stocké dans le ticket CRM en attente de validation humaine     │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │ Si escalade nécessaire
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                  [8] ESCALATION TO HUMAN AGENT                          │
│                                                                         │
│  Canal VoIP : Transfert d'appel SIP (REFER) vers le pool agents ARS    │
│              Header X-ARS-Conversation-ID transmis                      │
│              Dashboard agent : fiche assuré + résumé conversation       │
│              affiché automatiquement avant la prise en charge           │
│                                                                         │
│  Canal Chat : Notification agent disponible dans le dashboard           │
│              Reprise du chat dans l'interface superviseur               │
│              Historique complet visible en temps réel                   │
│                                                                         │
│  Dans les deux cas :                                                    │
│  - L'assuré est informé : "Je vous transfère à un conseiller disponible.│
│    Ne raccrochez pas, votre dossier lui a été transmis."                │
│  - Le ticket CRM est mis à jour (statut: ESCALADE, assigné à: ...)      │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                  [9] JOURNALIZATION & CLOSURE                           │
│                                                                         │
│  1. Enregistrement final dans Conversation History Store               │
│     (transcript, résumé, sentiment_score, durée, statut, ticket_ref)   │
│  2. Écriture des événements d'audit (append-only, signés HMAC)         │
│  3. Archivage audio (canal VoIP) si consentement → stockage chiffré    │
│  4. Nettoyage de la session en mémoire (Redis TTL expire)              │
│  5. Envoi notification assuré (SMS/email de confirmation)              │
│  6. Mise à jour des métriques Prometheus (compteurs, histogrammes)     │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### 4.2 Advanced Feature Logic

#### Authentication Logic

```
Algorithme d'authentification :

1. Demander CIN (ou numéro d'assuré)
2. Appel DigiHealth GET /assures?cin={value}
   - Si 404 → tentative_count++ → Message d'erreur doux
   - Si 200 → Passer à l'étape 3
3. Demander second facteur :
   a. OTP SMS : Générer OTP 6 chiffres, envoyer via SMS Gateway, délai validité 5 minutes
   b. Alternative : Date de naissance (si SMS indisponible)
4. Valider le second facteur
   - Si invalide → tentative_count++
5. Si tentative_count >= 3 :
   - Bloquer la session pendant 15 minutes (configurable)
   - Logger l'événement : AUTH_FAILURE_LOCKOUT
   - Déclencher l'escalade vers agent humain
6. Si authentification réussie :
   - Logger : AUTH_SUCCESS
   - Stocker profil assuré en session Redis (TTL 30 min)
   - Passer à CLASSIFY_INTENT
```

#### Escalation Logic

```
Déclencheurs d'escalade (évalués à chaque tour de dialogue) :

RÈGLE 1 — Échec d'authentification
  Condition : tentative_auth >= 3
  Priorité : URGENT

RÈGLE 2 — Analyse de sentiment
  Condition : sentiment_score < -0.6 ET durée_conversation > 2 tours
  Priorité : HIGH
  (sentiment_score calculé par le LLM ou service dédié sur chaque message assuré)

RÈGLE 3 — Demande explicite de l'assuré
  Condition : intent == "DEMANDE_AGENT_HUMAIN" OU
              texte contient ["conseiller", "humain", "personne", "agent", "responsable"]
  Priorité : MEDIUM

RÈGLE 4 — Impossibilité de résolution
  Condition : 3 tours successifs sans résolution de l'intent
  Priorité : MEDIUM

RÈGLE 5 — Durée excessive
  Condition : durée_conversation > 15 minutes (configurable)
  Priorité : LOW

RÈGLE 6 — Erreur système critique
  Condition : DigiHealth API unavailable ET fallback impossible
  Priorité : HIGH

Action d'escalade :
  1. Annoncer l'escalade à l'assuré (message configuré par ARS)
  2. Générer résumé intermédiaire de la conversation
  3. Trouver agent disponible dans le pool (API Dashboard)
  4. Transférer avec contexte complet
  5. Logger : ESCALATION { raison, priorité, agent_assigned, timestamp }
```

#### Summarization & Email Generation Workflow

```
WORKFLOW — Résumé & Email (exécuté asynchrone en fin de conversation)

Entrée : conversation_id, transcript_complet, metadata

ÉTAPE 1 — Extraction du transcript
  Query Conversation History Store → messages filtrés (rôle user + assistant)
  Construction du transcript formaté :
    [14:32:01] Assuré : "Chnowa statut mte3 réclamation mte3i ?"
    [14:32:04] Agent : "Bonjour M. Ben Ali. Je consulte votre dossier..."

ÉTAPE 2 — Appel LLM Summarization
  Model : claude-sonnet-4 (température 0.2)
  System Prompt : "Tu es un assistant spécialisé dans la rédaction de synthèses
    administratives pour l'ARS Tunisie. Génère un résumé JSON structuré..."
  User Prompt : [TRANSCRIPT COMPLET]
  Output : JSON résumé (schéma défini — voir Section 5.1)

ÉTAPE 3 — Validation du résumé
  Validation structurelle du JSON (schéma Zod/Pydantic)
  Si invalide → retry avec température 0.1

ÉTAPE 4 — Appel LLM Email Generation
  Model : claude-sonnet-4 (température 0.2)
  System Prompt : "Tu es un rédacteur administratif pour l'ARS Tunisie.
    Rédige un email professionnel en français basé sur le résumé fourni..."
  User Prompt : [RÉSUMÉ JSON]
  Output : { subject, to, cc, body, actions_requises }

ÉTAPE 5 — Attachement au ticket CRM
  PATCH /tickets/{ticket_id} {
    summary: résumé_json,
    email_draft: email_json,
    status: "EN_ATTENTE_VALIDATION"
  }

ÉTAPE 6 — Notification interne
  → Email/Slack à l'équipe ARS : "Nouveau dossier à traiter — REF-XXXX"
```

---

## 5. Data Flow & Schema

### 5.1 Core Entities

```typescript
// Entité Assuré (source : DigiHealth API)
interface Assure {
  id: string;                    // Identifiant interne DigiHealth
  cin: string;                   // Carte d'Identité Nationale
  numero_assure: string;         // Numéro d'assuré social
  nom: string;
  prenom: string;
  date_naissance: Date;
  email: string | null;
  telephone: string | null;
  statut_couverture: "ACTIF" | "SUSPENDU" | "EXPIRE";
  caisse: string;
}

// Entité Conversation
interface Conversation {
  id: string;                    // UUID v4
  channel: "CHAT_WEB" | "VOIP";
  assure_id: string | null;      // null si authentification échouée
  assure_cin: string | null;
  started_at: Date;
  ended_at: Date | null;
  status: "ACTIVE" | "RESOLVED" | "ESCALATED" | "ABANDONED";
  language: "fr" | "ar-TN";
  messages: Message[];
  sentiment_score: number;       // -1.0 (négatif) à 1.0 (positif)
  sentiment_label: "SATISFAIT" | "NEUTRE" | "INSATISFAIT";
  summary: ConversationSummary | null;
  email_draft: EmailDraft | null;
  ticket_id: string | null;      // Référence CRM
  duration_seconds: number;
  escalation_reason: string | null;
}

// Message individuel
interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: Date;
  tokens_used: number | null;
  tool_name: string | null;      // Si rôle "tool"
  tool_result: object | null;
}

// Résumé de conversation
interface ConversationSummary {
  assure_identifiant: string;
  date_heure: Date;
  canal: "CHAT_WEB" | "VOIP";
  motif_principal: string;
  motifs_secondaires: string[];
  actions_effectuees: string[];
  resultat: "RESOLU" | "ESCALADE" | "ABANDONNE";
  ticket_reference: string | null;
  points_attention: string[];
  sentiment_final: "SATISFAIT" | "NEUTRE" | "INSATISFAIT";
}

// Ticket CRM
interface Ticket {
  id: string;
  crm_id: string;                // Identifiant dans le CRM externe
  source: "AGENT_IA";
  channel: "CHAT_WEB" | "VOIP";
  conversation_id: string;
  assure_cin: string;
  assure_id: string;
  category: "RECLAMATION" | "INFORMATION" | "ELIGIBILITE" | "TECHNIQUE" | "AUTRE";
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  status: "NOUVEAU" | "EN_COURS" | "EN_ATTENTE_VALIDATION" | "RESOLU" | "FERME";
  subject: string;
  description: string;
  email_draft: EmailDraft | null;
  attachments: Attachment[];
  assigned_to: string | null;
  created_at: Date;
  updated_at: Date;
}

// Email généré automatiquement
interface EmailDraft {
  subject: string;
  to: string[];
  cc: string[];
  body: string;
  actions_requises: string[];
  attachments: Attachment[];
  generated_at: Date;
  validated: boolean;
  validated_by: string | null;
  sent_at: Date | null;
}

// Événement d'audit
interface AuditEvent {
  id: string;
  timestamp: Date;
  event_type: AuditEventType;
  actor_type: "ASSURE" | "AGENT_IA" | "AGENT_HUMAIN" | "SYSTEM" | "ADMIN";
  actor_id: string;
  conversation_id: string | null;
  action: string;
  resource: string;
  result: "SUCCESS" | "FAILURE" | "PARTIAL";
  ip_address: string;
  details: object;
  hmac_signature: string;        // Intégrité du log
}

type AuditEventType =
  | "AUTH_ATTEMPT" | "AUTH_SUCCESS" | "AUTH_FAILURE" | "AUTH_LOCKOUT"
  | "DIGIHEALTH_QUERY" | "TICKET_CREATED" | "TICKET_UPDATED"
  | "ESCALATION_TRIGGERED" | "CONVERSATION_STARTED" | "CONVERSATION_CLOSED"
  | "SUMMARY_GENERATED" | "EMAIL_GENERATED" | "EMAIL_SENT"
  | "ADMIN_LOGIN" | "ADMIN_ACTION" | "DATA_EXPORT";
```

### 5.2 Data Flow Diagram

```
┌──────────┐         ┌─────────────┐       ┌────────────────┐       ┌──────────────┐
│  ASSURÉ  │──[1]──► │  INGRESS    │──[2]──►  ORCHESTRATEUR │──[3]──►   LLM API    │
│          │         │ (Web/VoIP)  │       │  (State + Ctx) │       │  (Claude/OAI)│
└──────────┘         └─────────────┘       └───────┬────────┘       └──────┬───────┘
                                                   │                        │
                            ┌──────────────────────┼────────────────────────┘
                            │ [4] Tool Calls        │
              ┌─────────────▼──┐  ┌────────────────▼──┐  ┌──────────────────┐
              │  DigiHealth    │  │   Knowledge Base  │  │  Auth Module     │
              │  API           │  │   (RAG Vector DB) │  │  (+ SMS Gateway) │
              └────────┬───────┘  └────────┬──────────┘  └──────────────────┘
                       │ [5]               │ [5]
                       └─────────┬─────────┘
                                 │ Données retournées
                                 ▼
                      ┌──────────────────────┐
                      │  RÉPONSE à l'ASSURÉ  │──► Chat Widget / TTS → VoIP
                      └──────────┬───────────┘
                                 │ [6] Fin conversation
                                 ▼
               ┌──────────────────────────────────┐
               │  POST-PROCESSING (asynchrone)     │
               │  ├─ LLM → Summary JSON            │
               │  ├─ LLM → Email Draft             │
               │  ├─ CRM API → Ticket créé/MAJ     │
               │  ├─ SMS/Email → Notification      │
               │  └─ Audit Log → Append-only       │
               └──────────────────────────────────┘
```

**Légende des flux :**
- `[1]` Message texte (chat) ou audio PCM transcrit (VoIP) + metadata session
- `[2]` Message normalisé + session_id + conversation_id
- `[3]` Prompt complet = system_prompt + conversation_history + user_message + tool_definitions
- `[4]` Exécution des tool calls retournés par le LLM (appels API parallélisés si possible)
- `[5]` Données structurées renvoyées au LLM pour génération de la réponse finale
- `[6]` Workflow asynchrone déclenché en parallèle (ne bloque pas l'assuré)

---

## 6. Security & Compliance Architecture

### Encryption

| Couche | Mécanisme | Standard |
|--------|-----------|----------|
| **Données en transit (réseau)** | TLS 1.3 (TLS 1.2 minimum acceptable) | RFC 8446 |
| **Audio VoIP** | SRTP (Secure RTP) | RFC 3711 |
| **Données au repos (DB)** | AES-256-GCM pour les colonnes sensibles (CIN, données médicales) | NIST FIPS 197 |
| **Fichiers uploadés** | Chiffrement côté serveur avec clé gérée (SSE-KMS) | AWS KMS ou équivalent |
| **Logs d'audit** | Signature HMAC-SHA256 de chaque entrée | — |
| **Secrets applicatifs** | Stockage dans HashiCorp Vault ou AWS Secrets Manager. Rotation automatique des clés. | — |
| **Backups** | Chiffrement AES-256 des sauvegardes. Test de restauration mensuel. | — |

### Authentication & Authorization

```
RBAC — Rôles et permissions :

┌─────────────┬──────────────────────────────────────────────────────────┐
│ Rôle        │ Permissions                                              │
├─────────────┼──────────────────────────────────────────────────────────┤
│ ASSURE      │ Lecture de ses propres données · Dépôt réclamation       │
│             │ Consultation de son historique de conversations          │
├─────────────┼──────────────────────────────────────────────────────────┤
│ AGENT       │ Lecture des conversations assignées · Mise à jour tickets│
│             │ Écoute des enregistrements VoIP (avec autorisation)      │
├─────────────┼──────────────────────────────────────────────────────────┤
│ SUPERVISEUR │ Toutes permissions AGENT · Lecture de toutes convs       │
│             │ Gestion des escalades · Validation emails générés        │
├─────────────┼──────────────────────────────────────────────────────────┤
│ ADMIN       │ Toutes permissions · Gestion utilisateurs · Audit logs   │
│             │ Configuration système · Export de données               │
└─────────────┴──────────────────────────────────────────────────────────┘

API inter-services :
- OAuth 2.0 Client Credentials Flow (M2M) pour l'accès DigiHealth
- JWT (RS256, expiry 15 min) pour toutes les API internes
- mTLS (mutual TLS) pour la communication Backend ↔ Integration Gateway

Assurés :
- OTP SMS (6 chiffres, validité 5 minutes, 1 renvoi autorisé)
- Fallback : date de naissance + numéro d'assuré
- Session JWT : expiry 30 minutes, non-renouvelable sans ré-authentification
```

### Auditing

```
Événements audités (liste non exhaustive) :

SÉCURITÉ :
  - Toutes les tentatives d'authentification (réussie, échouée, lockout)
  - Accès aux données de santé (qui, quand, quel dossier)
  - Modifications de configuration système
  - Connexions administrateur

MÉTIER :
  - Création et modification de tickets
  - Génération de résumés et d'emails
  - Escalades (déclencheur, agent assigné)
  - Envoi de notifications

TECHNIQUE :
  - Appels DigiHealth (endpoint, durée, code retour)
  - Erreurs système critiques
  - Démarrages et arrêts des services

Conservation : 5 ans minimum (à confirmer avec ARS Tunisie)
Accès : Lecture seule pour les admins. Export possible en CSV/PDF.
Intégrité : Hash HMAC-SHA256 chaîné (chaque entrée inclut le hash de la précédente).
```

### Data Anonymization (Enregistrements Vocaux)

```
Politique pour les enregistrements VoIP :

1. CONSENTEMENT : Annonce obligatoire en début d'appel (ex : "Cet appel peut être
   enregistré à des fins de qualité et d'amélioration du service. En continuant,
   vous acceptez cet enregistrement.")

2. STOCKAGE : Fichiers audio stockés séparément des transcripts, dans un bucket
   chiffré avec accès restreint.

3. ANONYMISATION (pour usage en entraînement STT/TTS) :
   a. Suppression automatique : numéros CIN, numéros de téléphone, noms propres
      (détection NER — Named Entity Recognition)
   b. Remplacement par tokens neutres : [CIN], [NOM], [TELEPHONE]
   c. Validation manuelle par l'équipe ARS avant toute utilisation en entraînement

4. RÉTENTION :
   - Enregistrements production : 1 an (à confirmer ARS)
   - Enregistrements d'entraînement anonymisés : durée du projet + 6 mois
   - Suppression sécurisée (3-pass overwrite) à expiration

5. TRANSFERT : Aucun enregistrement brut (non-anonymisé) ne doit être transmis
   à un prestataire externe ou à une API cloud sans anonymisation préalable.
```

---

## 7. Infrastructure & Deployment Considerations

### Availability (SLA 99.5%)

```
Architecture Haute Disponibilité :

┌─────────────────────────────────────────────────────────────────────┐
│                        LOAD BALANCER (HA)                           │
│                  (HAProxy / AWS ALB / Nginx)                        │
│                  Active-Passive avec failover < 30s                 │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
        ┌───────────────────────┼────────────────────────┐
        ▼                       ▼                        ▼
┌──────────────┐       ┌──────────────┐        ┌──────────────┐
│  Instance 1  │       │  Instance 2  │        │  Instance N  │
│  Backend API │       │  Backend API │        │  Backend API │
│  (Primary)   │       │  (Replica)   │        │  (Auto-scale)│
└──────────────┘       └──────────────┘        └──────────────┘
        │                       │
        └───────────┬───────────┘
                    │
        ┌───────────▼───────────┐
        │    Redis Cluster (HA) │  ← Session state
        │    (3 nœuds minimum)  │
        └───────────────────────┘
                    │
        ┌───────────▼───────────┐
        │   PostgreSQL (HA)     │  ← Conversation history, audit
        │   Primary + 2 Read    │
        │   Replicas            │
        └───────────────────────┘

VoIP Gateway (HA) :
        ┌───────────────────────────────────────┐
        │  SIP Load Balancer (Kamailio)         │
        │    ↓                    ↓             │
        │  Asterisk Node 1    Asterisk Node 2   │
        └───────────────────────────────────────┘

Objectif : RTO (Recovery Time Objective) < 5 minutes
           RPO (Recovery Point Objective) < 1 minute (réplication synchrone Redis)
```

### Scalability

```
Composants scalables horizontalement :

┌─────────────────────┬──────────────────────────────────────────────────────┐
│ Composant           │ Stratégie de scaling                                 │
├─────────────────────┼──────────────────────────────────────────────────────┤
│ Backend API         │ Auto-scaling horizontal (Docker/Kubernetes HPA)       │
│                     │ Trigger : CPU > 70% OU conversations actives > N     │
├─────────────────────┼──────────────────────────────────────────────────────┤
│ VoIP Gateway        │ Multi-instances Asterisk + SIP Load Balancer         │
│ (Asterisk)          │ Scaling manuel anticipatif pour les pics saisonniers  │
├─────────────────────┼──────────────────────────────────────────────────────┤
│ STT Service         │ Scaling horizontal (si self-hosted Whisper)           │
│                     │ Ou scaling géré par le fournisseur cloud (Google/OAI) │
├─────────────────────┼──────────────────────────────────────────────────────┤
│ LLM API             │ Géré par Anthropic/OpenAI côté fournisseur            │
│                     │ Rate limits à surveiller. Quota augmentation à prévoir│
├─────────────────────┼──────────────────────────────────────────────────────┤
│ Redis               │ Redis Cluster (sharding) pour > 10 000 sessions       │
├─────────────────────┼──────────────────────────────────────────────────────┤
│ PostgreSQL          │ Read replicas pour les requêtes analytiques dashboard  │
│                     │ Partitionnement par date pour les tables conversations │
└─────────────────────┴──────────────────────────────────────────────────────┘
```

### Voice Data Prerequisite (CRITICAL)

> ⚠️ **Cette section est un prérequis BLOQUANT pour la mise en production du canal vocal.**

#### Contexte — Le Problème "Low-Resource Language"

L'arabe tunisien (Derja) est une **langue à faibles ressources numériques**. Contrairement à l'arabe standard ou au français, les corpus d'entraînement publics sont rares, bruités et inadaptés au contexte ARS. L'état des ressources disponibles :

| Corpus open source | Type | Volume | Raison d'inadéquation |
|--------------------|------|--------|-----------------------|
| **TunArTTS** | TTS | ~3 heures | Mono-locuteur (voix masculine unique). Les recommandations professionnelles sont de 5 à 20 h. |
| **TuniSpeech-21h** | ASR | 21 heures | Extraits de médias sociaux (YouTube, Facebook) — fort bruit de fond, aucun vocabulaire médical ou d'assurance. |
| **LDC2022E01** | ASR | 383 heures | Conversations téléphoniques générales — aucun scénario ARS, aucun terme métier (CIN, remboursement, éligibilité, DigiHealth). |
| **LinTO** | ASR | N/A | Mélange tunisien/français/anglais, contexte filmique, non adapté aux centres d'appels. |

**Conclusion : Aucune de ces ressources ne permet d'atteindre le WER < 15% requis sur les scénarios ARS sans fine-tuning sur des données spécifiques.**

#### Données TTS Requises (Création de la voix "ARS Voice")

| Donnée | Description | Quantité minimale | Délai requis |
|--------|-------------|-------------------|--------------|
| **Enregistrements audio studio** | Voix masculine et/ou féminine lisant des scripts ARS en Derja et en français. Qualité : WAV 44.1 kHz, 24 bits, chambre anéchoïque ou studio. | **5 à 10 heures d'audio clair** | Semaines 1-2 |
| **Scripts de lecture TTS** | 200 à 500 phrases phonétiquement diversifiées, incluant les formules ARS, termes techniques, scénarios courants. | 200-500 phrases | Semaine 1 |
| **Fiche voix ARS** | Genre, âge perçu, ton (formel/chaleureux/rassurant), débit, accent cible. | Description écrite (obligatoire avant tout enregistrement) | J+3 |

#### Données ASR Requises (Reconnaissance des appels réels)

| Donnée | Description | Quantité minimale | Délai requis |
|--------|-------------|-------------------|--------------|
| **Enregistrements d'appels réels anonymisés** | Extraits du centre d'appels ARS, anonymisés (CIN, noms masqués), en Derja. Format WAV 16 kHz, 16 bits, mono. | **10 à 20 heures** | Semaines 1-2 |
| **Transcriptions associées** | Fichier texte ou Excel par enregistrement. Colonnes : [Fichier audio] / [Transcription en Derja] / [Traduction FR optionnelle]. | 100 % des enregistrements | Semaines 3-4 |
| **Annotations bruit** | Type de bruit présent (bruit ambiant, écho VoIP, coupure, musique d'attente). | Recommandé | Semaines 3-4 |
| **Scripts de test** | 50 à 100 scénarios types ARS réels (ex. : "Chnowa statut mte3 réclamation mte3i ?", "Besh metti mahroum ?"). | 50-100 phrases/scénarios | Semaine 3 |
| **Guide phonétique métier** | Prononciation officielle des 50 à 100 termes ARS : CIN, remboursement, éligibilité, DigiHealth, mutuelle, vignette, prestataire, réclamation... | 50-100 termes | Semaine 2 |
| **Échantillons régionaux** | Enregistrements représentant les accents de Tunis, Sfax, Sousse, zones rurales (recommandé pour la robustesse ASR). | 2-3 heures | Semaine 4 |

#### Calendrier de Livraison des Données Vocales

```
SEMAINE 1-2  ─── Collecte ───────────────────────────────────────────────
             │ ARS sélectionne les enregistrements d'appels à anonymiser
             │ ARS choisit le/la locuteur(trice) pour la voix TTS
             │ ARS transmet la fiche voix et les scripts de lecture
             │
SEMAINE 3-4  ─── Annotation ─────────────────────────────────────────────
             │ ARS (ou prestataire désigné) transcrit les enregistrements
             │ ARS valide les scripts de test et le guide phonétique
             │ ARS livre les annotations de bruit
             │
SEMAINE 5-6  ─── Livraison ──────────────────────────────────────────────
             │ ARS transfère les fichiers à l'équipe technique :
             │   - Audio WAV (dossier zippé sécurisé)
             │   - Transcriptions UTF-8 (Excel ou .txt)
             │   - Guide phonétique (PDF ou Excel)
             │   - Scripts de test (Excel/CSV)
             │
SEMAINE 7-10 ─── Fine-tuning STT ────────────────────────────────────────
             │ Équipe technique : fine-tuning Whisper ou entraînement ASR
             │ Benchmarking WER sur les scripts de test ARS
             │ Itérations d'amélioration
             │
SEMAINE 7-10 ─── Voice Cloning TTS ──────────────────────────────────────
             │ Clonage voix via ElevenLabs ou Azure Neural TTS
             │ Génération d'échantillons pour validation ARS
             │ Ajustements (débit, ton, prononciation termes métier)
             │
SEMAINE 11   ─── Validation ARS ─────────────────────────────────────────
             │ Tests d'acceptation vocale (UAT vocal)
             │ Validation formelle par ARS de la voix et de la précision ASR
             └──────────────────────────────────────────────────────────────
```

> **⚠️ RISQUES SI LES DONNÉES NE SONT PAS FOURNIES :**
> - La voix TTS sera robotique et non naturelle, portant atteinte à l'image de l'ARS.
> - Les termes métier (CIN, remboursement, éligibilité, DigiHealth) seront mal prononcés ou incompris.
> - Le WER en conditions réelles d'appel dépassera largement 30%, rendant le système inutilisable.
> - Le taux d'escalade sera élevé, annulant tous les bénéfices opérationnels attendus.
> - **Le canal vocal ne pourra pas être mis en production dans les délais impartis.**

---

## 8. Conclusion & Next Steps

### Synthèse de la Maturité Technique

| Domaine | Statut | Prochaine action |
|---------|--------|-----------------|
| Spécifications fonctionnelles | ✅ Complet (CDC v1.1) | — |
| Architecture définie | ✅ Complet (ce document) | Validation par ARS |
| Accès DigiHealth API | 🔴 **Bloquant** | ARS doit fournir credentials + Swagger |
| Documentation CRM/Ticketing | 🔴 **Bloquant** | ARS doit fournir API spec |
| Intégration VoIP (détails SIP) | 🔴 **Bloquant** | ARS doit fournir IP SIP, trunk, codec |
| Validation API LLM (Anthropic) | 🔴 **Bloquant** | ARS doit signer validation écrite |
| Validation API STT/TTS | 🔴 **Bloquant** | ARS doit signer validation écrite |
| Données vocales TTS (enregistrements) | 🔴 **Critique** | ARS doit démarrer collecte J+0 |
| Données vocales ASR (appels anonymisés) | 🔴 **Critique** | ARS doit démarrer anonymisation J+0 |
| Infrastructure hébergement | 🟠 À définir | ARS doit confirmer on-premise vs cloud |
| Localisation des données (data residency) | 🟠 À définir | ARS doit statuer sur le territoire de traitement |

---

### Prérequis Immédiats — Actions Requises de l'ARS Tunisie

Les actions suivantes sont nécessaires avant tout démarrage du développement. Le délai cible est **2 à 3 semaines** à compter de la signature du contrat.

#### Prérequis Bloquants (Développement impossible sans ces éléments)

```
P1 — API DigiHealth
     ☐ URL de base (production et staging)
     ☐ Méthode d'authentification et credentials de test
     ☐ Documentation Swagger/OpenAPI complète
     ☐ IP/Domaines à whitelister pour nos serveurs
     ☐ Contact support technique DigiHealth dédié

P2 — Intégration VoIP
     ☐ Nature de la plateforme (Asterisk existant ou à déployer)
     ☐ Adresse IP et port du serveur SIP
     ☐ Credentials SIP Trunk (username, password, domaine)
     ☐ Codec configuré (G.711 / G.729 / Opus)
     ☐ Numéro(s) de téléphone dédié(s) au service Agent IA
     ☐ Capacité simultanée maximale attendue

P3 — CRM / Ticketing
     ☐ Nom de la solution CRM (Zendesk / Salesforce / autre)
     ☐ Documentation API de création de tickets
     ☐ Credentials d'accès (test et production)
     ☐ Liste des champs obligatoires à la création de ticket

P4 — Validations Écrites Obligatoires
     ☐ Autorisation d'utilisation de l'API Claude (Anthropic) — OUI / NON / Sous conditions
     ☐ Autorisation d'utilisation de l'API OpenAI — OUI / NON / Sous conditions
     ☐ Autorisation d'utilisation d'un service STT externe — OUI / NON / Sous conditions
     ☐ Autorisation d'utilisation d'un service TTS externe — OUI / NON / Sous conditions
     ☐ Position sur la localisation des données (data residency en Tunisie : OUI / NON)
```

#### Prérequis Critiques pour le Canal Vocal

```
P5 — Données Vocales (à démarrer immédiatement en parallèle)
     ☐ Fiche voix "ARS Voice" (genre, ton, débit, accent cible) — J+3
     ☐ Désignation du/de la locuteur(trice) pour les enregistrements TTS — J+7
     ☐ Scripts de lecture TTS (200-500 phrases) — Semaine 2
     ☐ Début collecte enregistrements d'appels réels à anonymiser — J+0
     ☐ Livraison enregistrements anonymisés + transcriptions — Semaine 5-6
     ☐ Guide phonétique des termes métier (50-100 termes) — Semaine 2
```

#### Prérequis Infrastructure

```
P6 — Infrastructure & Sécurité
     ☐ Décision hébergement : on-premise ARS / cloud privé / cloud public approuvé
     ☐ Fourniture d'un accès VPN sécurisé (si on-premise)
     ☐ Politique de pare-feu et domaines à whitelister
     ☐ Politique de rétention des données (durée légale applicable)
     ☐ Modalités d'authentification assuré (règles exactes, nombre de tentatives max)
```

---

### Contact & Gouvernance

| Rôle | Nom | Email | Téléphone |
|------|-----|-------|-----------|
| Chef de projet ARS Tunisie | *À compléter* | *À compléter* | *À compléter* |
| Responsable DSI / Technique ARS | *À compléter* | *À compléter* | *À compléter* |
| Responsable Sécurité ARS (RSSI) | *À compléter* | *À compléter* | *À compléter* |
| Chef de projet Prestataire | *À compléter* | *À compléter* | *À compléter* |
| Architecte Solution Prestataire | *À compléter* | *À compléter* | *À compléter* |

---

*Document généré à partir de l'analyse croisée des trois documents sources ARS Tunisie — Juin 2026.*  
*Ce document est vivant et sera mis à jour au fur et à mesure de la réception des informations client.*  
*Version suivante : `archi_v2.md` — À émettre après réception des prérequis P1 à P6.*

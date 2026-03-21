# Vanalytics MVP Design Spec

**Date:** 2026-03-20
**Status:** Approved
**Authors:** Scott McCutchen, Claude

## Overview

Vanalytics (Vana'diel + Analytics) is a Final Fantasy XI character progress tracker. It consists of a web application where players can view and manage character profiles, and a Windower 4 addon that automatically syncs in-game character state to the web app.

The MVP focuses on a narrow feature set: character basic profile, jobs/levels, crafting skills, current job assignment, and currently equipped gear. The data model and UI are designed for extensibility to eventually cover missions, trusts, rare items, area progression, and more.

## Architecture

**Approach: Monolith API on Azure Container Apps.**

A single .NET 10 Web API handles all concerns: authentication, character management, addon sync, and public profiles. The React/TypeScript SPA is hosted separately on Azure Static Web Apps.

> **Future consideration:** When the app begins to receive meaningful traffic, consider splitting into separate Container Apps for the web-facing API and addon ingestion API (Approach C). This enables independent scaling and isolates addon sync traffic from web UI traffic. The monolith is designed with clean internal boundaries to make this split straightforward.

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Backend API | .NET 10 Web API (C#) |
| Frontend | React + TypeScript (Vite) |
| Database | SQL Server (Azure SQL Database serverless in prod, SQL Server Linux container locally) |
| ORM | Entity Framework Core (SQL Server provider) |
| Windower Addon | Lua |
| Infrastructure | Terraform |
| CI/CD | GitHub Actions |
| Containerization | Docker / Docker Compose |

## Repository Structure

```
Vanalytics/
├── src/
│   ├── Vanalytics.Api/           # .NET 10 Web API (controllers, auth, middleware)
│   ├── Vanalytics.Core/          # Domain models, interfaces, DTOs
│   ├── Vanalytics.Data/          # EF Core DbContext, migrations, repositories
│   └── Vanalytics.Web/           # React/TypeScript SPA (Vite)
├── addon/
│   └── vanalytics/               # Windower Lua addon
│       ├── vanalytics.lua        # Main addon entry point
│       └── settings.xml          # Default addon settings (API URL, key)
├── infra/
│   └── terraform/                # Azure infrastructure definitions
├── .github/
│   └── workflows/                # CI/CD pipelines
├── docker-compose.yml            # Local dev: API + SQL Server + React dev server
├── docker-compose.prod.yml       # Production overrides
└── Vanalytics.sln                # Solution file
```

The .NET side follows a clean architecture split:
- **Vanalytics.Core** — domain models, enums, interfaces, DTOs. No dependencies on EF Core or ASP.NET.
- **Vanalytics.Data** — EF Core DbContext, entity configurations, migrations, repository implementations.
- **Vanalytics.Api** — controllers, middleware, authentication, dependency injection wiring.

## Authentication

### Web UI
- **Local auth:** username/password registration and login, passwords hashed with a strong algorithm (bcrypt or Argon2).
- **OAuth:** Google and Microsoft account login (both implemented for MVP).
- **Token format:** JWT issued on login, short-lived access token + refresh token.
- **Seeded admin:** The first user (admin) is seeded via environment variables (`ADMIN_EMAIL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`) defined in `docker-compose.yml` locally and as secrets in GitHub Actions for production.

### Windower Addon
- **API key:** Single key per user, sent via `X-Api-Key` header.
- User generates/regenerates the key in the web UI. Generating a new key invalidates the previous one.
- The API key authorizes requests for all characters owned by that user. The server checks license status per character on each sync request.

### Future Auth
- SAML authentication may be added in a future iteration.
- Role-based access control (RBAC) is deferred to a future iteration.

## Data Model

### Users
| Column | Type | Notes |
|--------|------|-------|
| Id | GUID | Primary key |
| Email | string | Unique |
| Username | string | Unique |
| PasswordHash | string | Nullable (OAuth users may not have a password) |
| ApiKey | string | Nullable, unique. For Windower addon auth. |
| CreatedAt | DateTimeOffset | |
| UpdatedAt | DateTimeOffset | |

### Characters
| Column | Type | Notes |
|--------|------|-------|
| Id | GUID | Primary key |
| UserId | GUID | FK → Users |
| Name | string | FFXI character name |
| Server | string | FFXI server name |
| LicenseStatus | enum | Unlicensed, Active, Expired (default: Unlicensed) |
| IsPublic | bool | Toggles public profile visibility |
| LastSyncAt | DateTimeOffset | Nullable, last successful addon sync |
| CreatedAt | DateTimeOffset | |
| UpdatedAt | DateTimeOffset | |

**Unique constraint:** (Name, Server) — a character name is unique per server in FFXI.

### CharacterJobs
| Column | Type | Notes |
|--------|------|-------|
| Id | GUID | Primary key |
| CharacterId | GUID | FK → Characters |
| JobId | enum (JobType) | One of 22 FFXI jobs |
| Level | int | 1-99 (or master level beyond) |
| IsActive | bool | Whether this is the currently set job (single source of truth for active job) |

**Unique constraint:** (CharacterId, JobId)

### EquippedGear
| Column | Type | Notes |
|--------|------|-------|
| Id | GUID | Primary key |
| CharacterId | GUID | FK → Characters |
| Slot | enum (EquipSlot) | One of 16 equipment slots |
| ItemName | string | In-game item name |
| ItemId | int | In-game item ID (for external DB linking) |

**Unique constraint:** (CharacterId, Slot)

### CraftingSkills
| Column | Type | Notes |
|--------|------|-------|
| Id | GUID | Primary key |
| CharacterId | GUID | FK → Characters |
| Craft | enum (CraftType) | One of 9 crafts (8 + Fishing) |
| Level | int | Crafting skill level |
| Rank | string | Crafting rank title (Amateur, Recruit, etc.) |

**Unique constraint:** (CharacterId, Craft)

### Enums

**JobType** (22 values): WAR, MNK, WHM, BLM, RDM, THF, PLD, DRK, BST, BRD, RNG, SAM, NIN, DRG, SMN, BLU, COR, PUP, DNC, SCH, GEO, RUN

**EquipSlot** (16 values): Main, Sub, Range, Ammo, Head, Body, Hands, Legs, Feet, Neck, Waist, Back, Ring1, Ring2, Ear1, Ear2

**CraftType** (9 values): Woodworking, Smithing, Goldsmithing, Clothcraft, Leathercraft, Bonecraft, Alchemy, Cooking, Fishing

**LicenseStatus** (3 values): Unlicensed, Active, Expired

## API Design

### Auth
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/auth/register | None | Create account |
| POST | /api/auth/login | None | Local login → JWT |
| POST | /api/auth/oauth/{provider} | None | OAuth callback → JWT |
| POST | /api/auth/refresh | JWT | Refresh access token |
| GET | /api/auth/me | JWT | Current user profile |

### API Keys
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/keys/generate | JWT | Generate new API key (invalidates old) |
| DELETE | /api/keys | JWT | Revoke API key |

### Characters
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/characters | JWT | List user's characters |
| POST | /api/characters | JWT | Register a character |
| GET | /api/characters/{id} | JWT | Character detail (owner only) |
| PUT | /api/characters/{id} | JWT | Update character settings |
| DELETE | /api/characters/{id} | JWT | Remove character |

### Public Profiles
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/profiles/{server}/{name} | None | Public character profile |

### Sync (Windower Addon)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/sync | API Key | Push character state snapshot |

**Rate limiting:** 20 requests per hour per API key on the sync endpoint. Returns `429 Too Many Requests` when exceeded.

### Sync Payload

```json
{
  "characterName": "Soverance",
  "server": "Asura",
  "activeJob": "THF",
  "activeJobLevel": 99,
  "jobs": [
    { "job": "THF", "level": 99 },
    { "job": "DNC", "level": 49 }
  ],
  "gear": [
    { "slot": "Main", "itemId": 20515, "itemName": "Vajra" }
  ],
  "crafting": [
    { "craft": "Goldsmithing", "level": 110, "rank": "Craftsman" }
  ]
}
```

The API upserts all character data from the snapshot. This keeps the addon simple — it sends the full state and the server reconciles.

## Windower Addon

### Configuration (settings.xml)
- `ApiUrl` — base URL of the Vanalytics API (default: `https://vanalytics.com`)
- `ApiKey` — user's API key from the web UI
- `SyncInterval` — minutes between auto-syncs (default: 15, minimum: 5)

### Commands
- `//vanalytics sync` — immediate manual sync
- `//vanalytics status` — show last sync time and connection status
- `//vanalytics interval <minutes>` — change sync interval (enforces 5 min floor)
- `//vanalytics help` — list commands

### Game State Reading
- `windower.ffxi.get_player()` — job, level, job levels
- `windower.ffxi.get_items()` — equipped gear across all 16 slots
- Crafting skill packet data — crafting levels and ranks
- `windower.ffxi.get_info()` — character name and server

### Sync Flow
1. Timer fires every N minutes (or user runs `//vanalytics sync`)
2. Addon reads current character state from Windower APIs
3. Sends `POST /api/sync` with `X-Api-Key` header and JSON payload
4. Logs success/failure to the game chat log

### Edge Cases
- Do not sync if not logged into a character
- Handle API errors gracefully (log to chat, do not crash the addon)
- If API returns 403 (no license for character), show a clear message in chat
- Enforce minimum 5-minute sync interval client-side; ignore settings below the floor
- Server-side rate limiting (20 req/hr per API key) as a backstop; addon shows warning on 429

## Frontend

### Routes
- `/` — landing page / marketing
- `/login` — login / register
- `/dashboard` — user's character list and account management
- `/dashboard/characters/{id}` — private character detail / manual editing
- `/dashboard/keys` — API key management
- `/{server}/{name}` — public character profile

### Public Profile Page
Displays: character name, server, active job/level, all job levels, equipped gear, crafting skills. Designed to be shareable and visually appealing. Read-only.

### Private Dashboard
Allows the character owner to: view sync status, toggle public visibility, manually edit data that can't be automated through the addon, manage character settings.

### UI Direction
The UI design will evolve over time. The MVP should be clean and functional. Detailed UI mockups and design decisions are deferred to the implementation phase.

## Infrastructure (Azure + Terraform)

### Azure Resources
| Resource | SKU/Tier | Estimated Cost |
|----------|----------|---------------|
| Azure Container Apps Environment | Consumption | Pay-per-use |
| Azure Container App (API) | Min 0 / Max 2 replicas | ~$0-5/mo at low traffic |
| Azure SQL Database | Serverless (auto-pause) | ~$0-5/mo (free tier eligible) |
| Azure Static Web Apps | Free tier | $0 |
| Azure Container Registry | Basic | ~$5/mo |

**Estimated total:** ~$5-10/mo at minimal traffic.

### Terraform State
Stored in an Azure Storage Account backend.

### Docker Compose (Local Dev)
- `api` — .NET 10 API with hot reload
- `db` — SQL Server 2022 Linux container
- `web` — React dev server (Vite)

## CI/CD (GitHub Actions)

### CI Workflow (on PR)
- Build .NET solution
- Run tests
- Lint frontend

### Deploy Workflow (on push to main)
- Build Docker images
- Push to Azure Container Registry
- Deploy API to Azure Container Apps
- Deploy SPA to Azure Static Web Apps

### Secrets
- Azure service principal credentials
- Seeded admin user (email, username, password)
- Database connection string
- OAuth client IDs and secrets

## User-Character Licensing Model

Users sign up for free. To track a character, they must have an active license for that character. The billing and payment system is deferred to a future iteration, but the data model supports it from day one via `Characters.LicenseStatus`.

New characters default to `Unlicensed` status. For the MVP, the seeded admin's characters will be manually set to `Active` license status. License enforcement logic in the sync endpoint will check this status and reject syncs for unlicensed characters with a 403 response.

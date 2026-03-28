# Vanalytics

**Vana'diel + Analytics** — A web-based companion app for Final Fantasy XI.

Vanalytics is an open-source character tracking, game data browsing, and 3D model viewing platform for FFXI. It consists of an ASP.NET Core API, a React + TypeScript frontend, and a Windower addon that syncs live character data from the game client.

**Production Instance:** [https://vanalytics.soverance.com](https://vanalytics.soverance.com)

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Windower Addon](#windower-addon)
- [Configuring the 3D Model Viewer](#configuring-the-3d-model-viewer)
- [FFXI Community Attribution](#ffxi-community-attribution)
- [Legal](#legal)

## Features

### Character Tracking
Sync your character data from the game client in real-time using the Windower addon. View job levels and stats, equipment, crafting skills, inventory, and Ultimate weapon progress.

### 3D Model Viewer
Render FFXI character models directly in the browser with full equipment compositing across all 8 races. Includes skeleton loading, animation playback, and texture rendering — all parsed from your local FFXI DAT files using the browser's File System Access API. No game files are ever uploaded to the server.

### Zone Viewer
Explore FFXI zone geometry in 3D with fog, water effects, day/night cycle simulation, NPC spawn point visualization, and minimap overlay. Supports orbit and fly camera modes.

### NPC & Monster Browser
Browse and preview NPC and monster models with 3D rendering, animation playback, and wireframe mode.

### Item Database
Search and filter the full FFXI item database with category, job, level range, and stat filters. Supports card grid and table views with URL-based state persistence for bookmarkable searches.

### Combat Session Tracking
The Windower addon parses combat log data and uploads session events including melee/ranged/spell damage, skillchains, magic bursts, healing, kills, deaths, and gil earned. View session reports with combat statistics and timeline breakdowns.

### Macro Editor
View and edit your FFXI macro books through the web interface. The addon reads macro DAT files and syncs all 20 books (10 pages each, 20 macros per page) with hash-based deduplication to prevent redundant uploads.

### Economy Tracking
Monitor bazaar activity across servers with active player counts per zone. Ingest auction house sales data with price history, buyer/seller tracking, and deduplication.  **This feature is still in development**.

### Forum
Community forum with categories, threads, full-text search, rich text editing, image attachments, and moderator tools (pin/lock threads).

### Server Status
Game server uptime monitoring with trend charts, heatmap visualization, and server rankings. Includes an FFXI clock displaying Vana'diel time, moon phase, and elemental hour.

## Architecture

| Component | Technology |
|-----------|------------|
| Backend | ASP.NET Core (.NET 10) REST API |
| Frontend | React 19, TypeScript, Tailwind CSS, Vite |
| 3D Rendering | Three.js via @react-three/fiber |
| Database | SQL Server (Azure SQL in production) |
| Auth | Local accounts, SAML SSO, API keys |
| Deployment | Docker → Azure Container Registry → Azure Container Apps |
| CI/CD | GitHub Actions (build, push, deploy, auto-tag releases) |

## Getting Started

### Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/download)
- [Node.js 20+](https://nodejs.org/)
- [Docker](https://www.docker.com/) (for local development with SQL Server)

### Local Development

1. Clone the repo with submodules:
   ```bash
   git clone --recurse-submodules https://github.com/Soverance/Vanalytics.git
   cd Vanalytics
   ```

2. Start the development environment:
   ```bash
   docker compose up
   ```
   This starts SQL Server, the API, and the frontend automatically.

### Environment Variables

Production secrets are managed through Azure Container Apps and GitHub Actions secrets. For local development, `docker-compose.yml` provides default development values. See `appsettings.json` for the full configuration schema.

## Windower Addon

The Vanalytics Windower addon syncs character data from the FFXI game client to the web platform.

See in the Vanalytics addon setup guide in the app: [vanalytics.soverance.com/setup](https://vanalytics.soverance.com/setup).

## Configuring the 3D Model Viewer

The model viewer renders FFXI character and NPC models directly from your local game installation. No game files are uploaded — everything is processed client-side in the browser.

### Requirements

- **Browser:** Chrome or Edge (requires the File System Access API, not supported in Firefox or Safari)
- **FFXI Installation:** A standard FFXI installation

### Setup

1. Navigate to **Profile > FFXI Installation**
2. Click **Browse for FFXI Installation**
3. Select your FFXI root directory (e.g., `C:\Program Files (x86)\PlayOnline\SquareEnix\FINAL FANTASY XI`)
4. Grant read permission when prompted

The directory handle is stored locally in your browser's IndexedDB. The model viewer will then be able to load character models, equipment meshes, textures, skeletons, and animations directly from your locally installed DAT files.

## FFXI Community Attribution

Vanalytics is built on top of years of FFXI community research and tooling. This project would not be possible without the following:

### Data Sources

- **[Windower](https://www.windower.net/)** — Addon framework and the [Windower Resources](https://github.com/Windower/Resources) repository, used for item definitions, descriptions, and the addon API
- **[LandSandBoat](https://github.com/LandSandBoat/server)** — Open-source FFXI server emulator. Used for equipment model ID mappings, NPC/monster pool data, zone configurations, and character stat calculation formulas.
- **[AltanaView](https://github.com/mynameisgonz/AltanaView)** Equipment and NPC model ROM path mappings used to resolve model IDs to DAT file locations
- **[FFXIAH](https://www.ffxiah.com)** — Item database information
- **[BG-Wiki](https://www.bg-wiki.com/ffxi/)** — Community wiki and gameplay reference
- **[GalkaReeve mapViewer](https://github.com/GalkaReeve)** — DAT file format structures used as reference for zone geometry decryption, mesh parsing, and animation block parsing

## Legal

### License

This project is licensed under the [MIT License](LICENSE).

### Disclaimer

FINAL FANTASY is a registered trademark of Square Enix Holdings Co., Ltd. FINAL FANTASY XI and all related content, including but not limited to character models, textures, zone geometry, item data, and game mechanics, are the property of Square Enix Co., Ltd. This project is not affiliated with, endorsed by, or sponsored by Square Enix.

Vanalytics does not distribute, host, or transmit any Square Enix game assets. The 3D model viewer reads DAT files directly from the user's local FFXI installation using the browser's File System Access API. All rendering is performed client-side.

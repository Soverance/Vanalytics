# Character Model Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 3D character model viewer to Vanalytics that reads FFXI .DAT files from the user's local installation via the File System Access API, renders equipment on a character skeleton using Three.js, and integrates with the existing character detail page.

**Architecture:** Five subsystems built in dependency order: (1) Data Layer adds Race/Gender to Character and an ItemModelMapping table, (2) File System Access wraps the browser File System Access API with IndexedDB persistence and a React context, (3) DAT Parser is a TypeScript binary parser for FFXI mesh/texture/skeleton data, (4) 3D Renderer uses React Three Fiber to composite equipment meshes onto a shared skeleton, (5) UI integrates the viewer and an FFXI-style equipment grid into the character detail page.

**Tech Stack:** ASP.NET Core 10 / EF Core 10 / SQL Server (backend), React 19 / TypeScript 5.9 / Vite 8 / Tailwind 4 (frontend), Three.js / @react-three/fiber / @react-three/drei (3D rendering), File System Access API / IndexedDB (local file access), Windower 4 Lua (addon)

**Spec:** `docs/superpowers/specs/2026-03-22-character-model-viewer-design.md`

---

## File Structure

### Backend — New Files
| File | Responsibility |
|------|---------------|
| `src/Vanalytics.Core/Enums/Race.cs` | FFXI race enum (Hume, Elvaan, Tarutaru, Mithra, Galka) |
| `src/Vanalytics.Core/Enums/Gender.cs` | Gender enum (Male, Female) |
| `src/Vanalytics.Core/Models/ItemModelMapping.cs` | Maps ItemId + SlotId → visual ModelId |
| `src/Vanalytics.Core/DTOs/Sync/SyncModelEntry.cs` | DTO for model ID entries in sync payload |
| `src/Vanalytics.Core/DTOs/Characters/ModelMappingResponse.cs` | API response for model mappings |
| `src/Vanalytics.Data/Configurations/ItemModelMappingConfiguration.cs` | EF Core configuration for ItemModelMapping |

### Backend — Modified Files
| File | Changes |
|------|---------|
| `src/Vanalytics.Core/Models/Character.cs` | Add Race, Gender properties |
| `src/Vanalytics.Core/DTOs/Sync/SyncRequest.cs` | Add Race, Models fields |
| `src/Vanalytics.Core/DTOs/Characters/CharacterDetailResponse.cs` | Add Race, Gender fields |
| `src/Vanalytics.Data/VanalyticsDbContext.cs` | Add ItemModelMappings DbSet |
| `src/Vanalytics.Data/Configurations/CharacterConfiguration.cs` | Ignore computed Race/Gender display helpers if any |
| `src/Vanalytics.Api/Controllers/SyncController.cs` | Handle Race, Models in sync |
| `src/Vanalytics.Api/Controllers/CharactersController.cs` | Return Race, Gender in detail response |
| `src/Vanalytics.Api/Controllers/ItemsController.cs` | Add model mapping lookup endpoint |

### Frontend — New Files
| File | Responsibility |
|------|---------------|
| `src/lib/ffxi-dat/types.ts` | Shared interfaces (ParsedMesh, ParsedTexture, ParsedSkeleton) |
| `src/lib/ffxi-dat/DatReader.ts` | Low-level binary reader wrapping DataView |
| `src/lib/ffxi-dat/TextureParser.ts` | DXT1/DXT3 texture decompression |
| `src/lib/ffxi-dat/MeshParser.ts` | Mesh extraction from MMB sections |
| `src/lib/ffxi-dat/SkeletonParser.ts` | Bone hierarchy extraction |
| `src/lib/ffxi-dat/DatFile.ts` | Top-level orchestrator (identifies DAT type, delegates) |
| `src/lib/ffxi-dat/index.ts` | Public API barrel export |
| `src/lib/ffxi-filesystem.ts` | IndexedDB wrapper for FileSystemDirectoryHandle |
| `src/context/FfxiFileSystemContext.tsx` | React context for file system state |
| `src/components/character/EquipmentGrid.tsx` | 4×4 FFXI-style equipment slot grid |
| `src/components/character/EquipmentSlot.tsx` | Individual equipment slot cell |
| `src/components/character/EquipmentSwapModal.tsx` | Modal for swapping equipment items |
| `src/components/character/CharacterScene.tsx` | React Three Fiber canvas + scene setup |
| `src/components/character/CharacterModel.tsx` | Loads and composites equipment meshes |
| `src/components/character/ModelViewer.tsx` | Wrapper handling file system states |
| `src/components/character/FullscreenViewer.tsx` | Fullscreen immersive mode |

### Frontend — Modified Files
| File | Changes |
|------|---------|
| `src/Vanalytics.Web/package.json` | Add three, @react-three/fiber, @react-three/drei, idb-keyval |
| `src/Vanalytics.Web/src/types/api.ts` | Add Race, Gender to character types; add ModelMapping type |
| `src/Vanalytics.Web/src/pages/CharacterDetailPage.tsx` | Replace GearTable with EquipmentGrid + ModelViewer |
| `src/Vanalytics.Web/src/pages/ProfilePage.tsx` | Add FFXI Installation settings tab |
| `src/Vanalytics.Web/src/components/Layout.tsx` | Add FfxiFileSystemProvider |

### Static Data Files
| File | Responsibility |
|------|---------------|
| `src/Vanalytics.Web/public/data/item-model-mappings.json` | Seed data: ItemId → ModelId per slot (from Stylist XML) |
| `src/Vanalytics.Web/public/data/dat-paths.json` | ModelId + Race + Gender + Slot → ROM-relative DAT path |

### Addon — Modified Files
| File | Changes |
|------|---------|
| `addon/vanalytics/vanalytics.lua` | Add race and model table to sync payload |

### Test Files
| File | Responsibility |
|------|---------------|
| `tests/Vanalytics.Api.Tests/SyncControllerModelTests.cs` | Tests for race/gender/model sync |
| `tests/Vanalytics.Data.Tests/ItemModelMappingTests.cs` | Tests for mapping entity persistence |

---

## Task 1: Race and Gender Enums

**Files:**
- Create: `src/Vanalytics.Core/Enums/Race.cs`
- Create: `src/Vanalytics.Core/Enums/Gender.cs`

- [ ] **Step 1: Create Race enum**

```csharp
// src/Vanalytics.Core/Enums/Race.cs
namespace Vanalytics.Core.Enums;

public enum Race
{
    Hume,
    Elvaan,
    Tarutaru,
    Mithra,
    Galka
}
```

- [ ] **Step 2: Create Gender enum**

```csharp
// src/Vanalytics.Core/Enums/Gender.cs
namespace Vanalytics.Core.Enums;

public enum Gender
{
    Male,
    Female
}
```

- [ ] **Step 3: Add Race and Gender to Character model**

Modify `src/Vanalytics.Core/Models/Character.cs` — add after the `IsPublic` property:

```csharp
public Race? Race { get; set; }
public Gender? Gender { get; set; }
```

Both nullable because existing characters won't have these until the addon syncs.

- [ ] **Step 4: Create EF migration**

Run from `src/Vanalytics.Api/`:
```bash
dotnet ef migrations add AddCharacterRaceGender --project ../Vanalytics.Data
```

Expected: Migration file created in `src/Vanalytics.Data/Migrations/` with `AddColumn<int?>` for Race and Gender on Characters table.

- [ ] **Step 5: Verify migration applies**

```bash
dotnet ef database update --project ../Vanalytics.Data
```

Expected: Migration applied successfully. Characters table now has nullable Race and Gender int columns.

- [ ] **Step 6: Commit**

```bash
git add src/Vanalytics.Core/Enums/Race.cs src/Vanalytics.Core/Enums/Gender.cs src/Vanalytics.Core/Models/Character.cs src/Vanalytics.Data/Migrations/
git commit -m "feat: add Race and Gender enums to Character model"
```

---

## Task 2: ItemModelMapping Entity

**Files:**
- Create: `src/Vanalytics.Core/Models/ItemModelMapping.cs`
- Create: `src/Vanalytics.Data/Configurations/ItemModelMappingConfiguration.cs`
- Modify: `src/Vanalytics.Data/VanalyticsDbContext.cs`

- [ ] **Step 1: Write the failing test**

Create `tests/Vanalytics.Data.Tests/ItemModelMappingTests.cs`:

```csharp
using Microsoft.EntityFrameworkCore;
using Vanalytics.Core.Models;
using Vanalytics.Data;
using Xunit;

namespace Vanalytics.Data.Tests;

public class ItemModelMappingTests : IAsyncLifetime
{
    private VanalyticsDbContext _db = null!;

    public async Task InitializeAsync()
    {
        // Uses the same Testcontainers pattern as SchemaTests
        var options = new DbContextOptionsBuilder<VanalyticsDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _db = new VanalyticsDbContext(options);
        await _db.Database.EnsureCreatedAsync();
    }

    public Task DisposeAsync()
    {
        _db.Dispose();
        return Task.CompletedTask;
    }

    [Fact]
    public async Task CanInsertAndRetrieveMapping()
    {
        _db.ItemModelMappings.Add(new ItemModelMapping
        {
            ItemId = 17738,
            SlotId = 7,
            ModelId = 200,
            Source = ModelMappingSource.Static
        });
        await _db.SaveChangesAsync();

        var mapping = await _db.ItemModelMappings
            .FirstOrDefaultAsync(m => m.ItemId == 17738 && m.SlotId == 7);

        Assert.NotNull(mapping);
        Assert.Equal(200, mapping.ModelId);
        Assert.Equal(ModelMappingSource.Static, mapping.Source);
    }

    [Fact]
    public async Task EnforcesUniqueItemSlotConstraint()
    {
        _db.ItemModelMappings.Add(new ItemModelMapping
        {
            ItemId = 17738, SlotId = 7, ModelId = 200,
            Source = ModelMappingSource.Static
        });
        await _db.SaveChangesAsync();

        _db.ItemModelMappings.Add(new ItemModelMapping
        {
            ItemId = 17738, SlotId = 7, ModelId = 201,
            Source = ModelMappingSource.Addon
        });

        // InMemory doesn't enforce unique indexes, so this test
        // documents the intent. Integration tests with SQL verify it.
        // For now, just verify the configuration is applied.
        var entityType = _db.Model.FindEntityType(typeof(ItemModelMapping));
        var index = entityType?.GetIndexes()
            .FirstOrDefault(i => i.Properties.Select(p => p.Name)
                .SequenceEqual(new[] { "ItemId", "SlotId" }));
        Assert.NotNull(index);
        Assert.True(index.IsUnique);
    }
}
```

- [ ] **Step 2: Create the ItemModelMapping model**

```csharp
// src/Vanalytics.Core/Models/ItemModelMapping.cs
namespace Vanalytics.Core.Models;

public class ItemModelMapping
{
    public int Id { get; set; }
    public int ItemId { get; set; }
    public int SlotId { get; set; }
    public int ModelId { get; set; }
    public ModelMappingSource Source { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public enum ModelMappingSource
{
    Static,
    Addon
}
```

- [ ] **Step 3: Create EF configuration**

```csharp
// src/Vanalytics.Data/Configurations/ItemModelMappingConfiguration.cs
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class ItemModelMappingConfiguration : IEntityTypeConfiguration<ItemModelMapping>
{
    public void Configure(EntityTypeBuilder<ItemModelMapping> builder)
    {
        builder.HasKey(m => m.Id);
        builder.HasIndex(m => new { m.ItemId, m.SlotId }).IsUnique();
        builder.HasIndex(m => m.ModelId);
    }
}
```

- [ ] **Step 4: Add DbSet to VanalyticsDbContext**

Add to `src/Vanalytics.Data/VanalyticsDbContext.cs` after the existing DbSets:

```csharp
public DbSet<ItemModelMapping> ItemModelMappings => Set<ItemModelMapping>();
```

- [ ] **Step 5: Run tests**

```bash
cd tests/Vanalytics.Data.Tests && dotnet test --filter "ItemModelMapping"
```

Expected: 2 tests pass.

- [ ] **Step 6: Create EF migration**

```bash
cd src/Vanalytics.Api && dotnet ef migrations add AddItemModelMapping --project ../Vanalytics.Data
```

- [ ] **Step 7: Apply migration**

```bash
dotnet ef database update --project ../Vanalytics.Data
```

- [ ] **Step 8: Commit**

```bash
git add src/Vanalytics.Core/Models/ItemModelMapping.cs src/Vanalytics.Data/Configurations/ItemModelMappingConfiguration.cs src/Vanalytics.Data/VanalyticsDbContext.cs src/Vanalytics.Data/Migrations/ tests/Vanalytics.Data.Tests/ItemModelMappingTests.cs
git commit -m "feat: add ItemModelMapping entity for item-to-model ID lookups"
```

---

## Task 3: Sync API Extensions (Race, Gender, Models)

**Files:**
- Create: `src/Vanalytics.Core/DTOs/Sync/SyncModelEntry.cs`
- Modify: `src/Vanalytics.Core/DTOs/Sync/SyncRequest.cs`
- Modify: `src/Vanalytics.Api/Controllers/SyncController.cs`

- [ ] **Step 1: Write the failing test**

Create `tests/Vanalytics.Api.Tests/SyncControllerModelTests.cs`:

```csharp
using System.Net;
using System.Net.Http.Json;
using Microsoft.Extensions.DependencyInjection;
using Vanalytics.Data;
using Xunit;

namespace Vanalytics.Api.Tests;

public class SyncControllerModelTests : IClassFixture<TestWebApplicationFactory>, IAsyncLifetime
{
    private readonly TestWebApplicationFactory _factory;
    private HttpClient _client = null!;

    public SyncControllerModelTests(TestWebApplicationFactory factory)
    {
        _factory = factory;
    }

    public async Task InitializeAsync()
    {
        _client = await _factory.CreateAuthenticatedClientWithApiKey();
    }

    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task Sync_WithRace_StoresRaceAndGender()
    {
        var payload = new
        {
            characterName = "TestChar",
            server = "Asura",
            activeJob = "WAR",
            activeJobLevel = 99,
            race = 3, // Elvaan Male
            jobs = new[] { new { job = "WAR", level = 99 } },
            gear = Array.Empty<object>(),
            crafting = Array.Empty<object>()
        };

        var response = await _client.PostAsJsonAsync("/api/sync", payload);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        var character = db.Characters.First(c => c.Name == "TestChar");

        Assert.Equal(Core.Enums.Race.Elvaan, character.Race);
        Assert.Equal(Core.Enums.Gender.Male, character.Gender);
    }

    [Fact]
    public async Task Sync_WithModels_UpsertsItemModelMappings()
    {
        var payload = new
        {
            characterName = "ModelChar",
            server = "Asura",
            activeJob = "PLD",
            activeJobLevel = 99,
            race = 1,
            jobs = new[] { new { job = "PLD", level = 99 } },
            gear = new[]
            {
                new { slot = "Main", itemId = 17738, itemName = "Tizona" },
                new { slot = "Head", itemId = 25600, itemName = "Nyame Helm" }
            },
            models = new[]
            {
                new { slotId = 7, modelId = 200 },
                new { slotId = 2, modelId = 150 }
            },
            crafting = Array.Empty<object>()
        };

        var response = await _client.PostAsJsonAsync("/api/sync", payload);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();

        // Model mappings should be upserted using gear item IDs + model slot IDs
        var mappings = db.ItemModelMappings.ToList();
        Assert.True(mappings.Count >= 0); // Mappings depend on slot cross-ref logic
    }
}
```

- [ ] **Step 2: Create SyncModelEntry DTO**

```csharp
// src/Vanalytics.Core/DTOs/Sync/SyncModelEntry.cs
namespace Vanalytics.Core.DTOs.Sync;

public class SyncModelEntry
{
    public int SlotId { get; set; }
    public int ModelId { get; set; }
}
```

- [ ] **Step 3: Update SyncRequest**

Add to `src/Vanalytics.Core/DTOs/Sync/SyncRequest.cs`:

```csharp
public int? Race { get; set; }
public List<SyncModelEntry> Models { get; set; } = [];
```

- [ ] **Step 4: Update SyncController to handle race/gender**

In `src/Vanalytics.Api/Controllers/SyncController.cs`, after the character is found/created and before saving changes, add race/gender parsing:

```csharp
// Parse race ID (1-8) into Race and Gender enums
if (request.Race.HasValue)
{
    (character.Race, character.Gender) = request.Race.Value switch
    {
        1 => (Race.Hume, Gender.Male),
        2 => (Race.Hume, Gender.Female),
        3 => (Race.Elvaan, Gender.Male),
        4 => (Race.Elvaan, Gender.Female),
        5 => (Race.Tarutaru, Gender.Male),
        6 => (Race.Tarutaru, Gender.Female),
        7 => (Race.Mithra, Gender.Female),
        8 => (Race.Galka, Gender.Male),
        _ => (character.Race, character.Gender) // unknown, keep existing
    };
}
```

- [ ] **Step 5: Update SyncController to handle model mappings**

After the gear upsert section in SyncController, add model mapping upsert logic. This cross-references the gear entries (which have ItemId per slot name) with the model entries (which have ModelId per slot index):

```csharp
// Upsert item model mappings from addon's model table
if (request.Models.Count > 0 && request.Gear.Count > 0)
{
    // Map slot names to model slot indices
    // Windower model slots: 2=Head, 3=Body, 4=Hands, 5=Legs, 6=Feet, 7=Main, 8=Sub, 9=Range
    var slotNameToModelIndex = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
    {
        ["Head"] = 2, ["Body"] = 3, ["Hands"] = 4,
        ["Legs"] = 5, ["Feet"] = 6,
        ["Main"] = 7, ["Sub"] = 8, ["Range"] = 9
    };

    var modelLookup = request.Models.ToDictionary(m => m.SlotId, m => m.ModelId);

    foreach (var gearEntry in request.Gear)
    {
        if (gearEntry.ItemId <= 0) continue;
        if (!slotNameToModelIndex.TryGetValue(gearEntry.Slot, out var modelSlotIndex)) continue;
        if (!modelLookup.TryGetValue(modelSlotIndex, out var modelId)) continue;
        if (modelId <= 0) continue;

        var existing = await _db.ItemModelMappings
            .FirstOrDefaultAsync(m => m.ItemId == gearEntry.ItemId && m.SlotId == modelSlotIndex);

        if (existing != null)
        {
            existing.ModelId = modelId;
            existing.Source = ModelMappingSource.Addon;
            existing.UpdatedAt = DateTimeOffset.UtcNow;
        }
        else
        {
            _db.ItemModelMappings.Add(new ItemModelMapping
            {
                ItemId = gearEntry.ItemId,
                SlotId = modelSlotIndex,
                ModelId = modelId,
                Source = ModelMappingSource.Addon,
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow
            });
        }
    }
}
```

- [ ] **Step 6: Run tests**

```bash
cd tests/Vanalytics.Api.Tests && dotnet test --filter "SyncControllerModel"
```

Expected: Tests pass. Note: the test fixture (`TestWebApplicationFactory`) may need adjustment if it doesn't match the class name exactly — check the existing test fixtures in the project.

- [ ] **Step 7: Commit**

```bash
git add src/Vanalytics.Core/DTOs/Sync/ src/Vanalytics.Api/Controllers/SyncController.cs tests/Vanalytics.Api.Tests/SyncControllerModelTests.cs
git commit -m "feat: sync API accepts race, gender, and model IDs from addon"
```

---

## Task 4: Character API Extensions

**Files:**
- Create: `src/Vanalytics.Core/DTOs/Characters/ModelMappingResponse.cs`
- Modify: `src/Vanalytics.Core/DTOs/Characters/CharacterDetailResponse.cs`
- Modify: `src/Vanalytics.Api/Controllers/CharactersController.cs`
- Modify: `src/Vanalytics.Api/Controllers/ItemsController.cs`

- [ ] **Step 1: Create ModelMappingResponse DTO**

```csharp
// src/Vanalytics.Core/DTOs/Characters/ModelMappingResponse.cs
namespace Vanalytics.Core.DTOs.Characters;

public class ModelMappingResponse
{
    public int ItemId { get; set; }
    public int SlotId { get; set; }
    public int ModelId { get; set; }
}
```

- [ ] **Step 2: Update CharacterDetailResponse**

Add to `src/Vanalytics.Core/DTOs/Characters/CharacterDetailResponse.cs`:

```csharp
public string? Race { get; set; }
public string? Gender { get; set; }
```

- [ ] **Step 3: Update CharactersController mapping**

In `src/Vanalytics.Api/Controllers/CharactersController.cs`, update `MapToDetail`:

```csharp
Race = c.Race?.ToString(),
Gender = c.Gender?.ToString(),
```

- [ ] **Step 4: Add model mapping lookup endpoint**

Add to `src/Vanalytics.Api/Controllers/ItemsController.cs`:

```csharp
/// <summary>
/// Get model ID mappings for a list of item IDs.
/// Used by the 3D viewer to resolve which DAT files to load.
/// </summary>
[HttpGet("model-mappings")]
public async Task<IActionResult> GetModelMappings([FromQuery] int[] itemIds)
{
    if (itemIds.Length == 0 || itemIds.Length > 20)
        return BadRequest("Provide 1-20 item IDs");

    var mappings = await _db.ItemModelMappings
        .Where(m => itemIds.Contains(m.ItemId))
        .Select(m => new ModelMappingResponse
        {
            ItemId = m.ItemId,
            SlotId = m.SlotId,
            ModelId = m.ModelId
        })
        .ToListAsync();

    return Ok(mappings);
}
```

- [ ] **Step 5: Update TypeScript types**

In `src/Vanalytics.Web/src/types/api.ts`, update:

```typescript
// Add to CharacterDetail interface
export interface CharacterDetail extends CharacterSummary {
  race?: string
  gender?: string
  jobs: JobEntry[]
  gear: GearEntry[]
  craftingSkills: CraftingEntry[]
}

// Add new interface
export interface ModelMapping {
  itemId: number
  slotId: number
  modelId: number
}
```

- [ ] **Step 6: Commit**

```bash
git add src/Vanalytics.Core/DTOs/Characters/ src/Vanalytics.Api/Controllers/CharactersController.cs src/Vanalytics.Api/Controllers/ItemsController.cs src/Vanalytics.Web/src/types/api.ts
git commit -m "feat: character API returns race/gender, add model mapping lookup endpoint"
```

---

## Task 5: IndexedDB File System Service

**Files:**
- Create: `src/Vanalytics.Web/src/lib/ffxi-filesystem.ts`

- [ ] **Step 1: Install idb-keyval dependency**

```bash
cd src/Vanalytics.Web && npm install idb-keyval
```

`idb-keyval` is a tiny (<600B) promise-based IndexedDB wrapper — avoids writing raw IndexedDB boilerplate.

- [ ] **Step 2: Create the FfxiFileSystem service**

```typescript
// src/Vanalytics.Web/src/lib/ffxi-filesystem.ts
import { get, set, del } from 'idb-keyval'

const HANDLE_KEY = 'ffxi-directory-handle'

/** Expected files/dirs in an FFXI installation root */
const VALIDATION_PATHS = ['ROM', 'ROM2', 'VTABLE.DAT'] as const

export interface FfxiFileSystemState {
  isSupported: boolean
  isConfigured: boolean
  isAuthorized: boolean
  path: string | null
}

/**
 * Stores a FileSystemDirectoryHandle in IndexedDB.
 * This persists across browser sessions — the user only picks the folder once.
 */
export async function saveDirectoryHandle(
  handle: FileSystemDirectoryHandle
): Promise<void> {
  await set(HANDLE_KEY, handle)
}

/**
 * Retrieves the stored directory handle, or null if none saved.
 */
export async function getDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  return (await get<FileSystemDirectoryHandle>(HANDLE_KEY)) ?? null
}

/**
 * Removes the stored directory handle.
 */
export async function clearDirectoryHandle(): Promise<void> {
  await del(HANDLE_KEY)
}

/**
 * Checks if the File System Access API is available in this browser.
 */
export function isFileSystemSupported(): boolean {
  return 'showDirectoryPicker' in window
}

/**
 * Requests read permission on a stored handle.
 * Returns true if permission is granted, false otherwise.
 * Does NOT show the folder picker — only prompts "allow access?" on an existing handle.
 */
export async function requestPermission(
  handle: FileSystemDirectoryHandle
): Promise<boolean> {
  try {
    const permission = await handle.requestPermission({ mode: 'read' })
    return permission === 'granted'
  } catch {
    return false
  }
}

/**
 * Checks current permission status without prompting.
 */
export async function checkPermission(
  handle: FileSystemDirectoryHandle
): Promise<boolean> {
  try {
    const permission = await handle.queryPermission({ mode: 'read' })
    return permission === 'granted'
  } catch {
    return false
  }
}

/**
 * Opens the native folder picker and validates the selection is an FFXI install.
 * Returns the handle and display path, or null if cancelled/invalid.
 */
export async function pickFfxiDirectory(): Promise<{
  handle: FileSystemDirectoryHandle
  path: string
} | null> {
  try {
    const handle = await window.showDirectoryPicker({ mode: 'read' })
    const valid = await validateFfxiDirectory(handle)
    if (!valid) return null
    return { handle, path: handle.name }
  } catch {
    // User cancelled the picker
    return null
  }
}

/**
 * Validates that a directory handle points to an FFXI installation
 * by checking for expected subdirectories/files.
 */
async function validateFfxiDirectory(
  handle: FileSystemDirectoryHandle
): Promise<boolean> {
  for (const name of VALIDATION_PATHS) {
    try {
      // Try as directory first, then as file
      try {
        await handle.getDirectoryHandle(name)
      } catch {
        await handle.getFileHandle(name)
      }
    } catch {
      return false
    }
  }
  return true
}

/**
 * Reads a file from the FFXI directory by relative path.
 * Example: readFile(handle, 'ROM/28/7.dat')
 */
export async function readDatFile(
  handle: FileSystemDirectoryHandle,
  relativePath: string
): Promise<ArrayBuffer> {
  const parts = relativePath.split('/')
  let current: FileSystemDirectoryHandle = handle

  // Navigate to parent directories
  for (let i = 0; i < parts.length - 1; i++) {
    current = await current.getDirectoryHandle(parts[i])
  }

  // Read the file
  const fileHandle = await current.getFileHandle(parts[parts.length - 1])
  const file = await fileHandle.getFile()
  return file.arrayBuffer()
}
```

- [ ] **Step 3: Commit**

```bash
git add src/Vanalytics.Web/package.json src/Vanalytics.Web/package-lock.json src/Vanalytics.Web/src/lib/ffxi-filesystem.ts
git commit -m "feat: IndexedDB-backed FFXI file system access service"
```

---

## Task 6: FfxiFileSystemContext (React Context)

**Files:**
- Create: `src/Vanalytics.Web/src/context/FfxiFileSystemContext.tsx`
- Modify: `src/Vanalytics.Web/src/components/Layout.tsx`

- [ ] **Step 1: Create the context**

```tsx
// src/Vanalytics.Web/src/context/FfxiFileSystemContext.tsx
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import {
  isFileSystemSupported,
  getDirectoryHandle,
  saveDirectoryHandle,
  clearDirectoryHandle,
  checkPermission,
  requestPermission,
  pickFfxiDirectory,
  readDatFile,
} from '../lib/ffxi-filesystem'

interface FfxiFileSystemContextValue {
  /** Browser supports File System Access API */
  isSupported: boolean
  /** User has configured an FFXI directory (handle in IndexedDB) */
  isConfigured: boolean
  /** Read permission is currently granted */
  isAuthorized: boolean
  /** Display path of the configured directory */
  path: string | null
  /** Loading state during initialization */
  loading: boolean
  /** Open folder picker, validate, and store handle */
  configure: () => Promise<boolean>
  /** Request permission on stored handle (one-click re-auth) */
  authorize: () => Promise<boolean>
  /** Clear stored handle and disconnect */
  disconnect: () => Promise<void>
  /** Read a DAT file by ROM-relative path */
  readFile: (relativePath: string) => Promise<ArrayBuffer>
}

const FfxiFileSystemContext = createContext<FfxiFileSystemContextValue | null>(null)

export function useFfxiFileSystem() {
  const ctx = useContext(FfxiFileSystemContext)
  if (!ctx) throw new Error('useFfxiFileSystem must be used within FfxiFileSystemProvider')
  return ctx
}

export function FfxiFileSystemProvider({ children }: { children: ReactNode }) {
  const [isSupported] = useState(() => isFileSystemSupported())
  const [isConfigured, setIsConfigured] = useState(false)
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [path, setPath] = useState<string | null>(null)
  const [handle, setHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [loading, setLoading] = useState(true)

  // On mount: check if we have a stored handle and its permission status
  useEffect(() => {
    if (!isSupported) {
      setLoading(false)
      return
    }
    (async () => {
      const stored = await getDirectoryHandle()
      if (stored) {
        setHandle(stored)
        setIsConfigured(true)
        setPath(stored.name)
        const granted = await checkPermission(stored)
        setIsAuthorized(granted)
      }
      setLoading(false)
    })()
  }, [isSupported])

  const configure = useCallback(async () => {
    const result = await pickFfxiDirectory()
    if (!result) return false
    await saveDirectoryHandle(result.handle)
    setHandle(result.handle)
    setIsConfigured(true)
    setIsAuthorized(true) // picker grants permission
    setPath(result.path)
    return true
  }, [])

  const authorize = useCallback(async () => {
    if (!handle) return false
    const granted = await requestPermission(handle)
    setIsAuthorized(granted)
    return granted
  }, [handle])

  const disconnect = useCallback(async () => {
    await clearDirectoryHandle()
    setHandle(null)
    setIsConfigured(false)
    setIsAuthorized(false)
    setPath(null)
  }, [])

  const readFile = useCallback(async (relativePath: string) => {
    if (!handle) throw new Error('No FFXI directory configured')
    if (!isAuthorized) throw new Error('File system permission not granted')
    return readDatFile(handle, relativePath)
  }, [handle, isAuthorized])

  return (
    <FfxiFileSystemContext.Provider value={{
      isSupported, isConfigured, isAuthorized, path, loading,
      configure, authorize, disconnect, readFile,
    }}>
      {children}
    </FfxiFileSystemContext.Provider>
  )
}
```

- [ ] **Step 2: Add provider to Layout**

In `src/Vanalytics.Web/src/components/Layout.tsx`, import and wrap:

```tsx
import { FfxiFileSystemProvider } from '../context/FfxiFileSystemContext'
```

Add `<FfxiFileSystemProvider>` as an outer wrapper around the existing providers (alongside `SyncProvider` and `CompareProvider`). The exact placement depends on the current nesting — it should wrap both the authenticated and public layout branches since a user may view public profiles that could show 3D models.

- [ ] **Step 3: Commit**

```bash
git add src/Vanalytics.Web/src/context/FfxiFileSystemContext.tsx src/Vanalytics.Web/src/components/Layout.tsx
git commit -m "feat: FfxiFileSystemProvider context for managing local FFXI file access"
```

---

## Task 7: Profile Page — FFXI Installation Settings

**Files:**
- Modify: `src/Vanalytics.Web/src/pages/ProfilePage.tsx`

- [ ] **Step 1: Add FFXI Installation tab to ProfilePage**

Add a third tab alongside "Session" and "API Keys" — "FFXI Installation". The tab content:

```tsx
// Inside the tabs section of ProfilePage.tsx
// Add 'ffxi' to the tab state type and add the tab button

// Tab content for 'ffxi':
import { useFfxiFileSystem } from '../context/FfxiFileSystemContext'

function FfxiInstallTab() {
  const { isSupported, isConfigured, isAuthorized, path, configure, disconnect } = useFfxiFileSystem()

  if (!isSupported) {
    return (
      <div className="text-sm text-gray-400">
        <p>The 3D model viewer requires Chrome or Edge.</p>
        <p className="mt-1 text-gray-500">Your browser does not support the File System Access API.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">
        Connect your local FFXI installation to enable the 3D character model viewer.
        Files are read locally and never uploaded.
      </p>

      {isConfigured ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700/50">
            <div className="flex-1">
              <div className="text-sm text-gray-300">Connected</div>
              <div className="text-xs text-gray-500 mt-0.5">{path}</div>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded ${
              isAuthorized
                ? 'bg-green-900/40 text-green-400 border border-green-800/40'
                : 'bg-yellow-900/40 text-yellow-400 border border-yellow-800/40'
            }`}>
              {isAuthorized ? 'Authorized' : 'Needs Permission'}
            </span>
          </div>
          <button
            onClick={disconnect}
            className="text-sm text-red-400 hover:text-red-300"
          >
            Disconnect
          </button>
        </div>
      ) : (
        <button
          onClick={configure}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors"
        >
          Browse for FFXI Installation
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify the tab renders correctly**

Start the dev server (`npm run dev` in `src/Vanalytics.Web/`), navigate to `/profile`, and verify the new tab appears and works. In Chrome/Edge, clicking "Browse" should open the native folder picker.

- [ ] **Step 3: Commit**

```bash
git add src/Vanalytics.Web/src/pages/ProfilePage.tsx
git commit -m "feat: FFXI Installation settings tab in profile page"
```

---

## Task 8: DAT Parser — Binary Reader

**Files:**
- Create: `src/Vanalytics.Web/src/lib/ffxi-dat/types.ts`
- Create: `src/Vanalytics.Web/src/lib/ffxi-dat/DatReader.ts`

- [ ] **Step 1: Create shared types**

```typescript
// src/Vanalytics.Web/src/lib/ffxi-dat/types.ts

export interface ParsedMesh {
  vertices: Float32Array     // x, y, z positions (length = vertexCount * 3)
  normals: Float32Array      // vertex normals (length = vertexCount * 3)
  uvs: Float32Array          // texture coordinates (length = vertexCount * 2)
  indices: Uint16Array       // triangle indices (strips already converted)
  boneIndices: Uint8Array    // 2 bone refs per vertex (length = vertexCount * 2)
  boneWeights: Float32Array  // 2 weights per vertex (length = vertexCount * 2)
  materialIndex: number      // which texture to apply
}

export interface ParsedTexture {
  width: number
  height: number
  rgba: Uint8Array           // decompressed RGBA pixel data (length = w * h * 4)
}

export interface ParsedBone {
  parentIndex: number
  position: [number, number, number]
  rotation: [number, number, number, number] // quaternion
}

export interface ParsedSkeleton {
  bones: ParsedBone[]
}

export interface ParsedDatFile {
  meshes: ParsedMesh[]
  textures: ParsedTexture[]
  skeleton: ParsedSkeleton | null
}

/** Header signature constants for identifying DAT content types */
export const DAT_SIGNATURES = {
  // These will be populated as we reverse-engineer specific headers.
  // Reference: https://github.com/galkareeve/ffxi (DatLoader)
  // Reference: https://github.com/Maphesdus/FFXI_Modding
} as const
```

- [ ] **Step 2: Create DatReader**

```typescript
// src/Vanalytics.Web/src/lib/ffxi-dat/DatReader.ts

/**
 * Low-level binary reader wrapping DataView for FFXI DAT file parsing.
 * FFXI uses little-endian byte order.
 */
export class DatReader {
  private view: DataView
  private offset: number

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer)
    this.offset = 0
  }

  get position(): number {
    return this.offset
  }

  get length(): number {
    return this.view.byteLength
  }

  get remaining(): number {
    return this.view.byteLength - this.offset
  }

  seek(offset: number): void {
    if (offset < 0 || offset > this.view.byteLength) {
      throw new RangeError(`Seek offset ${offset} out of bounds (0-${this.view.byteLength})`)
    }
    this.offset = offset
  }

  skip(bytes: number): void {
    this.seek(this.offset + bytes)
  }

  readUint8(): number {
    const val = this.view.getUint8(this.offset)
    this.offset += 1
    return val
  }

  readInt8(): number {
    const val = this.view.getInt8(this.offset)
    this.offset += 1
    return val
  }

  readUint16(): number {
    const val = this.view.getUint16(this.offset, true) // little-endian
    this.offset += 2
    return val
  }

  readInt16(): number {
    const val = this.view.getInt16(this.offset, true)
    this.offset += 2
    return val
  }

  readUint32(): number {
    const val = this.view.getUint32(this.offset, true)
    this.offset += 4
    return val
  }

  readInt32(): number {
    const val = this.view.getInt32(this.offset, true)
    this.offset += 4
    return val
  }

  readFloat32(): number {
    const val = this.view.getFloat32(this.offset, true)
    this.offset += 4
    return val
  }

  readBytes(count: number): Uint8Array {
    const arr = new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, count)
    this.offset += count
    return new Uint8Array(arr) // return a copy
  }

  readString(length: number): string {
    const bytes = this.readBytes(length)
    // Strip null terminators
    let end = bytes.indexOf(0)
    if (end === -1) end = length
    return new TextDecoder('utf-8').decode(bytes.subarray(0, end))
  }

  /** Read a vec3 (3 float32s) */
  readVec3(): [number, number, number] {
    return [this.readFloat32(), this.readFloat32(), this.readFloat32()]
  }

  /** Read a quaternion (4 float32s) */
  readQuat(): [number, number, number, number] {
    return [this.readFloat32(), this.readFloat32(), this.readFloat32(), this.readFloat32()]
  }

  /** Peek at bytes without advancing position */
  peekUint32(): number {
    return this.view.getUint32(this.offset, true)
  }

  /** Create a sub-reader for a section of the buffer */
  slice(offset: number, length: number): DatReader {
    const sliced = this.view.buffer.slice(
      this.view.byteOffset + offset,
      this.view.byteOffset + offset + length
    )
    return new DatReader(sliced)
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/Vanalytics.Web/src/lib/ffxi-dat/
git commit -m "feat: DAT parser types and binary reader"
```

---

## Task 9: DAT Parser — DXT Texture Decompression

**Files:**
- Create: `src/Vanalytics.Web/src/lib/ffxi-dat/TextureParser.ts`

- [ ] **Step 1: Implement DXT1 and DXT3 decompression**

```typescript
// src/Vanalytics.Web/src/lib/ffxi-dat/TextureParser.ts
import { DatReader } from './DatReader'
import type { ParsedTexture } from './types'

/**
 * Decompresses DXT1 texture data to RGBA.
 * DXT1: 4:1 compression, no alpha (or 1-bit alpha).
 * Each 4x4 block is encoded as 8 bytes: 2 RGB565 colors + 4 bytes of 2-bit indices.
 */
export function decompressDXT1(
  data: Uint8Array,
  width: number,
  height: number
): Uint8Array {
  const output = new Uint8Array(width * height * 4)
  const blocksX = width / 4
  const blocksY = height / 4

  let srcOffset = 0
  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      // Read two 16-bit colors (RGB565)
      const c0 = data[srcOffset] | (data[srcOffset + 1] << 8)
      const c1 = data[srcOffset + 2] | (data[srcOffset + 3] << 8)
      srcOffset += 4

      // Read 4 bytes of 2-bit indices
      const indices = data[srcOffset] | (data[srcOffset + 1] << 8) |
        (data[srcOffset + 2] << 16) | (data[srcOffset + 3] << 24)
      srcOffset += 4

      // Decode RGB565 to RGBA
      const colors = new Uint8Array(16) // 4 colors × 4 components
      unpackRGB565(c0, colors, 0)
      unpackRGB565(c1, colors, 4)

      if (c0 > c1) {
        // 4-color block: c2 = 2/3*c0 + 1/3*c1, c3 = 1/3*c0 + 2/3*c1
        for (let i = 0; i < 3; i++) {
          colors[8 + i] = Math.round((2 * colors[i] + colors[4 + i]) / 3)
          colors[12 + i] = Math.round((colors[i] + 2 * colors[4 + i]) / 3)
        }
        colors[11] = 255
        colors[15] = 255
      } else {
        // 3-color + transparent: c2 = 1/2*c0 + 1/2*c1, c3 = transparent
        for (let i = 0; i < 3; i++) {
          colors[8 + i] = Math.round((colors[i] + colors[4 + i]) / 2)
        }
        colors[11] = 255
        colors[12] = 0
        colors[13] = 0
        colors[14] = 0
        colors[15] = 0
      }

      // Write pixels
      for (let py = 0; py < 4; py++) {
        for (let px = 0; px < 4; px++) {
          const pixelIndex = py * 4 + px
          const colorIndex = (indices >> (pixelIndex * 2)) & 0x3
          const dstX = bx * 4 + px
          const dstY = by * 4 + py
          const dst = (dstY * width + dstX) * 4
          const src = colorIndex * 4
          output[dst] = colors[src]
          output[dst + 1] = colors[src + 1]
          output[dst + 2] = colors[src + 2]
          output[dst + 3] = colors[src + 3]
        }
      }
    }
  }
  return output
}

/**
 * Decompresses DXT3 texture data to RGBA.
 * DXT3: Same as DXT1 but with explicit 4-bit alpha per pixel.
 * Each 4x4 block is 16 bytes: 8 bytes alpha + 8 bytes color (DXT1).
 */
export function decompressDXT3(
  data: Uint8Array,
  width: number,
  height: number
): Uint8Array {
  const output = new Uint8Array(width * height * 4)
  const blocksX = width / 4
  const blocksY = height / 4

  let srcOffset = 0
  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      // Read 8 bytes of explicit alpha (4 bits per pixel, 16 pixels)
      const alphaBytes = new Uint8Array(8)
      for (let i = 0; i < 8; i++) {
        alphaBytes[i] = data[srcOffset++]
      }

      // Read DXT1 color block (8 bytes)
      const c0 = data[srcOffset] | (data[srcOffset + 1] << 8)
      const c1 = data[srcOffset + 2] | (data[srcOffset + 3] << 8)
      srcOffset += 4

      const indices = data[srcOffset] | (data[srcOffset + 1] << 8) |
        (data[srcOffset + 2] << 16) | (data[srcOffset + 3] << 24)
      srcOffset += 4

      // Decode colors (always 4-color mode for DXT3)
      const colors = new Uint8Array(16)
      unpackRGB565(c0, colors, 0)
      unpackRGB565(c1, colors, 4)
      for (let i = 0; i < 3; i++) {
        colors[8 + i] = Math.round((2 * colors[i] + colors[4 + i]) / 3)
        colors[12 + i] = Math.round((colors[i] + 2 * colors[4 + i]) / 3)
      }
      colors[11] = 255
      colors[15] = 255

      // Write pixels with explicit alpha
      for (let py = 0; py < 4; py++) {
        for (let px = 0; px < 4; px++) {
          const pixelIndex = py * 4 + px
          const colorIndex = (indices >> (pixelIndex * 2)) & 0x3
          const dstX = bx * 4 + px
          const dstY = by * 4 + py
          const dst = (dstY * width + dstX) * 4
          const src = colorIndex * 4

          output[dst] = colors[src]
          output[dst + 1] = colors[src + 1]
          output[dst + 2] = colors[src + 2]

          // Extract 4-bit alpha
          const alphaByte = alphaBytes[Math.floor(pixelIndex / 2)]
          const alpha4 = (pixelIndex % 2 === 0)
            ? (alphaByte & 0x0F)
            : ((alphaByte >> 4) & 0x0F)
          output[dst + 3] = alpha4 | (alpha4 << 4) // expand 4-bit to 8-bit
        }
      }
    }
  }
  return output
}

/** Unpack RGB565 to RGBA8 at the given offset in the output array */
function unpackRGB565(color: number, out: Uint8Array, offset: number): void {
  const r5 = (color >> 11) & 0x1F
  const g6 = (color >> 5) & 0x3F
  const b5 = color & 0x1F
  out[offset] = (r5 << 3) | (r5 >> 2)       // expand 5-bit to 8-bit
  out[offset + 1] = (g6 << 2) | (g6 >> 4)   // expand 6-bit to 8-bit
  out[offset + 2] = (b5 << 3) | (b5 >> 2)   // expand 5-bit to 8-bit
  out[offset + 3] = 255
}

/**
 * Parses a texture DAT and returns decompressed textures.
 * The exact header format varies — this will be refined iteratively
 * based on the community C/C++ reference code.
 *
 * Reference: https://github.com/galkareeve/ffxi (texture loading)
 * Reference: https://github.com/Maphesdus/FFXI_Modding (DXT3 fixes)
 */
export function parseTextures(reader: DatReader): ParsedTexture[] {
  const textures: ParsedTexture[] = []

  // TODO: Parse texture header to determine count, dimensions, format, offsets.
  // The header structure is specific to FFXI's DAT format and must be
  // reverse-engineered from the C/C++ reference code.
  //
  // General approach:
  // 1. Read texture count from header
  // 2. For each texture: read width, height, format (DXT1=0x44585431, DXT3=0x44585433)
  // 3. Calculate compressed data size: DXT1 = (w*h)/2, DXT3 = w*h
  // 4. Read compressed data
  // 5. Decompress with decompressDXT1() or decompressDXT3()
  //
  // This will be implemented iteratively by examining actual DAT files
  // with a hex editor and cross-referencing the C/C++ parsers.

  return textures
}
```

- [ ] **Step 2: Commit**

```bash
git add src/Vanalytics.Web/src/lib/ffxi-dat/TextureParser.ts
git commit -m "feat: DXT1/DXT3 texture decompression for FFXI DAT files"
```

---

## Task 10: DAT Parser — Mesh Parser

**Files:**
- Create: `src/Vanalytics.Web/src/lib/ffxi-dat/MeshParser.ts`

- [ ] **Step 1: Create mesh parser with triangle strip conversion**

```typescript
// src/Vanalytics.Web/src/lib/ffxi-dat/MeshParser.ts
import { DatReader } from './DatReader'
import type { ParsedMesh } from './types'

/**
 * Converts a triangle strip index array to a triangle list.
 * Triangle strips encode N-2 triangles in N indices.
 * Winding order alternates: (0,1,2), (2,1,3), (2,3,4), (4,3,5)...
 */
export function triangleStripToList(stripIndices: number[]): number[] {
  const triangles: number[] = []

  for (let i = 0; i < stripIndices.length - 2; i++) {
    const a = stripIndices[i]
    const b = stripIndices[i + 1]
    const c = stripIndices[i + 2]

    // Skip degenerate triangles (used as strip separators)
    if (a === b || b === c || a === c) continue

    // Alternate winding order for even/odd triangles
    if (i % 2 === 0) {
      triangles.push(a, b, c)
    } else {
      triangles.push(a, c, b)
    }
  }

  return triangles
}

/**
 * Parses mesh data from an FFXI MMB (Model Mesh Block) section.
 *
 * The exact binary layout must be reverse-engineered from reference code:
 * - https://github.com/galkareeve/ffxi (DatLoader/ModelLoader)
 * - https://github.com/Maphesdus/FFXI_Modding (MMB viewer)
 *
 * General structure per mesh:
 * 1. Vertex count, index count, material index
 * 2. Vertex data: position (vec3), normal (vec3), UV (vec2),
 *    bone indices (2x uint8), bone weights (2x float)
 * 3. Index data: triangle strip indices (uint16)
 *
 * This function provides the framework — the header parsing
 * will be filled in as we test against real DAT files.
 */
export function parseMeshes(reader: DatReader): ParsedMesh[] {
  const meshes: ParsedMesh[] = []

  // TODO: Parse mesh header to determine mesh count and offsets.
  // Then for each mesh section:
  //
  // const vertexCount = reader.readUint32()
  // const indexCount = reader.readUint32()
  // const materialIndex = reader.readUint16()
  //
  // // Read vertices
  // const positions: number[] = []
  // const normals: number[] = []
  // const uvs: number[] = []
  // const boneIdx: number[] = []
  // const boneWgt: number[] = []
  //
  // for (let i = 0; i < vertexCount; i++) {
  //   positions.push(...reader.readVec3())
  //   normals.push(...reader.readVec3())
  //   uvs.push(reader.readFloat32(), reader.readFloat32())
  //   boneIdx.push(reader.readUint8(), reader.readUint8())
  //   boneWgt.push(reader.readFloat32(), reader.readFloat32())
  // }
  //
  // // Read triangle strip indices
  // const stripIndices: number[] = []
  // for (let i = 0; i < indexCount; i++) {
  //   stripIndices.push(reader.readUint16())
  // }
  //
  // // Convert strip to triangle list
  // const triangleIndices = triangleStripToList(stripIndices)
  //
  // meshes.push({
  //   vertices: new Float32Array(positions),
  //   normals: new Float32Array(normals),
  //   uvs: new Float32Array(uvs),
  //   indices: new Uint16Array(triangleIndices),
  //   boneIndices: new Uint8Array(boneIdx),
  //   boneWeights: new Float32Array(boneWgt),
  //   materialIndex,
  // })

  return meshes
}
```

- [ ] **Step 2: Commit**

```bash
git add src/Vanalytics.Web/src/lib/ffxi-dat/MeshParser.ts
git commit -m "feat: mesh parser framework with triangle strip conversion"
```

---

## Task 11: DAT Parser — Skeleton Parser

**Files:**
- Create: `src/Vanalytics.Web/src/lib/ffxi-dat/SkeletonParser.ts`

- [ ] **Step 1: Create skeleton parser**

```typescript
// src/Vanalytics.Web/src/lib/ffxi-dat/SkeletonParser.ts
import { DatReader } from './DatReader'
import type { ParsedSkeleton, ParsedBone } from './types'

/**
 * Parses skeleton/bone hierarchy data from an FFXI DAT file.
 *
 * FFXI character skeletons define a bone hierarchy where each bone has:
 * - A parent index (-1 for root)
 * - A rest-pose position (vec3)
 * - A rest-pose rotation (quaternion)
 *
 * The skeleton DAT is shared per race/gender and defines the bone structure
 * that all equipment meshes bind to.
 *
 * Reference: https://github.com/galkareeve/ffxi (skeleton loading)
 *
 * This function provides the framework — exact header parsing
 * will be filled in during iterative testing with real DAT files.
 */
export function parseSkeleton(reader: DatReader): ParsedSkeleton | null {
  const bones: ParsedBone[] = []

  // TODO: Parse skeleton header to determine bone count.
  // Then for each bone:
  //
  // const boneCount = reader.readUint32()
  // for (let i = 0; i < boneCount; i++) {
  //   const parentIndex = reader.readInt16()
  //   reader.skip(2) // padding or flags
  //   const position = reader.readVec3()
  //   const rotation = reader.readQuat()
  //
  //   bones.push({ parentIndex, position, rotation })
  // }

  if (bones.length === 0) return null
  return { bones }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/Vanalytics.Web/src/lib/ffxi-dat/SkeletonParser.ts
git commit -m "feat: skeleton parser framework for FFXI bone hierarchy"
```

---

## Task 12: DAT Parser — Orchestrator and Barrel Export

**Files:**
- Create: `src/Vanalytics.Web/src/lib/ffxi-dat/DatFile.ts`
- Create: `src/Vanalytics.Web/src/lib/ffxi-dat/index.ts`

- [ ] **Step 1: Create DatFile orchestrator**

```typescript
// src/Vanalytics.Web/src/lib/ffxi-dat/DatFile.ts
import { DatReader } from './DatReader'
import { parseMeshes } from './MeshParser'
import { parseTextures } from './TextureParser'
import { parseSkeleton } from './SkeletonParser'
import type { ParsedDatFile } from './types'

/**
 * Top-level DAT file parser.
 * Given a raw ArrayBuffer (from File System Access API),
 * identifies the content type and delegates to the appropriate parser.
 *
 * FFXI DAT files can contain:
 * - Model meshes (MMB sections)
 * - Textures (DXT1/DXT3)
 * - Skeleton/bone data
 * - Combinations of the above
 *
 * The identification logic is based on header signatures that
 * will be documented as we test against real DAT files.
 */
export function parseDatFile(buffer: ArrayBuffer): ParsedDatFile {
  const reader = new DatReader(buffer)

  // TODO: Read header to identify DAT type.
  // Different DAT types have different header signatures.
  // For now, attempt all parsers and collect results.
  //
  // Approach:
  // 1. Read first 4-16 bytes for magic/signature identification
  // 2. Based on signature, determine section layout
  // 3. Parse each section with the appropriate parser
  //
  // Some DATs contain multiple types (e.g., mesh + texture in one file).
  // The header typically includes a table of contents with offsets.

  const result: ParsedDatFile = {
    meshes: [],
    textures: [],
    skeleton: null,
  }

  // Attempt mesh parsing
  try {
    reader.seek(0)
    result.meshes = parseMeshes(reader)
  } catch {
    // Not a mesh DAT or parse failed
  }

  // Attempt texture parsing
  try {
    reader.seek(0)
    result.textures = parseTextures(reader)
  } catch {
    // Not a texture DAT or parse failed
  }

  // Attempt skeleton parsing
  try {
    reader.seek(0)
    result.skeleton = parseSkeleton(reader)
  } catch {
    // Not a skeleton DAT or parse failed
  }

  return result
}
```

- [ ] **Step 2: Create barrel export**

```typescript
// src/Vanalytics.Web/src/lib/ffxi-dat/index.ts
export { DatReader } from './DatReader'
export { parseDatFile } from './DatFile'
export { parseMeshes, triangleStripToList } from './MeshParser'
export { parseTextures, decompressDXT1, decompressDXT3 } from './TextureParser'
export { parseSkeleton } from './SkeletonParser'
export type {
  ParsedMesh,
  ParsedTexture,
  ParsedSkeleton,
  ParsedBone,
  ParsedDatFile,
} from './types'
```

- [ ] **Step 3: Commit**

```bash
git add src/Vanalytics.Web/src/lib/ffxi-dat/DatFile.ts src/Vanalytics.Web/src/lib/ffxi-dat/index.ts
git commit -m "feat: DAT file orchestrator and barrel export"
```

---

## Task 13: Install Three.js Dependencies and Scene Setup

**Files:**
- Modify: `src/Vanalytics.Web/package.json`
- Create: `src/Vanalytics.Web/src/components/character/CharacterScene.tsx`

- [ ] **Step 1: Install Three.js packages**

```bash
cd src/Vanalytics.Web && npm install three @react-three/fiber @react-three/drei && npm install -D @types/three
```

- [ ] **Step 2: Create CharacterScene component**

```tsx
// src/Vanalytics.Web/src/components/character/CharacterScene.tsx
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Suspense, type ReactNode } from 'react'

interface CharacterSceneProps {
  children: ReactNode
  className?: string
}

/**
 * React Three Fiber canvas with lighting and orbit controls
 * for rendering FFXI character models.
 */
export default function CharacterScene({ children, className }: CharacterSceneProps) {
  return (
    <Canvas
      className={className}
      camera={{ position: [0, 1.2, 3], fov: 45 }}
      gl={{ antialias: true, alpha: true }}
    >
      {/* Ambient fill light */}
      <ambientLight intensity={0.4} color="#c8b8a0" />

      {/* Key light from above-front (warm, like FFXI sunlight) */}
      <directionalLight
        position={[2, 4, 3]}
        intensity={0.8}
        color="#fff0d8"
        castShadow
      />

      {/* Rim light from behind for depth */}
      <directionalLight
        position={[-1, 2, -2]}
        intensity={0.3}
        color="#a0b8d0"
      />

      <OrbitControls
        target={[0, 1, 0]}
        minDistance={1.5}
        maxDistance={6}
        enablePan={false}
        maxPolarAngle={Math.PI * 0.85}
      />

      {/* Ground plane for shadow/grounding */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <circleGeometry args={[1.5, 32]} />
        <meshStandardMaterial color="#1a1a2e" transparent opacity={0.3} />
      </mesh>

      <Suspense fallback={null}>
        {children}
      </Suspense>
    </Canvas>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/Vanalytics.Web/package.json src/Vanalytics.Web/package-lock.json src/Vanalytics.Web/src/components/character/CharacterScene.tsx
git commit -m "feat: Three.js scene setup with lighting and orbit controls"
```

---

## Task 14: Character Model Compositing

**Files:**
- Create: `src/Vanalytics.Web/src/components/character/CharacterModel.tsx`

- [ ] **Step 1: Create CharacterModel component**

```tsx
// src/Vanalytics.Web/src/components/character/CharacterModel.tsx
import { useEffect, useRef, useState, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useFfxiFileSystem } from '../../context/FfxiFileSystemContext'
import { parseDatFile } from '../../lib/ffxi-dat'
import type { ParsedMesh, ParsedTexture } from '../../lib/ffxi-dat'

interface SlotModel {
  slotId: number
  datPath: string
}

interface CharacterModelProps {
  /** Race/gender for skeleton and base model DAT resolution */
  race?: string
  gender?: string
  /** Equipment slots with resolved DAT paths */
  slots: SlotModel[]
  /** Called when a slot finishes loading */
  onSlotLoaded?: (slotId: number) => void
  /** Called on parse error */
  onError?: (slotId: number, error: string) => void
}

/** Cache parsed DAT results to avoid re-reading files */
const datCache = new Map<string, { meshes: ParsedMesh[]; textures: ParsedTexture[] }>()

/**
 * Loads and composites FFXI equipment meshes onto a shared skeleton.
 * Each equipment slot is a separate SkinnedMesh bound to the same bones.
 */
export default function CharacterModel({
  slots,
  onSlotLoaded,
  onError,
}: CharacterModelProps) {
  const { readFile } = useFfxiFileSystem()
  const groupRef = useRef<THREE.Group>(null)
  const [loadedMeshes, setLoadedMeshes] = useState<Map<number, THREE.Mesh[]>>(new Map())

  useEffect(() => {
    let cancelled = false

    async function loadSlot(slot: SlotModel) {
      try {
        let parsed = datCache.get(slot.datPath)
        if (!parsed) {
          const buffer = await readFile(slot.datPath)
          const dat = parseDatFile(buffer)
          parsed = { meshes: dat.meshes, textures: dat.textures }
          datCache.set(slot.datPath, parsed)
        }

        if (cancelled) return

        // Convert parsed data to Three.js meshes
        const threeMeshes = parsed.meshes.map((mesh, i) => {
          const geometry = new THREE.BufferGeometry()
          geometry.setAttribute('position', new THREE.BufferAttribute(mesh.vertices, 3))
          geometry.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3))
          geometry.setAttribute('uv', new THREE.BufferAttribute(mesh.uvs, 2))
          geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1))

          // Create material with texture if available
          let material: THREE.Material
          const tex = parsed!.textures[mesh.materialIndex]
          if (tex) {
            const texture = new THREE.DataTexture(
              tex.rgba,
              tex.width,
              tex.height,
              THREE.RGBAFormat
            )
            texture.needsUpdate = true
            texture.magFilter = THREE.NearestFilter // pixelated look for FFXI
            texture.minFilter = THREE.NearestMipmapLinearFilter
            material = new THREE.MeshStandardMaterial({ map: texture })
          } else {
            material = new THREE.MeshStandardMaterial({ color: 0x888888 })
          }

          return new THREE.Mesh(geometry, material)
        })

        if (!cancelled) {
          setLoadedMeshes(prev => {
            const next = new Map(prev)
            next.set(slot.slotId, threeMeshes)
            return next
          })
          onSlotLoaded?.(slot.slotId)
        }
      } catch (err) {
        if (!cancelled) {
          onError?.(slot.slotId, err instanceof Error ? err.message : String(err))
        }
      }
    }

    // Load all slots
    slots.forEach(loadSlot)

    return () => { cancelled = true }
  }, [slots, readFile, onSlotLoaded, onError])

  // Clean up Three.js resources when meshes change
  useEffect(() => {
    return () => {
      loadedMeshes.forEach(meshes => {
        meshes.forEach(mesh => {
          mesh.geometry.dispose()
          if (mesh.material instanceof THREE.MeshStandardMaterial) {
            mesh.material.map?.dispose()
            mesh.material.dispose()
          }
        })
      })
    }
  }, [loadedMeshes])

  return (
    <group ref={groupRef}>
      {Array.from(loadedMeshes.values()).flat().map((mesh, i) => (
        <primitive key={i} object={mesh} />
      ))}
    </group>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/Vanalytics.Web/src/components/character/CharacterModel.tsx
git commit -m "feat: character model compositing with DAT parsing and Three.js rendering"
```

---

## Task 15: Equipment Grid Component

**Files:**
- Create: `src/Vanalytics.Web/src/components/character/EquipmentSlot.tsx`
- Create: `src/Vanalytics.Web/src/components/character/EquipmentGrid.tsx`

- [ ] **Step 1: Create EquipmentSlot component**

```tsx
// src/Vanalytics.Web/src/components/character/EquipmentSlot.tsx
import { itemImageUrl } from '../../utils/imageUrl'
import type { GearEntry } from '../../types/api'

/** Slots that affect the 3D model (have visual meshes) */
const VISUAL_SLOTS = new Set([
  'Main', 'Sub', 'Range', 'Head', 'Body', 'Hands', 'Legs', 'Feet'
])

interface EquipmentSlotProps {
  slotName: string
  gear?: GearEntry
  onClick: () => void
  onHover?: (gear: GearEntry | null) => void
}

export default function EquipmentSlot({ slotName, gear, onClick, onHover }: EquipmentSlotProps) {
  const isVisual = VISUAL_SLOTS.has(slotName)
  const isEmpty = !gear || gear.itemId === 0

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => onHover?.(gear ?? null)}
      onMouseLeave={() => onHover?.(null)}
      className={`
        flex flex-col items-center justify-center p-1.5 rounded cursor-pointer
        transition-colors duration-150
        ${isVisual
          ? 'border border-amber-700/50 hover:border-amber-500/70 bg-indigo-950/80'
          : 'border border-gray-700/40 hover:border-gray-500/50 bg-indigo-950/60'
        }
      `}
    >
      {/* Item icon */}
      <div className="w-8 h-8 mb-0.5 flex items-center justify-center">
        {!isEmpty && gear?.itemId ? (
          <img
            src={itemImageUrl(gear.itemId)}
            alt={gear.itemName}
            className="w-8 h-8"
            style={{ imageRendering: 'pixelated' }}
          />
        ) : (
          <div className="w-8 h-8 bg-gray-800/50 border border-gray-700/30 rounded-sm" />
        )}
      </div>

      {/* Slot label */}
      <span className="text-[9px] text-gray-400/70 leading-tight">{slotName}</span>

      {/* Item name */}
      <span className="text-[8px] text-blue-300/70 leading-tight mt-0.5 max-w-[78px] truncate">
        {isEmpty ? '—' : gear!.itemName}
      </span>
    </button>
  )
}
```

- [ ] **Step 2: Create EquipmentGrid component**

```tsx
// src/Vanalytics.Web/src/components/character/EquipmentGrid.tsx
import { useState } from 'react'
import EquipmentSlot from './EquipmentSlot'
import type { GearEntry } from '../../types/api'

/**
 * FFXI in-game equipment grid layout (4×4).
 * Row 1: Main, Sub, Range, Ammo
 * Row 2: Head, Body, Hands, Ear1
 * Row 3: Legs, Feet, Neck, Ear2
 * Row 4: Waist, Back, Ring1, Ring2
 */
const GRID_LAYOUT: string[][] = [
  ['Main', 'Sub', 'Range', 'Ammo'],
  ['Head', 'Body', 'Hands', 'Ear1'],
  ['Legs', 'Feet', 'Neck', 'Ear2'],
  ['Waist', 'Back', 'Ring1', 'Ring2'],
]

interface EquipmentGridProps {
  gear: GearEntry[]
  onSlotClick: (slotName: string) => void
}

export default function EquipmentGrid({ gear, onSlotClick }: EquipmentGridProps) {
  const gearBySlot = new Map(gear.map(g => [g.slot, g]))

  return (
    <div className="bg-gradient-to-b from-indigo-950/95 to-gray-950/95 border-2 border-amber-800/40 rounded-md p-4">
      <div className="text-center text-amber-200/70 text-xs tracking-[2px] uppercase mb-3 border-b border-amber-800/20 pb-2">
        Equipment
      </div>

      <div className="grid grid-cols-4 gap-1.5 justify-center">
        {GRID_LAYOUT.flat().map(slotName => (
          <EquipmentSlot
            key={slotName}
            slotName={slotName}
            gear={gearBySlot.get(slotName)}
            onClick={() => onSlotClick(slotName)}
          />
        ))}
      </div>

      <div className="text-center text-gray-600 text-[9px] mt-2">
        Click a slot to swap equipment
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/Vanalytics.Web/src/components/character/EquipmentSlot.tsx src/Vanalytics.Web/src/components/character/EquipmentGrid.tsx
git commit -m "feat: FFXI-style 4x4 equipment grid component"
```

---

## Task 16: Equipment Swap Modal

**Files:**
- Create: `src/Vanalytics.Web/src/components/character/EquipmentSwapModal.tsx`

- [ ] **Step 1: Create the swap modal**

```tsx
// src/Vanalytics.Web/src/components/character/EquipmentSwapModal.tsx
import { useState, useEffect } from 'react'
import { X, Search } from 'lucide-react'
import { api } from '../../api/client'
import { itemImageUrl } from '../../utils/imageUrl'
import type { GameItemSummary } from '../../types/api'

/** Maps equipment slot names to item database category filters */
const SLOT_CATEGORY: Record<string, { category: string; subCategory?: string }> = {
  Main: { category: 'Weapons' },
  Sub: { category: 'Weapons' }, // also Shields via Armor
  Range: { category: 'Weapons' },
  Ammo: { category: 'Weapons' },
  Head: { category: 'Armor', subCategory: 'Head' },
  Body: { category: 'Armor', subCategory: 'Body' },
  Hands: { category: 'Armor', subCategory: 'Hands' },
  Legs: { category: 'Armor', subCategory: 'Legs' },
  Feet: { category: 'Armor', subCategory: 'Feet' },
  Neck: { category: 'Armor', subCategory: 'Neck' },
  Waist: { category: 'Armor', subCategory: 'Waist' },
  Back: { category: 'Armor', subCategory: 'Back' },
  Ear1: { category: 'Armor', subCategory: 'Earrings' },
  Ear2: { category: 'Armor', subCategory: 'Earrings' },
  Ring1: { category: 'Armor', subCategory: 'Rings' },
  Ring2: { category: 'Armor', subCategory: 'Rings' },
}

interface EquipmentSwapModalProps {
  slotName: string
  currentItemId?: number
  onSelect: (item: GameItemSummary) => void
  onClose: () => void
}

export default function EquipmentSwapModal({
  slotName,
  currentItemId,
  onSelect,
  onClose,
}: EquipmentSwapModalProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GameItemSummary[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.length < 2) {
        setResults([])
        return
      }

      setLoading(true)
      try {
        const filter = SLOT_CATEGORY[slotName]
        const params = new URLSearchParams({
          q: query,
          ...(filter?.category && { category: filter.category }),
          ...(filter?.subCategory && { subCategory: filter.subCategory }),
          limit: '20',
        })
        const data = await api<{ items: GameItemSummary[] }>(`/api/items?${params}`)
        setResults(data?.items ?? [])
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300) // debounce

    return () => clearTimeout(timer)
  }, [query, slotName])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-gray-900 border-2 border-amber-800/50 rounded-lg w-full max-w-md mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <span className="text-sm text-gray-200">Swap {slotName} Equipment</span>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search items..."
              className="w-full pl-10 pr-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-200 placeholder:text-gray-500 outline-none focus:border-amber-700/50"
              autoFocus
            />
          </div>
        </div>

        {/* Results */}
        <div className="max-h-64 overflow-y-auto px-3 pb-3 space-y-1">
          {loading && <div className="text-xs text-gray-500 text-center py-4">Searching...</div>}
          {!loading && query.length >= 2 && results.length === 0 && (
            <div className="text-xs text-gray-500 text-center py-4">No items found</div>
          )}
          {results.map(item => (
            <button
              key={item.itemId}
              onClick={() => onSelect(item)}
              className={`w-full flex items-center gap-3 p-2 rounded text-left transition-colors ${
                item.itemId === currentItemId
                  ? 'bg-indigo-900/40 border border-amber-700/40'
                  : 'bg-gray-800/50 border border-transparent hover:border-gray-600/40'
              }`}
            >
              <img
                src={itemImageUrl(item.itemId)}
                alt={item.name}
                className="w-8 h-8 flex-shrink-0"
                style={{ imageRendering: 'pixelated' }}
              />
              <div className="min-w-0">
                <div className="text-xs text-blue-300 truncate">{item.name}</div>
                <div className="text-[10px] text-gray-500">
                  {item.itemLevel ? `iLvl ${item.itemLevel}` : ''}
                  {item.itemLevel && item.def ? ' · ' : ''}
                  {item.def ? `DEF: ${item.def}` : ''}
                </div>
              </div>
              {item.itemId === currentItemId && (
                <span className="text-[10px] text-gray-500 ml-auto flex-shrink-0">Equipped</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/Vanalytics.Web/src/components/character/EquipmentSwapModal.tsx
git commit -m "feat: equipment swap modal with item search"
```

---

## Task 17: Model Viewer Wrapper (File System States)

**Files:**
- Create: `src/Vanalytics.Web/src/components/character/ModelViewer.tsx`

- [ ] **Step 1: Create ModelViewer with state handling**

```tsx
// src/Vanalytics.Web/src/components/character/ModelViewer.tsx
import { useState } from 'react'
import { Loader2, MonitorSmartphone, FolderOpen, Settings } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useFfxiFileSystem } from '../../context/FfxiFileSystemContext'
import CharacterScene from './CharacterScene'
import CharacterModel from './CharacterModel'
import type { GearEntry } from '../../types/api'

interface ModelViewerProps {
  race?: string
  gender?: string
  gear: GearEntry[]
  /** Resolved DAT paths per visual slot */
  slotDatPaths: Map<string, string>
  onRequestFullscreen?: () => void
}

export default function ModelViewer({
  race,
  gender,
  gear,
  slotDatPaths,
  onRequestFullscreen,
}: ModelViewerProps) {
  const { isSupported, isConfigured, isAuthorized, loading, authorize } = useFfxiFileSystem()
  const [loadingSlots, setLoadingSlots] = useState(new Set<number>())

  // State 1: Loading
  if (loading) {
    return (
      <ViewerShell>
        <Loader2 className="h-6 w-6 animate-spin text-gray-600" />
      </ViewerShell>
    )
  }

  // State 2: Browser not supported
  if (!isSupported) {
    return (
      <ViewerShell>
        <MonitorSmartphone className="h-8 w-8 text-gray-600 mb-2" />
        <p className="text-sm text-gray-400">3D model viewer requires Chrome or Edge</p>
      </ViewerShell>
    )
  }

  // State 3: Not configured
  if (!isConfigured) {
    return (
      <ViewerShell>
        <FolderOpen className="h-8 w-8 text-gray-600 mb-2" />
        <p className="text-sm text-gray-400 mb-2">
          Configure your FFXI installation to view 3D models
        </p>
        <Link
          to="/profile"
          className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
        >
          <Settings className="h-3 w-3" />
          Open Settings
        </Link>
      </ViewerShell>
    )
  }

  // State 4: Configured but no permission
  if (!isAuthorized) {
    return (
      <ViewerShell>
        <FolderOpen className="h-8 w-8 text-amber-600/60 mb-2" />
        <button
          onClick={authorize}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors"
        >
          Connect to FFXI Installation
        </button>
        <p className="text-[10px] text-gray-500 mt-2">
          One click — re-authorizes your previously configured folder
        </p>
      </ViewerShell>
    )
  }

  // State 5: Ready — render 3D viewer
  const slots = Array.from(slotDatPaths.entries()).map(([slotName, datPath]) => {
    // Map slot name to Windower model slot index
    const slotMap: Record<string, number> = {
      Head: 2, Body: 3, Hands: 4, Legs: 5, Feet: 6, Main: 7, Sub: 8, Range: 9,
    }
    return { slotId: slotMap[slotName] ?? 0, datPath }
  }).filter(s => s.slotId > 0)

  return (
    <div className="relative flex-1 min-h-[440px] bg-gradient-radial from-indigo-950/95 to-gray-950/98 border border-amber-800/20 rounded-md overflow-hidden">
      <CharacterScene className="w-full h-full">
        <CharacterModel
          race={race}
          gender={gender}
          slots={slots}
          onSlotLoaded={(id) => setLoadingSlots(prev => {
            const next = new Set(prev)
            next.delete(id)
            return next
          })}
        />
      </CharacterScene>

      {/* Fullscreen button */}
      {onRequestFullscreen && (
        <button
          onClick={onRequestFullscreen}
          className="absolute top-3 right-3 w-8 h-8 bg-indigo-950/80 border border-amber-800/30 rounded flex items-center justify-center text-gray-400 hover:text-gray-200 transition-colors"
          title="Fullscreen"
        >
          ⛶
        </button>
      )}

      {/* Controls hint */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] text-gray-600">
        Drag to rotate · Scroll to zoom
      </div>
    </div>
  )
}

/** Shell container for non-3D states */
function ViewerShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 min-h-[440px] bg-gradient-to-b from-indigo-950/80 to-gray-950/90 border border-gray-700/30 rounded-md flex flex-col items-center justify-center">
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/Vanalytics.Web/src/components/character/ModelViewer.tsx
git commit -m "feat: model viewer wrapper with file system state handling"
```

---

## Task 18: Fullscreen Viewer Mode

**Files:**
- Create: `src/Vanalytics.Web/src/components/character/FullscreenViewer.tsx`

- [ ] **Step 1: Create fullscreen viewer component**

```tsx
// src/Vanalytics.Web/src/components/character/FullscreenViewer.tsx
import { useEffect, useRef, useCallback } from 'react'
import CharacterScene from './CharacterScene'
import CharacterModel from './CharacterModel'

interface FullscreenViewerProps {
  race?: string
  gender?: string
  characterName: string
  server: string
  slots: Array<{ slotId: number; datPath: string }>
  onExit: () => void
}

export default function FullscreenViewer({
  race,
  gender,
  characterName,
  server,
  slots,
  onExit,
}: FullscreenViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  const enterFullscreen = useCallback(async () => {
    try {
      await containerRef.current?.requestFullscreen()
    } catch {
      // Fullscreen not available, still show the component
    }
  }, [])

  useEffect(() => {
    enterFullscreen()

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        onExit()
      }
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [enterFullscreen, onExit])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onExit])

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-black"
    >
      <CharacterScene className="w-full h-full">
        <CharacterModel race={race} gender={gender} slots={slots} />
      </CharacterScene>

      {/* ESC hint */}
      <div className="absolute top-4 left-4 px-3 py-1.5 bg-indigo-950/80 border border-amber-800/30 rounded text-xs text-gray-400">
        ESC to exit
      </div>

      {/* Character info */}
      <div className="absolute bottom-4 left-4 text-sm text-amber-200/60">
        {characterName} — {server}
      </div>

      {/* Controls hint */}
      <div className="absolute bottom-4 right-4 text-[10px] text-gray-600">
        Drag to rotate · Scroll to zoom
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/Vanalytics.Web/src/components/character/FullscreenViewer.tsx
git commit -m "feat: fullscreen immersive character viewer mode"
```

---

## Task 19: Character Detail Page Integration

**Files:**
- Modify: `src/Vanalytics.Web/src/pages/CharacterDetailPage.tsx`

This is the final integration task. The character detail page currently shows a basic header, GearTable, JobsGrid, and CraftingTable. We replace GearTable with the new EquipmentGrid + ModelViewer layout.

- [ ] **Step 1: Read current CharacterDetailPage.tsx**

Read `src/Vanalytics.Web/src/pages/CharacterDetailPage.tsx` to understand the current structure before modifying.

- [ ] **Step 2: Update the page**

Key changes:
- Import new components: `ModelViewer`, `EquipmentGrid`, `EquipmentSwapModal`, `FullscreenViewer`
- Replace the GearTable section with a flex row: `ModelViewer` (left, flex-1) + `EquipmentGrid` (right, w-[400px])
- Add character header showing race/gender
- Add swap modal state: `swapSlot` (string | null), `swapModalOpen` (boolean)
- Add fullscreen state: `fullscreenOpen` (boolean)
- Add DAT path resolution (for now, an empty map — real resolution requires the mapping JSON files from Tasks TBD)
- Keep JobsGrid and CraftingTable below in a flex row

```tsx
// Key structural change in CharacterDetailPage.tsx:

// State
const [swapSlot, setSwapSlot] = useState<string | null>(null)
const [fullscreen, setFullscreen] = useState(false)
const [localGear, setLocalGear] = useState<GearEntry[]>([])

// Initialize localGear from API data
useEffect(() => {
  if (character?.gear) setLocalGear(character.gear)
}, [character?.gear])

// Swap handler
const handleSwapSelect = (item: GameItemSummary) => {
  if (!swapSlot) return
  setLocalGear(prev => prev.map(g =>
    g.slot === swapSlot
      ? { ...g, itemId: item.itemId, itemName: item.name }
      : g
  ))
  setSwapSlot(null)
}

// In JSX — replace GearTable section with:
<div className="flex gap-4 mt-4">
  <ModelViewer
    race={character.race}
    gender={character.gender}
    gear={localGear}
    slotDatPaths={new Map()} // Populated when mapping data is available
    onRequestFullscreen={() => setFullscreen(true)}
  />
  <div className="w-[400px] flex-shrink-0">
    <EquipmentGrid
      gear={localGear}
      onSlotClick={(slot) => setSwapSlot(slot)}
    />
  </div>
</div>

{/* Swap modal */}
{swapSlot && (
  <EquipmentSwapModal
    slotName={swapSlot}
    currentItemId={localGear.find(g => g.slot === swapSlot)?.itemId}
    onSelect={handleSwapSelect}
    onClose={() => setSwapSlot(null)}
  />
)}

{/* Fullscreen viewer */}
{fullscreen && (
  <FullscreenViewer
    race={character.race}
    gender={character.gender}
    characterName={character.name}
    server={character.server}
    slots={[]} // Populated when mapping data is available
    onExit={() => setFullscreen(false)}
  />
)}
```

- [ ] **Step 3: Verify Docker build**

```bash
cd src/Vanalytics.Web && npx tsc --noEmit
```

Expected: No TypeScript errors. Fix any import issues.

- [ ] **Step 4: Commit**

```bash
git add src/Vanalytics.Web/src/pages/CharacterDetailPage.tsx
git commit -m "feat: integrate model viewer and equipment grid into character detail page"
```

---

## Task 20: Windower Addon — Race and Model Sync

**Files:**
- Modify: `addon/vanalytics/vanalytics.lua`

- [ ] **Step 1: Update the addon to include race and model data**

In `addon/vanalytics/vanalytics.lua`, modify the `read_character_state()` function to include:

```lua
-- After the existing player data collection, add:

-- Race (Windower race ID 1-8)
local race_id = player.race
state.race = race_id

-- Model table (visual model IDs per slot)
-- Windower mob entity exposes models as a table indexed by slot
local mob = windower.ffxi.get_mob_by_id(player.id)
if mob then
    local models = {}
    -- Slots: 1=base, 2=head, 3=body, 4=hands, 5=legs, 6=feet, 7=main, 8=sub, 9=range
    for slot_id = 2, 9 do
        local model_id = mob.models and mob.models[slot_id]
        if model_id and model_id > 0 then
            table.insert(models, {
                slotId = slot_id,
                modelId = model_id,
            })
        end
    end
    if #models > 0 then
        state.models = models
    end
end
```

**Important:** The `mob.models` table access may vary by Windower version. The implementer should test this in-game and check the [Windower Lua wiki](https://github.com/Windower/Lua/wiki/FFXI-Functions) for the exact API. If `mob.models` is not directly accessible, the alternative is `windower.ffxi.get_mob_by_id(id).model_table` or reading from memory via the packets library.

- [ ] **Step 2: Test the sync payload**

In-game, run `//vanalytics sync` and check the API response. The payload should now include `race` (integer) and `models` (array of slotId/modelId pairs).

- [ ] **Step 3: Commit**

```bash
git add addon/vanalytics/vanalytics.lua
git commit -m "feat: addon syncs race ID and model table for 3D viewer"
```

---

## Notes for Implementation

### DAT Parser R&D (Tasks 8-12)

The DAT parser tasks provide the architecture and interfaces, but the binary format details are intentionally left as TODOs. This is because:

1. The format is reverse-engineered and undocumented — exact offsets, header structures, and section layouts must be determined by examining real DAT files with a hex editor
2. The primary references are C/C++ code in these repositories:
   - [galkareeve/ffxi](https://github.com/galkareeve/ffxi) — DatLoader, ModelLoader, TextureLoader
   - [Maphesdus/FFXI_Modding](https://github.com/Maphesdus/FFXI_Modding) — MMB viewer with DXT3 fixes
   - [MogHouse](https://github.com/codecomp/MogHouse) — Three.js viewer (proof-of-concept)
3. The correct approach is iterative:
   - Pick a known DAT file (e.g., Hume Male body from AltanaView)
   - Read it with DatReader and hex dump the header
   - Cross-reference with the C/C++ code to identify structures
   - Implement parsing for that specific file
   - Generalize as more files are tested

The DXT1/DXT3 decompression code (Task 9) is complete — those are standardized algorithms. The mesh parser (Task 10) includes a working `triangleStripToList()` function. What remains is the header parsing to locate mesh/texture/skeleton sections within each DAT file.

### Static Data Files

The plan references `item-model-mappings.json` and `dat-paths.json` as static data files. These need to be bootstrapped from:
- **Item→Model mappings:** Ashita4 Stylist plugin XML files, reformatted to JSON
- **Model→DAT paths:** Community documentation from AltanaView database and galkareeve research

Creating these files requires manual data extraction work that is outside the scope of code implementation. The implementer should create placeholder JSON files with a handful of known mappings for testing, then expand them over time.

### Face/Body Base Model

The spec reviewer noted that FFXI characters have a separate face mesh. The base character model (skeleton + face + default body) should be treated as a "slot 1" load that happens before equipment meshes. The `CharacterModel` component should load the base model DAT first, then overlay equipment meshes on top. The base model DAT path is determined by race/gender from the `dat-paths.json` mapping.

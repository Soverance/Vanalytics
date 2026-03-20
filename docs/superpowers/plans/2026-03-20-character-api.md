# Character API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement character CRUD, public profiles, and the Windower addon sync endpoint with rate limiting and license enforcement.

**Architecture:** Three controllers: `CharactersController` (JWT auth, CRUD), `ProfilesController` (no auth, public read), `SyncController` (API key auth, upsert with rate limiting). Rate limiting uses an in-memory `ConcurrentDictionary` (sufficient for MVP single-instance deployment). Sync does full-state upsert — the addon sends everything and the server reconciles.

**Tech Stack:** ASP.NET Core Controllers, EF Core (existing), JWT + API Key auth (existing).

**Spec:** `docs/specs/2026-03-20-vanalytics-mvp-design.md` — sections: Characters, Public Profiles, Sync, Sync Payload

**Builds on:** Plan 1 (data model, DbContext) + Plan 2 (auth, API key handler)

---

## File Structure

```
src/
├── Vanalytics.Core/
│   └── DTOs/
│       ├── Characters/
│       │   ├── CreateCharacterRequest.cs      # CREATE
│       │   ├── UpdateCharacterRequest.cs      # CREATE
│       │   ├── CharacterSummaryResponse.cs    # CREATE (list view)
│       │   └── CharacterDetailResponse.cs     # CREATE (full detail with jobs/gear/crafting)
│       └── Sync/
│           └── SyncRequest.cs                 # CREATE (sync payload + nested types)
├── Vanalytics.Api/
│   ├── Controllers/
│   │   ├── CharactersController.cs            # CREATE
│   │   ├── ProfilesController.cs              # CREATE
│   │   └── SyncController.cs                  # CREATE
│   └── Services/
│       └── RateLimiter.cs                     # CREATE (in-memory per-key rate limiter)
│   ├── Program.cs                             # MODIFY (register RateLimiter)
tests/
└── Vanalytics.Api.Tests/
    └── Controllers/
        ├── CharactersControllerTests.cs       # CREATE
        ├── ProfilesControllerTests.cs         # CREATE
        └── SyncControllerTests.cs             # CREATE
```

---

### Task 1: Character and Sync DTOs

**Files:**
- Create: `src/Vanalytics.Core/DTOs/Characters/CreateCharacterRequest.cs`
- Create: `src/Vanalytics.Core/DTOs/Characters/UpdateCharacterRequest.cs`
- Create: `src/Vanalytics.Core/DTOs/Characters/CharacterSummaryResponse.cs`
- Create: `src/Vanalytics.Core/DTOs/Characters/CharacterDetailResponse.cs`
- Create: `src/Vanalytics.Core/DTOs/Sync/SyncRequest.cs`

- [ ] **Step 1: Create CreateCharacterRequest**

```csharp
// src/Vanalytics.Core/DTOs/Characters/CreateCharacterRequest.cs
using System.ComponentModel.DataAnnotations;

namespace Vanalytics.Core.DTOs.Characters;

public class CreateCharacterRequest
{
    [Required, MaxLength(64)]
    public string Name { get; set; } = string.Empty;

    [Required, MaxLength(64)]
    public string Server { get; set; } = string.Empty;
}
```

- [ ] **Step 2: Create UpdateCharacterRequest**

```csharp
// src/Vanalytics.Core/DTOs/Characters/UpdateCharacterRequest.cs
namespace Vanalytics.Core.DTOs.Characters;

public class UpdateCharacterRequest
{
    public bool IsPublic { get; set; }
}
```

- [ ] **Step 3: Create CharacterSummaryResponse**

```csharp
// src/Vanalytics.Core/DTOs/Characters/CharacterSummaryResponse.cs
namespace Vanalytics.Core.DTOs.Characters;

public class CharacterSummaryResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Server { get; set; } = string.Empty;
    public string LicenseStatus { get; set; } = string.Empty;
    public bool IsPublic { get; set; }
    public DateTimeOffset? LastSyncAt { get; set; }
}
```

- [ ] **Step 4: Create CharacterDetailResponse**

```csharp
// src/Vanalytics.Core/DTOs/Characters/CharacterDetailResponse.cs
namespace Vanalytics.Core.DTOs.Characters;

public class CharacterDetailResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Server { get; set; } = string.Empty;
    public string LicenseStatus { get; set; } = string.Empty;
    public bool IsPublic { get; set; }
    public DateTimeOffset? LastSyncAt { get; set; }

    public List<JobEntry> Jobs { get; set; } = [];
    public List<GearEntry> Gear { get; set; } = [];
    public List<CraftingEntry> CraftingSkills { get; set; } = [];
}

public class JobEntry
{
    public string Job { get; set; } = string.Empty;
    public int Level { get; set; }
    public bool IsActive { get; set; }
}

public class GearEntry
{
    public string Slot { get; set; } = string.Empty;
    public int ItemId { get; set; }
    public string ItemName { get; set; } = string.Empty;
}

public class CraftingEntry
{
    public string Craft { get; set; } = string.Empty;
    public int Level { get; set; }
    public string Rank { get; set; } = string.Empty;
}
```

- [ ] **Step 5: Create SyncRequest**

```csharp
// src/Vanalytics.Core/DTOs/Sync/SyncRequest.cs
using System.ComponentModel.DataAnnotations;

namespace Vanalytics.Core.DTOs.Sync;

public class SyncRequest
{
    [Required, MaxLength(64)]
    public string CharacterName { get; set; } = string.Empty;

    [Required, MaxLength(64)]
    public string Server { get; set; } = string.Empty;

    [Required]
    public string ActiveJob { get; set; } = string.Empty;

    public int ActiveJobLevel { get; set; }

    public List<SyncJobEntry> Jobs { get; set; } = [];
    public List<SyncGearEntry> Gear { get; set; } = [];
    public List<SyncCraftingEntry> Crafting { get; set; } = [];
}

public class SyncJobEntry
{
    public string Job { get; set; } = string.Empty;
    public int Level { get; set; }
}

public class SyncGearEntry
{
    public string Slot { get; set; } = string.Empty;
    public int ItemId { get; set; }
    public string ItemName { get; set; } = string.Empty;
}

public class SyncCraftingEntry
{
    public string Craft { get; set; } = string.Empty;
    public int Level { get; set; }
    public string Rank { get; set; } = string.Empty;
}
```

- [ ] **Step 6: Verify build**

```bash
dotnet build src/Vanalytics.Core/Vanalytics.Core.csproj
```

---

### Task 2: RateLimiter Service

**Files:**
- Create: `src/Vanalytics.Api/Services/RateLimiter.cs`
- Modify: `src/Vanalytics.Api/Program.cs`

- [ ] **Step 1: Create RateLimiter**

In-memory sliding window rate limiter. Tracks timestamps per key, prunes expired entries.

```csharp
// src/Vanalytics.Api/Services/RateLimiter.cs
using System.Collections.Concurrent;

namespace Vanalytics.Api.Services;

public class RateLimiter
{
    private readonly ConcurrentDictionary<string, List<DateTimeOffset>> _requests = new();
    private readonly int _maxRequests;
    private readonly TimeSpan _window;

    public RateLimiter(int maxRequests = 20, TimeSpan? window = null)
    {
        _maxRequests = maxRequests;
        _window = window ?? TimeSpan.FromHours(1);
    }

    public bool IsAllowed(string key)
    {
        var now = DateTimeOffset.UtcNow;
        var cutoff = now - _window;

        var timestamps = _requests.GetOrAdd(key, _ => new List<DateTimeOffset>());

        lock (timestamps)
        {
            timestamps.RemoveAll(t => t < cutoff);

            if (timestamps.Count >= _maxRequests)
                return false;

            timestamps.Add(now);
            return true;
        }
    }
}
```

- [ ] **Step 2: Register RateLimiter as singleton in Program.cs**

Add this line after the existing service registrations in `src/Vanalytics.Api/Program.cs`:

```csharp
builder.Services.AddSingleton<RateLimiter>();
```

- [ ] **Step 3: Verify build**

```bash
dotnet build Vanalytics.slnx
```

---

### Task 3: CharactersController — CRUD

**Files:**
- Create: `src/Vanalytics.Api/Controllers/CharactersController.cs`
- Create: `tests/Vanalytics.Api.Tests/Controllers/CharactersControllerTests.cs`

- [ ] **Step 1: Write integration tests**

```csharp
// tests/Vanalytics.Api.Tests/Controllers/CharactersControllerTests.cs
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.MsSql;
using Vanalytics.Core.DTOs.Auth;
using Vanalytics.Core.DTOs.Characters;
using Vanalytics.Data;

namespace Vanalytics.Api.Tests.Controllers;

public class CharactersControllerTests : IAsyncLifetime
{
    private readonly MsSqlContainer _container = new MsSqlBuilder("mcr.microsoft.com/mssql/server:2022-latest").Build();
    private WebApplicationFactory<Program> _factory = null!;
    private HttpClient _client = null!;

    public async Task InitializeAsync()
    {
        await _container.StartAsync();
        _factory = new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder =>
            {
                builder.ConfigureServices(services =>
                {
                    var desc = services.SingleOrDefault(d => d.ServiceType == typeof(DbContextOptions<VanalyticsDbContext>));
                    if (desc != null) services.Remove(desc);
                    services.AddDbContext<VanalyticsDbContext>(o => o.UseSqlServer(_container.GetConnectionString()));
                });
                builder.ConfigureAppConfiguration((_, config) =>
                {
                    config.AddInMemoryCollection(new Dictionary<string, string?>
                    {
                        ["Jwt:Secret"] = "TestSecretKeyThatIsAtLeast32BytesLongForHmacSha256!!",
                        ["Jwt:Issuer"] = "VanalyticsTest",
                        ["Jwt:Audience"] = "VanalyticsTest",
                        ["Jwt:AccessTokenExpirationMinutes"] = "15",
                        ["Jwt:RefreshTokenExpirationDays"] = "7"
                    });
                });
            });
        _client = _factory.CreateClient();
    }

    public async Task DisposeAsync()
    {
        _client.Dispose();
        await _factory.DisposeAsync();
        await _container.DisposeAsync();
    }

    private async Task<string> RegisterAndGetTokenAsync(string email, string username)
    {
        var resp = await _client.PostAsJsonAsync("/api/auth/register", new RegisterRequest
        { Email = email, Username = username, Password = "Password123!" });
        var auth = await resp.Content.ReadFromJsonAsync<AuthResponse>();
        return auth!.AccessToken;
    }

    private HttpRequestMessage Authed(HttpMethod method, string url, string token)
    {
        var req = new HttpRequestMessage(method, url);
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return req;
    }

    [Fact]
    public async Task CreateCharacter_ReturnsCreated()
    {
        var token = await RegisterAndGetTokenAsync("char1@test.com", "char1user");
        var req = Authed(HttpMethod.Post, "/api/characters", token);
        req.Content = JsonContent.Create(new CreateCharacterRequest { Name = "Soverance", Server = "Asura" });

        var resp = await _client.SendAsync(req);

        Assert.Equal(HttpStatusCode.Created, resp.StatusCode);
        var character = await resp.Content.ReadFromJsonAsync<CharacterSummaryResponse>();
        Assert.Equal("Soverance", character!.Name);
        Assert.Equal("Asura", character.Server);
        Assert.Equal("Unlicensed", character.LicenseStatus);
    }

    [Fact]
    public async Task CreateCharacter_DuplicateNameServer_ReturnsConflict()
    {
        var token = await RegisterAndGetTokenAsync("char2@test.com", "char2user");
        var req1 = Authed(HttpMethod.Post, "/api/characters", token);
        req1.Content = JsonContent.Create(new CreateCharacterRequest { Name = "Dupechar", Server = "Asura" });
        await _client.SendAsync(req1);

        var req2 = Authed(HttpMethod.Post, "/api/characters", token);
        req2.Content = JsonContent.Create(new CreateCharacterRequest { Name = "Dupechar", Server = "Asura" });
        var resp = await _client.SendAsync(req2);

        Assert.Equal(HttpStatusCode.Conflict, resp.StatusCode);
    }

    [Fact]
    public async Task ListCharacters_ReturnsOwnCharacters()
    {
        var token = await RegisterAndGetTokenAsync("char3@test.com", "char3user");
        var req1 = Authed(HttpMethod.Post, "/api/characters", token);
        req1.Content = JsonContent.Create(new CreateCharacterRequest { Name = "ListChar", Server = "Asura" });
        await _client.SendAsync(req1);

        var resp = await _client.SendAsync(Authed(HttpMethod.Get, "/api/characters", token));

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var chars = await resp.Content.ReadFromJsonAsync<List<CharacterSummaryResponse>>();
        Assert.Single(chars!);
        Assert.Equal("ListChar", chars[0].Name);
    }

    [Fact]
    public async Task GetCharacter_OwnerCanAccess()
    {
        var token = await RegisterAndGetTokenAsync("char4@test.com", "char4user");
        var req1 = Authed(HttpMethod.Post, "/api/characters", token);
        req1.Content = JsonContent.Create(new CreateCharacterRequest { Name = "DetailChar", Server = "Asura" });
        var createResp = await _client.SendAsync(req1);
        var created = await createResp.Content.ReadFromJsonAsync<CharacterSummaryResponse>();

        var resp = await _client.SendAsync(Authed(HttpMethod.Get, $"/api/characters/{created!.Id}", token));

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var detail = await resp.Content.ReadFromJsonAsync<CharacterDetailResponse>();
        Assert.Equal("DetailChar", detail!.Name);
    }

    [Fact]
    public async Task GetCharacter_NonOwnerGetsForbidden()
    {
        var token1 = await RegisterAndGetTokenAsync("char5a@test.com", "char5auser");
        var token2 = await RegisterAndGetTokenAsync("char5b@test.com", "char5buser");

        var req1 = Authed(HttpMethod.Post, "/api/characters", token1);
        req1.Content = JsonContent.Create(new CreateCharacterRequest { Name = "OtherChar", Server = "Asura" });
        var createResp = await _client.SendAsync(req1);
        var created = await createResp.Content.ReadFromJsonAsync<CharacterSummaryResponse>();

        var resp = await _client.SendAsync(Authed(HttpMethod.Get, $"/api/characters/{created!.Id}", token2));

        Assert.Equal(HttpStatusCode.Forbidden, resp.StatusCode);
    }

    [Fact]
    public async Task UpdateCharacter_TogglesPublic()
    {
        var token = await RegisterAndGetTokenAsync("char6@test.com", "char6user");
        var req1 = Authed(HttpMethod.Post, "/api/characters", token);
        req1.Content = JsonContent.Create(new CreateCharacterRequest { Name = "ToggleChar", Server = "Asura" });
        var createResp = await _client.SendAsync(req1);
        var created = await createResp.Content.ReadFromJsonAsync<CharacterSummaryResponse>();

        var req2 = Authed(HttpMethod.Put, $"/api/characters/{created!.Id}", token);
        req2.Content = JsonContent.Create(new UpdateCharacterRequest { IsPublic = true });
        var resp = await _client.SendAsync(req2);

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var updated = await resp.Content.ReadFromJsonAsync<CharacterSummaryResponse>();
        Assert.True(updated!.IsPublic);
    }

    [Fact]
    public async Task DeleteCharacter_Removes()
    {
        var token = await RegisterAndGetTokenAsync("char7@test.com", "char7user");
        var req1 = Authed(HttpMethod.Post, "/api/characters", token);
        req1.Content = JsonContent.Create(new CreateCharacterRequest { Name = "DeleteChar", Server = "Asura" });
        var createResp = await _client.SendAsync(req1);
        var created = await createResp.Content.ReadFromJsonAsync<CharacterSummaryResponse>();

        var resp = await _client.SendAsync(Authed(HttpMethod.Delete, $"/api/characters/{created!.Id}", token));
        Assert.Equal(HttpStatusCode.NoContent, resp.StatusCode);

        var getResp = await _client.SendAsync(Authed(HttpMethod.Get, $"/api/characters/{created.Id}", token));
        Assert.Equal(HttpStatusCode.NotFound, getResp.StatusCode);
    }

    [Fact]
    public async Task WithoutAuth_ReturnsUnauthorized()
    {
        var resp = await _client.GetAsync("/api/characters");
        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
dotnet test tests/Vanalytics.Api.Tests/Controllers/CharactersControllerTests.cs -v normal
```

- [ ] **Step 3: Create CharactersController**

```csharp
// src/Vanalytics.Api/Controllers/CharactersController.cs
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Core.DTOs.Characters;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/characters")]
[Authorize]
public class CharactersController : ControllerBase
{
    private readonly VanalyticsDbContext _db;

    public CharactersController(VanalyticsDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<IActionResult> List()
    {
        var userId = GetUserId();
        var characters = await _db.Characters
            .Where(c => c.UserId == userId)
            .Select(c => new CharacterSummaryResponse
            {
                Id = c.Id,
                Name = c.Name,
                Server = c.Server,
                LicenseStatus = c.LicenseStatus.ToString(),
                IsPublic = c.IsPublic,
                LastSyncAt = c.LastSyncAt
            })
            .ToListAsync();

        return Ok(characters);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateCharacterRequest request)
    {
        var userId = GetUserId();

        if (await _db.Characters.AnyAsync(c => c.Name == request.Name && c.Server == request.Server))
            return Conflict(new { message = "Character already exists on this server" });

        var character = new Character
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Name = request.Name,
            Server = request.Server,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };

        _db.Characters.Add(character);
        await _db.SaveChangesAsync();

        return CreatedAtAction(nameof(Get), new { id = character.Id }, new CharacterSummaryResponse
        {
            Id = character.Id,
            Name = character.Name,
            Server = character.Server,
            LicenseStatus = character.LicenseStatus.ToString(),
            IsPublic = character.IsPublic,
            LastSyncAt = character.LastSyncAt
        });
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
    {
        var userId = GetUserId();
        var character = await _db.Characters
            .Include(c => c.Jobs)
            .Include(c => c.Gear)
            .Include(c => c.CraftingSkills)
            .FirstOrDefaultAsync(c => c.Id == id);

        if (character is null) return NotFound();
        if (character.UserId != userId) return Forbid();

        return Ok(MapToDetail(character));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateCharacterRequest request)
    {
        var userId = GetUserId();
        var character = await _db.Characters.FirstOrDefaultAsync(c => c.Id == id);

        if (character is null) return NotFound();
        if (character.UserId != userId) return Forbid();

        character.IsPublic = request.IsPublic;
        character.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new CharacterSummaryResponse
        {
            Id = character.Id,
            Name = character.Name,
            Server = character.Server,
            LicenseStatus = character.LicenseStatus.ToString(),
            IsPublic = character.IsPublic,
            LastSyncAt = character.LastSyncAt
        });
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var userId = GetUserId();
        var character = await _db.Characters.FirstOrDefaultAsync(c => c.Id == id);

        if (character is null) return NotFound();
        if (character.UserId != userId) return Forbid();

        _db.Characters.Remove(character);
        await _db.SaveChangesAsync();

        return NoContent();
    }

    private Guid GetUserId() =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    private static CharacterDetailResponse MapToDetail(Character c) => new()
    {
        Id = c.Id,
        Name = c.Name,
        Server = c.Server,
        LicenseStatus = c.LicenseStatus.ToString(),
        IsPublic = c.IsPublic,
        LastSyncAt = c.LastSyncAt,
        Jobs = c.Jobs.Select(j => new JobEntry
        {
            Job = j.JobId.ToString(),
            Level = j.Level,
            IsActive = j.IsActive
        }).ToList(),
        Gear = c.Gear.Select(g => new GearEntry
        {
            Slot = g.Slot.ToString(),
            ItemId = g.ItemId,
            ItemName = g.ItemName
        }).ToList(),
        CraftingSkills = c.CraftingSkills.Select(s => new CraftingEntry
        {
            Craft = s.Craft.ToString(),
            Level = s.Level,
            Rank = s.Rank
        }).ToList()
    };
}
```

- [ ] **Step 4: Run tests**

```bash
dotnet test tests/Vanalytics.Api.Tests/ -v normal
```

Expected: All tests pass (previous 17 + 8 new CharactersController tests).

---

### Task 4: ProfilesController — Public Character Profile

**Files:**
- Create: `src/Vanalytics.Api/Controllers/ProfilesController.cs`
- Create: `tests/Vanalytics.Api.Tests/Controllers/ProfilesControllerTests.cs`

- [ ] **Step 1: Write integration tests**

```csharp
// tests/Vanalytics.Api.Tests/Controllers/ProfilesControllerTests.cs
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.MsSql;
using Vanalytics.Core.DTOs.Auth;
using Vanalytics.Core.DTOs.Characters;
using Vanalytics.Data;

namespace Vanalytics.Api.Tests.Controllers;

public class ProfilesControllerTests : IAsyncLifetime
{
    private readonly MsSqlContainer _container = new MsSqlBuilder("mcr.microsoft.com/mssql/server:2022-latest").Build();
    private WebApplicationFactory<Program> _factory = null!;
    private HttpClient _client = null!;

    public async Task InitializeAsync()
    {
        await _container.StartAsync();
        _factory = new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder =>
            {
                builder.ConfigureServices(services =>
                {
                    var desc = services.SingleOrDefault(d => d.ServiceType == typeof(DbContextOptions<VanalyticsDbContext>));
                    if (desc != null) services.Remove(desc);
                    services.AddDbContext<VanalyticsDbContext>(o => o.UseSqlServer(_container.GetConnectionString()));
                });
                builder.ConfigureAppConfiguration((_, config) =>
                {
                    config.AddInMemoryCollection(new Dictionary<string, string?>
                    {
                        ["Jwt:Secret"] = "TestSecretKeyThatIsAtLeast32BytesLongForHmacSha256!!",
                        ["Jwt:Issuer"] = "VanalyticsTest",
                        ["Jwt:Audience"] = "VanalyticsTest",
                        ["Jwt:AccessTokenExpirationMinutes"] = "15",
                        ["Jwt:RefreshTokenExpirationDays"] = "7"
                    });
                });
            });
        _client = _factory.CreateClient();
    }

    public async Task DisposeAsync()
    {
        _client.Dispose();
        await _factory.DisposeAsync();
        await _container.DisposeAsync();
    }

    private async Task<(string Token, CharacterSummaryResponse Character)> CreatePublicCharacterAsync(
        string email, string username, string charName, string server)
    {
        var regResp = await _client.PostAsJsonAsync("/api/auth/register", new RegisterRequest
        { Email = email, Username = username, Password = "Password123!" });
        var auth = (await regResp.Content.ReadFromJsonAsync<AuthResponse>())!;

        var createReq = new HttpRequestMessage(HttpMethod.Post, "/api/characters");
        createReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        createReq.Content = JsonContent.Create(new CreateCharacterRequest { Name = charName, Server = server });
        var createResp = await _client.SendAsync(createReq);
        var character = (await createResp.Content.ReadFromJsonAsync<CharacterSummaryResponse>())!;

        // Make it public
        var updateReq = new HttpRequestMessage(HttpMethod.Put, $"/api/characters/{character.Id}");
        updateReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        updateReq.Content = JsonContent.Create(new UpdateCharacterRequest { IsPublic = true });
        await _client.SendAsync(updateReq);

        return (auth.AccessToken, character);
    }

    [Fact]
    public async Task GetPublicProfile_WhenPublic_ReturnsProfile()
    {
        await CreatePublicCharacterAsync("prof1@test.com", "prof1user", "PubChar", "Asura");

        var resp = await _client.GetAsync("/api/profiles/Asura/PubChar");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var detail = await resp.Content.ReadFromJsonAsync<CharacterDetailResponse>();
        Assert.Equal("PubChar", detail!.Name);
        Assert.Equal("Asura", detail.Server);
    }

    [Fact]
    public async Task GetPublicProfile_WhenPrivate_ReturnsNotFound()
    {
        // Create character but don't make it public
        var regResp = await _client.PostAsJsonAsync("/api/auth/register", new RegisterRequest
        { Email = "prof2@test.com", Username = "prof2user", Password = "Password123!" });
        var auth = (await regResp.Content.ReadFromJsonAsync<AuthResponse>())!;

        var createReq = new HttpRequestMessage(HttpMethod.Post, "/api/characters");
        createReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        createReq.Content = JsonContent.Create(new CreateCharacterRequest { Name = "PrivChar", Server = "Asura" });
        await _client.SendAsync(createReq);

        var resp = await _client.GetAsync("/api/profiles/Asura/PrivChar");

        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    [Fact]
    public async Task GetPublicProfile_NonExistent_ReturnsNotFound()
    {
        var resp = await _client.GetAsync("/api/profiles/Asura/NoSuchChar");
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Create ProfilesController**

```csharp
// src/Vanalytics.Api/Controllers/ProfilesController.cs
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Core.DTOs.Characters;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/profiles")]
public class ProfilesController : ControllerBase
{
    private readonly VanalyticsDbContext _db;

    public ProfilesController(VanalyticsDbContext db)
    {
        _db = db;
    }

    [HttpGet("{server}/{name}")]
    public async Task<IActionResult> GetPublicProfile(string server, string name)
    {
        var character = await _db.Characters
            .Include(c => c.Jobs)
            .Include(c => c.Gear)
            .Include(c => c.CraftingSkills)
            .FirstOrDefaultAsync(c =>
                c.Server == server &&
                c.Name == name &&
                c.IsPublic);

        if (character is null) return NotFound();

        return Ok(new CharacterDetailResponse
        {
            Id = character.Id,
            Name = character.Name,
            Server = character.Server,
            LicenseStatus = character.LicenseStatus.ToString(),
            IsPublic = character.IsPublic,
            LastSyncAt = character.LastSyncAt,
            Jobs = character.Jobs.Select(j => new JobEntry
            {
                Job = j.JobId.ToString(),
                Level = j.Level,
                IsActive = j.IsActive
            }).ToList(),
            Gear = character.Gear.Select(g => new GearEntry
            {
                Slot = g.Slot.ToString(),
                ItemId = g.ItemId,
                ItemName = g.ItemName
            }).ToList(),
            CraftingSkills = character.CraftingSkills.Select(s => new CraftingEntry
            {
                Craft = s.Craft.ToString(),
                Level = s.Level,
                Rank = s.Rank
            }).ToList()
        });
    }
}
```

- [ ] **Step 4: Run tests**

```bash
dotnet test tests/Vanalytics.Api.Tests/ -v normal
```

Expected: All previous tests + 3 new ProfilesController tests pass.

---

### Task 5: SyncController — Addon Sync with Rate Limiting and License Enforcement

**Files:**
- Create: `src/Vanalytics.Api/Controllers/SyncController.cs`
- Create: `tests/Vanalytics.Api.Tests/Controllers/SyncControllerTests.cs`

- [ ] **Step 1: Write integration tests**

```csharp
// tests/Vanalytics.Api.Tests/Controllers/SyncControllerTests.cs
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.MsSql;
using Vanalytics.Core.DTOs.Auth;
using Vanalytics.Core.DTOs.Characters;
using Vanalytics.Core.DTOs.Keys;
using Vanalytics.Core.DTOs.Sync;
using Vanalytics.Core.Enums;
using Vanalytics.Data;

namespace Vanalytics.Api.Tests.Controllers;

public class SyncControllerTests : IAsyncLifetime
{
    private readonly MsSqlContainer _container = new MsSqlBuilder("mcr.microsoft.com/mssql/server:2022-latest").Build();
    private WebApplicationFactory<Program> _factory = null!;
    private HttpClient _client = null!;

    public async Task InitializeAsync()
    {
        await _container.StartAsync();
        _factory = new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder =>
            {
                builder.ConfigureServices(services =>
                {
                    var desc = services.SingleOrDefault(d => d.ServiceType == typeof(DbContextOptions<VanalyticsDbContext>));
                    if (desc != null) services.Remove(desc);
                    services.AddDbContext<VanalyticsDbContext>(o => o.UseSqlServer(_container.GetConnectionString()));
                });
                builder.ConfigureAppConfiguration((_, config) =>
                {
                    config.AddInMemoryCollection(new Dictionary<string, string?>
                    {
                        ["Jwt:Secret"] = "TestSecretKeyThatIsAtLeast32BytesLongForHmacSha256!!",
                        ["Jwt:Issuer"] = "VanalyticsTest",
                        ["Jwt:Audience"] = "VanalyticsTest",
                        ["Jwt:AccessTokenExpirationMinutes"] = "15",
                        ["Jwt:RefreshTokenExpirationDays"] = "7"
                    });
                });
            });
        _client = _factory.CreateClient();
    }

    public async Task DisposeAsync()
    {
        _client.Dispose();
        await _factory.DisposeAsync();
        await _container.DisposeAsync();
    }

    private async Task<(string JwtToken, string ApiKey, Guid CharacterId)> SetupSyncUserAsync(
        string email, string username, string charName, LicenseStatus license = LicenseStatus.Active)
    {
        // Register user
        var regResp = await _client.PostAsJsonAsync("/api/auth/register", new RegisterRequest
        { Email = email, Username = username, Password = "Password123!" });
        var auth = (await regResp.Content.ReadFromJsonAsync<AuthResponse>())!;

        // Create character
        var createReq = new HttpRequestMessage(HttpMethod.Post, "/api/characters");
        createReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        createReq.Content = JsonContent.Create(new CreateCharacterRequest { Name = charName, Server = "Asura" });
        var createResp = await _client.SendAsync(createReq);
        var character = (await createResp.Content.ReadFromJsonAsync<CharacterSummaryResponse>())!;

        // Set license status directly in DB
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        var dbChar = await db.Characters.FindAsync(character.Id);
        dbChar!.LicenseStatus = license;
        await db.SaveChangesAsync();

        // Generate API key
        var keyReq = new HttpRequestMessage(HttpMethod.Post, "/api/keys/generate");
        keyReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        var keyResp = await _client.SendAsync(keyReq);
        var apiKey = (await keyResp.Content.ReadFromJsonAsync<ApiKeyResponse>())!;

        return (auth.AccessToken, apiKey.ApiKey, character.Id);
    }

    private HttpRequestMessage SyncRequest(string apiKey, SyncRequest payload)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, "/api/sync");
        req.Headers.Add("X-Api-Key", apiKey);
        req.Content = JsonContent.Create(payload);
        return req;
    }

    [Fact]
    public async Task Sync_WithValidApiKey_UpsertsData()
    {
        var (_, apiKey, _) = await SetupSyncUserAsync("sync1@test.com", "sync1user", "SyncChar1");

        var payload = new SyncRequest
        {
            CharacterName = "SyncChar1",
            Server = "Asura",
            ActiveJob = "THF",
            ActiveJobLevel = 99,
            Jobs = [new SyncJobEntry { Job = "THF", Level = 99 }, new SyncJobEntry { Job = "DNC", Level = 49 }],
            Gear = [new SyncGearEntry { Slot = "Main", ItemId = 20515, ItemName = "Vajra" }],
            Crafting = [new SyncCraftingEntry { Craft = "Goldsmithing", Level = 110, Rank = "Craftsman" }]
        };

        var resp = await _client.SendAsync(SyncRequest(apiKey, payload));

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        // Verify data via profile (make it public first)
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        var character = await db.Characters
            .Include(c => c.Jobs)
            .Include(c => c.Gear)
            .Include(c => c.CraftingSkills)
            .FirstAsync(c => c.Name == "SyncChar1");

        Assert.Equal(2, character.Jobs.Count);
        Assert.Single(character.Gear);
        Assert.Equal("Vajra", character.Gear[0].ItemName);
        Assert.Single(character.CraftingSkills);
        Assert.NotNull(character.LastSyncAt);
    }

    [Fact]
    public async Task Sync_UnlicensedCharacter_ReturnsForbidden()
    {
        var (_, apiKey, _) = await SetupSyncUserAsync(
            "sync2@test.com", "sync2user", "SyncChar2", LicenseStatus.Unlicensed);

        var payload = new SyncRequest
        {
            CharacterName = "SyncChar2",
            Server = "Asura",
            ActiveJob = "WAR",
            ActiveJobLevel = 75
        };

        var resp = await _client.SendAsync(SyncRequest(apiKey, payload));

        Assert.Equal(HttpStatusCode.Forbidden, resp.StatusCode);
    }

    [Fact]
    public async Task Sync_CharacterNotOwnedByUser_ReturnsForbidden()
    {
        // User1 creates character, User2 tries to sync it
        var (_, _, _) = await SetupSyncUserAsync("sync3a@test.com", "sync3auser", "SyncChar3");

        // Register another user and get their API key
        var regResp = await _client.PostAsJsonAsync("/api/auth/register", new RegisterRequest
        { Email = "sync3b@test.com", Username = "sync3buser", Password = "Password123!" });
        var auth2 = (await regResp.Content.ReadFromJsonAsync<AuthResponse>())!;
        var keyReq = new HttpRequestMessage(HttpMethod.Post, "/api/keys/generate");
        keyReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", auth2.AccessToken);
        var keyResp = await _client.SendAsync(keyReq);
        var apiKey2 = (await keyResp.Content.ReadFromJsonAsync<ApiKeyResponse>())!;

        var payload = new SyncRequest
        {
            CharacterName = "SyncChar3",
            Server = "Asura",
            ActiveJob = "WAR",
            ActiveJobLevel = 75
        };

        var resp = await _client.SendAsync(SyncRequest(apiKey2.ApiKey, payload));

        Assert.Equal(HttpStatusCode.Forbidden, resp.StatusCode);
    }

    [Fact]
    public async Task Sync_WithoutApiKey_ReturnsUnauthorized()
    {
        var payload = new SyncRequest
        {
            CharacterName = "NoAuth",
            Server = "Asura",
            ActiveJob = "WAR",
            ActiveJobLevel = 75
        };

        var resp = await _client.PostAsJsonAsync("/api/sync", payload);

        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task Sync_RateLimitExceeded_Returns429()
    {
        var (_, apiKey, _) = await SetupSyncUserAsync("sync4@test.com", "sync4user", "SyncChar4");

        var payload = new SyncRequest
        {
            CharacterName = "SyncChar4",
            Server = "Asura",
            ActiveJob = "WAR",
            ActiveJobLevel = 75,
            Jobs = [new SyncJobEntry { Job = "WAR", Level = 75 }]
        };

        // Send 20 requests (should all succeed)
        for (int i = 0; i < 20; i++)
        {
            var resp = await _client.SendAsync(SyncRequest(apiKey, payload));
            Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        }

        // 21st request should be rate limited
        var limitedResp = await _client.SendAsync(SyncRequest(apiKey, payload));
        Assert.Equal((HttpStatusCode)429, limitedResp.StatusCode);
    }

    [Fact]
    public async Task Sync_SecondSync_UpsertsExistingData()
    {
        var (_, apiKey, _) = await SetupSyncUserAsync("sync5@test.com", "sync5user", "SyncChar5");

        // First sync
        var payload1 = new SyncRequest
        {
            CharacterName = "SyncChar5",
            Server = "Asura",
            ActiveJob = "THF",
            ActiveJobLevel = 75,
            Jobs = [new SyncJobEntry { Job = "THF", Level = 75 }]
        };
        await _client.SendAsync(SyncRequest(apiKey, payload1));

        // Second sync with updated data
        var payload2 = new SyncRequest
        {
            CharacterName = "SyncChar5",
            Server = "Asura",
            ActiveJob = "THF",
            ActiveJobLevel = 99,
            Jobs = [
                new SyncJobEntry { Job = "THF", Level = 99 },
                new SyncJobEntry { Job = "DNC", Level = 49 }
            ]
        };
        var resp = await _client.SendAsync(SyncRequest(apiKey, payload2));

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        var character = await db.Characters
            .Include(c => c.Jobs)
            .FirstAsync(c => c.Name == "SyncChar5");

        Assert.Equal(2, character.Jobs.Count);
        Assert.Equal(99, character.Jobs.First(j => j.JobId == JobType.THF).Level);
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Create SyncController**

```csharp
// src/Vanalytics.Api/Controllers/SyncController.cs
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Api.Services;
using Vanalytics.Core.DTOs.Sync;
using Vanalytics.Core.Enums;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/sync")]
[Authorize(AuthenticationSchemes = "ApiKey")]
public class SyncController : ControllerBase
{
    private readonly VanalyticsDbContext _db;
    private readonly RateLimiter _rateLimiter;

    public SyncController(VanalyticsDbContext db, RateLimiter rateLimiter)
    {
        _db = db;
        _rateLimiter = rateLimiter;
    }

    [HttpPost]
    public async Task<IActionResult> Sync([FromBody] SyncRequest request)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        // Rate limit per API key (spec: 20 req/hr per API key)
        var apiKey = Request.Headers["X-Api-Key"].ToString();
        if (!_rateLimiter.IsAllowed(apiKey))
            return StatusCode(429, new { message = "Rate limit exceeded. Max 20 requests per hour." });

        // Find character
        var character = await _db.Characters
            .Include(c => c.Jobs)
            .Include(c => c.Gear)
            .Include(c => c.CraftingSkills)
            .FirstOrDefaultAsync(c => c.Name == request.CharacterName && c.Server == request.Server);

        if (character is null)
            return NotFound(new { message = $"Character '{request.CharacterName}' on '{request.Server}' not found" });

        // Verify ownership
        if (character.UserId != userId)
            return StatusCode(403, new { message = "Character is not owned by this account" });

        // Check license
        if (character.LicenseStatus != LicenseStatus.Active)
            return StatusCode(403, new { message = "Character does not have an active license" });

        // Full state replacement for jobs (clear and re-add, same as gear/crafting)
        _db.CharacterJobs.RemoveRange(character.Jobs);
        foreach (var jobEntry in request.Jobs)
        {
            if (!Enum.TryParse<JobType>(jobEntry.Job, true, out var jobType)) continue;

            character.Jobs.Add(new CharacterJob
            {
                Id = Guid.NewGuid(),
                CharacterId = character.Id,
                JobId = jobType,
                Level = jobEntry.Level,
                IsActive = jobEntry.Job.Equals(request.ActiveJob, StringComparison.OrdinalIgnoreCase)
            });
        }

        // Full state replacement for gear (clear and re-add)
        _db.EquippedGear.RemoveRange(character.Gear);
        foreach (var gearEntry in request.Gear)
        {
            if (!Enum.TryParse<EquipSlot>(gearEntry.Slot, true, out var slot)) continue;

            character.Gear.Add(new EquippedGear
            {
                Id = Guid.NewGuid(),
                CharacterId = character.Id,
                Slot = slot,
                ItemId = gearEntry.ItemId,
                ItemName = gearEntry.ItemName
            });
        }

        // Upsert crafting — replace all (clear and re-add)
        _db.CraftingSkills.RemoveRange(character.CraftingSkills);
        foreach (var craftEntry in request.Crafting)
        {
            if (!Enum.TryParse<CraftType>(craftEntry.Craft, true, out var craft)) continue;

            character.CraftingSkills.Add(new CraftingSkill
            {
                Id = Guid.NewGuid(),
                CharacterId = character.Id,
                Craft = craft,
                Level = craftEntry.Level,
                Rank = craftEntry.Rank
            });
        }

        character.LastSyncAt = DateTimeOffset.UtcNow;
        character.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new { message = "Sync successful", lastSyncAt = character.LastSyncAt });
    }
}
```

- [ ] **Step 4: Run all tests**

```bash
dotnet test Vanalytics.slnx -v normal
```

Expected: All tests pass (previous tests + 5 new SyncController tests).

---

### Task 6: Docker Compose Smoke Test

- [ ] **Step 1: Build and start Docker Compose**

```bash
docker compose up --build -d
sleep 5
```

- [ ] **Step 2: Register user and create character**

```bash
# Register
curl -s -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"smoketest@test.com","username":"smokeuser","password":"TestPass123!"}'

# Create character (use token from above)
TOKEN="<token>"
curl -s -X POST http://localhost:5000/api/characters \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"SmokeChar","server":"Asura"}'
```

- [ ] **Step 3: List characters**

```bash
curl -s http://localhost:5000/api/characters -H "Authorization: Bearer $TOKEN"
```

Expected: Array with one character.

- [ ] **Step 4: Generate API key and test sync**

```bash
# Generate key
curl -s -X POST http://localhost:5000/api/keys/generate -H "Authorization: Bearer $TOKEN"

# Note: Sync will return 403 because character is Unlicensed by default.
# This is expected behavior per the spec.
APIKEY="<key>"
curl -s -X POST http://localhost:5000/api/sync \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: $APIKEY" \
  -d '{"characterName":"SmokeChar","server":"Asura","activeJob":"THF","activeJobLevel":99,"jobs":[{"job":"THF","level":99}]}'
```

Expected: 403 with "Character does not have an active license" (correct behavior — new characters default to Unlicensed).

- [ ] **Step 5: Tear down**

```bash
docker compose down
```

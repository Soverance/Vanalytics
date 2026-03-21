# Vanalytics Common Library Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Vanalytics' local auth/data code with the shared Soverance.Common libraries consumed via git submodule + project references.

**Architecture:** Add Common repo as a git submodule at `src/lib/Common/`. Update project references to point to shared Auth and Data projects. Delete local files replaced by shared equivalents. Update VanalyticsDbContext to inherit from SoveranceDbContextBase. Update all namespace references from `Vanalytics.Core.Models/Enums` to `Soverance.Auth.Models` for shared types. Add EF migration for new schema (IsEnabled column, SAML tables).

**Tech Stack:** .NET 10, EF Core 10, Soverance.Auth, Soverance.Data

**Spec:** `C:/Git/soverance/Common/docs/superpowers/specs/2026-03-21-shared-libraries-design.md` (see "Consuming App Changes — Vanalytics" section)

**Important:** The user (Scott) handles all git operations. Do NOT run git add, commit, push, or submodule commands. Do NOT run EF migration scaffold commands (dotnet ef migrations add) — those require Scott to run manually after verifying the changes.

---

## Namespace Migration Reference

These namespace changes apply across the entire codebase. Every file that imports the old namespace needs updating:

| Old | New |
|-----|-----|
| `Vanalytics.Core.Models.User` | `Soverance.Auth.Models.User` |
| `Vanalytics.Core.Models.RefreshToken` | `Soverance.Auth.Models.RefreshToken` |
| `Vanalytics.Core.Enums.UserRole` | `Soverance.Auth.Models.UserRole` |
| `Vanalytics.Core.DTOs.Auth.*` | `Soverance.Auth.DTOs.*` |
| `Vanalytics.Api.Services.TokenService` | `Soverance.Auth.Services.TokenService` |
| `Vanalytics.Api.Auth.ApiKeyAuthHandler` | `Soverance.Auth.Auth.ApiKeyAuthHandler` |
| `Vanalytics.Data.Seeding.AdminSeeder` | `Soverance.Auth.Services.AdminSeeder` |

Files that ONLY use `Vanalytics.Core.Models` for app-specific types (Character, GameServer, etc.) do NOT need changes — those types stay in Vanalytics.Core.

---

### Task 1: Update project references and csproj files

**Prerequisite:** Scott must first add the git submodule:
```bash
cd C:/Git/soverance/Vanalytics
git submodule add https://github.com/soverance/Common.git src/lib/Common
```

**Files:**
- Modify: `src/Vanalytics.Api/Vanalytics.Api.csproj`
- Modify: `src/Vanalytics.Data/Vanalytics.Data.csproj`
- Modify: `src/Vanalytics.Core/Vanalytics.Core.csproj`
- Modify: `tests/Vanalytics.Api.Tests/Vanalytics.Api.Tests.csproj`
- Modify: `tests/Vanalytics.Data.Tests/Vanalytics.Data.Tests.csproj`

- [ ] **Step 1: Update Vanalytics.Api.csproj**

Remove `BCrypt.Net-Next` and `Microsoft.AspNetCore.Authentication.JwtBearer` packages (now provided by Soverance.Auth). Add ProjectReferences to both Common projects:

```xml
<Project Sdk="Microsoft.NET.Sdk.Web">

  <ItemGroup>
    <ProjectReference Include="..\Vanalytics.Core\Vanalytics.Core.csproj" />
    <ProjectReference Include="..\Vanalytics.Data\Vanalytics.Data.csproj" />
    <ProjectReference Include="..\lib\Common\src\Soverance.Auth\Soverance.Auth.csproj" />
    <ProjectReference Include="..\lib\Common\src\Soverance.Data\Soverance.Data.csproj" />
  </ItemGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.AspNetCore.OpenApi" Version="10.0.5" />
    <PackageReference Include="Microsoft.EntityFrameworkCore.Design" Version="10.0.5">
      <IncludeAssets>runtime; build; native; contentfiles; analyzers; buildtransitive</IncludeAssets>
      <PrivateAssets>all</PrivateAssets>
    </PackageReference>
    <PackageReference Include="Scalar.AspNetCore" Version="2.13.13" />
  </ItemGroup>

  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>

</Project>
```

- [ ] **Step 2: Update Vanalytics.Data.csproj**

Remove `Microsoft.EntityFrameworkCore.SqlServer` (now provided by Soverance.Data). Add ProjectReference to Common Data:

```xml
<Project Sdk="Microsoft.NET.Sdk">

  <ItemGroup>
    <ProjectReference Include="..\Vanalytics.Core\Vanalytics.Core.csproj" />
    <ProjectReference Include="..\lib\Common\src\Soverance.Data\Soverance.Data.csproj" />
  </ItemGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.EntityFrameworkCore.Design" Version="10.0.5">
      <IncludeAssets>runtime; build; native; contentfiles; analyzers; buildtransitive</IncludeAssets>
      <PrivateAssets>all</PrivateAssets>
    </PackageReference>
  </ItemGroup>

  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
  </PropertyGroup>

</Project>
```

- [ ] **Step 3: Update Vanalytics.Core.csproj**

Add ProjectReference to Common Auth (for User model access by app-specific entities like Character):

```xml
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
  </PropertyGroup>

  <ItemGroup>
    <ProjectReference Include="..\lib\Common\src\Soverance.Auth\Soverance.Auth.csproj" />
  </ItemGroup>

</Project>
```

- [ ] **Step 4: Update test project csproj files**

Add ProjectReferences to Common projects in both test projects so they can resolve shared types.

In `tests/Vanalytics.Api.Tests/Vanalytics.Api.Tests.csproj`, add to the ProjectReference ItemGroup:
```xml
<ProjectReference Include="..\..\src\lib\Common\src\Soverance.Auth\Soverance.Auth.csproj" />
<ProjectReference Include="..\..\src\lib\Common\src\Soverance.Data\Soverance.Data.csproj" />
```

In `tests/Vanalytics.Data.Tests/Vanalytics.Data.Tests.csproj`, add to the ProjectReference ItemGroup:
```xml
<ProjectReference Include="..\..\src\lib\Common\src\Soverance.Auth\Soverance.Auth.csproj" />
<ProjectReference Include="..\..\src\lib\Common\src\Soverance.Data\Soverance.Data.csproj" />
```

- [ ] **Step 5: Verify restore**

Run: `cd "C:/Git/soverance/Vanalytics" && dotnet restore`
Expected: Restore succeeds. May have build errors (expected — source files still reference old types).

- [ ] **Step 6: Commit**

```
feat: update project references for Common shared libraries
```

---

### Task 2: Delete files replaced by shared libraries

These files are now provided by Soverance.Auth and Soverance.Data. Delete them.

**Files to delete:**
- `src/Vanalytics.Core/Models/User.cs`
- `src/Vanalytics.Core/Models/RefreshToken.cs`
- `src/Vanalytics.Core/Enums/UserRole.cs`
- `src/Vanalytics.Core/DTOs/Auth/LoginRequest.cs`
- `src/Vanalytics.Core/DTOs/Auth/RegisterRequest.cs`
- `src/Vanalytics.Core/DTOs/Auth/OAuthRequest.cs`
- `src/Vanalytics.Core/DTOs/Auth/RefreshRequest.cs`
- `src/Vanalytics.Core/DTOs/Auth/AuthResponse.cs`
- `src/Vanalytics.Core/DTOs/Auth/UserProfileResponse.cs`
- `src/Vanalytics.Data/Configurations/UserConfiguration.cs`
- `src/Vanalytics.Data/Configurations/RefreshTokenConfiguration.cs`
- `src/Vanalytics.Data/Seeding/AdminSeeder.cs`
- `src/Vanalytics.Api/Services/TokenService.cs`
- `src/Vanalytics.Api/Auth/ApiKeyAuthHandler.cs`

- [ ] **Step 1: Delete all 14 files listed above**

Use `rm` for each file. Also remove empty directories if they result (e.g., `src/Vanalytics.Core/Enums/`, `src/Vanalytics.Core/DTOs/Auth/`, `src/Vanalytics.Data/Seeding/`, `src/Vanalytics.Api/Auth/`).

- [ ] **Step 2: Commit**

```
refactor: remove files replaced by Soverance.Common shared libraries
```

---

### Task 3: Update VanalyticsDbContext to inherit from SoveranceDbContextBase

**Files:**
- Modify: `src/Vanalytics.Data/VanalyticsDbContext.cs`

- [ ] **Step 1: Rewrite VanalyticsDbContext**

Remove `Users` and `RefreshTokens` DbSets (now inherited from base). Change base class. Override `OnModelCreating` to call base first (applies shared configs), then apply Vanalytics-specific configs:

```csharp
using Microsoft.EntityFrameworkCore;
using Soverance.Data;
using Vanalytics.Core.Models;

namespace Vanalytics.Data;

public class VanalyticsDbContext(DbContextOptions<VanalyticsDbContext> options)
    : SoveranceDbContextBase(options)
{
    public DbSet<Character> Characters => Set<Character>();
    public DbSet<CharacterJob> CharacterJobs => Set<CharacterJob>();
    public DbSet<EquippedGear> EquippedGear => Set<EquippedGear>();
    public DbSet<CraftingSkill> CraftingSkills => Set<CraftingSkill>();
    public DbSet<GameServer> GameServers => Set<GameServer>();
    public DbSet<GameItem> GameItems => Set<GameItem>();
    public DbSet<ServerStatusChange> ServerStatusChanges => Set<ServerStatusChange>();
    public DbSet<AuctionSale> AuctionSales => Set<AuctionSale>();
    public DbSet<BazaarPresence> BazaarPresences => Set<BazaarPresence>();
    public DbSet<BazaarListing> BazaarListings => Set<BazaarListing>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder); // Applies shared configs (User, RefreshToken, SamlConfig, SamlRoleMapping)
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(VanalyticsDbContext).Assembly); // Vanalytics-specific configs
    }
}
```

- [ ] **Step 2: Commit**

```
refactor: VanalyticsDbContext inherits from SoveranceDbContextBase
```

---

### Task 4: Update CharacterConfiguration for shared User model

The shared User model no longer has a `Characters` navigation property (app-specific nav properties are configured from the entity side only). Change `WithMany(u => u.Characters)` to `WithMany()`.

**Files:**
- Modify: `src/Vanalytics.Data/Configurations/CharacterConfiguration.cs`

- [ ] **Step 1: Update the User relationship**

Change this line:
```csharp
builder.HasOne(c => c.User)
    .WithMany(u => u.Characters)
```
To:
```csharp
builder.HasOne(c => c.User)
    .WithMany()
```

Also update the `using` statement: change `using Vanalytics.Core.Models;` — this stays the same since `Character` is still in Vanalytics.Core.Models. But we also need `using Soverance.Auth.Models;` for User. Actually, since the `HasOne(c => c.User)` infers the User type from the Character entity's property, no explicit using for User is needed here. Just ensure the existing using stays.

- [ ] **Step 2: Commit**

```
refactor: configure Character→User relationship without shared User nav property
```

---

### Task 5: Update namespace references across Core models

Files in `Vanalytics.Core.Models` that reference `User` or `UserRole` need updated imports.

**Files:**
- Modify: `src/Vanalytics.Core/Models/Character.cs` — change `using Vanalytics.Core.Enums;` to nothing (UserRole is no longer used here), ensure `User` nav property type resolves via `using Soverance.Auth.Models;`

- [ ] **Step 1: Update Character.cs**

The Character model has `public User User { get; set; }` and `public Guid UserId { get; set; }`. Since User is now in `Soverance.Auth.Models`:

Replace `using Vanalytics.Core.Enums;` (if present) with `using Soverance.Auth.Models;`.

If Character.cs doesn't import UserRole directly, just add `using Soverance.Auth.Models;` for the User type.

- [ ] **Step 2: Check and update other Core models that reference User**

Grep for `using Vanalytics.Core.Models` in files that reference User and ensure they compile. The key files are Character.cs and any models with a UserId FK.

- [ ] **Step 3: Commit**

```
refactor: update Core model namespace references for shared User
```

---

### Task 6: Update namespace references across Data configurations

All configurations that reference `User`, `RefreshToken`, or `UserRole` need updated imports.

**Files to check and update:**
- `src/Vanalytics.Data/Configurations/CharacterConfiguration.cs` — may need `using Soverance.Auth.Models;`
- Any other configuration files that reference User (grep for `User` or `UserRole` in Configurations/)

- [ ] **Step 1: Update using statements in all configuration files**

For each configuration file that references types from the old `Vanalytics.Core.Models` or `Vanalytics.Core.Enums` namespaces for User/RefreshToken/UserRole, add `using Soverance.Auth.Models;` and remove the old using if it was only there for those types.

Files that only use app-specific types (Character, GameServer, etc.) from `Vanalytics.Core.Models` keep their existing imports unchanged.

- [ ] **Step 2: Commit**

```
refactor: update Data configuration namespace references
```

---

### Task 7: Update Program.cs to use shared extensions and services

**Files:**
- Modify: `src/Vanalytics.Api/Program.cs`

- [ ] **Step 1: Rewrite Program.cs**

Key changes:
1. Replace inline DB config with `AddSoveranceSqlServer<VanalyticsDbContext>()`
2. Replace inline JWT + ApiKey auth with `AddSoveranceJwtAuth()` + `AddSoveranceApiKeyAuth()`
3. Replace `TokenService` singleton registration (now done by `AddSoveranceJwtAuth`)
4. Replace `BCrypt.Net.BCrypt.HashPassword()` with `PasswordHasher.HashPassword()`
5. Replace `AdminSeeder.SeedAsync(db, ...)` import — class moved to `Soverance.Auth.Services`
6. Remove `using Vanalytics.Api.Auth;`, `using Vanalytics.Api.Services;` (for TokenService), `using Vanalytics.Data.Seeding;`
7. Add `using Soverance.Auth.Extensions;`, `using Soverance.Auth.Services;`, `using Soverance.Data.Extensions;`

```csharp
using Microsoft.OpenApi.Models;
using Scalar.AspNetCore;
using Soverance.Auth.Extensions;
using Soverance.Auth.Services;
using Soverance.Data.Extensions;
using Vanalytics.Api.Services;
using Vanalytics.Data;

var builder = WebApplication.CreateBuilder(args);

// Database (shared extension with retry logic)
builder.Services.AddSoveranceSqlServer<VanalyticsDbContext>(builder.Configuration);

// Authentication (shared JWT + API key)
builder.Services.AddSoveranceJwtAuth(builder.Configuration)
    .AddSoveranceApiKeyAuth();

builder.Services.AddAuthorization();
builder.Services.AddControllers();
builder.Services.AddHttpClient();

builder.Services.AddOpenApi("v1", options =>
{
    options.AddDocumentTransformer((document, context, ct) =>
    {
        document.Info = new OpenApiInfo
        {
            Title = "Vanalytics API",
            Version = "v1",
            Description = "FFXI character tracking and game data API"
        };
        document.Components ??= new OpenApiComponents();
        document.Components.SecuritySchemes["BearerAuth"] = new OpenApiSecurityScheme
        {
            Type = SecuritySchemeType.Http,
            Scheme = "bearer",
            BearerFormat = "JWT",
            Description = "JWT access token. Obtain via POST /api/auth/login or /api/auth/register."
        };
        document.Components.SecuritySchemes["ApiKeyAuth"] = new OpenApiSecurityScheme
        {
            Type = SecuritySchemeType.ApiKey,
            In = ParameterLocation.Header,
            Name = "X-Api-Key",
            Description = "API key for addon sync endpoints. Generate via POST /api/keys/generate."
        };
        return Task.CompletedTask;
    });
});

// Services
builder.Services.AddScoped<OAuthService>();
builder.Services.AddSingleton<RateLimiter>();
builder.Services.AddSingleton<EconomyRateLimiter>();
builder.Services.AddHttpClient("PlayOnline", client =>
{
    client.Timeout = TimeSpan.FromSeconds(15);
});
builder.Services.AddHostedService<ServerStatusScraper>();
builder.Services.AddHostedService<ItemImageDownloader>();
builder.Services.AddHostedService<ItemDatabaseSyncJob>();
builder.Services.AddHostedService<BazaarStalenessJob>();

var app = builder.Build();

// Apply migrations and seed admin on startup
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();

    await db.Database.MigrateAsync();

    var adminEmail = app.Configuration["ADMIN_EMAIL"];
    var adminUsername = app.Configuration["ADMIN_USERNAME"];
    var adminPassword = app.Configuration["ADMIN_PASSWORD"];

    if (!string.IsNullOrEmpty(adminEmail) &&
        !string.IsNullOrEmpty(adminUsername) &&
        !string.IsNullOrEmpty(adminPassword))
    {
        var hash = PasswordHasher.HashPassword(adminPassword);
        await AdminSeeder.SeedAsync(db, adminEmail, adminUsername, hash, logger);
    }

    // Seed item database (skip in integration tests via config)
    if (!string.Equals(app.Configuration["SKIP_ITEM_SEED"], "true", StringComparison.OrdinalIgnoreCase))
    {
        var httpFactory = scope.ServiceProvider.GetRequiredService<IHttpClientFactory>();
        await ItemDatabaseSeeder.SeedAsync(db, httpFactory, logger);
    }
}

// HTTPS redirection in production
if (!app.Environment.IsDevelopment() &&
    !string.Equals(app.Configuration["DISABLE_HTTPS_REDIRECT"], "true", StringComparison.OrdinalIgnoreCase))
{
    app.UseHttpsRedirection();
}

// Serve item images as static files
var itemImagesPath = app.Configuration["ItemImages:BasePath"]
    ?? Path.Combine(AppContext.BaseDirectory, "item-images");
Directory.CreateDirectory(itemImagesPath);
{
    app.UseStaticFiles(new StaticFileOptions
    {
        FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(itemImagesPath),
        RequestPath = "/item-images"
    });
}

app.UseAuthentication();
app.UseAuthorization();
app.MapOpenApi();
app.MapScalarApiReference("/api/docs", options =>
{
    options.Title = "Vanalytics API";
});
app.MapControllers();
app.MapGet("/health", () => Results.Ok(new { status = "healthy" }));

app.Run();

// Make Program class accessible for WebApplicationFactory in tests
public partial class Program { }
```

- [ ] **Step 2: Commit**

```
refactor: use shared auth/data extensions in Program.cs
```

---

### Task 8: Update AuthController to use shared types

**Files:**
- Modify: `src/Vanalytics.Api/Controllers/AuthController.cs`

- [ ] **Step 1: Update namespace imports and type references**

Replace:
```csharp
using Vanalytics.Api.Services;
using Vanalytics.Core.DTOs.Auth;
using Vanalytics.Core.Models;
```
With:
```csharp
using Soverance.Auth.DTOs;
using Soverance.Auth.Models;
using Soverance.Auth.Services;
using Vanalytics.Api.Services;
```

The controller uses `TokenService`, `User`, `RefreshToken`, `LoginRequest`, `RegisterRequest`, `OAuthRequest`, `RefreshRequest`, `AuthResponse`, `UserProfileResponse` — all now from `Soverance.Auth`.

Replace `BCrypt.Net.BCrypt.HashPassword(request.Password)` with `PasswordHasher.HashPassword(request.Password)` and `BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash)` with `PasswordHasher.VerifyPassword(request.Password, user.PasswordHash)`.

The `VanalyticsDbContext` import stays — it's still the concrete context used for DI injection.

- [ ] **Step 2: Commit**

```
refactor: AuthController uses shared auth types and PasswordHasher
```

---

### Task 9: Update remaining controllers for namespace changes

**Files:**
- Modify: `src/Vanalytics.Api/Controllers/AdminUsersController.cs`
- Modify: `src/Vanalytics.Api/Controllers/KeysController.cs`
- Modify: `src/Vanalytics.Api/Controllers/ProfilesController.cs`
- Modify: `src/Vanalytics.Api/Controllers/CharactersController.cs`
- Modify: `src/Vanalytics.Api/Controllers/SyncController.cs`
- Modify: `src/Vanalytics.Api/Services/OAuthService.cs`

- [ ] **Step 1: Update AdminUsersController.cs**

Replace `using Vanalytics.Core.Enums;` with `using Soverance.Auth.Models;` (for UserRole enum).
Replace `using Vanalytics.Core.Models;` with `using Soverance.Auth.Models;` if it only uses User. If it also uses app-specific models, keep both imports.

- [ ] **Step 2: Update KeysController.cs**

Replace `using Vanalytics.Core.Models;` — add `using Soverance.Auth.Models;` for User, keep Vanalytics.Core.Models if it uses other types.
Replace any `BCrypt.Net.BCrypt` calls with `PasswordHasher` equivalents. Add `using Soverance.Auth.Services;`.

- [ ] **Step 3: Update other controllers**

For each controller that imports `Vanalytics.Core.Models` for User or `Vanalytics.Core.Enums` for UserRole:
- Add `using Soverance.Auth.Models;`
- Remove the old using if it was only needed for those shared types
- Keep `using Vanalytics.Core.Models;` if the controller also uses app-specific types (Character, etc.)

For `OAuthService.cs` — no changes needed unless it directly references User or auth types (it likely uses `OAuthUserInfo` which is a local type).

- [ ] **Step 4: Build to check**

Run: `cd "C:/Git/soverance/Vanalytics" && dotnet build`
Expected: May still have errors in test projects. Fix any remaining namespace issues.

- [ ] **Step 5: Commit**

```
refactor: update controller namespace references for shared types
```

---

### Task 10: Update test projects for namespace changes

**Files:**
- Modify: `tests/Vanalytics.Api.Tests/Controllers/AuthControllerTests.cs`
- Modify: `tests/Vanalytics.Api.Tests/Services/TokenServiceTests.cs`
- Modify: `tests/Vanalytics.Api.Tests/Controllers/KeysControllerTests.cs`
- Modify: `tests/Vanalytics.Api.Tests/Controllers/SyncControllerTests.cs`
- Modify: `tests/Vanalytics.Api.Tests/Controllers/CharactersControllerTests.cs`
- Modify: `tests/Vanalytics.Api.Tests/Controllers/ProfilesControllerTests.cs`
- Modify: `tests/Vanalytics.Api.Tests/Controllers/EconomyControllerTests.cs`
- Modify: `tests/Vanalytics.Data.Tests/SchemaTests.cs`

- [ ] **Step 1: Update using statements in all test files**

Apply the same namespace migration as the source code:
- `Vanalytics.Core.Models.User` → `Soverance.Auth.Models.User`
- `Vanalytics.Core.Enums.UserRole` → `Soverance.Auth.Models.UserRole`
- `Vanalytics.Core.DTOs.Auth.*` → `Soverance.Auth.DTOs.*`
- `Vanalytics.Api.Services.TokenService` → `Soverance.Auth.Services.TokenService`

TokenServiceTests.cs creates a `TokenService` directly — ensure the import points to `Soverance.Auth.Services.TokenService`.

SchemaTests.cs creates `User` objects — ensure it imports `Soverance.Auth.Models`.

- [ ] **Step 2: Build entire solution**

Run: `cd "C:/Git/soverance/Vanalytics" && dotnet build`
Expected: Build succeeded, 0 errors.

- [ ] **Step 3: Run tests**

Run: `cd "C:/Git/soverance/Vanalytics" && dotnet test --no-build`
Expected: All tests pass. (Integration tests may be skipped if Docker/Testcontainers isn't available.)

- [ ] **Step 4: Commit**

```
refactor: update test namespace references for shared types
```

---

### Task 11: Update Dockerfile for submodule

The Dockerfile's restore step needs to COPY the Common project csproj files so `dotnet restore` can resolve the new project references.

**Files:**
- Modify: `src/Vanalytics.Api/Dockerfile`

- [ ] **Step 1: Update Dockerfile**

Add COPY lines for the Common csproj files before the restore step:

```dockerfile
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS base
WORKDIR /app
EXPOSE 8080

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY ["src/lib/Common/src/Soverance.Auth/Soverance.Auth.csproj", "src/lib/Common/src/Soverance.Auth/"]
COPY ["src/lib/Common/src/Soverance.Data/Soverance.Data.csproj", "src/lib/Common/src/Soverance.Data/"]
COPY ["src/Vanalytics.Core/Vanalytics.Core.csproj", "src/Vanalytics.Core/"]
COPY ["src/Vanalytics.Data/Vanalytics.Data.csproj", "src/Vanalytics.Data/"]
COPY ["src/Vanalytics.Api/Vanalytics.Api.csproj", "src/Vanalytics.Api/"]
RUN dotnet restore "src/Vanalytics.Api/Vanalytics.Api.csproj"
COPY . .
RUN dotnet publish "src/Vanalytics.Api/Vanalytics.Api.csproj" -c Release -o /app/publish

FROM base AS final
WORKDIR /app
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "Vanalytics.Api.dll"]
```

The `COPY . .` step copies the entire build context (repo root) which includes the submodule at `src/lib/Common/`.

- [ ] **Step 2: Commit**

```
build: update Dockerfile to include Common submodule csproj files
```

---

### Task 12: Update deploy.yml for submodule checkout

**Files:**
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: Add submodules: recursive to checkout**

In the build job's checkout step, add `submodules: recursive`:

```yaml
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
          submodules: recursive
```

- [ ] **Step 2: Commit**

```
ci: add submodule checkout to deploy pipeline
```

---

### Task 13: Final build verification

- [ ] **Step 1: Clean build**

Run: `cd "C:/Git/soverance/Vanalytics" && dotnet build --no-incremental`
Expected: Build succeeded, 0 errors, 0 warnings (or only expected warnings).

- [ ] **Step 2: Run all tests**

Run: `cd "C:/Git/soverance/Vanalytics" && dotnet test`
Expected: All tests pass.

- [ ] **Step 3: Verify deleted files are gone**

Confirm these directories/files no longer exist:
- `src/Vanalytics.Core/Enums/`
- `src/Vanalytics.Core/DTOs/Auth/`
- `src/Vanalytics.Data/Seeding/`
- `src/Vanalytics.Api/Auth/`
- `src/Vanalytics.Api/Services/TokenService.cs`

- [ ] **Step 4: Note for Scott — EF Migration needed**

After all code changes are committed, Scott should scaffold the EF migration:
```bash
cd src/Vanalytics.Api
dotnet ef migrations add CommonIntegration --project ../Vanalytics.Data
```

This migration will:
- Add `IsEnabled` column to `Users` table (BIT, default true)
- Add `SamlConfigs` table
- Add `SamlRoleMappings` table

The migration should be auto-scaffoldable — no manual SQL blocks needed since the User table schema is otherwise identical.

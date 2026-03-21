# Vanalytics Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the .NET 10 solution, define the domain model, configure EF Core with SQL Server, stand up Docker Compose for local dev, and seed the admin user.

**Architecture:** Three-project clean architecture (Core for domain, Data for EF Core persistence, Api for HTTP host). SQL Server 2022 Linux container for local development. Docker Compose orchestrates the API and database.

**Tech Stack:** .NET 10, EF Core (SQL Server provider), Docker Compose, SQL Server 2022 Linux, xUnit + Testcontainers for integration tests.

**Spec:** `docs/specs/2026-03-20-vanalytics-mvp-design.md`

---

## File Structure

```
Vanalytics/
├── Vanalytics.sln
├── .dockerignore
├── docker-compose.yml
├── src/
│   ├── Vanalytics.Core/
│   │   ├── Vanalytics.Core.csproj
│   │   ├── Enums/
│   │   │   ├── JobType.cs
│   │   │   ├── EquipSlot.cs
│   │   │   ├── CraftType.cs
│   │   │   └── LicenseStatus.cs
│   │   └── Models/
│   │       ├── User.cs
│   │       ├── Character.cs
│   │       ├── CharacterJob.cs
│   │       ├── EquippedGear.cs
│   │       └── CraftingSkill.cs
│   ├── Vanalytics.Data/
│   │   ├── Vanalytics.Data.csproj
│   │   ├── VanalyticsDbContext.cs
│   │   └── Configurations/
│   │       ├── UserConfiguration.cs
│   │       ├── CharacterConfiguration.cs
│   │       ├── CharacterJobConfiguration.cs
│   │       ├── EquippedGearConfiguration.cs
│   │       └── CraftingSkillConfiguration.cs
│   └── Vanalytics.Api/
│       ├── Vanalytics.Api.csproj
│       ├── Program.cs
│       ├── Dockerfile
│       ├── appsettings.json
│       └── appsettings.Development.json
└── tests/
    └── Vanalytics.Data.Tests/
        ├── Vanalytics.Data.Tests.csproj
        └── SchemaTests.cs
```

---

### Task 1: Scaffold .NET Solution and Projects

**Files:**
- Create: `Vanalytics.sln`
- Create: `src/Vanalytics.Core/Vanalytics.Core.csproj`
- Create: `src/Vanalytics.Data/Vanalytics.Data.csproj`
- Create: `src/Vanalytics.Api/Vanalytics.Api.csproj`

- [ ] **Step 1: Create the Core class library**

```bash
dotnet new classlib -n Vanalytics.Core -o src/Vanalytics.Core -f net10.0
rm src/Vanalytics.Core/Class1.cs
```

- [ ] **Step 2: Create the Data class library**

```bash
dotnet new classlib -n Vanalytics.Data -o src/Vanalytics.Data -f net10.0
rm src/Vanalytics.Data/Class1.cs
```

- [ ] **Step 3: Create the Api web project**

```bash
dotnet new webapi -n Vanalytics.Api -o src/Vanalytics.Api -f net10.0 --no-openapi
```

Remove the generated `WeatherForecast` boilerplate if present.

- [ ] **Step 4: Create the solution and add projects**

```bash
dotnet new sln -n Vanalytics
dotnet sln add src/Vanalytics.Core/Vanalytics.Core.csproj
dotnet sln add src/Vanalytics.Data/Vanalytics.Data.csproj
dotnet sln add src/Vanalytics.Api/Vanalytics.Api.csproj
```

- [ ] **Step 5: Add project references**

```bash
# Data depends on Core
dotnet add src/Vanalytics.Data/Vanalytics.Data.csproj reference src/Vanalytics.Core/Vanalytics.Core.csproj

# Api depends on Core and Data
dotnet add src/Vanalytics.Api/Vanalytics.Api.csproj reference src/Vanalytics.Core/Vanalytics.Core.csproj
dotnet add src/Vanalytics.Api/Vanalytics.Api.csproj reference src/Vanalytics.Data/Vanalytics.Data.csproj
```

- [ ] **Step 6: Add NuGet packages to Data project**

```bash
dotnet add src/Vanalytics.Data/Vanalytics.Data.csproj package Microsoft.EntityFrameworkCore.SqlServer
dotnet add src/Vanalytics.Data/Vanalytics.Data.csproj package Microsoft.EntityFrameworkCore.Design
```

- [ ] **Step 7: Add EF Core Design package to Api project (for migrations CLI)**

```bash
dotnet add src/Vanalytics.Api/Vanalytics.Api.csproj package Microsoft.EntityFrameworkCore.Design
```

- [ ] **Step 8: Verify the solution builds**

```bash
dotnet build Vanalytics.sln
```

Expected: Build succeeded with 0 errors.

- [ ] **Step 9: Commit**

```bash
git add Vanalytics.sln src/Vanalytics.Core/ src/Vanalytics.Data/ src/Vanalytics.Api/
git commit -m "feat: scaffold .NET solution with Core, Data, and Api projects"
```

---

### Task 2: Define Domain Enums

**Files:**
- Create: `src/Vanalytics.Core/Enums/JobType.cs`
- Create: `src/Vanalytics.Core/Enums/EquipSlot.cs`
- Create: `src/Vanalytics.Core/Enums/CraftType.cs`
- Create: `src/Vanalytics.Core/Enums/LicenseStatus.cs`

- [ ] **Step 1: Create JobType enum**

```csharp
// src/Vanalytics.Core/Enums/JobType.cs
namespace Vanalytics.Core.Enums;

public enum JobType
{
    WAR, MNK, WHM, BLM, RDM, THF,
    PLD, DRK, BST, BRD, RNG, SAM,
    NIN, DRG, SMN, BLU, COR, PUP,
    DNC, SCH, GEO, RUN
}
```

- [ ] **Step 2: Create EquipSlot enum**

```csharp
// src/Vanalytics.Core/Enums/EquipSlot.cs
namespace Vanalytics.Core.Enums;

public enum EquipSlot
{
    Main, Sub, Range, Ammo,
    Head, Body, Hands, Legs, Feet,
    Neck, Waist, Back,
    Ring1, Ring2, Ear1, Ear2
}
```

- [ ] **Step 3: Create CraftType enum**

```csharp
// src/Vanalytics.Core/Enums/CraftType.cs
namespace Vanalytics.Core.Enums;

public enum CraftType
{
    Woodworking, Smithing, Goldsmithing,
    Clothcraft, Leathercraft, Bonecraft,
    Alchemy, Cooking, Fishing
}
```

- [ ] **Step 4: Create LicenseStatus enum**

```csharp
// src/Vanalytics.Core/Enums/LicenseStatus.cs
namespace Vanalytics.Core.Enums;

public enum LicenseStatus
{
    Unlicensed, Active, Expired
}
```

- [ ] **Step 5: Verify build**

```bash
dotnet build src/Vanalytics.Core/Vanalytics.Core.csproj
```

Expected: Build succeeded.

- [ ] **Step 6: Commit**

```bash
git add src/Vanalytics.Core/Enums/
git commit -m "feat: add domain enums (JobType, EquipSlot, CraftType, LicenseStatus)"
```

---

### Task 3: Define Domain Models

> **Note:** OAuth-related fields (external provider ID, provider name) on the User model are deferred to Plan 2 (Auth). A migration will be added at that time. The User model here matches the spec's Users table exactly.

**Files:**
- Create: `src/Vanalytics.Core/Models/User.cs`
- Create: `src/Vanalytics.Core/Models/Character.cs`
- Create: `src/Vanalytics.Core/Models/CharacterJob.cs`
- Create: `src/Vanalytics.Core/Models/EquippedGear.cs`
- Create: `src/Vanalytics.Core/Models/CraftingSkill.cs`

- [ ] **Step 1: Create User model**

```csharp
// src/Vanalytics.Core/Models/User.cs
namespace Vanalytics.Core.Models;

public class User
{
    public Guid Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string? PasswordHash { get; set; }
    public string? ApiKey { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public List<Character> Characters { get; set; } = [];
}
```

- [ ] **Step 2: Create Character model**

```csharp
// src/Vanalytics.Core/Models/Character.cs
using Vanalytics.Core.Enums;

namespace Vanalytics.Core.Models;

public class Character
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Server { get; set; } = string.Empty;
    public LicenseStatus LicenseStatus { get; set; } = LicenseStatus.Unlicensed;
    public bool IsPublic { get; set; }
    public DateTimeOffset? LastSyncAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public User User { get; set; } = null!;
    public List<CharacterJob> Jobs { get; set; } = [];
    public List<EquippedGear> Gear { get; set; } = [];
    public List<CraftingSkill> CraftingSkills { get; set; } = [];
}
```

- [ ] **Step 3: Create CharacterJob model**

```csharp
// src/Vanalytics.Core/Models/CharacterJob.cs
using Vanalytics.Core.Enums;

namespace Vanalytics.Core.Models;

public class CharacterJob
{
    public Guid Id { get; set; }
    public Guid CharacterId { get; set; }
    public JobType JobId { get; set; }
    public int Level { get; set; }
    public bool IsActive { get; set; }

    public Character Character { get; set; } = null!;
}
```

- [ ] **Step 4: Create EquippedGear model**

```csharp
// src/Vanalytics.Core/Models/EquippedGear.cs
using Vanalytics.Core.Enums;

namespace Vanalytics.Core.Models;

public class EquippedGear
{
    public Guid Id { get; set; }
    public Guid CharacterId { get; set; }
    public EquipSlot Slot { get; set; }
    public string ItemName { get; set; } = string.Empty;
    public int ItemId { get; set; }

    public Character Character { get; set; } = null!;
}
```

- [ ] **Step 5: Create CraftingSkill model**

```csharp
// src/Vanalytics.Core/Models/CraftingSkill.cs
using Vanalytics.Core.Enums;

namespace Vanalytics.Core.Models;

public class CraftingSkill
{
    public Guid Id { get; set; }
    public Guid CharacterId { get; set; }
    public CraftType Craft { get; set; }
    public int Level { get; set; }
    public string Rank { get; set; } = string.Empty;

    public Character Character { get; set; } = null!;
}
```

- [ ] **Step 6: Verify build**

```bash
dotnet build src/Vanalytics.Core/Vanalytics.Core.csproj
```

Expected: Build succeeded.

- [ ] **Step 7: Commit**

```bash
git add src/Vanalytics.Core/Models/
git commit -m "feat: add domain models (User, Character, CharacterJob, EquippedGear, CraftingSkill)"
```

---

### Task 4: Configure EF Core DbContext and Entity Configurations

**Files:**
- Create: `src/Vanalytics.Data/VanalyticsDbContext.cs`
- Create: `src/Vanalytics.Data/Configurations/UserConfiguration.cs`
- Create: `src/Vanalytics.Data/Configurations/CharacterConfiguration.cs`
- Create: `src/Vanalytics.Data/Configurations/CharacterJobConfiguration.cs`
- Create: `src/Vanalytics.Data/Configurations/EquippedGearConfiguration.cs`
- Create: `src/Vanalytics.Data/Configurations/CraftingSkillConfiguration.cs`

- [ ] **Step 1: Create the DbContext**

```csharp
// src/Vanalytics.Data/VanalyticsDbContext.cs
using Microsoft.EntityFrameworkCore;
using Vanalytics.Core.Models;

namespace Vanalytics.Data;

public class VanalyticsDbContext(DbContextOptions<VanalyticsDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Character> Characters => Set<Character>();
    public DbSet<CharacterJob> CharacterJobs => Set<CharacterJob>();
    public DbSet<EquippedGear> EquippedGear => Set<EquippedGear>();
    public DbSet<CraftingSkill> CraftingSkills => Set<CraftingSkill>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(VanalyticsDbContext).Assembly);
    }
}
```

- [ ] **Step 2: Create UserConfiguration**

```csharp
// src/Vanalytics.Data/Configurations/UserConfiguration.cs
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class UserConfiguration : IEntityTypeConfiguration<User>
{
    public void Configure(EntityTypeBuilder<User> builder)
    {
        builder.HasKey(u => u.Id);
        builder.HasIndex(u => u.Email).IsUnique();
        builder.HasIndex(u => u.Username).IsUnique();
        builder.HasIndex(u => u.ApiKey).IsUnique().HasFilter("[ApiKey] IS NOT NULL");

        builder.Property(u => u.Email).HasMaxLength(256).IsRequired();
        builder.Property(u => u.Username).HasMaxLength(64).IsRequired();
        builder.Property(u => u.PasswordHash).HasMaxLength(256);
        builder.Property(u => u.ApiKey).HasMaxLength(128);
    }
}
```

- [ ] **Step 3: Create CharacterConfiguration**

```csharp
// src/Vanalytics.Data/Configurations/CharacterConfiguration.cs
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class CharacterConfiguration : IEntityTypeConfiguration<Character>
{
    public void Configure(EntityTypeBuilder<Character> builder)
    {
        builder.HasKey(c => c.Id);
        builder.HasIndex(c => new { c.Name, c.Server }).IsUnique();

        builder.Property(c => c.Name).HasMaxLength(64).IsRequired();
        builder.Property(c => c.Server).HasMaxLength(64).IsRequired();
        builder.Property(c => c.LicenseStatus)
            .HasConversion<string>()
            .HasMaxLength(32)
            .HasDefaultValue(Core.Enums.LicenseStatus.Unlicensed);

        builder.HasOne(c => c.User)
            .WithMany(u => u.Characters)
            .HasForeignKey(c => c.UserId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
```

- [ ] **Step 4: Create CharacterJobConfiguration**

```csharp
// src/Vanalytics.Data/Configurations/CharacterJobConfiguration.cs
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class CharacterJobConfiguration : IEntityTypeConfiguration<CharacterJob>
{
    public void Configure(EntityTypeBuilder<CharacterJob> builder)
    {
        builder.HasKey(j => j.Id);
        builder.HasIndex(j => new { j.CharacterId, j.JobId }).IsUnique();

        builder.Property(j => j.JobId)
            .HasConversion<string>()
            .HasMaxLength(3);

        builder.HasOne(j => j.Character)
            .WithMany(c => c.Jobs)
            .HasForeignKey(j => j.CharacterId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
```

- [ ] **Step 5: Create EquippedGearConfiguration**

```csharp
// src/Vanalytics.Data/Configurations/EquippedGearConfiguration.cs
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class EquippedGearConfiguration : IEntityTypeConfiguration<EquippedGear>
{
    public void Configure(EntityTypeBuilder<EquippedGear> builder)
    {
        builder.HasKey(g => g.Id);
        builder.HasIndex(g => new { g.CharacterId, g.Slot }).IsUnique();

        builder.Property(g => g.Slot)
            .HasConversion<string>()
            .HasMaxLength(16);
        builder.Property(g => g.ItemName).HasMaxLength(128).IsRequired();

        builder.HasOne(g => g.Character)
            .WithMany(c => c.Gear)
            .HasForeignKey(g => g.CharacterId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
```

- [ ] **Step 6: Create CraftingSkillConfiguration**

```csharp
// src/Vanalytics.Data/Configurations/CraftingSkillConfiguration.cs
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class CraftingSkillConfiguration : IEntityTypeConfiguration<CraftingSkill>
{
    public void Configure(EntityTypeBuilder<CraftingSkill> builder)
    {
        builder.HasKey(s => s.Id);
        builder.HasIndex(s => new { s.CharacterId, s.Craft }).IsUnique();

        builder.Property(s => s.Craft)
            .HasConversion<string>()
            .HasMaxLength(32);
        builder.Property(s => s.Rank).HasMaxLength(64).IsRequired();

        builder.HasOne(s => s.Character)
            .WithMany(c => c.CraftingSkills)
            .HasForeignKey(s => s.CharacterId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
```

- [ ] **Step 7: Verify build**

```bash
dotnet build src/Vanalytics.Data/Vanalytics.Data.csproj
```

Expected: Build succeeded.

- [ ] **Step 8: Commit**

```bash
git add src/Vanalytics.Data/
git commit -m "feat: add EF Core DbContext and entity configurations"
```

---

### Task 5: Docker Compose for Local Development

> **Note:** The spec also lists a `web` (React dev server) service and `docker-compose.prod.yml`. Both are deferred to later plans when the frontend and infrastructure are implemented.

**Files:**
- Create: `.dockerignore`
- Create: `docker-compose.yml`
- Create: `src/Vanalytics.Api/Dockerfile`
- Create: `src/Vanalytics.Api/appsettings.json` (modify generated)
- Create: `src/Vanalytics.Api/appsettings.Development.json` (modify generated)

- [ ] **Step 1: Create .dockerignore**

```
# .dockerignore
**/bin/
**/obj/
**/node_modules/
.git/
.github/
docs/
tests/
addon/
infra/
*.md
.dockerignore
docker-compose*.yml
```

- [ ] **Step 2: Create the API Dockerfile**

```dockerfile
# src/Vanalytics.Api/Dockerfile
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS base
WORKDIR /app
EXPOSE 8080

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
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

- [ ] **Step 3: Create docker-compose.yml**

```yaml
# docker-compose.yml
services:
  db:
    image: mcr.microsoft.com/mssql/server:2022-latest
    environment:
      ACCEPT_EULA: "Y"
      MSSQL_SA_PASSWORD: "VanalyticsD3v!"
    ports:
      - "1433:1433"
    volumes:
      - sqldata:/var/opt/mssql
    healthcheck:
      test: /opt/mssql-tools2/bin/sqlcmd -S localhost -U sa -P 'VanalyticsD3v!' -Q 'SELECT 1' -b
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 15s

  api:
    build:
      context: .
      dockerfile: src/Vanalytics.Api/Dockerfile
    ports:
      - "5000:8080"
    environment:
      ConnectionStrings__DefaultConnection: "Server=db;Database=Vanalytics;User Id=sa;Password=VanalyticsD3v!;TrustServerCertificate=True"
      ADMIN_EMAIL: "admin@vanalytics.com"
      ADMIN_USERNAME: "admin"
      ADMIN_PASSWORD: "Admin123!"
    depends_on:
      db:
        condition: service_healthy

volumes:
  sqldata:
```

- [ ] **Step 4: Update appsettings.json**

```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning"
    }
  },
  "AllowedHosts": "*",
  "ConnectionStrings": {
    "DefaultConnection": ""
  }
}
```

- [ ] **Step 5: Update appsettings.Development.json**

```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Information"
    }
  },
  "ConnectionStrings": {
    "DefaultConnection": "Server=localhost;Database=Vanalytics;User Id=sa;Password=VanalyticsD3v!;TrustServerCertificate=True"
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add .dockerignore docker-compose.yml src/Vanalytics.Api/Dockerfile src/Vanalytics.Api/appsettings*.json
git commit -m "feat: add Docker Compose for local dev (API + SQL Server)"
```

---

### Task 6: API Startup with EF Core and Health Check

**Files:**
- Modify: `src/Vanalytics.Api/Program.cs`

- [ ] **Step 1: Wire up EF Core and a health check endpoint in Program.cs**

```csharp
// src/Vanalytics.Api/Program.cs
using Microsoft.EntityFrameworkCore;
using Vanalytics.Data;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<VanalyticsDbContext>(options =>
    options.UseSqlServer(
        builder.Configuration.GetConnectionString("DefaultConnection"),
        sqlOptions => sqlOptions.EnableRetryOnFailure(
            maxRetryCount: 5,
            maxRetryDelay: TimeSpan.FromSeconds(10),
            errorNumbersToAdd: null)));

var app = builder.Build();

app.MapGet("/health", () => Results.Ok(new { status = "healthy" }));

app.Run();
```

- [ ] **Step 2: Verify build**

```bash
dotnet build Vanalytics.sln
```

Expected: Build succeeded.

- [ ] **Step 3: Commit**

```bash
git add src/Vanalytics.Api/Program.cs
git commit -m "feat: wire up EF Core with retry logic and health check endpoint"
```

---

### Task 7: Create Initial EF Core Migration

**Files:**
- Create: `src/Vanalytics.Data/Migrations/` (auto-generated)

- [ ] **Step 1: Install EF Core tools if not already installed**

```bash
dotnet tool install --global dotnet-ef 2>/dev/null || dotnet tool update --global dotnet-ef
```

- [ ] **Step 2: Create the initial migration**

```bash
dotnet ef migrations add InitialCreate --project src/Vanalytics.Data --startup-project src/Vanalytics.Api
```

Expected: Migration files created in `src/Vanalytics.Data/Migrations/`.

- [ ] **Step 3: Verify the migration compiles**

```bash
dotnet build Vanalytics.sln
```

Expected: Build succeeded.

- [ ] **Step 4: Commit**

```bash
git add src/Vanalytics.Data/Migrations/
git commit -m "feat: add initial EF Core migration for data model"
```

---

### Task 8: Admin Seeding Logic

**Files:**
- Create: `src/Vanalytics.Data/Seeding/AdminSeeder.cs`
- Modify: `src/Vanalytics.Api/Program.cs`

- [ ] **Step 1: Add BCrypt package to Api project**

```bash
dotnet add src/Vanalytics.Api/Vanalytics.Api.csproj package BCrypt.Net-Next
```

- [ ] **Step 2: Create AdminSeeder**

```csharp
// src/Vanalytics.Data/Seeding/AdminSeeder.cs
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Seeding;

public static class AdminSeeder
{
    public static async Task SeedAsync(
        VanalyticsDbContext db,
        string email,
        string username,
        string passwordHash,
        ILogger logger)
    {
        if (await db.Users.AnyAsync(u => u.Email == email))
        {
            logger.LogInformation("Admin user already exists, skipping seed");
            return;
        }

        var admin = new User
        {
            Id = Guid.NewGuid(),
            Email = email,
            Username = username,
            PasswordHash = passwordHash,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };

        db.Users.Add(admin);
        await db.SaveChangesAsync();
        logger.LogInformation("Admin user seeded: {Username}", username);
    }
}
```

- [ ] **Step 3: Update Program.cs to apply migrations and seed on startup**

```csharp
// src/Vanalytics.Api/Program.cs
using Microsoft.EntityFrameworkCore;
using Vanalytics.Data;
using Vanalytics.Data.Seeding;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<VanalyticsDbContext>(options =>
    options.UseSqlServer(
        builder.Configuration.GetConnectionString("DefaultConnection"),
        sqlOptions => sqlOptions.EnableRetryOnFailure(
            maxRetryCount: 5,
            maxRetryDelay: TimeSpan.FromSeconds(10),
            errorNumbersToAdd: null)));

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
        var hash = BCrypt.Net.BCrypt.HashPassword(adminPassword);
        await AdminSeeder.SeedAsync(db, adminEmail, adminUsername, hash, logger);
    }
}

app.MapGet("/health", () => Results.Ok(new { status = "healthy" }));

app.Run();
```

- [ ] **Step 4: Verify build**

```bash
dotnet build Vanalytics.sln
```

Expected: Build succeeded.

- [ ] **Step 5: Commit**

```bash
git add src/Vanalytics.Data/Seeding/ src/Vanalytics.Api/Program.cs src/Vanalytics.Api/Vanalytics.Api.csproj
git commit -m "feat: add admin seeding with BCrypt password hashing on startup"
```

---

### Task 9: Integration Tests with Testcontainers

**Files:**
- Create: `tests/Vanalytics.Data.Tests/Vanalytics.Data.Tests.csproj`
- Create: `tests/Vanalytics.Data.Tests/SchemaTests.cs`

- [ ] **Step 1: Create the test project**

```bash
dotnet new xunit -n Vanalytics.Data.Tests -o tests/Vanalytics.Data.Tests -f net10.0
dotnet sln add tests/Vanalytics.Data.Tests/Vanalytics.Data.Tests.csproj
dotnet add tests/Vanalytics.Data.Tests/Vanalytics.Data.Tests.csproj reference src/Vanalytics.Data/Vanalytics.Data.csproj
dotnet add tests/Vanalytics.Data.Tests/Vanalytics.Data.Tests.csproj reference src/Vanalytics.Core/Vanalytics.Core.csproj
```

- [ ] **Step 2: Add Testcontainers SQL Server package**

```bash
dotnet add tests/Vanalytics.Data.Tests/Vanalytics.Data.Tests.csproj package Testcontainers.MsSql
```

- [ ] **Step 3: Write the failing schema test**

```csharp
// tests/Vanalytics.Data.Tests/SchemaTests.cs
using Microsoft.EntityFrameworkCore;
using Testcontainers.MsSql;
using Vanalytics.Core.Enums;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Data.Tests;

public class SchemaTests : IAsyncLifetime
{
    private readonly MsSqlContainer _container = new MsSqlBuilder().Build();
    private VanalyticsDbContext _db = null!;

    public async Task InitializeAsync()
    {
        await _container.StartAsync();
        var options = new DbContextOptionsBuilder<VanalyticsDbContext>()
            .UseSqlServer(_container.GetConnectionString())
            .Options;
        _db = new VanalyticsDbContext(options);
        await _db.Database.MigrateAsync();
    }

    public async Task DisposeAsync()
    {
        await _db.DisposeAsync();
        await _container.DisposeAsync();
    }

    [Fact]
    public async Task CanInsertAndRetrieveFullCharacterGraph()
    {
        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = "test@example.com",
            Username = "testuser",
            PasswordHash = "hash",
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        _db.Users.Add(user);

        var character = new Character
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            Name = "Soverance",
            Server = "Asura",
            LicenseStatus = LicenseStatus.Active,
            IsPublic = true,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        _db.Characters.Add(character);

        _db.CharacterJobs.Add(new CharacterJob
        {
            Id = Guid.NewGuid(),
            CharacterId = character.Id,
            JobId = JobType.THF,
            Level = 99,
            IsActive = true
        });

        _db.EquippedGear.Add(new EquippedGear
        {
            Id = Guid.NewGuid(),
            CharacterId = character.Id,
            Slot = EquipSlot.Main,
            ItemName = "Vajra",
            ItemId = 20515
        });

        _db.CraftingSkills.Add(new CraftingSkill
        {
            Id = Guid.NewGuid(),
            CharacterId = character.Id,
            Craft = CraftType.Goldsmithing,
            Level = 110,
            Rank = "Craftsman"
        });

        await _db.SaveChangesAsync();

        var loaded = await _db.Characters
            .Include(c => c.Jobs)
            .Include(c => c.Gear)
            .Include(c => c.CraftingSkills)
            .FirstAsync(c => c.Id == character.Id);

        Assert.Equal("Soverance", loaded.Name);
        Assert.Single(loaded.Jobs);
        Assert.Equal(JobType.THF, loaded.Jobs[0].JobId);
        Assert.Single(loaded.Gear);
        Assert.Equal("Vajra", loaded.Gear[0].ItemName);
        Assert.Single(loaded.CraftingSkills);
        Assert.Equal(CraftType.Goldsmithing, loaded.CraftingSkills[0].Craft);
    }

    [Fact]
    public async Task EnforcesUniqueCharacterNamePerServer()
    {
        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = "unique@example.com",
            Username = "uniqueuser",
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        _db.Users.Add(user);

        _db.Characters.Add(new Character
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            Name = "Dupechar",
            Server = "Asura",
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        });
        await _db.SaveChangesAsync();

        _db.Characters.Add(new Character
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            Name = "Dupechar",
            Server = "Asura",
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        });

        await Assert.ThrowsAsync<DbUpdateException>(() => _db.SaveChangesAsync());
    }

    [Fact]
    public async Task EnforcesUniqueEmail()
    {
        _db.Users.Add(new User
        {
            Id = Guid.NewGuid(),
            Email = "dupe@example.com",
            Username = "user1",
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        });
        await _db.SaveChangesAsync();

        _db.Users.Add(new User
        {
            Id = Guid.NewGuid(),
            Email = "dupe@example.com",
            Username = "user2",
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        });

        await Assert.ThrowsAsync<DbUpdateException>(() => _db.SaveChangesAsync());
    }
}
```

- [ ] **Step 4: Run tests (requires Docker running)**

```bash
dotnet test tests/Vanalytics.Data.Tests/ -v normal
```

Expected: All 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add tests/Vanalytics.Data.Tests/
git commit -m "test: add integration tests for schema, constraints, and full entity graph"
```

---

### Task 10: Verify Full Stack Locally with Docker Compose

- [ ] **Step 1: Build and start Docker Compose**

```bash
docker compose up --build -d
```

Expected: Both `db` and `api` containers start.

- [ ] **Step 2: Wait for API to be ready and hit health check**

The `db` service has a healthcheck and the `api` service uses `depends_on: condition: service_healthy`, so SQL Server will be ready before the API starts. Wait a few seconds for the API to run migrations, then test:

```bash
sleep 5 && curl http://localhost:5000/health
```

Expected: `{"status":"healthy"}`. If the API isn't ready yet, retry after a few more seconds.

- [ ] **Step 3: Verify database has the seeded admin user**

```bash
docker compose exec db /opt/mssql-tools2/bin/sqlcmd -S localhost -U sa -P 'VanalyticsD3v!' -d Vanalytics -Q "SELECT Username, Email FROM Users"
```

Expected: One row with `admin` / `admin@vanalytics.com`.

- [ ] **Step 4: Tear down**

```bash
docker compose down
```

- [ ] **Step 5: Commit any cleanup (if needed), then tag completion**

```bash
git log --oneline -10
```

Verify all foundation commits are present. Plan 1 is complete.

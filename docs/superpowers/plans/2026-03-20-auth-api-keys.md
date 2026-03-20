# Auth & API Keys Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement authentication (local + OAuth) with JWT tokens, and API key management for Windower addon authorization.

**Architecture:** ASP.NET Core JWT Bearer authentication for web UI, custom API key auth handler for addon sync. Local auth uses BCrypt (already installed). OAuth uses manual token exchange (SPA sends authorization code, API exchanges it with provider). Refresh tokens stored in database. API keys are per-user, single active key.

**Tech Stack:** ASP.NET Core Authentication, JWT Bearer, BCrypt.Net-Next (existing), HttpClient for OAuth token exchange, EF Core (existing).

**Spec:** `docs/specs/2026-03-20-vanalytics-mvp-design.md` — sections: Authentication, API Design (Auth + API Keys)

**Builds on:** Plan 1 Foundation (User model, DbContext, migrations, BCrypt, Docker Compose)

---

## File Structure

```
src/
├── Vanalytics.Core/
│   ├── Models/
│   │   ├── User.cs                          # MODIFY: add OAuthProvider, OAuthId
│   │   └── RefreshToken.cs                  # CREATE: refresh token entity
│   └── DTOs/
│       ├── Auth/
│       │   ├── RegisterRequest.cs           # CREATE
│       │   ├── LoginRequest.cs              # CREATE
│       │   ├── OAuthRequest.cs              # CREATE
│       │   ├── AuthResponse.cs              # CREATE (access + refresh tokens)
│       │   ├── RefreshRequest.cs            # CREATE
│       │   └── UserProfileResponse.cs       # CREATE
│       └── Keys/
│           └── ApiKeyResponse.cs            # CREATE
├── Vanalytics.Data/
│   ├── VanalyticsDbContext.cs               # MODIFY: add RefreshTokens DbSet
│   ├── Configurations/
│   │   ├── UserConfiguration.cs             # MODIFY: add OAuthProvider, OAuthId config
│   │   └── RefreshTokenConfiguration.cs     # CREATE
│   └── Migrations/                          # CREATE: new migration
├── Vanalytics.Api/
│   ├── Program.cs                           # MODIFY: add auth services + middleware
│   ├── appsettings.json                     # MODIFY: add Jwt + OAuth config sections
│   ├── appsettings.Development.json         # MODIFY: add dev Jwt secret
│   ├── Services/
│   │   ├── TokenService.cs                  # CREATE: JWT + refresh token logic
│   │   └── OAuthService.cs                  # CREATE: Google/Microsoft token exchange
│   ├── Auth/
│   │   └── ApiKeyAuthHandler.cs             # CREATE: X-Api-Key auth handler
│   └── Controllers/
│       ├── AuthController.cs                # CREATE: register, login, oauth, refresh, me
│       └── KeysController.cs                # CREATE: generate, revoke
tests/
└── Vanalytics.Api.Tests/
    ├── Vanalytics.Api.Tests.csproj          # CREATE
    ├── Services/
    │   └── TokenServiceTests.cs             # CREATE
    └── Controllers/
        ├── AuthControllerTests.cs           # CREATE
        └── KeysControllerTests.cs           # CREATE
```

---

### Task 1: Extend User Model and Add RefreshToken Entity

**Files:**
- Modify: `src/Vanalytics.Core/Models/User.cs`
- Create: `src/Vanalytics.Core/Models/RefreshToken.cs`
- Modify: `src/Vanalytics.Data/VanalyticsDbContext.cs`
- Modify: `src/Vanalytics.Data/Configurations/UserConfiguration.cs`
- Create: `src/Vanalytics.Data/Configurations/RefreshTokenConfiguration.cs`
- Create: `src/Vanalytics.Data/Migrations/` (new migration)

- [ ] **Step 1: Add OAuth fields to User model**

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
    public string? OAuthProvider { get; set; }
    public string? OAuthId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public List<Character> Characters { get; set; } = [];
    public List<RefreshToken> RefreshTokens { get; set; } = [];
}
```

- [ ] **Step 2: Create RefreshToken model**

```csharp
// src/Vanalytics.Core/Models/RefreshToken.cs
namespace Vanalytics.Core.Models;

public class RefreshToken
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Token { get; set; } = string.Empty;
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public bool IsRevoked { get; set; }

    public User User { get; set; } = null!;
}
```

- [ ] **Step 3: Add RefreshTokens DbSet to VanalyticsDbContext**

Add to `src/Vanalytics.Data/VanalyticsDbContext.cs`:

```csharp
public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
```

- [ ] **Step 4: Update UserConfiguration for OAuth fields**

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
        builder.HasIndex(u => new { u.OAuthProvider, u.OAuthId })
            .IsUnique()
            .HasFilter("[OAuthProvider] IS NOT NULL AND [OAuthId] IS NOT NULL");

        builder.Property(u => u.Email).HasMaxLength(256).IsRequired();
        builder.Property(u => u.Username).HasMaxLength(64).IsRequired();
        builder.Property(u => u.PasswordHash).HasMaxLength(256);
        builder.Property(u => u.ApiKey).HasMaxLength(128);
        builder.Property(u => u.OAuthProvider).HasMaxLength(32);
        builder.Property(u => u.OAuthId).HasMaxLength(256);
    }
}
```

- [ ] **Step 5: Create RefreshTokenConfiguration**

```csharp
// src/Vanalytics.Data/Configurations/RefreshTokenConfiguration.cs
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class RefreshTokenConfiguration : IEntityTypeConfiguration<RefreshToken>
{
    public void Configure(EntityTypeBuilder<RefreshToken> builder)
    {
        builder.HasKey(t => t.Id);
        builder.HasIndex(t => t.Token).IsUnique();

        builder.Property(t => t.Token).HasMaxLength(256).IsRequired();

        builder.HasOne(t => t.User)
            .WithMany(u => u.RefreshTokens)
            .HasForeignKey(t => t.UserId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
```

- [ ] **Step 6: Verify build**

```bash
dotnet build Vanalytics.slnx
```

- [ ] **Step 7: Create migration**

```bash
dotnet ef migrations add AddAuthFields --project src/Vanalytics.Data --startup-project src/Vanalytics.Api
```

- [ ] **Step 8: Verify build with migration**

```bash
dotnet build Vanalytics.slnx
```

---

### Task 2: Auth DTOs

**Files:**
- Create: `src/Vanalytics.Core/DTOs/Auth/RegisterRequest.cs`
- Create: `src/Vanalytics.Core/DTOs/Auth/LoginRequest.cs`
- Create: `src/Vanalytics.Core/DTOs/Auth/OAuthRequest.cs`
- Create: `src/Vanalytics.Core/DTOs/Auth/RefreshRequest.cs`
- Create: `src/Vanalytics.Core/DTOs/Auth/AuthResponse.cs`
- Create: `src/Vanalytics.Core/DTOs/Auth/UserProfileResponse.cs`
- Create: `src/Vanalytics.Core/DTOs/Keys/ApiKeyResponse.cs`

- [ ] **Step 1: Create RegisterRequest**

```csharp
// src/Vanalytics.Core/DTOs/Auth/RegisterRequest.cs
using System.ComponentModel.DataAnnotations;

namespace Vanalytics.Core.DTOs.Auth;

public class RegisterRequest
{
    [Required, EmailAddress, MaxLength(256)]
    public string Email { get; set; } = string.Empty;

    [Required, MinLength(3), MaxLength(64)]
    public string Username { get; set; } = string.Empty;

    [Required, MinLength(8), MaxLength(128)]
    public string Password { get; set; } = string.Empty;
}
```

- [ ] **Step 2: Create LoginRequest**

```csharp
// src/Vanalytics.Core/DTOs/Auth/LoginRequest.cs
using System.ComponentModel.DataAnnotations;

namespace Vanalytics.Core.DTOs.Auth;

public class LoginRequest
{
    [Required, EmailAddress]
    public string Email { get; set; } = string.Empty;

    [Required]
    public string Password { get; set; } = string.Empty;
}
```

- [ ] **Step 3: Create OAuthRequest**

```csharp
// src/Vanalytics.Core/DTOs/Auth/OAuthRequest.cs
using System.ComponentModel.DataAnnotations;

namespace Vanalytics.Core.DTOs.Auth;

public class OAuthRequest
{
    [Required]
    public string Code { get; set; } = string.Empty;

    [Required]
    public string RedirectUri { get; set; } = string.Empty;
}
```

- [ ] **Step 4: Create RefreshRequest**

```csharp
// src/Vanalytics.Core/DTOs/Auth/RefreshRequest.cs
using System.ComponentModel.DataAnnotations;

namespace Vanalytics.Core.DTOs.Auth;

public class RefreshRequest
{
    [Required]
    public string RefreshToken { get; set; } = string.Empty;
}
```

- [ ] **Step 5: Create AuthResponse**

```csharp
// src/Vanalytics.Core/DTOs/Auth/AuthResponse.cs
namespace Vanalytics.Core.DTOs.Auth;

public class AuthResponse
{
    public string AccessToken { get; set; } = string.Empty;
    public string RefreshToken { get; set; } = string.Empty;
    public DateTimeOffset ExpiresAt { get; set; }
}
```

- [ ] **Step 6: Create UserProfileResponse**

```csharp
// src/Vanalytics.Core/DTOs/Auth/UserProfileResponse.cs
namespace Vanalytics.Core.DTOs.Auth;

public class UserProfileResponse
{
    public Guid Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public bool HasApiKey { get; set; }
    public string? OAuthProvider { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
```

- [ ] **Step 7: Create ApiKeyResponse**

```csharp
// src/Vanalytics.Core/DTOs/Keys/ApiKeyResponse.cs
namespace Vanalytics.Core.DTOs.Keys;

public class ApiKeyResponse
{
    public string ApiKey { get; set; } = string.Empty;
    public DateTimeOffset GeneratedAt { get; set; }
}
```

- [ ] **Step 8: Verify build**

```bash
dotnet build src/Vanalytics.Core/Vanalytics.Core.csproj
```

---

### Task 3: TokenService — JWT and Refresh Token Logic

**Files:**
- Create: `src/Vanalytics.Api/Services/TokenService.cs`
- Create: `tests/Vanalytics.Api.Tests/Vanalytics.Api.Tests.csproj`
- Create: `tests/Vanalytics.Api.Tests/Services/TokenServiceTests.cs`

- [ ] **Step 1: Add JWT NuGet package to Api project**

```bash
dotnet add src/Vanalytics.Api/Vanalytics.Api.csproj package Microsoft.AspNetCore.Authentication.JwtBearer
```

- [ ] **Step 2: Create test project**

```bash
dotnet new xunit -n Vanalytics.Api.Tests -o tests/Vanalytics.Api.Tests -f net10.0
dotnet sln Vanalytics.slnx add tests/Vanalytics.Api.Tests/Vanalytics.Api.Tests.csproj
dotnet add tests/Vanalytics.Api.Tests/Vanalytics.Api.Tests.csproj reference src/Vanalytics.Api/Vanalytics.Api.csproj
dotnet add tests/Vanalytics.Api.Tests/Vanalytics.Api.Tests.csproj reference src/Vanalytics.Core/Vanalytics.Core.csproj
dotnet add tests/Vanalytics.Api.Tests/Vanalytics.Api.Tests.csproj reference src/Vanalytics.Data/Vanalytics.Data.csproj
```

Remove the generated `UnitTest1.cs` file.

- [ ] **Step 3: Write TokenService tests**

```csharp
// tests/Vanalytics.Api.Tests/Services/TokenServiceTests.cs
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.Extensions.Configuration;
using Vanalytics.Api.Services;
using Vanalytics.Core.Models;

namespace Vanalytics.Api.Tests.Services;

public class TokenServiceTests
{
    private readonly TokenService _sut;

    public TokenServiceTests()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Secret"] = "ThisIsATestSecretKeyThatIsLongEnoughForHmacSha256!",
                ["Jwt:Issuer"] = "VanalyticsTest",
                ["Jwt:Audience"] = "VanalyticsTest",
                ["Jwt:AccessTokenExpirationMinutes"] = "15",
                ["Jwt:RefreshTokenExpirationDays"] = "7"
            })
            .Build();

        _sut = new TokenService(config);
    }

    [Fact]
    public void GenerateAccessToken_ReturnsValidJwt()
    {
        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = "test@example.com",
            Username = "testuser"
        };

        var token = _sut.GenerateAccessToken(user);

        Assert.NotEmpty(token);

        var handler = new JwtSecurityTokenHandler();
        var jwt = handler.ReadJwtToken(token);
        Assert.Equal("test@example.com", jwt.Claims.First(c => c.Type == ClaimTypes.Email).Value);
        Assert.Equal("testuser", jwt.Claims.First(c => c.Type == ClaimTypes.Name).Value);
        Assert.Equal(user.Id.ToString(), jwt.Claims.First(c => c.Type == ClaimTypes.NameIdentifier).Value);
    }

    [Fact]
    public void GenerateAccessToken_ExpiresInConfiguredMinutes()
    {
        var user = new User { Id = Guid.NewGuid(), Email = "t@t.com", Username = "t" };
        var token = _sut.GenerateAccessToken(user);
        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(token);

        var expectedExpiry = DateTimeOffset.UtcNow.AddMinutes(15);
        var actualExpiry = new DateTimeOffset(jwt.ValidTo, TimeSpan.Zero);

        Assert.InRange(actualExpiry, expectedExpiry.AddSeconds(-5), expectedExpiry.AddSeconds(5));
    }

    [Fact]
    public void GenerateRefreshToken_ReturnsNonEmptyString()
    {
        var token = _sut.GenerateRefreshToken();
        Assert.NotEmpty(token);
        Assert.True(token.Length >= 32);
    }

    [Fact]
    public void GenerateRefreshToken_ReturnsDifferentTokensEachCall()
    {
        var token1 = _sut.GenerateRefreshToken();
        var token2 = _sut.GenerateRefreshToken();
        Assert.NotEqual(token1, token2);
    }

    [Fact]
    public void GetRefreshTokenExpiration_ReturnsConfiguredDays()
    {
        var expiration = _sut.GetRefreshTokenExpiration();
        var expected = DateTimeOffset.UtcNow.AddDays(7);
        Assert.InRange(expiration, expected.AddSeconds(-5), expected.AddSeconds(5));
    }

    [Fact]
    public void GetAccessTokenExpiration_ReturnsConfiguredMinutes()
    {
        var expiration = _sut.GetAccessTokenExpiration();
        var expected = DateTimeOffset.UtcNow.AddMinutes(15);
        Assert.InRange(expiration, expected.AddSeconds(-5), expected.AddSeconds(5));
    }
}
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
dotnet test tests/Vanalytics.Api.Tests/ -v normal
```

Expected: FAIL — `TokenService` does not exist.

- [ ] **Step 5: Implement TokenService**

```csharp
// src/Vanalytics.Api/Services/TokenService.cs
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using Vanalytics.Core.Models;

namespace Vanalytics.Api.Services;

public class TokenService
{
    private readonly IConfiguration _config;

    public TokenService(IConfiguration config)
    {
        _config = config;
    }

    public string GenerateAccessToken(User user)
    {
        var key = new SymmetricSecurityKey(
            Encoding.UTF8.GetBytes(_config["Jwt:Secret"]!));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Email, user.Email),
            new Claim(ClaimTypes.Name, user.Username)
        };

        var token = new JwtSecurityToken(
            issuer: _config["Jwt:Issuer"],
            audience: _config["Jwt:Audience"],
            claims: claims,
            expires: GetAccessTokenExpiration().UtcDateTime,
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public string GenerateRefreshToken()
    {
        var bytes = RandomNumberGenerator.GetBytes(32);
        return Convert.ToBase64String(bytes);
    }

    public DateTimeOffset GetAccessTokenExpiration()
    {
        var minutes = int.Parse(_config["Jwt:AccessTokenExpirationMinutes"] ?? "15");
        return DateTimeOffset.UtcNow.AddMinutes(minutes);
    }

    public DateTimeOffset GetRefreshTokenExpiration()
    {
        var days = int.Parse(_config["Jwt:RefreshTokenExpirationDays"] ?? "7");
        return DateTimeOffset.UtcNow.AddDays(days);
    }
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
dotnet test tests/Vanalytics.Api.Tests/ -v normal
```

Expected: All 6 tests pass.

---

### Task 4: OAuthService — Google and Microsoft Token Exchange

> **Testing note:** Integration tests for the OAuth endpoint are deferred because it calls external services (Google, Microsoft). The OAuthService is tested implicitly via the Task 10 smoke test with real credentials. For a future iteration, consider adding tests with a mocked `IHttpClientFactory`.

**Files:**
- Create: `src/Vanalytics.Api/Services/OAuthService.cs`

- [ ] **Step 1: Create OAuthService**

This service exchanges authorization codes with Google/Microsoft for user info. It uses `HttpClient` directly — no ASP.NET Core OAuth middleware (which is designed for cookie-based server apps, not SPA + API).

```csharp
// src/Vanalytics.Api/Services/OAuthService.cs
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Vanalytics.Api.Services;

public class OAuthService
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _config;

    public OAuthService(IHttpClientFactory httpClientFactory, IConfiguration config)
    {
        _httpClientFactory = httpClientFactory;
        _config = config;
    }

    public async Task<OAuthUserInfo> GetGoogleUserInfoAsync(string code, string redirectUri)
    {
        var client = _httpClientFactory.CreateClient();

        // Exchange code for tokens
        var tokenResponse = await client.PostAsync("https://oauth2.googleapis.com/token",
            new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["code"] = code,
                ["client_id"] = _config["OAuth:Google:ClientId"]!,
                ["client_secret"] = _config["OAuth:Google:ClientSecret"]!,
                ["redirect_uri"] = redirectUri,
                ["grant_type"] = "authorization_code"
            }));

        tokenResponse.EnsureSuccessStatusCode();
        var tokenData = await JsonSerializer.DeserializeAsync<OAuthTokenResponse>(
            await tokenResponse.Content.ReadAsStreamAsync());

        // Get user info
        var request = new HttpRequestMessage(HttpMethod.Get, "https://www.googleapis.com/oauth2/v2/userinfo");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", tokenData!.AccessToken);
        var userResponse = await client.SendAsync(request);
        userResponse.EnsureSuccessStatusCode();

        var googleUser = await JsonSerializer.DeserializeAsync<GoogleUserInfo>(
            await userResponse.Content.ReadAsStreamAsync());

        return new OAuthUserInfo
        {
            Provider = "google",
            ProviderId = googleUser!.Id,
            Email = googleUser.Email,
            Name = googleUser.Name ?? googleUser.Email.Split('@')[0]
        };
    }

    public async Task<OAuthUserInfo> GetMicrosoftUserInfoAsync(string code, string redirectUri)
    {
        var client = _httpClientFactory.CreateClient();

        // Exchange code for tokens
        var tokenResponse = await client.PostAsync(
            "https://login.microsoftonline.com/common/oauth2/v2.0/token",
            new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["code"] = code,
                ["client_id"] = _config["OAuth:Microsoft:ClientId"]!,
                ["client_secret"] = _config["OAuth:Microsoft:ClientSecret"]!,
                ["redirect_uri"] = redirectUri,
                ["grant_type"] = "authorization_code",
                ["scope"] = "openid email profile"
            }));

        tokenResponse.EnsureSuccessStatusCode();
        var tokenData = await JsonSerializer.DeserializeAsync<OAuthTokenResponse>(
            await tokenResponse.Content.ReadAsStreamAsync());

        // Get user info from Microsoft Graph
        var request = new HttpRequestMessage(HttpMethod.Get, "https://graph.microsoft.com/v1.0/me");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", tokenData!.AccessToken);
        var userResponse = await client.SendAsync(request);
        userResponse.EnsureSuccessStatusCode();

        var msUser = await JsonSerializer.DeserializeAsync<MicrosoftUserInfo>(
            await userResponse.Content.ReadAsStreamAsync());

        return new OAuthUserInfo
        {
            Provider = "microsoft",
            ProviderId = msUser!.Id,
            Email = msUser.Mail ?? msUser.UserPrincipalName,
            Name = msUser.DisplayName ?? msUser.UserPrincipalName.Split('@')[0]
        };
    }
}

public class OAuthUserInfo
{
    public string Provider { get; set; } = string.Empty;
    public string ProviderId { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
}

public class OAuthTokenResponse
{
    [JsonPropertyName("access_token")]
    public string AccessToken { get; set; } = string.Empty;
}

public class GoogleUserInfo
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("email")]
    public string Email { get; set; } = string.Empty;

    [JsonPropertyName("name")]
    public string? Name { get; set; }
}

public class MicrosoftUserInfo
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("mail")]
    public string? Mail { get; set; }

    [JsonPropertyName("userPrincipalName")]
    public string UserPrincipalName { get; set; } = string.Empty;

    [JsonPropertyName("displayName")]
    public string? DisplayName { get; set; }
}
```

- [ ] **Step 2: Verify build**

```bash
dotnet build Vanalytics.slnx
```

---

### Task 5: API Key Auth Handler

**Files:**
- Create: `src/Vanalytics.Api/Auth/ApiKeyAuthHandler.cs`

- [ ] **Step 1: Create the API key authentication handler**

This handler reads `X-Api-Key` from the request header and validates it against the database.

```csharp
// src/Vanalytics.Api/Auth/ApiKeyAuthHandler.cs
using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Vanalytics.Data;

namespace Vanalytics.Api.Auth;

public class ApiKeyAuthHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    private readonly VanalyticsDbContext _db;

    public ApiKeyAuthHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder,
        VanalyticsDbContext db)
        : base(options, logger, encoder)
    {
        _db = db;
    }

    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Request.Headers.TryGetValue("X-Api-Key", out var apiKeyHeader))
            return AuthenticateResult.NoResult();

        var apiKey = apiKeyHeader.ToString();
        if (string.IsNullOrEmpty(apiKey))
            return AuthenticateResult.NoResult();

        // API keys are stored as BCrypt hashes. We must check all users with a non-null
        // ApiKey since BCrypt hashes can't be queried directly. This is acceptable at MVP
        // scale. For high-volume usage, consider a prefix-based lookup strategy.
        var usersWithKeys = await _db.Users
            .Where(u => u.ApiKey != null)
            .ToListAsync();

        var user = usersWithKeys.FirstOrDefault(u => BCrypt.Net.BCrypt.Verify(apiKey, u.ApiKey));
        if (user is null)
            return AuthenticateResult.Fail("Invalid API key");

        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Email, user.Email),
            new Claim(ClaimTypes.Name, user.Username)
        };

        var identity = new ClaimsIdentity(claims, Scheme.Name);
        var principal = new ClaimsPrincipal(identity);
        var ticket = new AuthenticationTicket(principal, Scheme.Name);

        return AuthenticateResult.Success(ticket);
    }
}
```

- [ ] **Step 2: Verify build**

```bash
dotnet build Vanalytics.slnx
```

---

### Task 6: Wire Up Authentication in Program.cs

**Files:**
- Modify: `src/Vanalytics.Api/Program.cs`
- Modify: `src/Vanalytics.Api/appsettings.json`
- Modify: `src/Vanalytics.Api/appsettings.Development.json`

- [ ] **Step 1: Update appsettings.json with auth config sections**

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
  },
  "Jwt": {
    "Secret": "",
    "Issuer": "Vanalytics",
    "Audience": "Vanalytics",
    "AccessTokenExpirationMinutes": 15,
    "RefreshTokenExpirationDays": 7
  },
  "OAuth": {
    "Google": {
      "ClientId": "",
      "ClientSecret": ""
    },
    "Microsoft": {
      "ClientId": "",
      "ClientSecret": ""
    }
  }
}
```

- [ ] **Step 2: Update appsettings.Development.json**

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
  },
  "Jwt": {
    "Secret": "DevSecretKeyThatIsAtLeast32BytesLongForHmacSha256Algorithm!!"
  }
}
```

- [ ] **Step 3: Update Program.cs with auth services and middleware**

```csharp
// src/Vanalytics.Api/Program.cs
using System.Text;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Vanalytics.Api.Auth;
using Vanalytics.Api.Services;
using Vanalytics.Data;
using Vanalytics.Data.Seeding;

var builder = WebApplication.CreateBuilder(args);

// Database
builder.Services.AddDbContext<VanalyticsDbContext>(options =>
    options.UseSqlServer(
        builder.Configuration.GetConnectionString("DefaultConnection"),
        sqlOptions => sqlOptions.EnableRetryOnFailure(
            maxRetryCount: 5,
            maxRetryDelay: TimeSpan.FromSeconds(10),
            errorNumbersToAdd: null)));

// Authentication
builder.Services.AddAuthentication(options =>
    {
        options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
        options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
    })
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidAudience = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(builder.Configuration["Jwt:Secret"]!))
        };
    })
    .AddScheme<AuthenticationSchemeOptions, ApiKeyAuthHandler>("ApiKey", null);

builder.Services.AddAuthorization();
builder.Services.AddControllers();
builder.Services.AddHttpClient();

// Services
builder.Services.AddSingleton<TokenService>();
builder.Services.AddScoped<OAuthService>();

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

app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapGet("/health", () => Results.Ok(new { status = "healthy" }));

app.Run();
```

- [ ] **Step 4: Verify build**

```bash
dotnet build Vanalytics.slnx
```

---

### Task 7: AuthController — Register and Login

**Files:**
- Create: `src/Vanalytics.Api/Controllers/AuthController.cs`
- Create: `tests/Vanalytics.Api.Tests/Controllers/AuthControllerTests.cs`

- [ ] **Step 1: Add Testcontainers package to Api test project**

```bash
dotnet add tests/Vanalytics.Api.Tests/Vanalytics.Api.Tests.csproj package Testcontainers.MsSql
dotnet add tests/Vanalytics.Api.Tests/Vanalytics.Api.Tests.csproj package Microsoft.AspNetCore.Mvc.Testing
```

- [ ] **Step 2: Write integration tests for register and login**

```csharp
// tests/Vanalytics.Api.Tests/Controllers/AuthControllerTests.cs
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.MsSql;
using Vanalytics.Core.DTOs.Auth;
using Vanalytics.Data;

namespace Vanalytics.Api.Tests.Controllers;

public class AuthControllerTests : IAsyncLifetime
{
    private readonly MsSqlContainer _container = new MsSqlBuilder().Build();
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
                    // Replace DbContext with test container
                    var descriptor = services.SingleOrDefault(
                        d => d.ServiceType == typeof(DbContextOptions<VanalyticsDbContext>));
                    if (descriptor != null) services.Remove(descriptor);

                    services.AddDbContext<VanalyticsDbContext>(options =>
                        options.UseSqlServer(_container.GetConnectionString()));
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

    [Fact]
    public async Task Register_WithValidData_ReturnsTokens()
    {
        var response = await _client.PostAsJsonAsync("/api/auth/register", new RegisterRequest
        {
            Email = "new@example.com",
            Username = "newuser",
            Password = "Password123!"
        });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var auth = await response.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(auth);
        Assert.NotEmpty(auth.AccessToken);
        Assert.NotEmpty(auth.RefreshToken);
    }

    [Fact]
    public async Task Register_WithDuplicateEmail_ReturnsConflict()
    {
        await _client.PostAsJsonAsync("/api/auth/register", new RegisterRequest
        {
            Email = "dupe@example.com",
            Username = "user1",
            Password = "Password123!"
        });

        var response = await _client.PostAsJsonAsync("/api/auth/register", new RegisterRequest
        {
            Email = "dupe@example.com",
            Username = "user2",
            Password = "Password123!"
        });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Login_WithValidCredentials_ReturnsTokens()
    {
        await _client.PostAsJsonAsync("/api/auth/register", new RegisterRequest
        {
            Email = "login@example.com",
            Username = "loginuser",
            Password = "Password123!"
        });

        var response = await _client.PostAsJsonAsync("/api/auth/login", new LoginRequest
        {
            Email = "login@example.com",
            Password = "Password123!"
        });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var auth = await response.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(auth);
        Assert.NotEmpty(auth.AccessToken);
    }

    [Fact]
    public async Task Login_WithWrongPassword_ReturnsUnauthorized()
    {
        await _client.PostAsJsonAsync("/api/auth/register", new RegisterRequest
        {
            Email = "wrong@example.com",
            Username = "wronguser",
            Password = "Password123!"
        });

        var response = await _client.PostAsJsonAsync("/api/auth/login", new LoginRequest
        {
            Email = "wrong@example.com",
            Password = "WrongPassword!"
        });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Me_WithValidToken_ReturnsProfile()
    {
        var registerResponse = await _client.PostAsJsonAsync("/api/auth/register", new RegisterRequest
        {
            Email = "me@example.com",
            Username = "meuser",
            Password = "Password123!"
        });
        var auth = await registerResponse.Content.ReadFromJsonAsync<AuthResponse>();

        var request = new HttpRequestMessage(HttpMethod.Get, "/api/auth/me");
        request.Headers.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", auth!.AccessToken);
        var response = await _client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var profile = await response.Content.ReadFromJsonAsync<UserProfileResponse>();
        Assert.Equal("me@example.com", profile!.Email);
        Assert.Equal("meuser", profile.Username);
    }

    [Fact]
    public async Task Me_WithoutToken_ReturnsUnauthorized()
    {
        var response = await _client.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Refresh_WithValidToken_ReturnsNewTokens()
    {
        var registerResponse = await _client.PostAsJsonAsync("/api/auth/register", new RegisterRequest
        {
            Email = "refresh@example.com",
            Username = "refreshuser",
            Password = "Password123!"
        });
        var auth = await registerResponse.Content.ReadFromJsonAsync<AuthResponse>();

        var response = await _client.PostAsJsonAsync("/api/auth/refresh", new RefreshRequest
        {
            RefreshToken = auth!.RefreshToken
        });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var newAuth = await response.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(newAuth);
        Assert.NotEmpty(newAuth.AccessToken);
        Assert.NotEqual(auth.RefreshToken, newAuth.RefreshToken);
    }
}
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
dotnet test tests/Vanalytics.Api.Tests/ -v normal
```

Expected: FAIL — `AuthController` does not exist yet.

- [ ] **Step 4: Create AuthController**

```csharp
// src/Vanalytics.Api/Controllers/AuthController.cs
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Api.Services;
using Vanalytics.Core.DTOs.Auth;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly VanalyticsDbContext _db;
    private readonly TokenService _tokenService;
    private readonly OAuthService _oauthService;

    public AuthController(VanalyticsDbContext db, TokenService tokenService, OAuthService oauthService)
    {
        _db = db;
        _tokenService = tokenService;
        _oauthService = oauthService;
    }

    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterRequest request)
    {
        if (await _db.Users.AnyAsync(u => u.Email == request.Email))
            return Conflict(new { message = "Email already registered" });

        if (await _db.Users.AnyAsync(u => u.Username == request.Username))
            return Conflict(new { message = "Username already taken" });

        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = request.Email,
            Username = request.Username,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };

        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        return Ok(await GenerateAuthResponseAsync(user));
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == request.Email);
        if (user is null || user.PasswordHash is null)
            return Unauthorized(new { message = "Invalid credentials" });

        if (!BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
            return Unauthorized(new { message = "Invalid credentials" });

        return Ok(await GenerateAuthResponseAsync(user));
    }

    [HttpPost("oauth/{provider}")]
    public async Task<IActionResult> OAuth(string provider, [FromBody] OAuthRequest request)
    {
        OAuthUserInfo userInfo;
        try
        {
            userInfo = provider.ToLowerInvariant() switch
            {
                "google" => await _oauthService.GetGoogleUserInfoAsync(request.Code, request.RedirectUri),
                "microsoft" => await _oauthService.GetMicrosoftUserInfoAsync(request.Code, request.RedirectUri),
                _ => throw new ArgumentException($"Unsupported provider: {provider}")
            };
        }
        catch (ArgumentException)
        {
            return BadRequest(new { message = $"Unsupported OAuth provider: {provider}" });
        }
        catch (HttpRequestException)
        {
            return BadRequest(new { message = "Failed to authenticate with OAuth provider" });
        }

        // Find existing user by OAuth ID, or fall back to email match.
        // Note: Email-based linking is an MVP convenience. For a higher-security app,
        // account linking should require explicit user confirmation while authenticated.
        // Acceptable here because both Google and Microsoft verify email ownership.
        var user = await _db.Users.FirstOrDefaultAsync(u =>
            u.OAuthProvider == userInfo.Provider && u.OAuthId == userInfo.ProviderId);

        if (user is null)
        {
            user = await _db.Users.FirstOrDefaultAsync(u => u.Email == userInfo.Email);
            if (user is not null)
            {
                // Link OAuth to existing account
                user.OAuthProvider = userInfo.Provider;
                user.OAuthId = userInfo.ProviderId;
                user.UpdatedAt = DateTimeOffset.UtcNow;
            }
            else
            {
                // Create new user, handling username collisions
                var username = userInfo.Name;
                if (await _db.Users.AnyAsync(u => u.Username == username))
                    username = $"{username}_{Guid.NewGuid().ToString()[..6]}";

                user = new User
                {
                    Id = Guid.NewGuid(),
                    Email = userInfo.Email,
                    Username = username,
                    OAuthProvider = userInfo.Provider,
                    OAuthId = userInfo.ProviderId,
                    CreatedAt = DateTimeOffset.UtcNow,
                    UpdatedAt = DateTimeOffset.UtcNow
                };
                _db.Users.Add(user);
            }

            await _db.SaveChangesAsync();
        }

        return Ok(await GenerateAuthResponseAsync(user));
    }

    // Note: Spec says refresh requires JWT, but this is intentionally unauthenticated.
    // The whole point of refresh is that the access token may be expired. The refresh
    // token itself serves as the authentication credential for this endpoint.
    [HttpPost("refresh")]
    public async Task<IActionResult> Refresh([FromBody] RefreshRequest request)
    {
        var refreshToken = await _db.RefreshTokens
            .Include(t => t.User)
            .FirstOrDefaultAsync(t =>
                t.Token == request.RefreshToken &&
                !t.IsRevoked &&
                t.ExpiresAt > DateTimeOffset.UtcNow);

        if (refreshToken is null)
            return Unauthorized(new { message = "Invalid or expired refresh token" });

        // Revoke old token — the SaveChangesAsync inside GenerateAuthResponseAsync
        // will persist both the revocation and the new refresh token in one round trip.
        refreshToken.IsRevoked = true;

        return Ok(await GenerateAuthResponseAsync(refreshToken.User));
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<IActionResult> Me()
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var user = await _db.Users.FindAsync(userId);
        if (user is null) return NotFound();

        return Ok(new UserProfileResponse
        {
            Id = user.Id,
            Email = user.Email,
            Username = user.Username,
            HasApiKey = user.ApiKey is not null,
            OAuthProvider = user.OAuthProvider,
            CreatedAt = user.CreatedAt
        });
    }

    private async Task<AuthResponse> GenerateAuthResponseAsync(User user)
    {
        var accessToken = _tokenService.GenerateAccessToken(user);
        var refreshTokenValue = _tokenService.GenerateRefreshToken();

        var refreshToken = new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            Token = refreshTokenValue,
            ExpiresAt = _tokenService.GetRefreshTokenExpiration(),
            CreatedAt = DateTimeOffset.UtcNow
        };

        _db.RefreshTokens.Add(refreshToken);
        await _db.SaveChangesAsync();

        return new AuthResponse
        {
            AccessToken = accessToken,
            RefreshToken = refreshTokenValue,
            ExpiresAt = _tokenService.GetAccessTokenExpiration()
        };
    }
}
```

- [ ] **Step 5: Make Program class accessible to test project**

Add to `src/Vanalytics.Api/Program.cs` at the very end of the file:

```csharp
// Make Program accessible for WebApplicationFactory in tests
public partial class Program { }
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
dotnet test tests/Vanalytics.Api.Tests/ -v normal
```

Expected: All tests pass (both TokenService unit tests and AuthController integration tests).

---

### Task 8: KeysController — API Key Generate and Revoke

**Files:**
- Create: `src/Vanalytics.Api/Controllers/KeysController.cs`
- Create: `tests/Vanalytics.Api.Tests/Controllers/KeysControllerTests.cs`

- [ ] **Step 1: Write integration tests for key management**

```csharp
// tests/Vanalytics.Api.Tests/Controllers/KeysControllerTests.cs
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.MsSql;
using Vanalytics.Core.DTOs.Auth;
using Vanalytics.Core.DTOs.Keys;
using Vanalytics.Data;

namespace Vanalytics.Api.Tests.Controllers;

public class KeysControllerTests : IAsyncLifetime
{
    private readonly MsSqlContainer _container = new MsSqlBuilder().Build();
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
                    var descriptor = services.SingleOrDefault(
                        d => d.ServiceType == typeof(DbContextOptions<VanalyticsDbContext>));
                    if (descriptor != null) services.Remove(descriptor);

                    services.AddDbContext<VanalyticsDbContext>(options =>
                        options.UseSqlServer(_container.GetConnectionString()));
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
        var response = await _client.PostAsJsonAsync("/api/auth/register", new RegisterRequest
        {
            Email = email,
            Username = username,
            Password = "Password123!"
        });
        var auth = await response.Content.ReadFromJsonAsync<AuthResponse>();
        return auth!.AccessToken;
    }

    private HttpRequestMessage AuthedRequest(HttpMethod method, string url, string token)
    {
        var request = new HttpRequestMessage(method, url);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return request;
    }

    [Fact]
    public async Task Generate_WithAuth_ReturnsApiKey()
    {
        var token = await RegisterAndGetTokenAsync("keygen@example.com", "keygen");

        var response = await _client.SendAsync(AuthedRequest(HttpMethod.Post, "/api/keys/generate", token));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var keyResponse = await response.Content.ReadFromJsonAsync<ApiKeyResponse>();
        Assert.NotNull(keyResponse);
        Assert.NotEmpty(keyResponse.ApiKey);
    }

    [Fact]
    public async Task Generate_Twice_InvalidatesOldKey()
    {
        var token = await RegisterAndGetTokenAsync("keygen2@example.com", "keygen2");

        var response1 = await _client.SendAsync(AuthedRequest(HttpMethod.Post, "/api/keys/generate", token));
        var key1 = (await response1.Content.ReadFromJsonAsync<ApiKeyResponse>())!.ApiKey;

        var response2 = await _client.SendAsync(AuthedRequest(HttpMethod.Post, "/api/keys/generate", token));
        var key2 = (await response2.Content.ReadFromJsonAsync<ApiKeyResponse>())!.ApiKey;

        Assert.NotEqual(key1, key2);
    }

    [Fact]
    public async Task Revoke_WithAuth_RemovesApiKey()
    {
        var token = await RegisterAndGetTokenAsync("revoke@example.com", "revoke");

        await _client.SendAsync(AuthedRequest(HttpMethod.Post, "/api/keys/generate", token));
        var response = await _client.SendAsync(AuthedRequest(HttpMethod.Delete, "/api/keys", token));

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);

        // Verify key is gone via profile
        var profileResponse = await _client.SendAsync(AuthedRequest(HttpMethod.Get, "/api/auth/me", token));
        var profile = await profileResponse.Content.ReadFromJsonAsync<UserProfileResponse>();
        Assert.False(profile!.HasApiKey);
    }

    [Fact]
    public async Task Generate_WithoutAuth_ReturnsUnauthorized()
    {
        var response = await _client.PostAsync("/api/keys/generate", null);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
dotnet test tests/Vanalytics.Api.Tests/Controllers/KeysControllerTests.cs -v normal
```

Expected: FAIL — `KeysController` does not exist.

- [ ] **Step 3: Create KeysController**

```csharp
// src/Vanalytics.Api/Controllers/KeysController.cs
using System.Security.Claims;
using System.Security.Cryptography;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Vanalytics.Core.DTOs.Keys;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/keys")]
[Authorize]
public class KeysController : ControllerBase
{
    private readonly VanalyticsDbContext _db;

    public KeysController(VanalyticsDbContext db)
    {
        _db = db;
    }

    [HttpPost("generate")]
    public async Task<IActionResult> Generate()
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var user = await _db.Users.FindAsync(userId);
        if (user is null) return NotFound();

        // Generate a random key, return it to the user, but store only the hash.
        // The plaintext key is only shown once — on generation.
        var rawKey = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
        user.ApiKey = BCrypt.Net.BCrypt.HashPassword(rawKey);
        user.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new ApiKeyResponse
        {
            ApiKey = rawKey,
            GeneratedAt = user.UpdatedAt
        });
    }

    [HttpDelete]
    public async Task<IActionResult> Revoke()
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var user = await _db.Users.FindAsync(userId);
        if (user is null) return NotFound();

        user.ApiKey = null;
        user.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();

        return NoContent();
    }
}
```

- [ ] **Step 4: Run all tests**

```bash
dotnet test Vanalytics.slnx -v normal
```

Expected: All tests pass (TokenService unit tests, AuthController integration tests, KeysController integration tests, and the schema tests from Plan 1).

---

### Task 9: Update Docker Compose with JWT Secret

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Add JWT secret to docker-compose environment**

Add to the `api` service `environment` section in `docker-compose.yml`:

```yaml
      Jwt__Secret: "DockerDevSecretKeyThatIsAtLeast32BytesLongForHmacSha256!!"
      Jwt__Issuer: "Vanalytics"
      Jwt__Audience: "Vanalytics"
      Jwt__AccessTokenExpirationMinutes: "15"
      Jwt__RefreshTokenExpirationDays: "7"
```

- [ ] **Step 2: Verify Docker Compose still works**

```bash
docker compose up --build -d
sleep 5
curl http://localhost:5000/health
docker compose down
```

Expected: `{"status":"healthy"}`

---

### Task 10: Full Auth Flow Smoke Test via Docker Compose

This is a manual verification task — not automated tests. Run the full flow against the Docker Compose stack.

- [ ] **Step 1: Start the stack**

```bash
docker compose up --build -d
sleep 5
```

- [ ] **Step 2: Register a new user**

```bash
curl -s -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","username":"testuser","password":"TestPass123!"}'
```

Expected: JSON with `accessToken`, `refreshToken`, `expiresAt`.

- [ ] **Step 3: Login with the new user**

```bash
curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"TestPass123!"}'
```

Expected: JSON with new tokens.

- [ ] **Step 4: Hit /me with the access token**

```bash
TOKEN="<access token from step 3>"
curl -s http://localhost:5000/api/auth/me -H "Authorization: Bearer $TOKEN"
```

Expected: User profile JSON.

- [ ] **Step 5: Generate an API key**

```bash
curl -s -X POST http://localhost:5000/api/keys/generate -H "Authorization: Bearer $TOKEN"
```

Expected: JSON with `apiKey`, `generatedAt`.

- [ ] **Step 6: Refresh the token**

```bash
REFRESH="<refresh token from step 3>"
curl -s -X POST http://localhost:5000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH\"}"
```

Expected: New token pair.

- [ ] **Step 7: Tear down**

```bash
docker compose down
```

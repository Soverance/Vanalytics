using System.Text;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Scalar.AspNetCore;
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
builder.Services.AddSingleton<TokenService>();
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
        var hash = BCrypt.Net.BCrypt.HashPassword(adminPassword);
        await AdminSeeder.SeedAsync(db, adminEmail, adminUsername, hash, logger);
    }

    // Seed item database (skip in integration tests via config)
    if (!string.Equals(app.Configuration["SKIP_ITEM_SEED"], "true", StringComparison.OrdinalIgnoreCase))
    {
        var httpFactory = scope.ServiceProvider.GetRequiredService<IHttpClientFactory>();
        await ItemDatabaseSeeder.SeedAsync(db, httpFactory, logger);
    }
}

// HTTPS redirection in production (skipped when behind a reverse proxy
// that terminates TLS, e.g., Azure Container Apps + Cloudflare)
if (!app.Environment.IsDevelopment() &&
    !string.Equals(app.Configuration["DISABLE_HTTPS_REDIRECT"], "true", StringComparison.OrdinalIgnoreCase))
{
    app.UseHttpsRedirection();
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

using System.Reflection;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using Microsoft.OpenApi;
using Scalar.AspNetCore;
using Soverance.Auth.Endpoints;
using Soverance.Auth.Extensions;
using Soverance.Auth.Models;
using Soverance.Auth.Services;
using Soverance.Forum.Extensions;
using Soverance.Forum.Services;
using Soverance.Data.Extensions;
using Vanalytics.Api.Middleware;
using Vanalytics.Api.Services;
using Vanalytics.Api.Services.Sync;
using Vanalytics.Data;

var builder = WebApplication.CreateBuilder(args);

// Database
builder.Services.AddSoveranceSqlServer<VanalyticsDbContext>(builder.Configuration);

// Authentication
builder.Services.AddSoveranceJwtAuth(builder.Configuration)
    .AddSoveranceApiKeyAuth();
builder.Services.AddSingleton<ISamlSignInHandler, JwtSamlSignInHandler>();
builder.Services.AddScoped<AuthResponseService>();

builder.Services.AddMemoryCache();
builder.Services.AddAuthorization();
builder.Services.AddControllers();
builder.Services.AddHttpClient();

// CORS — allow only configured origins (browser-enforced; does not affect non-browser
// clients like the Windower addon, which use native HTTP and bypass CORS entirely)
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.WithOrigins(allowedOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

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
        document.Components.SecuritySchemes ??= new Dictionary<string, IOpenApiSecurityScheme>();
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
builder.Services.AddSingleton<VanadielClock>();
builder.Services.AddScoped<OAuthService>();
builder.Services.AddScoped<DatMappingService>();
builder.Services.AddSingleton<RateLimiter>();
builder.Services.AddSingleton<EconomyRateLimiter>();
builder.Services.AddSingleton<LoginRateLimiter>();
builder.Services.AddSingleton<SessionRateLimiter>();

// Item image storage: Azure Blob in production, local filesystem in dev
if (!string.IsNullOrEmpty(builder.Configuration["AzureStorage:ConnectionString"]))
    builder.Services.AddSingleton<IItemImageStore, AzureBlobItemImageStore>();
else
    builder.Services.AddSingleton<IItemImageStore, LocalItemImageStore>();

// Forum attachment storage: Azure Blob in production, local filesystem in dev
if (!string.IsNullOrEmpty(builder.Configuration["AzureStorage:ConnectionString"]))
    builder.Services.AddSingleton<IForumAttachmentStore, AzureBlobForumAttachmentStore>();
else
    builder.Services.AddSingleton<IForumAttachmentStore, LocalForumAttachmentStore>();
builder.Services.AddHttpClient("PlayOnline", client =>
{
    client.Timeout = TimeSpan.FromSeconds(15);
});
// Sync providers (admin-triggered)
builder.Services.AddSingleton<SyncOrchestrator>();
builder.Services.AddKeyedSingleton<ISyncProvider, ItemSyncProvider>("items");
builder.Services.AddKeyedSingleton<ISyncProvider, IconSyncProvider>("icons");
builder.Services.AddKeyedSingleton<ISyncProvider, ZoneSyncProvider>("zones");

builder.Services.AddHostedService<ServerStatusScraper>();
// ItemDatabaseSyncJob removed — item data is static game data that only changes
// when SE patches the game. Sync should only be triggered by an admin from /admin/data.
builder.Services.AddHostedService<BazaarStalenessJob>();

// Forum
builder.Services.AddForumServices();
builder.Services.AddScoped<IForumAuthorResolver, VanalyticsForumAuthorResolver>();
builder.Services.AddScoped<IForumSearchService, ForumSearchService>();

// Run EF migrations + seeding in the background so the HTTP server starts
// immediately and can respond to health/startup probes while the database
// is still waking up (Azure SQL auto-pause) or migrations are running.
builder.Services.AddHostedService<DatabaseMigrationService>();

var app = builder.Build();

// Generate a dev JWT for Scalar API docs pre-authentication
if (app.Environment.IsDevelopment())
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
    // In dev, run migrations synchronously so the dev token can be generated
    await db.Database.MigrateAsync();
    var adminUser = await db.Set<User>().FirstOrDefaultAsync(u => u.IsSystemAccount);
    if (adminUser is not null)
    {
        var tokenService = scope.ServiceProvider.GetRequiredService<TokenService>();
        app.Configuration["DevAdminToken"] = tokenService.GenerateAccessToken(adminUser);
    }
}

// Forward proxy headers so RemoteIpAddress reflects the real client IP.
// Required behind Cloudflare + Azure Container Apps, which both set X-Forwarded-For.
// In production, KnownProxies/KnownNetworks are cleared to trust all forwarders —
// safe because Azure Container Apps only exposes the container via its own ingress.
if (!app.Environment.IsDevelopment())
{
    app.UseForwardedHeaders(new ForwardedHeadersOptions
    {
        ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto,
        // Clear defaults so all proxy IPs in the chain are trusted.
        // Azure Container Apps + Cloudflare don't have fixed IPs to whitelist.
        KnownProxies = { },
        KnownIPNetworks = { },
    });
}

// Global error handling — catches unhandled exceptions and returns clean JSON
app.UseMiddleware<ExceptionHandlerMiddleware>();

// Security headers on every response
app.UseMiddleware<SecurityHeadersMiddleware>();

// HTTPS redirection in production (skipped when behind a reverse proxy
// that terminates TLS, e.g., Azure Container Apps + Cloudflare)
if (!app.Environment.IsDevelopment() &&
    !string.Equals(app.Configuration["DISABLE_HTTPS_REDIRECT"], "true", StringComparison.OrdinalIgnoreCase))
{
    app.UseHttpsRedirection();
}

// Serve item images — redirect to Azure blob URL or serve from local disk
var azureImageStore = app.Services.GetService<IItemImageStore>() as AzureBlobItemImageStore;
if (azureImageStore != null)
{
    // Azure: redirect /item-images/{path} to the public blob URL
    app.MapGet("/item-images/{**path}", (string path) =>
        Results.Redirect($"{azureImageStore.BaseUrl}/{path}", permanent: false));
}
else
{
    // Local: serve from filesystem
    var itemImagesPath = app.Configuration["ItemImages:BasePath"]
        ?? Path.Combine(AppContext.BaseDirectory, "item-images");
    Directory.CreateDirectory(itemImagesPath);
    app.UseStaticFiles(new StaticFileOptions
    {
        FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(itemImagesPath),
        RequestPath = "/item-images"
    });
}

// Serve forum attachments — redirect to Azure blob URL or serve from local disk
var azureAttachmentStore = app.Services.GetService<IForumAttachmentStore>() as AzureBlobForumAttachmentStore;
if (azureAttachmentStore != null)
{
    app.MapGet("/forum-attachments/{**path}", (string path) =>
        Results.Redirect($"{azureAttachmentStore.BaseUrl}/{path}", permanent: false));
}
else
{
    var forumAttachmentsPath = app.Configuration["ForumAttachments:BasePath"]
        ?? Path.Combine(AppContext.BaseDirectory, "forum-attachments");
    Directory.CreateDirectory(forumAttachmentsPath);
    app.UseStaticFiles(new StaticFileOptions
    {
        FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(forumAttachmentsPath),
        RequestPath = "/forum-attachments"
    });
}

// Serve the embedded SPA (Vanalytics.Web built into wwwroot/)
app.UseStaticFiles();

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    var devToken = app.Configuration["DevAdminToken"];
    app.MapScalarApiReference("/api/docs", options =>
    {
        options.Title = "Vanalytics API";
        options.OpenApiRoutePattern = "/openapi/{documentName}.json";
        if (!string.IsNullOrEmpty(devToken))
        {
            options
                .AddHttpAuthentication("BearerAuth", scheme => scheme.WithToken(devToken))
                .AddPreferredSecuritySchemes("BearerAuth");
        }
    });
}
app.MapControllers();
app.MapSamlEndpoints();
app.MapSamlAdminEndpoints();
app.MapSamlExchangeEndpoint();
var startedAt = DateTimeOffset.UtcNow;
app.MapGet("/health", async (VanalyticsDbContext db, IHostEnvironment env) =>
{
    var dbHealthy = false;
    try
    {
        dbHealthy = await db.Database.CanConnectAsync();
    }
    catch
    {
        // Connection failure — dbHealthy stays false
    }

    var version = typeof(Program).Assembly
        .GetCustomAttribute<System.Reflection.AssemblyInformationalVersionAttribute>()?.InformationalVersion
        ?? typeof(Program).Assembly.GetName().Version?.ToString()
        ?? "unknown";

    var status = dbHealthy ? "healthy" : "degraded";

    return Results.Json(new
    {
        status,
        version,
        environment = env.EnvironmentName,
        uptime = (DateTimeOffset.UtcNow - startedAt).ToString(@"d\.hh\:mm\:ss"),
        database = dbHealthy ? "connected" : "unavailable",
    }, statusCode: dbHealthy ? 200 : 503);
});

// SPA fallback: serve index.html for unmatched non-file, non-API requests
app.MapFallbackToFile("index.html");

app.Run();

// Make Program class accessible for WebApplicationFactory in tests
public partial class Program { }

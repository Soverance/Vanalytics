using Microsoft.EntityFrameworkCore;
using Microsoft.OpenApi;
using Scalar.AspNetCore;
using Soverance.Auth.Extensions;
using Soverance.Auth.Services;
using Soverance.Data.Extensions;
using Vanalytics.Api.Services;
using Vanalytics.Api.Services.Sync;
using Vanalytics.Data;

var builder = WebApplication.CreateBuilder(args);

// Database
builder.Services.AddSoveranceSqlServer<VanalyticsDbContext>(builder.Configuration);

// Authentication
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
        document.Components!.SecuritySchemes["BearerAuth"] = new OpenApiSecurityScheme
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

// Item image storage: Azure Blob in production, local filesystem in dev
if (!string.IsNullOrEmpty(builder.Configuration["AzureStorage:ConnectionString"]))
    builder.Services.AddSingleton<IItemImageStore, AzureBlobItemImageStore>();
else
    builder.Services.AddSingleton<IItemImageStore, LocalItemImageStore>();
builder.Services.AddHttpClient("PlayOnline", client =>
{
    client.Timeout = TimeSpan.FromSeconds(15);
});
// Sync providers (admin-triggered)
builder.Services.AddSingleton<SyncOrchestrator>();
builder.Services.AddKeyedSingleton<ISyncProvider, ItemSyncProvider>("items");
builder.Services.AddKeyedSingleton<ISyncProvider, IconSyncProvider>("icons");

builder.Services.AddHostedService<ServerStatusScraper>();
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

}

// HTTPS redirection in production (skipped when behind a reverse proxy
// that terminates TLS, e.g., Azure Container Apps + Cloudflare)
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

using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Vanalytics.Api.Middleware;
using Xunit;

namespace Vanalytics.Api.Tests.Middleware;

public class SecurityHeadersMiddlewareTests
{
    private static async Task<HttpContext> InvokeAsync(string path = "/")
    {
        var services = new ServiceCollection();
        services.AddSingleton<IHostEnvironment>(new StubHostEnvironment());
        var context = new DefaultHttpContext { RequestServices = services.BuildServiceProvider() };
        context.Request.Path = path;

        var middleware = new SecurityHeadersMiddleware(_ => Task.CompletedTask);
        await middleware.InvokeAsync(context);
        return context;
    }

    // Every domain that hosts avatar images must be whitelisted in the CSP img-src
    // directive, or the browser silently renders a broken image (Discord avatars
    // regressed exactly this way). When adding a new OAuth provider or image source,
    // add its CDN here AND in SecurityHeadersMiddleware so this test fails loudly if
    // one is forgotten.
    [Theory]
    [InlineData("https://*.googleusercontent.com")] // Google OAuth avatars
    [InlineData("https://cdn.discordapp.com")]      // Discord OAuth avatars
    [InlineData("https://*.blob.core.windows.net")] // SAML avatars + item/forum images in blob storage
    public async Task Csp_ImgSrc_AllowsAvatarSourceDomain(string domain)
    {
        var context = await InvokeAsync();
        var csp = context.Response.Headers["Content-Security-Policy"].ToString();

        var imgSrc = csp.Split("; ").Single(d => d.StartsWith("img-src ", StringComparison.Ordinal));
        Assert.Contains(domain, imgSrc);
    }

    private sealed class StubHostEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = Environments.Production;
        public string ApplicationName { get; set; } = "Vanalytics.Api.Tests";
        public string ContentRootPath { get; set; } = "";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}

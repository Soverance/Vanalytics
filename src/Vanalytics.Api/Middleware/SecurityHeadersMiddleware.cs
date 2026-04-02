namespace Vanalytics.Api.Middleware;

public class SecurityHeadersMiddleware
{
    private readonly RequestDelegate _next;

    public SecurityHeadersMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        // Skip security headers for Scalar API docs in Development
        // (Scalar uses inline scripts that CSP would block)
        var env = context.RequestServices.GetRequiredService<IHostEnvironment>();
        if (env.IsDevelopment() && context.Request.Path.StartsWithSegments("/api/docs"))
        {
            await _next(context);
            return;
        }

        var headers = context.Response.Headers;

        // Prevent MIME-type sniffing
        headers["X-Content-Type-Options"] = "nosniff";

        // Block framing (clickjacking protection)
        headers["X-Frame-Options"] = "DENY";

        // Disable legacy XSS filter (modern browsers should rely on CSP instead)
        headers["X-XSS-Protection"] = "0";

        // Control referrer information sent with requests
        headers["Referrer-Policy"] = "strict-origin-when-cross-origin";

        // Content Security Policy
        // - 'self' for scripts, styles, fonts, images
        // - 'unsafe-inline' for styles (Tailwind + Three.js inject inline styles)
        // - blob: for Three.js textures generated from DAT file parsing
        // - data: for small inline images (icons, etc.)
        // - Azure blob storage domain for item images and forum attachments
        headers["Content-Security-Policy"] = string.Join("; ",
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' blob: data: https://*.blob.core.windows.net https://*.googleusercontent.com",
            "font-src 'self'",
            "connect-src 'self'",
            "media-src 'self'",
            "object-src 'none'",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'"
        );

        // Restrict browser features the app doesn't need
        headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=()";

        await _next(context);
    }
}

using System.IO.Compression;
using Microsoft.AspNetCore.Mvc;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/addon")]
public class AddonController : ControllerBase
{
    private static readonly string AddonPath =
        Path.Combine(AppContext.BaseDirectory, "addon");

    // Files that ship in the addon folder but must NEVER be served by the
    // self-updater: settings.xml holds the player's API key and personal config.
    private static readonly HashSet<string> ExcludedFiles =
        new(StringComparer.OrdinalIgnoreCase) { "settings.xml" };

    // Relative (forward-slash) paths of every file the addon should self-update,
    // excluding the player-local files above.
    private static IEnumerable<string> ShippedFiles()
    {
        if (!Directory.Exists(AddonPath)) yield break;
        foreach (var file in Directory.GetFiles(AddonPath, "*", SearchOption.AllDirectories))
        {
            var rel = Path.GetRelativePath(AddonPath, file).Replace('\\', '/');
            if (ExcludedFiles.Contains(rel)) continue;
            yield return rel;
        }
    }

    [HttpGet("download")]
    public IActionResult Download()
    {
        if (!Directory.Exists(AddonPath))
            return NotFound(new { error = "Addon files not found on server." });

        var files = Directory.GetFiles(AddonPath, "*", SearchOption.AllDirectories);
        if (files.Length == 0)
            return NotFound(new { error = "Addon files not found on server." });

        var stream = new MemoryStream();
        using (var zip = new ZipArchive(stream, ZipArchiveMode.Create, leaveOpen: true))
        {
            foreach (var file in files)
            {
                var entryName = Path.Combine("vanalytics",
                    Path.GetRelativePath(AddonPath, file)).Replace('\\', '/');
                zip.CreateEntryFromFile(file, entryName);
            }
        }

        stream.Position = 0;
        return File(stream, "application/zip", "vanalytics-addon.zip");
    }

    [HttpGet("manifest")]
    public IActionResult Manifest()
    {
        if (!Directory.Exists(AddonPath))
            return NotFound(new { error = "Addon files not found on server." });

        var files = ShippedFiles()
            .Select(rel => new
            {
                path = rel,
                size = new FileInfo(Path.Combine(AddonPath, rel)).Length,
            })
            .OrderBy(f => f.path, StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (files.Count == 0)
            return NotFound(new { error = "Addon files not found on server." });

        return Ok(new { version = AppVersion.Current, files });
    }

    [HttpGet("file")]
    public IActionResult GetFile([FromQuery] string? path)
    {
        if (string.IsNullOrWhiteSpace(path))
            return BadRequest(new { error = "path is required." });

        var normalized = path.Replace('\\', '/');

        // Allow only files that are members of the shipped (non-excluded) set.
        // This rejects traversal, absolute paths, and settings.xml outright,
        // because none of those match a known relative path.
        var allowed = ShippedFiles()
            .Any(p => string.Equals(p, normalized, StringComparison.OrdinalIgnoreCase));
        if (!allowed)
            return NotFound(new { error = "Unknown file." });

        var fullResolved = Path.GetFullPath(Path.Combine(AddonPath, normalized));
        var rootWithSep = Path.GetFullPath(AddonPath)
            .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
            + Path.DirectorySeparatorChar;

        // Defense in depth: the resolved path must stay inside AddonPath.
        if (!fullResolved.StartsWith(rootWithSep, StringComparison.OrdinalIgnoreCase)
            || !System.IO.File.Exists(fullResolved))
            return NotFound(new { error = "Unknown file." });

        var bytes = System.IO.File.ReadAllBytes(fullResolved);
        return File(bytes, "application/octet-stream");
    }
}

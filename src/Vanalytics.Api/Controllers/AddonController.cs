using System.IO.Compression;
using Microsoft.AspNetCore.Mvc;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/addon")]
public class AddonController : ControllerBase
{
    private static readonly string AddonPath =
        Path.Combine(AppContext.BaseDirectory, "addon");

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
}

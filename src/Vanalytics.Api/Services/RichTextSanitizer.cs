using System.Text;

namespace Vanalytics.Api.Services;

// Strips <img> tags whose src does not start with the allowed prefix (our own
// attachment store base URL). Extracted from ForumController so linkshell
// profile rich text can reuse the exact same rule.
public static class RichTextSanitizer
{
    public static string SanitizeImageSources(string html, string allowedPrefix)
    {
        var result = new StringBuilder(html.Length);
        var pos = 0;
        while (pos < html.Length)
        {
            var imgStart = html.IndexOf("<img ", pos, StringComparison.OrdinalIgnoreCase);
            if (imgStart < 0)
            {
                result.Append(html, pos, html.Length - pos);
                break;
            }
            result.Append(html, pos, imgStart - pos);

            var imgEnd = html.IndexOf('>', imgStart);
            if (imgEnd < 0)
            {
                result.Append(html, pos, html.Length - pos);
                break;
            }
            imgEnd++;

            var tag = html[imgStart..imgEnd];
            var srcIdx = tag.IndexOf("src=\"", StringComparison.OrdinalIgnoreCase);
            if (srcIdx >= 0)
            {
                var srcStart = srcIdx + 5;
                var srcEnd = tag.IndexOf('"', srcStart);
                if (srcEnd > srcStart)
                {
                    var src = tag[srcStart..srcEnd];
                    if (src.StartsWith(allowedPrefix, StringComparison.OrdinalIgnoreCase))
                    {
                        result.Append(tag);
                    }
                    // else: drop the img tag (external source)
                }
            }

            pos = imgEnd;
        }
        return result.ToString();
    }
}

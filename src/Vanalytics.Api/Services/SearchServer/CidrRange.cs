using System.Net;
using System.Net.Sockets;

namespace Vanalytics.Api.Services.SearchServer;

public static class CidrRange
{
    public static IEnumerable<string> Enumerate(string cidr)
    {
        var parts = cidr.Split('/');
        var baseIp = IPAddress.Parse(parts[0]).GetAddressBytes();
        int prefix = int.Parse(parts[1]);
        if (prefix < 1 || prefix > 32)
            throw new ArgumentOutOfRangeException(nameof(cidr), $"Unsupported CIDR prefix /{prefix}; expected /1../32");
        uint start = (uint)((baseIp[0] << 24) | (baseIp[1] << 16) | (baseIp[2] << 8) | baseIp[3]);
        uint mask = prefix == 0 ? 0 : 0xFFFFFFFF << (32 - prefix);
        uint network = start & mask;
        uint count = prefix == 32 ? 1u : (~mask) + 1;
        for (uint i = 0; i < count; i++)
        {
            uint ip = network + i;
            yield return $"{(ip >> 24) & 0xFF}.{(ip >> 16) & 0xFF}.{(ip >> 8) & 0xFF}.{ip & 0xFF}";
        }
    }

    /// <summary>
    /// Validates an IPv4 CIDR of the form a.b.c.d/n (n in 1..32) WITHOUT enumerating it,
    /// so a large prefix (e.g. /8) doesn't expand millions of addresses. Rejects /0 to
    /// match <see cref="Enumerate"/>, plus IPv6, short/oversized octets, and malformed input.
    /// </summary>
    public static bool IsValid(string cidr)
    {
        if (string.IsNullOrWhiteSpace(cidr)) return false;
        var parts = cidr.Split('/');
        if (parts.Length != 2) return false;
        // Require exactly four dotted octets (IPAddress.TryParse would accept "1.2.3").
        if (parts[0].Split('.').Length != 4) return false;
        if (!IPAddress.TryParse(parts[0], out var ip) || ip.AddressFamily != AddressFamily.InterNetwork)
            return false;
        if (!int.TryParse(parts[1], out int prefix)) return false;
        return prefix >= 1 && prefix <= 32;
    }

    /// <summary>
    /// Splits newline-separated CIDR config text into trimmed lines, dropping blank lines
    /// and '#' comments. Pure; does not validate the CIDRs.
    /// </summary>
    public static IReadOnlyList<string> ParseCidrLines(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return Array.Empty<string>();
        return text.Split('\n')
            .Select(l => l.Trim())
            .Where(l => l.Length > 0 && !l.StartsWith('#'))
            .ToList();
    }
}

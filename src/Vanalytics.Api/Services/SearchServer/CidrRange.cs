using System.Net;

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
}

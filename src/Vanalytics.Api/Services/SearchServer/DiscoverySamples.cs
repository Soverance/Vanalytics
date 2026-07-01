using System.Text.Json;

namespace Vanalytics.Api.Services.SearchServer;

public record SampleSale(int Price, DateTimeOffset SoldAt, string SellerName, string BuyerName);
public record ProbeItemSample(int ItemId, IReadOnlyList<SampleSale> Sales);

/// <summary>JSON (de)serialization for a DiscoveredEndpoint's per-probe-item sample sales.</summary>
public static class DiscoverySamples
{
    private static readonly JsonSerializerOptions Opts = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    public static string Serialize(IReadOnlyList<ProbeItemSample> samples) =>
        JsonSerializer.Serialize(samples, Opts);

    public static List<ProbeItemSample> Deserialize(string json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new();
        try { return JsonSerializer.Deserialize<List<ProbeItemSample>>(json, Opts) ?? new(); }
        catch (JsonException) { return new(); }
    }
}

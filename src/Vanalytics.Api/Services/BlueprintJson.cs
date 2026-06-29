using System.Text.Json;

namespace Vanalytics.Api.Services;

// Single source of truth for blueprint JSON handling so the controller (which serializes the graph on
// save and deserializes on read) and BlueprintGenerationService can never drift on serializer settings —
// a mismatch would silently break the graph round-trip. Augment deserialization lives here too.
public static class BlueprintJson
{
    public static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public static List<string> DeserializeAugments(string? json) =>
        string.IsNullOrEmpty(json) ? [] : (JsonSerializer.Deserialize<List<string>>(json) ?? []);
}

namespace Vanalytics.Core.DTOs.Blueprints;

public class GenerateBlueprintResponse
{
    public string Lua { get; set; } = string.Empty;
    public List<string> Warnings { get; set; } = [];
}

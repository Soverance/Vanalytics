namespace Vanalytics.Core.DTOs.Blueprints;

public class GenerateBlueprintResponse
{
    public string Lua { get; set; } = string.Empty;     // "" when there are errors (codegen skipped)
    public List<Diagnostic> Diagnostics { get; set; } = [];
}

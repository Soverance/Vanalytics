namespace Vanalytics.Core.DTOs.Workflows;

public class GenerateWorkflowResponse
{
    public string Lua { get; set; } = string.Empty;
    public List<string> Warnings { get; set; } = [];
}

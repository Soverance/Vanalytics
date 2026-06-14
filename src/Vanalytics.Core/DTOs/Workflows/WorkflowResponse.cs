namespace Vanalytics.Core.DTOs.Workflows;

public class WorkflowResponse
{
    public string Job { get; set; } = string.Empty;
    public WorkflowGraphDto Graph { get; set; } = new();
    public DateTimeOffset? UpdatedAt { get; set; }   // null when no workflow saved yet
}

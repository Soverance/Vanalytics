namespace Vanalytics.Core.Models;

public class MacroPage
{
    public Guid Id { get; set; }
    public Guid MacroBookId { get; set; }
    public int PageNumber { get; set; }

    public MacroBook Book { get; set; } = null!;
    public List<Macro> Macros { get; set; } = [];
}

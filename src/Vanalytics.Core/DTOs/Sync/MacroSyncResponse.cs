using System.Collections.Generic;

namespace Vanalytics.Core.DTOs.Sync;

public class MacroSyncResponse
{
    public string Message { get; set; } = string.Empty;
    public int BooksUpdated { get; set; }
    public List<int> Conflicts { get; set; } = [];
    public List<MacroSyncBookResult> Books { get; set; } = [];
}

public class MacroSyncBookResult
{
    public int BookNumber { get; set; }
    public string ContentHash { get; set; } = string.Empty;
}

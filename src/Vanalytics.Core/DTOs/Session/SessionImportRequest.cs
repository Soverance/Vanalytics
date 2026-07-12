using System.ComponentModel.DataAnnotations;

namespace Vanalytics.Core.DTOs.Session;

// Used by POST /api/session/import to recover a completed run from a local
// .jsonl session file whose live upload failed. Unlike the live flow, the
// session's timestamps come from the events themselves (not "now"), so a
// recovered run keeps its original duration and date.
public class SessionImportRequest
{
    [Required, MaxLength(64)]
    public string CharacterName { get; set; } = string.Empty;

    [Required, MaxLength(64)]
    public string Server { get; set; } = string.Empty;

    [MaxLength(64)]
    public string Zone { get; set; } = string.Empty;

    // Same per-entry sanitize-don't-reject contract as SessionEventsRequest.
    [Required]
    public List<SessionEventEntry> Events { get; set; } = [];
}

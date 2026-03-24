namespace Vanalytics.Api.DTOs;

public record EnrichedPostResponse(
    long Id, Guid AuthorId, string? Body, bool IsEdited, bool IsDeleted,
    int VoteCount, bool CurrentUserVoted,
    DateTimeOffset CreatedAt, DateTimeOffset? UpdatedAt,
    string AuthorUsername, string? AuthorAvatarHash, int AuthorPostCount, DateTimeOffset AuthorJoinedAt);

public record EnrichedThreadSummaryResponse(
    int Id, string Title, string Slug, bool IsPinned, bool IsLocked,
    Guid AuthorId, int ReplyCount, int VoteCount,
    DateTimeOffset CreatedAt, DateTimeOffset LastPostAt,
    string AuthorUsername, string? AuthorAvatarHash);

public record EnrichedThreadDetailResponse(
    int Id, string Title, string Slug, int CategoryId, string CategoryName, string CategorySlug,
    bool IsPinned, bool IsLocked, Guid AuthorId,
    DateTimeOffset CreatedAt, DateTimeOffset LastPostAt,
    string AuthorUsername, string? AuthorAvatarHash);

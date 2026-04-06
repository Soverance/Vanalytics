using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Core.DTOs.Macros;
using Vanalytics.Core.DTOs.Sync;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/macros")]
[Authorize]
public class MacrosController : ControllerBase
{
    private readonly VanalyticsDbContext _db;

    public MacrosController(VanalyticsDbContext db)
    {
        _db = db;
    }

    [HttpGet("{characterId:guid}")]
    public async Task<IActionResult> ListBooks(Guid characterId)
    {
        var userId = GetUserId();
        var character = await _db.Characters.FirstOrDefaultAsync(c => c.Id == characterId);
        if (character is null) return NotFound();
        if (character.UserId != userId) return Forbid();

        var books = await _db.MacroBooks
            .Include(b => b.Pages).ThenInclude(p => p.Macros)
            .Where(b => b.CharacterId == characterId)
            .OrderBy(b => b.BookNumber)
            .ToListAsync();

        var summaries = books.Select(b =>
        {
            var allMacros = b.Pages.SelectMany(p => p.Macros).ToList();

            return new MacroBookSummary
            {
                BookNumber = b.BookNumber,
                ContentHash = b.ContentHash,
                BookTitle = !string.IsNullOrWhiteSpace(b.BookTitle) ? b.BookTitle : $"Book {b.BookNumber:D2}",
                PendingPush = b.PendingPush,
                IsEmpty = !allMacros.Any(m => !string.IsNullOrEmpty(m.Name)),
                UpdatedAt = b.UpdatedAt
            };
        }).ToList();

        return Ok(summaries);
    }

    [HttpGet("{characterId:guid}/{bookNumber:int}")]
    public async Task<IActionResult> GetBook(Guid characterId, int bookNumber)
    {
        var userId = GetUserId();
        var character = await _db.Characters.FirstOrDefaultAsync(c => c.Id == characterId);
        if (character is null) return NotFound();
        if (character.UserId != userId) return Forbid();

        var book = await _db.MacroBooks
            .Include(b => b.Pages).ThenInclude(p => p.Macros)
            .FirstOrDefaultAsync(b => b.CharacterId == characterId && b.BookNumber == bookNumber);
        if (book is null) return NotFound();

        return Ok(MapBookToDetail(book));
    }

    [HttpPut("{characterId:guid}/{bookNumber:int}")]
    public async Task<IActionResult> UpdateBook(Guid characterId, int bookNumber, [FromBody] MacroBookUpdateRequest request)
    {
        var userId = GetUserId();
        var character = await _db.Characters.FirstOrDefaultAsync(c => c.Id == characterId);
        if (character is null) return NotFound();
        if (character.UserId != userId) return Forbid();

        var book = await _db.MacroBooks
            .Include(b => b.Pages).ThenInclude(p => p.Macros)
            .FirstOrDefaultAsync(b => b.CharacterId == characterId && b.BookNumber == bookNumber);
        if (book is null) return NotFound();

        // Snapshot before overwriting
        await SnapshotBookIfNotEmpty(book, "web edit");

        // Clear existing pages/macros
        await _db.Macros
            .Where(m => m.Page.MacroBookId == book.Id)
            .ExecuteDeleteAsync();
        await _db.MacroPages
            .Where(p => p.MacroBookId == book.Id)
            .ExecuteDeleteAsync();

        // Re-add from request
        foreach (var pageEntry in request.Pages)
        {
            var page = new MacroPage
            {
                Id = Guid.NewGuid(),
                MacroBookId = book.Id,
                PageNumber = pageEntry.PageNumber
            };
            _db.MacroPages.Add(page);

            foreach (var macroEntry in pageEntry.Macros)
            {
                _db.Macros.Add(new Macro
                {
                    Id = Guid.NewGuid(),
                    MacroPageId = page.Id,
                    Set = macroEntry.Set,
                    Position = macroEntry.Position,
                    Name = macroEntry.Name,
                    Icon = macroEntry.Icon,
                    Line1 = macroEntry.Line1,
                    Line2 = macroEntry.Line2,
                    Line3 = macroEntry.Line3,
                    Line4 = macroEntry.Line4,
                    Line5 = macroEntry.Line5,
                    Line6 = macroEntry.Line6
                });
            }
        }

        // Recompute content hash from the new data
        book.ContentHash = ComputeContentHash(request);
        book.PendingPush = true;
        book.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();

        var detail = await GetBookDetail(book);
        return Ok(detail);
    }

    private Guid GetUserId() => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    internal static string ComputeContentHash(MacroBookUpdateRequest request)
    {
        var sb = new StringBuilder();
        foreach (var page in request.Pages.OrderBy(p => p.PageNumber))
        {
            foreach (var m in page.Macros.OrderBy(m => m.Set).ThenBy(m => m.Position))
            {
                sb.Append(m.Set).Append(m.Position).Append(m.Name).Append(m.Icon);
                sb.Append(m.Line1).Append(m.Line2).Append(m.Line3);
                sb.Append(m.Line4).Append(m.Line5).Append(m.Line6);
            }
        }
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(sb.ToString()));
        return Convert.ToHexStringLower(hash)[..16];
    }

    internal static string ComputeContentHash(MacroSyncBook syncBook)
    {
        var sb = new StringBuilder();
        foreach (var page in syncBook.Pages.OrderBy(p => p.PageNumber))
        {
            foreach (var macro in page.Macros.OrderBy(m => m.Set).ThenBy(m => m.Position))
            {
                sb.Append(macro.Set);
                sb.Append(macro.Position);
                sb.Append(macro.Name ?? string.Empty);
                sb.Append(macro.Icon);
                sb.Append(macro.Line1 ?? string.Empty);
                sb.Append(macro.Line2 ?? string.Empty);
                sb.Append(macro.Line3 ?? string.Empty);
                sb.Append(macro.Line4 ?? string.Empty);
                sb.Append(macro.Line5 ?? string.Empty);
                sb.Append(macro.Line6 ?? string.Empty);
            }
        }
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(sb.ToString()));
        return Convert.ToHexStringLower(hash)[..16];
    }

    [HttpGet("{characterId:guid}/{bookNumber:int}/history")]
    public async Task<IActionResult> GetBookHistory(Guid characterId, int bookNumber)
    {
        var userId = GetUserId();
        var character = await _db.Characters.FirstOrDefaultAsync(c => c.Id == characterId && c.UserId == userId);
        if (character == null) return NotFound();

        var book = await _db.MacroBooks
            .FirstOrDefaultAsync(b => b.CharacterId == characterId && b.BookNumber == bookNumber);
        if (book == null) return Ok(Array.Empty<MacroBookSnapshotSummary>());

        var snapshots = await _db.MacroBookSnapshots
            .Where(s => s.MacroBookId == book.Id)
            .OrderByDescending(s => s.CreatedAt)
            .Take(5)
            .Select(s => new MacroBookSnapshotSummary
            {
                Id = s.Id,
                ContentHash = s.ContentHash,
                BookTitle = s.BookTitle,
                Reason = s.Reason,
                CreatedAt = s.CreatedAt
            })
            .ToListAsync();

        return Ok(snapshots);
    }

    [HttpPost("{characterId:guid}/{bookNumber:int}/restore/{snapshotId:guid}")]
    public async Task<IActionResult> RestoreFromSnapshot(Guid characterId, int bookNumber, Guid snapshotId)
    {
        var userId = GetUserId();
        var character = await _db.Characters.FirstOrDefaultAsync(c => c.Id == characterId && c.UserId == userId);
        if (character == null) return NotFound();

        var book = await _db.MacroBooks
            .FirstOrDefaultAsync(b => b.CharacterId == characterId && b.BookNumber == bookNumber);
        if (book == null) return NotFound("Book not found");

        var snapshot = await _db.MacroBookSnapshots
            .FirstOrDefaultAsync(s => s.Id == snapshotId && s.MacroBookId == book.Id);
        if (snapshot == null) return NotFound("Snapshot not found");

        await SnapshotBookIfNotEmpty(book, "restore");

        var oldPages = await _db.MacroPages
            .Where(p => p.MacroBookId == book.Id)
            .ToListAsync();
        _db.MacroPages.RemoveRange(oldPages);

        var pages = JsonSerializer.Deserialize<List<SnapshotPageData>>(snapshot.SnapshotData);
        if (pages != null)
        {
            foreach (var pageData in pages)
            {
                var page = new MacroPage
                {
                    Id = Guid.NewGuid(),
                    MacroBookId = book.Id,
                    PageNumber = pageData.PageNumber
                };
                _db.MacroPages.Add(page);

                foreach (var macroData in pageData.Macros)
                {
                    _db.Macros.Add(new Macro
                    {
                        Id = Guid.NewGuid(),
                        MacroPageId = page.Id,
                        Set = macroData.Set,
                        Position = macroData.Position,
                        Name = macroData.Name ?? string.Empty,
                        Icon = macroData.Icon,
                        Line1 = macroData.Line1 ?? string.Empty,
                        Line2 = macroData.Line2 ?? string.Empty,
                        Line3 = macroData.Line3 ?? string.Empty,
                        Line4 = macroData.Line4 ?? string.Empty,
                        Line5 = macroData.Line5 ?? string.Empty,
                        Line6 = macroData.Line6 ?? string.Empty
                    });
                }
            }
        }

        book.ContentHash = snapshot.ContentHash;
        book.PendingPush = true;
        book.UpdatedAt = DateTimeOffset.UtcNow;

        await _db.SaveChangesAsync();

        var detail = await GetBookDetail(book);
        return Ok(detail);
    }

    private async Task SnapshotBookIfNotEmpty(MacroBook book, string reason)
    {
        var pages = await _db.MacroPages
            .Where(p => p.MacroBookId == book.Id)
            .Include(p => p.Macros)
            .OrderBy(p => p.PageNumber)
            .ToListAsync();

        if (pages.Count == 0) return;

        var snapshotData = pages.Select(p => new
        {
            p.PageNumber,
            Macros = p.Macros.OrderBy(m => m.Set).ThenBy(m => m.Position).Select(m => new
            {
                m.Set,
                m.Position,
                m.Name,
                m.Icon,
                m.Line1,
                m.Line2,
                m.Line3,
                m.Line4,
                m.Line5,
                m.Line6
            })
        });

        _db.MacroBookSnapshots.Add(new MacroBookSnapshot
        {
            Id = Guid.NewGuid(),
            MacroBookId = book.Id,
            BookNumber = book.BookNumber,
            ContentHash = book.ContentHash,
            BookTitle = book.BookTitle,
            SnapshotData = JsonSerializer.Serialize(snapshotData),
            Reason = reason,
            CreatedAt = DateTimeOffset.UtcNow
        });

        var excess = await _db.MacroBookSnapshots
            .Where(s => s.MacroBookId == book.Id)
            .OrderByDescending(s => s.CreatedAt)
            .Skip(5)
            .ToListAsync();

        if (excess.Count > 0)
            _db.MacroBookSnapshots.RemoveRange(excess);
    }

    private async Task<MacroBookDetail> GetBookDetail(MacroBook book)
    {
        var loadedBook = await _db.MacroBooks
            .Include(b => b.Pages)
                .ThenInclude(p => p.Macros)
            .FirstAsync(b => b.Id == book.Id);

        return new MacroBookDetail
        {
            BookNumber = loadedBook.BookNumber,
            ContentHash = loadedBook.ContentHash,
            PendingPush = loadedBook.PendingPush,
            UpdatedAt = loadedBook.UpdatedAt,
            Pages = loadedBook.Pages
                .OrderBy(p => p.PageNumber)
                .Select(p => new MacroPageDetail
                {
                    PageNumber = p.PageNumber,
                    Macros = p.Macros
                        .OrderBy(m => m.Set).ThenBy(m => m.Position)
                        .Select(m => new MacroDetail
                        {
                            Set = m.Set,
                            Position = m.Position,
                            Name = m.Name,
                            Icon = m.Icon,
                            Line1 = m.Line1,
                            Line2 = m.Line2,
                            Line3 = m.Line3,
                            Line4 = m.Line4,
                            Line5 = m.Line5,
                            Line6 = m.Line6
                        }).ToList()
                }).ToList()
        };
    }

    private static MacroBookDetail MapBookToDetail(MacroBook book) => new()
    {
        BookNumber = book.BookNumber,
        ContentHash = book.ContentHash,
        PendingPush = book.PendingPush,
        UpdatedAt = book.UpdatedAt,
        Pages = book.Pages.OrderBy(p => p.PageNumber).Select(p => new MacroPageDetail
        {
            PageNumber = p.PageNumber,
            Macros = p.Macros.OrderBy(m => m.Set).ThenBy(m => m.Position).Select(m => new MacroDetail
            {
                Set = m.Set,
                Position = m.Position,
                Name = m.Name,
                Icon = m.Icon,
                Line1 = m.Line1,
                Line2 = m.Line2,
                Line3 = m.Line3,
                Line4 = m.Line4,
                Line5 = m.Line5,
                Line6 = m.Line6
            }).ToList()
        }).ToList()
    };

    private class SnapshotPageData
    {
        public int PageNumber { get; set; }
        public List<SnapshotMacroData> Macros { get; set; } = [];
    }

    private class SnapshotMacroData
    {
        public string Set { get; set; } = string.Empty;
        public int Position { get; set; }
        public string Name { get; set; } = string.Empty;
        public int Icon { get; set; }
        public string Line1 { get; set; } = string.Empty;
        public string Line2 { get; set; } = string.Empty;
        public string Line3 { get; set; } = string.Empty;
        public string Line4 { get; set; } = string.Empty;
        public string Line5 { get; set; } = string.Empty;
        public string Line6 { get; set; } = string.Empty;
    }
}

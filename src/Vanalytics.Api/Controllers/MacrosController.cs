using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Core.DTOs.Macros;
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
            var firstNonEmpty = allMacros
                .OrderBy(m => m.Page.PageNumber).ThenBy(m => m.Set).ThenBy(m => m.Position)
                .FirstOrDefault(m => !string.IsNullOrEmpty(m.Name));

            return new MacroBookSummary
            {
                BookNumber = b.BookNumber,
                ContentHash = b.ContentHash,
                PendingPush = b.PendingPush,
                IsEmpty = !allMacros.Any(m => !string.IsNullOrEmpty(m.Name)),
                PreviewLabel = firstNonEmpty?.Name ?? "Empty",
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

        // Reload to return full detail
        book = await _db.MacroBooks
            .Include(b => b.Pages).ThenInclude(p => p.Macros)
            .FirstAsync(b => b.Id == book.Id);

        return Ok(MapBookToDetail(book));
    }

    private Guid GetUserId() => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    private static string ComputeContentHash(MacroBookUpdateRequest request)
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
}

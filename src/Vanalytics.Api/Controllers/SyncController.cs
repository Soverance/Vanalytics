using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Api.Services;
using Vanalytics.Core.DTOs.Macros;
using Vanalytics.Core.DTOs.Sync;
using Vanalytics.Core.Enums;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/sync")]
[Authorize(AuthenticationSchemes = "ApiKey")]
public class SyncController : ControllerBase
{
    private readonly VanalyticsDbContext _db;
    private readonly RateLimiter _rateLimiter;
    private readonly MacroRateLimiter _macroLimiter;

    public SyncController(VanalyticsDbContext db, RateLimiter rateLimiter, MacroRateLimiter macroLimiter)
    {
        _db = db;
        _rateLimiter = rateLimiter;
        _macroLimiter = macroLimiter;
    }

    // Resolve the character the addon is acting on. The addon MUST send
    // X-Character-Name and X-Server headers so the backend knows exactly
    // which character to read/write — falling back to "most recently synced
    // character" silently picks the wrong row for multi-character accounts.
    // Returns null if headers are missing or the character doesn't belong
    // to the authenticated user.
    private async Task<Character?> ResolveAddonCharacterAsync()
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var name = Request.Headers["X-Character-Name"].ToString();
        var server = Request.Headers["X-Server"].ToString();
        if (string.IsNullOrEmpty(name) || string.IsNullOrEmpty(server))
            return null;
        return await _db.Characters
            .FirstOrDefaultAsync(c => c.UserId == userId && c.Name == name && c.Server == server);
    }

    private const string MissingCharacterMessage =
        "Addon character context missing. The addon must send X-Character-Name and X-Server headers matching a character owned by this account. Update your Vanalytics addon if you're seeing this on a recent build.";

    private static bool TryParseLinkshellRank(string? rank, out LinkshellRank result)
    {
        switch ((rank ?? string.Empty).ToLowerInvariant())
        {
            case "leader": result = LinkshellRank.Leader; return true;
            case "sackholder": result = LinkshellRank.Sackholder; return true;
            case "member": result = LinkshellRank.Member; return true;
            default: result = LinkshellRank.Member; return false;
        }
    }

    [HttpPost]
    public async Task<IActionResult> Sync([FromBody] SyncRequest request)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        // Rate limit per API key (spec: 20 req/hr per API key)
        var apiKey = Request.Headers["X-Api-Key"].ToString();
        if (!_rateLimiter.IsAllowed(apiKey))
            return StatusCode(429, new { message = "Rate limit exceeded. Max 20 requests per hour." });

        // Find or create character
        var character = await _db.Characters
            .FirstOrDefaultAsync(c => c.Name == request.CharacterName && c.Server == request.Server);

        if (character is null)
        {
            character = new Character
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                Name = request.CharacterName,
                Server = request.Server,
                IsPublic = false,
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow
            };
            _db.Characters.Add(character);

            try
            {
                await _db.SaveChangesAsync();
            }
            catch (DbUpdateException)
            {
                // Unique constraint race condition — re-read
                _db.Entry(character).State = Microsoft.EntityFrameworkCore.EntityState.Detached;
                character = await _db.Characters
                    .FirstOrDefaultAsync(c => c.Name == request.CharacterName && c.Server == request.Server);
                if (character is null)
                    return StatusCode(500, new { message = "Failed to create character" });
            }
        }

        // Verify ownership
        if (character.UserId != userId)
            return StatusCode(403, new { message = "Character is not owned by this account" });

        // Parse race ID (1-8) into Race and Gender enums
        if (request.Race.HasValue)
        {
            (character.Race, character.Gender) = request.Race.Value switch
            {
                1 => (Race.Hume, Gender.Male),
                2 => (Race.Hume, Gender.Female),
                3 => (Race.Elvaan, Gender.Male),
                4 => (Race.Elvaan, Gender.Female),
                5 => (Race.Tarutaru, Gender.Male),
                6 => (Race.Tarutaru, Gender.Female),
                7 => (Race.Mithra, Gender.Female),
                8 => (Race.Galka, Gender.Male),
                _ => (character.Race, character.Gender)
            };
        }

        // Update character metadata
        character.FaceModelId = request.FaceModelId;
        character.SubJob = request.SubJob;
        character.SubJobLevel = request.SubJobLevel;
        character.MasterLevel = request.MasterLevel;
        character.ItemLevel = request.ItemLevel;
        character.Hp = request.Hp;
        character.MaxHp = request.MaxHp;
        character.Mp = request.Mp;
        character.MaxMp = request.MaxMp;
        character.Linkshell = request.Linkshell;
        character.LinkshellSlot = request.LinkshellSlot;
        character.Nation = request.Nation;
        character.NationRank = request.NationRank;
        character.RankPoints = request.RankPoints;
        character.TitleId = request.TitleId;
        character.Title = request.TitleName;
        character.BaseStr = request.BaseStr;
        character.BaseDex = request.BaseDex;
        character.BaseVit = request.BaseVit;
        character.BaseAgi = request.BaseAgi;
        character.BaseInt = request.BaseInt;
        character.BaseMnd = request.BaseMnd;
        character.BaseChr = request.BaseChr;
        character.AddedStr = request.AddedStr;
        character.AddedDex = request.AddedDex;
        character.AddedVit = request.AddedVit;
        character.AddedAgi = request.AddedAgi;
        character.AddedInt = request.AddedInt;
        character.AddedMnd = request.AddedMnd;
        character.AddedChr = request.AddedChr;
        character.Attack = request.Attack;
        character.Defense = request.Defense;
        character.ResFire = request.ResFire;
        character.ResIce = request.ResIce;
        character.ResWind = request.ResWind;
        character.ResEarth = request.ResEarth;
        character.ResLightning = request.ResLightning;
        character.ResWater = request.ResWater;
        character.ResLight = request.ResLight;
        character.ResDark = request.ResDark;
        character.PlaytimeSeconds = request.PlaytimeSeconds;
        character.MeritsJson = request.Merits is { Count: > 0 }
            ? JsonSerializer.Serialize(request.Merits)
            : null;

        // Title accumulator: record every distinct title ever observed
        // equipped during a sync. FFXIAH-style — a title equipped only
        // briefly between syncs won't be captured. Collection grows over
        // time as the player browses through and equips different titles.
        if (request.TitleId is int titleId && titleId > 0)
        {
            var existingTitle = await _db.CharacterTitles
                .FirstOrDefaultAsync(t => t.CharacterId == character.Id && t.TitleId == titleId);
            var titleSeenAt = DateTimeOffset.UtcNow;
            if (existingTitle is null)
            {
                _db.CharacterTitles.Add(new CharacterTitle
                {
                    CharacterId = character.Id,
                    TitleId = titleId,
                    FirstSeenAt = titleSeenAt,
                    LastEquippedAt = titleSeenAt,
                });
            }
            else
            {
                existingTitle.LastEquippedAt = titleSeenAt;
            }
        }

        // Full state replacement
        await _db.CharacterJobs.Where(j => j.CharacterId == character.Id).ExecuteDeleteAsync();
        await _db.EquippedGear.Where(g => g.CharacterId == character.Id).ExecuteDeleteAsync();
        await _db.CraftingSkills.Where(s => s.CharacterId == character.Id).ExecuteDeleteAsync();
        await _db.CharacterSkills.Where(s => s.CharacterId == character.Id).ExecuteDeleteAsync();

        // Re-add jobs directly via the DbSet (avoids navigation-property tracking issues)
        var newJobs = new List<CharacterJob>();
        foreach (var jobEntry in request.Jobs)
        {
            if (!Enum.TryParse<JobType>(jobEntry.Job, true, out var jobType)) continue;

            newJobs.Add(new CharacterJob
            {
                Id = Guid.NewGuid(),
                CharacterId = character.Id,
                JobId = jobType,
                Level = jobEntry.Level,
                IsActive = jobType.ToString().Equals(request.ActiveJob, StringComparison.OrdinalIgnoreCase),
                JP = jobEntry.JP,
                JPSpent = jobEntry.JPSpent,
                CP = jobEntry.CP
            });
        }
        _db.CharacterJobs.AddRange(newJobs);

        // Re-add gear
        var newGear = new List<EquippedGear>();
        foreach (var gearEntry in request.Gear)
        {
            if (!Enum.TryParse<EquipSlot>(gearEntry.Slot, true, out var slot)) continue;

            newGear.Add(new EquippedGear
            {
                Id = Guid.NewGuid(),
                CharacterId = character.Id,
                Slot = slot,
                ItemId = gearEntry.ItemId,
                ItemName = gearEntry.ItemName,
                AugmentsJson = gearEntry.Augments is { Count: > 0 }
                    ? JsonSerializer.Serialize(gearEntry.Augments)
                    : null
            });
        }
        _db.EquippedGear.AddRange(newGear);

        // Re-add crafting skills
        var newCrafting = new List<CraftingSkill>();
        foreach (var craftEntry in request.Crafting)
        {
            if (!Enum.TryParse<CraftType>(craftEntry.Craft, true, out var craft)) continue;

            newCrafting.Add(new CraftingSkill
            {
                Id = Guid.NewGuid(),
                CharacterId = character.Id,
                Craft = craft,
                Level = craftEntry.Level,
                Rank = craftEntry.Rank
            });
        }
        _db.CraftingSkills.AddRange(newCrafting);

        // Re-add character skills (combat/magic/automaton)
        var newSkills = new List<CharacterSkill>();
        foreach (var skillEntry in request.Skills)
        {
            if (!Enum.TryParse<SkillType>(skillEntry.Skill.Replace(" ", "").Replace("-", ""), true, out var skillType)) continue;

            newSkills.Add(new CharacterSkill
            {
                Id = Guid.NewGuid(),
                CharacterId = character.Id,
                Skill = skillType,
                Level = skillEntry.Level,
                Cap = skillEntry.Cap
            });
        }
        _db.CharacterSkills.AddRange(newSkills);

        // Upsert item model mappings from addon's model table
        if (request.Models.Count > 0 && request.Gear.Count > 0)
        {
            var slotNameToModelIndex = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
            {
                ["Head"] = 2, ["Body"] = 3, ["Hands"] = 4,
                ["Legs"] = 5, ["Feet"] = 6,
                ["Main"] = 7, ["Sub"] = 8, ["Range"] = 9
            };

            var modelLookup = request.Models.ToDictionary(m => m.SlotId, m => m.ModelId);

            // Build the set of (ItemId, SlotId) pairs we're about to upsert, then
            // fetch all matching ItemModelMappings in one round-trip.
            var pairsToUpsert = new List<(int ItemId, int SlotId, int ModelId)>();
            foreach (var gearEntry in request.Gear)
            {
                if (gearEntry.ItemId <= 0) continue;
                if (!slotNameToModelIndex.TryGetValue(gearEntry.Slot, out var modelSlotIndex)) continue;
                if (!modelLookup.TryGetValue(modelSlotIndex, out var modelId)) continue;
                if (modelId <= 0) continue;
                pairsToUpsert.Add((gearEntry.ItemId, modelSlotIndex, modelId));
            }

            if (pairsToUpsert.Count > 0)
            {
                var itemIds = pairsToUpsert.Select(p => p.ItemId).ToHashSet();
                var slotIds = pairsToUpsert.Select(p => p.SlotId).ToHashSet();
                var existingMappings = (await _db.ItemModelMappings
                    .Where(m => itemIds.Contains(m.ItemId) && slotIds.Contains(m.SlotId))
                    .ToListAsync())
                    .ToDictionary(m => (m.ItemId, m.SlotId));

                var modelNow = DateTimeOffset.UtcNow;
                foreach (var (itemId, slotId, modelId) in pairsToUpsert)
                {
                    if (existingMappings.TryGetValue((itemId, slotId), out var existing))
                    {
                        existing.ModelId = modelId;
                        existing.Source = ModelMappingSource.Addon;
                        existing.UpdatedAt = modelNow;
                    }
                    else
                    {
                        _db.ItemModelMappings.Add(new ItemModelMapping
                        {
                            ItemId = itemId,
                            SlotId = slotId,
                            ModelId = modelId,
                            Source = ModelMappingSource.Addon,
                            CreatedAt = modelNow,
                            UpdatedAt = modelNow
                        });
                    }
                }
            }
        }

        character.LastSyncAt = DateTimeOffset.UtcNow;
        character.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();

        // Linkshell membership accumulator. Never hard-deletes: a linkshell the
        // character no longer reports is flipped to IsCurrent = false. Mirrors
        // the CharacterTitles freshness pattern. Runs after the character is
        // saved so character.Id is persisted for the membership FKs.
        if (request.Linkshells.Count > 0)
        {
            var lsNow = DateTimeOffset.UtcNow;
            var currentLinkshellPks = new HashSet<Guid>();

            foreach (var entry in request.Linkshells)
            {
                if (entry.LinkshellId == 0 || string.IsNullOrEmpty(entry.Name)) continue;
                if (!TryParseLinkshellRank(entry.Rank, out var rank)) continue;

                var ls = await _db.Linkshells
                    .FirstOrDefaultAsync(l => l.Server == character.Server && l.GameLinkshellId == entry.LinkshellId);
                if (ls is null)
                {
                    ls = new Linkshell
                    {
                        Id = Guid.NewGuid(),
                        Server = character.Server,
                        GameLinkshellId = entry.LinkshellId,
                        Name = entry.Name,
                        ColorRgb = entry.ColorRgb,
                        FirstSeenAt = lsNow,
                        LastSeenAt = lsNow,
                    };
                    _db.Linkshells.Add(ls);
                }
                else
                {
                    ls.Name = entry.Name;
                    ls.ColorRgb = entry.ColorRgb;
                    ls.LastSeenAt = lsNow;
                }

                var membership = await _db.LinkshellMemberships
                    .FirstOrDefaultAsync(m => m.CharacterId == character.Id && m.LinkshellId == ls.Id);
                if (membership is null)
                {
                    _db.LinkshellMemberships.Add(new LinkshellMembership
                    {
                        Id = Guid.NewGuid(),
                        CharacterId = character.Id,
                        LinkshellId = ls.Id,
                        Slot = entry.Slot ?? 0,
                        Rank = rank,
                        IsCurrent = true,
                        FirstSeenAt = lsNow,
                        LastSeenAt = lsNow,
                    });
                }
                else
                {
                    membership.Slot = entry.Slot ?? membership.Slot;
                    membership.Rank = rank;
                    membership.IsCurrent = true;
                    membership.LastSeenAt = lsNow;
                }

                currentLinkshellPks.Add(ls.Id);

                // Denormalize the active linkshell's color onto the character for
                // the profile-header pearl icon (matches the flat request.Linkshell).
                if (!string.IsNullOrEmpty(request.Linkshell)
                    && string.Equals(entry.Name, request.Linkshell, StringComparison.OrdinalIgnoreCase))
                {
                    character.LinkshellColorRgb = entry.ColorRgb;
                }
            }

            var stale = await _db.LinkshellMemberships
                .Where(m => m.CharacterId == character.Id && m.IsCurrent)
                .ToListAsync();
            foreach (var m in stale)
            {
                if (!currentLinkshellPks.Contains(m.LinkshellId))
                    m.IsCurrent = false;
            }

            await _db.SaveChangesAsync();

            var touchedPks = currentLinkshellPks
                .Concat(stale.Select(m => m.LinkshellId))
                .ToHashSet();
            foreach (var lsId in touchedPks)
            {
                var ls = await _db.Linkshells.FirstOrDefaultAsync(l => l.Id == lsId);
                if (ls is null) continue;
                ls.MemberCount = await _db.LinkshellMemberships
                    .CountAsync(m => m.LinkshellId == lsId && m.IsCurrent);
            }
            await _db.SaveChangesAsync();
        }

        return Ok(new { message = "Sync successful", lastSyncAt = character.LastSyncAt });
    }

    [HttpPost("macros")]
    public async Task<IActionResult> SyncMacros([FromBody] MacroSyncRequest request)
    {
        var apiKey = Request.Headers["X-Api-Key"].ToString();
        if (!_macroLimiter.IsAllowed(apiKey))
            return StatusCode(429, new { message = "Macro rate limit exceeded. Max 120 requests per hour." });

        var character = await ResolveAddonCharacterAsync();
        if (character is null)
            return BadRequest(new { message = MissingCharacterMessage });

        var booksUpdated = 0;
        var conflicts = new List<int>();
        var bookResults = new List<MacroSyncBookResult>();

        foreach (var bookEntry in request.Books)
        {
            var book = await _db.MacroBooks
                .FirstOrDefaultAsync(b => b.CharacterId == character.Id && b.BookNumber == bookEntry.BookNumber);

            if (book is null)
            {
                book = new MacroBook
                {
                    Id = Guid.NewGuid(),
                    CharacterId = character.Id,
                    BookNumber = bookEntry.BookNumber,
                    ContentHash = bookEntry.ContentHash,
                    BookTitle = bookEntry.BookTitle,
                    PendingPush = false,
                    UpdatedAt = DateTimeOffset.UtcNow
                };
                _db.MacroBooks.Add(book);
            }
            else
            {
                // Track conflicts: books that had pending web edits
                if (book.PendingPush)
                    conflicts.Add(book.BookNumber);

                // Snapshot before overwriting
                await SnapshotBookIfNotEmpty(book, "addon push", _db);

                await _db.Macros
                    .Where(m => m.Page.MacroBookId == book.Id)
                    .ExecuteDeleteAsync();
                await _db.MacroPages
                    .Where(p => p.MacroBookId == book.Id)
                    .ExecuteDeleteAsync();

                book.BookTitle = bookEntry.BookTitle;
                book.PendingPush = false;
                book.UpdatedAt = DateTimeOffset.UtcNow;
            }

            foreach (var pageEntry in bookEntry.Pages)
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

            // Compute content hash from new data
            book.ContentHash = MacrosController.ComputeContentHash(bookEntry);
            booksUpdated++;

            bookResults.Add(new MacroSyncBookResult
            {
                BookNumber = book.BookNumber,
                ContentHash = book.ContentHash
            });
        }

        await _db.SaveChangesAsync();
        return Ok(new MacroSyncResponse
        {
            Message = "Macros synced",
            BooksUpdated = booksUpdated,
            Conflicts = conflicts,
            Books = bookResults
        });
    }

    [HttpGet("macros/pending")]
    public async Task<IActionResult> GetPendingMacros()
    {
        var character = await ResolveAddonCharacterAsync();
        if (character is null)
            return BadRequest(new { message = MissingCharacterMessage });

        var pending = await _db.MacroBooks
            .Where(b => b.CharacterId == character.Id && b.PendingPush)
            .Select(b => b.BookNumber)
            .OrderBy(n => n)
            .ToArrayAsync();

        return Ok(new { pendingBooks = pending });
    }

    [HttpGet("macros/{bookNumber:int}")]
    public async Task<IActionResult> GetMacroBook(int bookNumber)
    {
        var character = await ResolveAddonCharacterAsync();
        if (character is null)
            return BadRequest(new { message = MissingCharacterMessage });

        var book = await _db.MacroBooks
            .Include(b => b.Pages).ThenInclude(p => p.Macros)
            .FirstOrDefaultAsync(b => b.CharacterId == character.Id && b.BookNumber == bookNumber);
        if (book is null)
            return NotFound(new { message = $"Macro book {bookNumber} not found." });

        return Ok(MapBookToDetail(book));
    }

    [HttpGet("macros/pull")]
    public async Task<IActionResult> PullPendingMacros()
    {
        var character = await ResolveAddonCharacterAsync();
        if (character is null)
            return BadRequest(new { message = MissingCharacterMessage });

        var pendingBooks = await _db.MacroBooks
            .Include(b => b.Pages).ThenInclude(p => p.Macros)
            .Where(b => b.CharacterId == character.Id && b.PendingPush)
            .OrderBy(b => b.BookNumber)
            .ToListAsync();

        return Ok(new MacroPullResponse
        {
            Books = pendingBooks.Select(MapBookToDetail).ToList()
        });
    }

    [HttpPost("macros/acknowledge")]
    public async Task<IActionResult> AcknowledgeMacroBooks([FromBody] AcknowledgeMacrosRequest request)
    {
        var character = await ResolveAddonCharacterAsync();
        if (character is null)
            return BadRequest(new { message = MissingCharacterMessage });

        var bookNumbers = request.BookNumbers ?? [];
        var books = await _db.MacroBooks
            .Where(b => b.CharacterId == character.Id && bookNumbers.Contains(b.BookNumber))
            .ToListAsync();

        foreach (var book in books)
            book.PendingPush = false;

        await _db.SaveChangesAsync();
        return Ok(new { acknowledged = books.Count });
    }

    [HttpDelete("macros/pending/{bookNumber:int}")]
    public async Task<IActionResult> AcknowledgeMacroBook(int bookNumber)
    {
        var character = await ResolveAddonCharacterAsync();
        if (character is null)
            return BadRequest(new { message = MissingCharacterMessage });

        var book = await _db.MacroBooks
            .FirstOrDefaultAsync(b => b.CharacterId == character.Id && b.BookNumber == bookNumber);
        if (book is null)
            return NotFound();

        book.PendingPush = false;
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // === Inventory Moves ===

    [HttpGet("inventory/moves/pending")]
    public async Task<IActionResult> GetPendingMoves()
    {
        var character = await ResolveAddonCharacterAsync();
        if (character is null)
            return BadRequest(new { message = MissingCharacterMessage });

        var moves = await _db.InventoryMoveOrders
            .Where(m => m.CharacterId == character.Id && m.Status == MoveOrderStatus.Pending)
            .Join(_db.GameItems, m => m.ItemId, g => g.ItemId, (m, g) => new
            {
                m.Id,
                m.ItemId,
                ItemName = g.Name ?? g.NameJa ?? "Unknown",
                FromBag = m.FromBag.ToString(),
                m.FromSlot,
                ToBag = m.ToBag.ToString(),
                m.Quantity,
            })
            .OrderBy(m => m.Id)
            .ToListAsync();

        return Ok(new { moves });
    }

    [HttpPost("inventory/moves/acknowledge")]
    public async Task<IActionResult> AcknowledgeMoves([FromBody] AcknowledgeMovesRequest request)
    {
        var character = await ResolveAddonCharacterAsync();
        if (character is null)
            return BadRequest(new { message = MissingCharacterMessage });

        var now = DateTimeOffset.UtcNow;
        var moveIds = request.MoveIds ?? [];

        var orders = await _db.InventoryMoveOrders
            .Where(m => moveIds.Contains(m.Id) && m.CharacterId == character.Id && m.Status == MoveOrderStatus.Pending)
            .ToListAsync();

        foreach (var order in orders)
        {
            order.Status = MoveOrderStatus.Completed;
            order.CompletedAt = now;
        }

        await _db.SaveChangesAsync();
        return Ok(new { acknowledged = orders.Count });
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

    private async Task SnapshotBookIfNotEmpty(MacroBook book, string reason, VanalyticsDbContext db)
    {
        var pages = await db.MacroPages
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

        db.MacroBookSnapshots.Add(new MacroBookSnapshot
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

        // Prune to 5 snapshots
        var excess = await db.MacroBookSnapshots
            .Where(s => s.MacroBookId == book.Id)
            .OrderByDescending(s => s.CreatedAt)
            .Skip(5)
            .ToListAsync();

        if (excess.Count > 0)
            db.MacroBookSnapshots.RemoveRange(excess);
    }
}

public class AcknowledgeMovesRequest
{
    public List<long> MoveIds { get; set; } = [];
}

public class AcknowledgeMacrosRequest
{
    public List<int> BookNumbers { get; set; } = [];
}

public class MacroPullResponse
{
    public List<MacroBookDetail> Books { get; set; } = [];
}

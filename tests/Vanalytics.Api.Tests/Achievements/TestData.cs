using System;
using Soverance.Auth.Models;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Tests.Achievements;

/// <summary>
/// Shared test-data helpers for Achievement integration tests (Tasks 4–11).
/// Builds minimal valid entities and tracks them on the provided DbContext.
/// Caller is responsible for calling SaveChangesAsync.
/// </summary>
public static class TestData
{
    public static User AddUser(VanalyticsDbContext db, string? email = null, string? username = null)
    {
        email ??= $"testuser_{Guid.NewGuid():N}@test.com";
        username ??= $"testuser_{Guid.NewGuid():N}";

        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = email,
            Username = username,
            PasswordHash = Soverance.Auth.Services.PasswordHasher.HashPassword("Password123!"),
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        db.Users.Add(user);
        return user;
    }

    public static Character AddCharacter(
        VanalyticsDbContext db,
        Guid userId,
        string name,
        string server,
        bool isPublic = false)
    {
        var character = new Character
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Name = name,
            Server = server,
            IsPublic = isPublic,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        db.Characters.Add(character);
        return character;
    }
}

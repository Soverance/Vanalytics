using Microsoft.Extensions.Logging.Abstractions;
using Vanalytics.Api.Services;
using Vanalytics.Core.Enums;

namespace Vanalytics.Api.Tests.Services;

public class MemorialProfileStoreTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "memorials-" + Guid.NewGuid());

    public void Dispose()
    {
        if (Directory.Exists(_dir)) Directory.Delete(_dir, true);
    }

    private MemorialProfileStore CreateStore() =>
        new(_dir, NullLogger<MemorialProfileStore>.Instance);

    private void WriteProfile(string file, string json)
    {
        Directory.CreateDirectory(_dir);
        File.WriteAllText(Path.Combine(_dir, file), json);
    }

    private const string ValidJson = """
    {
      "id": "9c1f0a2e-4d3b-4b6e-9a7f-1e2d3c4b5a69",
      "server": "Ifrit",
      "name": "Gravekeeper",
      "dedication": "Beloved brother",
      "race": "Tarutaru",
      "gender": "Male",
      "faceModelId": 0,
      "nation": 1,
      "nationRank": 7,
      "title": "Simurgh Poacher",
      "subJob": "NIN",
      "subJobLevel": 37,
      "jobs": [
        { "job": "WAR", "level": 75, "isActive": true },
        { "job": "NIN", "level": 75, "isActive": false }
      ],
      "craftingSkills": [ { "craft": "Clothcraft", "level": 60, "rank": "Journeyman" } ],
      "gear": [ { "slot": "Main", "itemId": 17946, "itemName": "Maneater" } ]
    }
    """;

    [Fact]
    public void Find_ReturnsProfile_CaseInsensitive()
    {
        WriteProfile("ifrit-gravekeeper.json", ValidJson);
        var store = CreateStore();

        Assert.NotNull(store.Find("Ifrit", "Gravekeeper"));
        Assert.NotNull(store.Find("ifrit", "GRAVEKEEPER"));
        Assert.Null(store.Find("Asura", "Gravekeeper"));
        Assert.Null(store.Find("Ifrit", "Nobody"));
    }

    [Fact]
    public void Find_MissingDirectory_ReturnsNull()
    {
        var store = CreateStore(); // _dir never created
        Assert.Null(store.Find("Ifrit", "Gravekeeper"));
    }

    [Fact]
    public void MalformedFile_IsSkipped_OthersStillLoad()
    {
        WriteProfile("bad.json", "{ not json !!");
        WriteProfile("ifrit-gravekeeper.json", ValidJson);
        var store = CreateStore();

        Assert.NotNull(store.Find("Ifrit", "Gravekeeper"));
    }

    [Fact]
    public void ToCharacter_MapsFields()
    {
        WriteProfile("ifrit-gravekeeper.json", ValidJson);
        var profile = CreateStore().Find("Ifrit", "Gravekeeper")!;
        var c = profile.ToCharacter();

        Assert.Equal(Guid.Parse("9c1f0a2e-4d3b-4b6e-9a7f-1e2d3c4b5a69"), c.Id);
        Assert.True(c.IsPublic);
        Assert.Equal("Gravekeeper", c.Name);
        Assert.Equal("Ifrit", c.Server);
        Assert.Equal(Race.Tarutaru, c.Race);
        Assert.Equal(Gender.Male, c.Gender);
        Assert.Equal(0, c.FaceModelId);
        Assert.Equal(1, c.Nation);
        Assert.Equal("NIN", c.SubJob);
        Assert.Equal(2, c.Jobs.Count);
        Assert.Equal(JobType.WAR, c.Jobs[0].JobId);
        Assert.True(c.Jobs[0].IsActive);
        Assert.Equal(CraftType.Clothcraft, c.CraftingSkills[0].Craft);
        Assert.Equal(EquipSlot.Main, c.Gear[0].Slot);
        Assert.Equal(17946, c.Gear[0].ItemId);
        Assert.Null(c.LastSyncAt); // keeps "Last sync" off the memorial header
    }
}

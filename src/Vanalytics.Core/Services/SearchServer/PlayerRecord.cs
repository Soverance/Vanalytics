namespace Vanalytics.Core.Services.SearchServer;

public readonly record struct PlayerRecord(
    string Name, int Zone, int Nation, int MainJob, int SubJob,
    int MainLevel, int SubLevel, int Race, int Rank, int Id);

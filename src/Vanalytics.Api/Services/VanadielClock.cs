using Vanalytics.Core.DTOs.Vanadiel;

namespace Vanalytics.Api.Services;

public class VanadielClock
{
    // Vana'diel epoch: 2002-06-23 15:00:00 UTC
    private static readonly DateTimeOffset VanadielEpoch =
        new(2002, 6, 23, 15, 0, 0, TimeSpan.Zero);

    // Moon phase epoch: 2004-01-25 02:31:12 UTC
    private static readonly DateTimeOffset MoonEpoch =
        new(2004, 1, 25, 2, 31, 12, TimeSpan.Zero);

    // RSE epoch: 2004-01-28 09:14:24 UTC
    private static readonly DateTimeOffset RseEpoch =
        new(2004, 1, 28, 9, 14, 24, TimeSpan.Zero);

    private const double TimeMultiplier = 25.0;
    private const long MsPerRealDay = 86_400_000L;

    // Real-world milliseconds per Vana'diel day (57.6 real minutes)
    private const long MsPerGameDay = MsPerRealDay / 25;

    // Vana'diel calendar constants
    private const int DaysPerYear = 360;
    private const int DaysPerMonth = 30;
    private const int DaysPerWeek = 8;
    private const int MoonCycleDays = 84;

    // Initial Vana'diel date offset at epoch (year 898, day 30)
    private const long InitialVanaOffset = (898L * DaysPerYear + 30) * MsPerRealDay;

    private static readonly string[] WeekDays =
        ["Firesday", "Earthsday", "Watersday", "Windsday", "Iceday", "Lightningsday", "Lightsday", "Darksday"];

    private static readonly string[] Elements =
        ["Fire", "Earth", "Water", "Wind", "Ice", "Lightning", "Light", "Dark"];

    private static readonly string[] MoonPhaseNames =
        ["Full Moon", "Waning Gibbous", "Last Quarter", "Waning Crescent", "New Moon", "Waxing Crescent", "First Quarter", "Waxing Gibbous"];

    private static readonly string[] RseRaces =
        ["Hume", "Elvaan", "Tarutaru", "Mithra", "Galka"];

    private static readonly string[] RseLocations =
        ["Gusgen Mines", "Shakhrami Maze", "Ordelle's Caves"];

    private static readonly GuildDefinition[] Guilds =
    [
        new("Alchemy", 8, 23, "Lightsday"),
        new("Bonecraft", 8, 23, "Windsday"),
        new("Clothcraft", 6, 21, "Firesday"),
        new("Cooking", 5, 20, "Darksday"),
        new("Fishing", 3, 18, "Lightningsday"),
        new("Goldsmithing", 8, 23, "Lightsday"),
        new("Leathercraft", 3, 18, "Windsday"),
        new("Smithing", 8, 23, "Iceday"),
        new("Woodworking", 6, 21, "Earthsday"),
    ];

    public VanadielClockResponse GetClock(DateTimeOffset? atTime = null)
    {
        var now = atTime ?? DateTimeOffset.UtcNow;

        var vanaMs = GetVanadielMs(now);
        var time = GetVanadielTime(vanaMs);
        var dayIndex = GetDayOfWeekIndex(vanaMs);

        return new VanadielClockResponse
        {
            Time = time,
            DayOfWeek = WeekDays[dayIndex],
            Element = Elements[dayIndex],
            Moon = GetMoonPhase(now),
            Conquest = GetConquest(now),
            Guilds = GetGuildStatuses(time.Hour, WeekDays[dayIndex]),
            Ferry = GetFerrySchedule(time.Hour, time.Minute),
            Rse = GetRse(now),
        };
    }

    private static long GetVanadielMs(DateTimeOffset now)
    {
        var elapsed = (long)(now - VanadielEpoch).TotalMilliseconds;
        return InitialVanaOffset + (long)(elapsed * TimeMultiplier);
    }

    private static VanadielTime GetVanadielTime(long vanaMs)
    {
        var msPerYear = (long)DaysPerYear * MsPerRealDay;
        var msPerMonth = (long)DaysPerMonth * MsPerRealDay;

        return new VanadielTime
        {
            Year = (int)(vanaMs / msPerYear),
            Month = (int)(vanaMs % msPerYear / msPerMonth) + 1,
            Day = (int)(vanaMs % msPerMonth / MsPerRealDay) + 1,
            Hour = (int)(vanaMs % MsPerRealDay / 3_600_000),
            Minute = (int)(vanaMs % 3_600_000 / 60_000),
            Second = (int)(vanaMs % 60_000 / 1_000),
        };
    }

    private static int GetDayOfWeekIndex(long vanaMs)
    {
        return (int)(vanaMs % ((long)DaysPerWeek * MsPerRealDay) / MsPerRealDay);
    }

    private static MoonPhaseInfo GetMoonPhase(DateTimeOffset now)
    {
        var elapsedMs = (long)(now - MoonEpoch).TotalMilliseconds;
        var moonDays = (int)(elapsedMs / MsPerGameDay % MoonCycleDays);

        // Moon percent: ranges from -100 (full) through 0 (new) to +100 (full)
        var moonPercent = -(int)Math.Round((42.0 - moonDays) / 42.0 * 100.0);

        var phaseIndex = moonPercent switch
        {
            <= -94 or >= 90 => 0, // Full Moon
            >= -93 and <= -62 => 1, // Waning Gibbous
            >= -61 and <= -41 => 2, // Last Quarter
            >= -40 and <= -11 => 3, // Waning Crescent
            >= -10 and <= 6 => 4, // New Moon
            >= 7 and <= 36 => 5, // Waxing Crescent
            >= 37 and <= 56 => 6, // First Quarter
            _ => 7, // Waxing Gibbous
        };

        // Convert to 0-100 display percent (0 = new, 100 = full)
        var displayPercent = Math.Abs(moonPercent);

        return new MoonPhaseInfo
        {
            PhaseName = MoonPhaseNames[phaseIndex],
            Percent = displayPercent,
        };
    }

    private static ConquestInfo GetConquest(DateTimeOffset now)
    {
        // Conquest tally every 7 real days from the epoch
        var elapsedMs = (long)(now - VanadielEpoch).TotalMilliseconds;
        var cycleLengthMs = 7L * MsPerRealDay;
        var remainingMs = cycleLengthMs - (elapsedMs % cycleLengthMs);

        return new ConquestInfo
        {
            EarthSecondsRemaining = (int)(remainingMs / 1000),
            VanadielDaysRemaining = (int)(remainingMs / MsPerGameDay) + 1,
        };
    }

    private static List<GuildStatus> GetGuildStatuses(int currentHour, string currentDay)
    {
        return Guilds.Select(g => new GuildStatus
        {
            Name = g.Name,
            Holiday = g.Holiday,
            OpenHour = g.OpenHour,
            CloseHour = g.CloseHour,
            IsOpen = currentDay != g.Holiday && currentHour >= g.OpenHour && currentHour < g.CloseHour,
        }).ToList();
    }

    private static FerryScheduleInfo GetFerrySchedule(int hour, int minute)
    {
        // Ferry departures occur at 00:00, 08:00, 16:00 Vana'diel time
        // Transit takes ~6.5 Vana'diel hours (arrive at :30 past 6 hours later)
        var departureTimes = new[] { 0, 8, 16 };
        var currentMinutes = hour * 60 + minute;

        string nextDep = "";
        string nextArr = "";

        foreach (var dep in departureTimes)
        {
            var depMinutes = dep * 60;
            if (depMinutes > currentMinutes)
            {
                nextDep = $"{dep:D2}:00";
                var arrHour = (dep + 6) % 24;
                nextArr = $"{arrHour:D2}:30";
                break;
            }
        }

        if (string.IsNullOrEmpty(nextDep))
        {
            // Next departure wraps to tomorrow
            nextDep = "00:00";
            nextArr = "06:30";
        }

        return new FerryScheduleInfo
        {
            SelbinaToMhaura = new FerryDirection { NextDeparture = nextDep, NextArrival = nextArr },
            MhauraToSelbina = new FerryDirection { NextDeparture = nextDep, NextArrival = nextArr },
        };
    }

    private static RseInfo GetRse(DateTimeOffset now)
    {
        var elapsedMs = (long)(now - RseEpoch).TotalMilliseconds;

        // Race rotates every 8 game days within a 40-game-day cycle (5 races x 8 days)
        var rseGameDays = elapsedMs / MsPerGameDay;
        var raceCycleDays = 8L;
        var fullCycleDays = raceCycleDays * RseRaces.Length; // 40
        var posInCycle = rseGameDays % fullCycleDays;
        var raceIndex = (int)(posInCycle / raceCycleDays);

        // Location rotates every 8 game days on a separate 24-day cycle (3 locations x 8 days)
        var locationCycleDays = raceCycleDays * RseLocations.Length; // 24
        var locationPos = rseGameDays % locationCycleDays;
        var locationIndex = (int)(locationPos / raceCycleDays);

        // Next race change
        var daysIntoCurrentRace = posInCycle % raceCycleDays;
        var daysUntilNext = raceCycleDays - daysIntoCurrentRace;
        var msUntilNext = daysUntilNext * MsPerGameDay - (elapsedMs % MsPerGameDay);
        var secondsUntilNext = msUntilNext / 1000;

        var nextRaceIndex = (raceIndex + 1) % RseRaces.Length;

        return new RseInfo
        {
            CurrentRace = RseRaces[raceIndex],
            CurrentLocation = RseLocations[locationIndex],
            NextRace = RseRaces[nextRaceIndex],
            NextChangeEarthSeconds = secondsUntilNext.ToString(),
        };
    }

    private record GuildDefinition(string Name, int OpenHour, int CloseHour, string Holiday);
}

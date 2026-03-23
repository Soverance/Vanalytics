namespace Vanalytics.Core.DTOs.Vanadiel;

public class VanadielClockResponse
{
    public VanadielTime Time { get; set; } = new();
    public string DayOfWeek { get; set; } = string.Empty;
    public string Element { get; set; } = string.Empty;
    public MoonPhaseInfo Moon { get; set; } = new();
    public ConquestInfo Conquest { get; set; } = new();
    public List<GuildStatus> Guilds { get; set; } = [];
    public FerryScheduleInfo Ferry { get; set; } = new();
    public RseInfo Rse { get; set; } = new();
}

public class VanadielTime
{
    public int Year { get; set; }
    public int Month { get; set; }
    public int Day { get; set; }
    public int Hour { get; set; }
    public int Minute { get; set; }
    public int Second { get; set; }
}

public class MoonPhaseInfo
{
    public string PhaseName { get; set; } = string.Empty;
    public int Percent { get; set; }
}

public class ConquestInfo
{
    public int EarthSecondsRemaining { get; set; }
    public int VanadielDaysRemaining { get; set; }
}

public class GuildStatus
{
    public string Name { get; set; } = string.Empty;
    public bool IsOpen { get; set; }
    public string Holiday { get; set; } = string.Empty;
    public int OpenHour { get; set; }
    public int CloseHour { get; set; }
}

public class FerryScheduleInfo
{
    public FerryDirection SelbinaToMhaura { get; set; } = new();
    public FerryDirection MhauraToSelbina { get; set; } = new();
}

public class FerryDirection
{
    public string NextDeparture { get; set; } = string.Empty;
    public string NextArrival { get; set; } = string.Empty;
}

public class RseInfo
{
    public string CurrentRace { get; set; } = string.Empty;
    public string CurrentLocation { get; set; } = string.Empty;
    public string NextRace { get; set; } = string.Empty;
    public string NextChangeEarthSeconds { get; set; } = string.Empty;
}

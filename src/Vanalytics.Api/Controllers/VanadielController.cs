using Microsoft.AspNetCore.Mvc;
using Vanalytics.Api.Services;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/vanadiel")]
public class VanadielController(VanadielClock clock) : ControllerBase
{
    private readonly VanadielClock _clock = clock;

    [HttpGet("clock")]
    public IActionResult GetClock()
    {
        return Ok(_clock.GetClock());
    }
}

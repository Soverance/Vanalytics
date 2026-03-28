using Microsoft.AspNetCore.Mvc;
using Vanalytics.Api.Services;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/dat-mappings")]
public class DatMappingsController : ControllerBase
{
    private readonly DatMappingService _service;

    public DatMappingsController(DatMappingService service)
    {
        _service = service;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var result = await _service.GetAllMappingsAsync();
        return Ok(result);
    }
}

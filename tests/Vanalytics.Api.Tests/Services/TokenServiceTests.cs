using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.Extensions.Configuration;
using Vanalytics.Api.Services;
using Vanalytics.Core.Models;

namespace Vanalytics.Api.Tests.Services;

public class TokenServiceTests
{
    private readonly TokenService _sut;

    public TokenServiceTests()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Secret"] = "ThisIsATestSecretKeyThatIsLongEnoughForHmacSha256!",
                ["Jwt:Issuer"] = "VanalyticsTest",
                ["Jwt:Audience"] = "VanalyticsTest",
                ["Jwt:AccessTokenExpirationMinutes"] = "15",
                ["Jwt:RefreshTokenExpirationDays"] = "7"
            })
            .Build();

        _sut = new TokenService(config);
    }

    [Fact]
    public void GenerateAccessToken_ReturnsValidJwt()
    {
        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = "test@example.com",
            Username = "testuser"
        };

        var token = _sut.GenerateAccessToken(user);

        Assert.NotEmpty(token);

        var handler = new JwtSecurityTokenHandler();
        var jwt = handler.ReadJwtToken(token);
        Assert.Equal("test@example.com", jwt.Claims.First(c => c.Type == ClaimTypes.Email).Value);
        Assert.Equal("testuser", jwt.Claims.First(c => c.Type == ClaimTypes.Name).Value);
        Assert.Equal(user.Id.ToString(), jwt.Claims.First(c => c.Type == ClaimTypes.NameIdentifier).Value);
    }

    [Fact]
    public void GenerateAccessToken_ExpiresInConfiguredMinutes()
    {
        var user = new User { Id = Guid.NewGuid(), Email = "t@t.com", Username = "t" };
        var token = _sut.GenerateAccessToken(user);
        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(token);

        var expectedExpiry = DateTimeOffset.UtcNow.AddMinutes(15);
        var actualExpiry = new DateTimeOffset(jwt.ValidTo, TimeSpan.Zero);

        Assert.InRange(actualExpiry, expectedExpiry.AddSeconds(-5), expectedExpiry.AddSeconds(5));
    }

    [Fact]
    public void GenerateRefreshToken_ReturnsNonEmptyString()
    {
        var token = _sut.GenerateRefreshToken();
        Assert.NotEmpty(token);
        Assert.True(token.Length >= 32);
    }

    [Fact]
    public void GenerateRefreshToken_ReturnsDifferentTokensEachCall()
    {
        var token1 = _sut.GenerateRefreshToken();
        var token2 = _sut.GenerateRefreshToken();
        Assert.NotEqual(token1, token2);
    }

    [Fact]
    public void GetRefreshTokenExpiration_ReturnsConfiguredDays()
    {
        var expiration = _sut.GetRefreshTokenExpiration();
        var expected = DateTimeOffset.UtcNow.AddDays(7);
        Assert.InRange(expiration, expected.AddSeconds(-5), expected.AddSeconds(5));
    }

    [Fact]
    public void GetAccessTokenExpiration_ReturnsConfiguredMinutes()
    {
        var expiration = _sut.GetAccessTokenExpiration();
        var expected = DateTimeOffset.UtcNow.AddMinutes(15);
        Assert.InRange(expiration, expected.AddSeconds(-5), expected.AddSeconds(5));
    }
}

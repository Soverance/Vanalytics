using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Vanalytics.Api.Services;

public class OAuthService
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _config;

    public OAuthService(IHttpClientFactory httpClientFactory, IConfiguration config)
    {
        _httpClientFactory = httpClientFactory;
        _config = config;
    }

    public async Task<OAuthUserInfo> GetGoogleUserInfoAsync(string code, string redirectUri)
    {
        var client = _httpClientFactory.CreateClient();

        var tokenResponse = await client.PostAsync("https://oauth2.googleapis.com/token",
            new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["code"] = code,
                ["client_id"] = _config["OAuth:Google:ClientId"]!,
                ["client_secret"] = _config["OAuth:Google:ClientSecret"]!,
                ["redirect_uri"] = redirectUri,
                ["grant_type"] = "authorization_code"
            }));

        tokenResponse.EnsureSuccessStatusCode();
        var tokenData = await JsonSerializer.DeserializeAsync<OAuthTokenResponse>(
            await tokenResponse.Content.ReadAsStreamAsync());

        var request = new HttpRequestMessage(HttpMethod.Get, "https://www.googleapis.com/oauth2/v2/userinfo");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", tokenData!.AccessToken);
        var userResponse = await client.SendAsync(request);
        userResponse.EnsureSuccessStatusCode();

        var googleUser = await JsonSerializer.DeserializeAsync<GoogleUserInfo>(
            await userResponse.Content.ReadAsStreamAsync());

        return new OAuthUserInfo
        {
            Provider = "google",
            ProviderId = googleUser!.Id,
            Email = googleUser.Email,
            Name = googleUser.Name ?? googleUser.Email.Split('@')[0],
            AvatarUrl = googleUser.Picture
        };
    }

    public async Task<OAuthUserInfo> GetMicrosoftUserInfoAsync(string code, string redirectUri)
    {
        var client = _httpClientFactory.CreateClient();

        var tokenResponse = await client.PostAsync(
            "https://login.microsoftonline.com/common/oauth2/v2.0/token",
            new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["code"] = code,
                ["client_id"] = _config["OAuth:Microsoft:ClientId"]!,
                ["client_secret"] = _config["OAuth:Microsoft:ClientSecret"]!,
                ["redirect_uri"] = redirectUri,
                ["grant_type"] = "authorization_code",
                ["scope"] = "openid email profile User.Read"
            }));

        if (!tokenResponse.IsSuccessStatusCode)
        {
            var errorBody = await tokenResponse.Content.ReadAsStringAsync();
            throw new HttpRequestException(
                $"Microsoft token exchange failed ({tokenResponse.StatusCode}): {errorBody}");
        }
        var tokenData = await JsonSerializer.DeserializeAsync<OAuthTokenResponse>(
            await tokenResponse.Content.ReadAsStreamAsync());

        var request = new HttpRequestMessage(HttpMethod.Get, "https://graph.microsoft.com/v1.0/me");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", tokenData!.AccessToken);
        var userResponse = await client.SendAsync(request);
        userResponse.EnsureSuccessStatusCode();

        var msUser = await JsonSerializer.DeserializeAsync<MicrosoftUserInfo>(
            await userResponse.Content.ReadAsStreamAsync());

        return new OAuthUserInfo
        {
            Provider = "microsoft",
            ProviderId = msUser!.Id,
            Email = msUser.Mail ?? msUser.UserPrincipalName,
            Name = msUser.DisplayName ?? msUser.UserPrincipalName.Split('@')[0]
        };
    }
}

public class OAuthUserInfo
{
    public string Provider { get; set; } = string.Empty;
    public string ProviderId { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? AvatarUrl { get; set; }
}

public class OAuthTokenResponse
{
    [JsonPropertyName("access_token")]
    public string AccessToken { get; set; } = string.Empty;
}

public class GoogleUserInfo
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("email")]
    public string Email { get; set; } = string.Empty;

    [JsonPropertyName("name")]
    public string? Name { get; set; }

    [JsonPropertyName("picture")]
    public string? Picture { get; set; }
}

public class MicrosoftUserInfo
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("mail")]
    public string? Mail { get; set; }

    [JsonPropertyName("userPrincipalName")]
    public string UserPrincipalName { get; set; } = string.Empty;

    [JsonPropertyName("displayName")]
    public string? DisplayName { get; set; }
}

using System.Text.RegularExpressions;

namespace Vanalytics.Api.Validation;

/// <summary>
/// Validates a user-chosen display name. Assumes the caller has already trimmed
/// the input and handled the blank case (blank → null is allowed and not validated here).
/// </summary>
public static partial class DisplayNameValidator
{
    private const int MinLength = 3;
    private const int MaxLength = 24;

    public static bool IsValid(string value, out string error)
    {
        if (value.Length < MinLength || value.Length > MaxLength)
        {
            error = $"Display name must be {MinLength}–{MaxLength} characters.";
            return false;
        }

        if (!AllowedPattern().IsMatch(value))
        {
            error = "Display name may only contain letters, numbers, spaces, and _ - . ' [ ]";
            return false;
        }

        error = "";
        return true;
    }

    [GeneratedRegex(@"^[A-Za-z0-9 _\-.'\[\]]+$")]
    private static partial Regex AllowedPattern();
}

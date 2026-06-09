using Vanalytics.Api.Validation;
using Xunit;

namespace Vanalytics.Api.Tests.Validation;

public class DisplayNameValidatorTests
{
    [Theory]
    [InlineData("Aldo")]
    [InlineData("Aldo the Brave")]
    [InlineData("X_Y-Z.1")]
    [InlineData("O'Brien")]
    [InlineData("[LS]Tank")]
    public void IsValid_AcceptsTypicalNames(string name)
    {
        Assert.True(DisplayNameValidator.IsValid(name, out _));
    }

    [Theory]
    [InlineData("ab")]                          // too short
    [InlineData("this name is way too long!!")] // > 24 chars
    public void IsValid_RejectsBadLength(string name)
    {
        Assert.False(DisplayNameValidator.IsValid(name, out var error));
        Assert.NotEmpty(error);
    }

    [Theory]
    [InlineData("bad@name")]
    [InlineData("emoji😀here")]
    [InlineData("semi;colon")]
    public void IsValid_RejectsDisallowedCharacters(string name)
    {
        Assert.False(DisplayNameValidator.IsValid(name, out var error));
        Assert.NotEmpty(error);
    }
}

namespace Vanalytics.Core.Enums;

// A player's private label for one of their synced characters: what the
// character is FOR. Stored as int on Character.Role; exposed across the API as
// the enum NAME (string). None = no label. Owner-only — never surfaced on
// public profiles.
public enum CharacterRole
{
    None = 0,
    Main = 1,
    Mule = 2,
    Alt = 3,
    Crafter = 4,
    Merchant = 5,
}

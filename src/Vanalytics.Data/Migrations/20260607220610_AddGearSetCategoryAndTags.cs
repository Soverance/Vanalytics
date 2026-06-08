using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vanalytics.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddGearSetCategoryAndTags : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Category",
                table: "CharacterGearSets",
                type: "nvarchar(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "Other");

            migrationBuilder.AddColumn<string>(
                name: "TagsJson",
                table: "CharacterGearSets",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "[]");

            migrationBuilder.CreateIndex(
                name: "IX_CharacterGearSets_CharacterId_Job_Category",
                table: "CharacterGearSets",
                columns: new[] { "CharacterId", "Job", "Category" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_CharacterGearSets_CharacterId_Job_Category",
                table: "CharacterGearSets");

            migrationBuilder.DropColumn(
                name: "Category",
                table: "CharacterGearSets");

            migrationBuilder.DropColumn(
                name: "TagsJson",
                table: "CharacterGearSets");
        }
    }
}

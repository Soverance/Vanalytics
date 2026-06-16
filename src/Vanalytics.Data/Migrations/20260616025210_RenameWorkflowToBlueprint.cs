using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vanalytics.Data.Migrations
{
    /// <inheritdoc />
    public partial class RenameWorkflowToBlueprint : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameTable(
                name: "CharacterJobWorkflows",
                newName: "CharacterJobBlueprints");

            migrationBuilder.RenameIndex(
                name: "IX_CharacterJobWorkflows_CharacterId_Job",
                table: "CharacterJobBlueprints",
                newName: "IX_CharacterJobBlueprints_CharacterId_Job");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameIndex(
                name: "IX_CharacterJobBlueprints_CharacterId_Job",
                table: "CharacterJobBlueprints",
                newName: "IX_CharacterJobWorkflows_CharacterId_Job");

            migrationBuilder.RenameTable(
                name: "CharacterJobBlueprints",
                newName: "CharacterJobWorkflows");
        }
    }
}

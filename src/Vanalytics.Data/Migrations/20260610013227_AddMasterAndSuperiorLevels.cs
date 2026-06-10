using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vanalytics.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddMasterAndSuperiorLevels : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "SuperiorLevel",
                table: "Characters",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "MasterCapped",
                table: "CharacterJobs",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "MasterEpCurrent",
                table: "CharacterJobs",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "MasterEpNeeded",
                table: "CharacterJobs",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "MasterLevel",
                table: "CharacterJobs",
                type: "int",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SuperiorLevel",
                table: "Characters");

            migrationBuilder.DropColumn(
                name: "MasterCapped",
                table: "CharacterJobs");

            migrationBuilder.DropColumn(
                name: "MasterEpCurrent",
                table: "CharacterJobs");

            migrationBuilder.DropColumn(
                name: "MasterEpNeeded",
                table: "CharacterJobs");

            migrationBuilder.DropColumn(
                name: "MasterLevel",
                table: "CharacterJobs");
        }
    }
}

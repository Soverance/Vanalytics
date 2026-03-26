using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vanalytics.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddCharacterMetadata : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Character table: new metadata columns
            migrationBuilder.AddColumn<int>(
                name: "FaceModelId",
                table: "Characters",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SubJob",
                table: "Characters",
                type: "nvarchar(3)",
                maxLength: 3,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "SubJobLevel",
                table: "Characters",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "MasterLevel",
                table: "Characters",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ItemLevel",
                table: "Characters",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Linkshell",
                table: "Characters",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Nation",
                table: "Characters",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "MeritsJson",
                table: "Characters",
                type: "nvarchar(max)",
                nullable: true);

            // Drop FK constraint on EquippedGear.ItemId — gear syncs before items exist
            migrationBuilder.DropForeignKey(
                name: "FK_EquippedGear_GameItems_ItemId",
                table: "EquippedGear");

            // CharacterJobs table: JP/CP columns
            migrationBuilder.AddColumn<int>(
                name: "JP",
                table: "CharacterJobs",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "JPSpent",
                table: "CharacterJobs",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "CP",
                table: "CharacterJobs",
                type: "int",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "FaceModelId", table: "Characters");
            migrationBuilder.DropColumn(name: "SubJob", table: "Characters");
            migrationBuilder.DropColumn(name: "SubJobLevel", table: "Characters");
            migrationBuilder.DropColumn(name: "MasterLevel", table: "Characters");
            migrationBuilder.DropColumn(name: "ItemLevel", table: "Characters");
            migrationBuilder.DropColumn(name: "Linkshell", table: "Characters");
            migrationBuilder.DropColumn(name: "Nation", table: "Characters");
            migrationBuilder.DropColumn(name: "MeritsJson", table: "Characters");
            migrationBuilder.DropColumn(name: "JP", table: "CharacterJobs");
            migrationBuilder.DropColumn(name: "JPSpent", table: "CharacterJobs");
            migrationBuilder.DropColumn(name: "CP", table: "CharacterJobs");
        }
    }
}

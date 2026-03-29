using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vanalytics.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddCharacterStats : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "AddedAgi",
                table: "Characters",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "AddedChr",
                table: "Characters",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "AddedDex",
                table: "Characters",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "AddedInt",
                table: "Characters",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "AddedMnd",
                table: "Characters",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "AddedStr",
                table: "Characters",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "AddedVit",
                table: "Characters",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Attack",
                table: "Characters",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "BaseAgi",
                table: "Characters",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "BaseChr",
                table: "Characters",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "BaseDex",
                table: "Characters",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "BaseInt",
                table: "Characters",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "BaseMnd",
                table: "Characters",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "BaseStr",
                table: "Characters",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "BaseVit",
                table: "Characters",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Defense",
                table: "Characters",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ResDark",
                table: "Characters",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ResEarth",
                table: "Characters",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ResFire",
                table: "Characters",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ResIce",
                table: "Characters",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ResLight",
                table: "Characters",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ResLightning",
                table: "Characters",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ResWater",
                table: "Characters",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ResWind",
                table: "Characters",
                type: "int",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AddedAgi",
                table: "Characters");

            migrationBuilder.DropColumn(
                name: "AddedChr",
                table: "Characters");

            migrationBuilder.DropColumn(
                name: "AddedDex",
                table: "Characters");

            migrationBuilder.DropColumn(
                name: "AddedInt",
                table: "Characters");

            migrationBuilder.DropColumn(
                name: "AddedMnd",
                table: "Characters");

            migrationBuilder.DropColumn(
                name: "AddedStr",
                table: "Characters");

            migrationBuilder.DropColumn(
                name: "AddedVit",
                table: "Characters");

            migrationBuilder.DropColumn(
                name: "Attack",
                table: "Characters");

            migrationBuilder.DropColumn(
                name: "BaseAgi",
                table: "Characters");

            migrationBuilder.DropColumn(
                name: "BaseChr",
                table: "Characters");

            migrationBuilder.DropColumn(
                name: "BaseDex",
                table: "Characters");

            migrationBuilder.DropColumn(
                name: "BaseInt",
                table: "Characters");

            migrationBuilder.DropColumn(
                name: "BaseMnd",
                table: "Characters");

            migrationBuilder.DropColumn(
                name: "BaseStr",
                table: "Characters");

            migrationBuilder.DropColumn(
                name: "BaseVit",
                table: "Characters");

            migrationBuilder.DropColumn(
                name: "Defense",
                table: "Characters");

            migrationBuilder.DropColumn(
                name: "ResDark",
                table: "Characters");

            migrationBuilder.DropColumn(
                name: "ResEarth",
                table: "Characters");

            migrationBuilder.DropColumn(
                name: "ResFire",
                table: "Characters");

            migrationBuilder.DropColumn(
                name: "ResIce",
                table: "Characters");

            migrationBuilder.DropColumn(
                name: "ResLight",
                table: "Characters");

            migrationBuilder.DropColumn(
                name: "ResLightning",
                table: "Characters");

            migrationBuilder.DropColumn(
                name: "ResWater",
                table: "Characters");

            migrationBuilder.DropColumn(
                name: "ResWind",
                table: "Characters");
        }
    }
}

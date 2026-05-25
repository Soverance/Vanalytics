using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vanalytics.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddMobIndexToZoneSpawn : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "MobIndex",
                table: "ZoneSpawns",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateIndex(
                name: "IX_ZoneSpawns_ZoneId_MobName",
                table: "ZoneSpawns",
                columns: new[] { "ZoneId", "MobName" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_ZoneSpawns_ZoneId_MobName",
                table: "ZoneSpawns");

            migrationBuilder.DropColumn(
                name: "MobIndex",
                table: "ZoneSpawns");
        }
    }
}

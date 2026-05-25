using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vanalytics.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddZoneNamedMonster : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ZoneNamedMonsters",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    ZoneId = table.Column<int>(type: "int", nullable: false),
                    MobName = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    Genus = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    SpawnTypeLabel = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    RespawnTime = table.Column<int>(type: "int", nullable: true),
                    PlaceholderName = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    PlaceholderMobIndex = table.Column<string>(type: "nvarchar(8)", maxLength: 8, nullable: true),
                    Notes = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ZoneNamedMonsters", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ZoneNamedMonsters_ZoneId_MobName",
                table: "ZoneNamedMonsters",
                columns: new[] { "ZoneId", "MobName" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ZoneNamedMonsters");
        }
    }
}

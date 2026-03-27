using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vanalytics.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddZoneSpawns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ZoneSpawns",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    ZoneId = table.Column<int>(type: "int", nullable: false),
                    GroupId = table.Column<int>(type: "int", nullable: false),
                    PoolId = table.Column<int>(type: "int", nullable: true),
                    MobName = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    X = table.Column<float>(type: "real", nullable: false),
                    Y = table.Column<float>(type: "real", nullable: false),
                    Z = table.Column<float>(type: "real", nullable: false),
                    Rotation = table.Column<float>(type: "real", nullable: false),
                    MinLevel = table.Column<int>(type: "int", nullable: false),
                    MaxLevel = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ZoneSpawns", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ZoneSpawns_PoolId",
                table: "ZoneSpawns",
                column: "PoolId");

            migrationBuilder.CreateIndex(
                name: "IX_ZoneSpawns_ZoneId",
                table: "ZoneSpawns",
                column: "ZoneId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ZoneSpawns");
        }
    }
}

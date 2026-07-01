using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vanalytics.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddScraperRunStateAndWorldErrors : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "LastScrapeError",
                table: "GameServers",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "LastScrapeErrorAt",
                table: "GameServers",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ScraperRunStates",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false),
                    IsRunning = table.Column<bool>(type: "bit", nullable: false),
                    LastCycleStartedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    LastCycleFinishedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    WorldsProcessedLastCycle = table.Column<int>(type: "int", nullable: false),
                    SalesIngestedLastCycle = table.Column<int>(type: "int", nullable: false),
                    LastError = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    LastErrorAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ScraperRunStates", x => x.Id);
                });

            migrationBuilder.Sql("IF NOT EXISTS (SELECT 1 FROM ScraperRunStates WHERE Id = 1) INSERT INTO ScraperRunStates (Id, IsRunning, WorldsProcessedLastCycle, SalesIngestedLastCycle) VALUES (1, 0, 0, 0);");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ScraperRunStates");

            migrationBuilder.DropColumn(
                name: "LastScrapeError",
                table: "GameServers");

            migrationBuilder.DropColumn(
                name: "LastScrapeErrorAt",
                table: "GameServers");
        }
    }
}

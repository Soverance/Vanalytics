using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vanalytics.Data.Migrations
{
    /// <inheritdoc />
    public partial class AhScraperAdmin : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "EndpointHealthy",
                table: "GameServers",
                type: "bit",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "LastDiscoveredAt",
                table: "GameServers",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "LastProbedAt",
                table: "GameServers",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "MappingConfidence",
                table: "GameServers",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "MappingSource",
                table: "GameServers",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "ScraperSettings",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false),
                    MasterEnabled = table.Column<bool>(type: "bit", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ScraperSettings", x => x.Id);
                });

            migrationBuilder.Sql("IF NOT EXISTS (SELECT 1 FROM ScraperSettings WHERE Id = 1) INSERT INTO ScraperSettings (Id, MasterEnabled, UpdatedAt) VALUES (1, 0, SYSDATETIMEOFFSET());");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ScraperSettings");

            migrationBuilder.DropColumn(
                name: "EndpointHealthy",
                table: "GameServers");

            migrationBuilder.DropColumn(
                name: "LastDiscoveredAt",
                table: "GameServers");

            migrationBuilder.DropColumn(
                name: "LastProbedAt",
                table: "GameServers");

            migrationBuilder.DropColumn(
                name: "MappingConfidence",
                table: "GameServers");

            migrationBuilder.DropColumn(
                name: "MappingSource",
                table: "GameServers");
        }
    }
}

using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vanalytics.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddDiscoveredEndpoints : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "DiscoveredEndpoints",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Ip = table.Column<string>(type: "nvarchar(45)", maxLength: 45, nullable: false),
                    Port = table.Column<int>(type: "int", nullable: false),
                    ScannedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    SampleSalesJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    MappedServerId = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DiscoveredEndpoints", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DiscoveredEndpoints_GameServers_MappedServerId",
                        column: x => x.MappedServerId,
                        principalTable: "GameServers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DiscoveredEndpoints_Ip_Port",
                table: "DiscoveredEndpoints",
                columns: new[] { "Ip", "Port" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_DiscoveredEndpoints_MappedServerId",
                table: "DiscoveredEndpoints",
                column: "MappedServerId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DiscoveredEndpoints");
        }
    }
}

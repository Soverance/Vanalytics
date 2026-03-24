using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vanalytics.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddZones : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Zones",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    ModelPath = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: true),
                    DialogPath = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: true),
                    NpcPath = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: true),
                    EventPath = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: true),
                    MapPaths = table.Column<string>(type: "nvarchar(2048)", maxLength: 2048, nullable: true),
                    Expansion = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    Region = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: true),
                    IsDiscovered = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Zones", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Zones_Expansion",
                table: "Zones",
                column: "Expansion");

            migrationBuilder.CreateIndex(
                name: "IX_Zones_ModelPath",
                table: "Zones",
                column: "ModelPath");

            migrationBuilder.CreateIndex(
                name: "IX_Zones_Name",
                table: "Zones",
                column: "Name");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Zones");
        }
    }
}

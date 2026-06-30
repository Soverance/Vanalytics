using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vanalytics.Data.Migrations
{
    /// <inheritdoc />
    public partial class AhSearchScraperSchema : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Truncate stale addon-reported rows before schema change (ObservedAt is NOT NULL).
            migrationBuilder.Sql("DELETE FROM AuctionSales;");

            migrationBuilder.DropForeignKey(
                name: "FK_AuctionSales_Users_ReportedByUserId",
                table: "AuctionSales");

            migrationBuilder.DropIndex(
                name: "IX_AuctionSales_ReportedByUserId",
                table: "AuctionSales");

            migrationBuilder.DropColumn(
                name: "ReportedByUserId",
                table: "AuctionSales");

            migrationBuilder.RenameColumn(
                name: "ReportedAt",
                table: "AuctionSales",
                newName: "ObservedAt");

            migrationBuilder.AddColumn<bool>(
                name: "ScrapeEnabled",
                table: "GameServers",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "SearchHost",
                table: "GameServers",
                type: "nvarchar(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "SearchPort",
                table: "GameServers",
                type: "int",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "AhScrapeStates",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    ServerId = table.Column<int>(type: "int", nullable: false),
                    ItemId = table.Column<int>(type: "int", nullable: false),
                    Stack = table.Column<bool>(type: "bit", nullable: false),
                    LastScrapedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AhScrapeStates", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AhScrapeStates_GameItems_ItemId",
                        column: x => x.ItemId,
                        principalTable: "GameItems",
                        principalColumn: "ItemId",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_AhScrapeStates_GameServers_ServerId",
                        column: x => x.ServerId,
                        principalTable: "GameServers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AhScrapeStates_ItemId",
                table: "AhScrapeStates",
                column: "ItemId");

            migrationBuilder.CreateIndex(
                name: "IX_AhScrapeStates_ServerId_ItemId_Stack",
                table: "AhScrapeStates",
                columns: new[] { "ServerId", "ItemId", "Stack" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_AhScrapeStates_ServerId_LastScrapedAt",
                table: "AhScrapeStates",
                columns: new[] { "ServerId", "LastScrapedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AhScrapeStates");

            migrationBuilder.DropColumn(
                name: "ScrapeEnabled",
                table: "GameServers");

            migrationBuilder.DropColumn(
                name: "SearchHost",
                table: "GameServers");

            migrationBuilder.DropColumn(
                name: "SearchPort",
                table: "GameServers");

            migrationBuilder.RenameColumn(
                name: "ObservedAt",
                table: "AuctionSales",
                newName: "ReportedAt");

            migrationBuilder.AddColumn<Guid>(
                name: "ReportedByUserId",
                table: "AuctionSales",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.CreateIndex(
                name: "IX_AuctionSales_ReportedByUserId",
                table: "AuctionSales",
                column: "ReportedByUserId");

            migrationBuilder.AddForeignKey(
                name: "FK_AuctionSales_Users_ReportedByUserId",
                table: "AuctionSales",
                column: "ReportedByUserId",
                principalTable: "Users",
                principalColumn: "Id");
        }
    }
}

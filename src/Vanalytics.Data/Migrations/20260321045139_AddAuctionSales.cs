using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vanalytics.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddAuctionSales : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AuctionSales",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    ItemId = table.Column<int>(type: "int", nullable: false),
                    ServerId = table.Column<int>(type: "int", nullable: false),
                    Price = table.Column<int>(type: "int", nullable: false),
                    SoldAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    SellerName = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    BuyerName = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    StackSize = table.Column<int>(type: "int", nullable: false),
                    ReportedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ReportedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AuctionSales", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AuctionSales_GameItems_ItemId",
                        column: x => x.ItemId,
                        principalTable: "GameItems",
                        principalColumn: "ItemId",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_AuctionSales_GameServers_ServerId",
                        column: x => x.ServerId,
                        principalTable: "GameServers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_AuctionSales_Users_ReportedByUserId",
                        column: x => x.ReportedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_AuctionSales_ItemId_ServerId_Price_SoldAt_BuyerName_SellerName_StackSize",
                table: "AuctionSales",
                columns: new[] { "ItemId", "ServerId", "Price", "SoldAt", "BuyerName", "SellerName", "StackSize" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_AuctionSales_ItemId_ServerId_SoldAt",
                table: "AuctionSales",
                columns: new[] { "ItemId", "ServerId", "SoldAt" });

            migrationBuilder.CreateIndex(
                name: "IX_AuctionSales_ReportedByUserId",
                table: "AuctionSales",
                column: "ReportedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_AuctionSales_ServerId_SoldAt",
                table: "AuctionSales",
                columns: new[] { "ServerId", "SoldAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AuctionSales");
        }
    }
}

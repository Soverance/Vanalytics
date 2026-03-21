using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vanalytics.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddBazaarTracking : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "BazaarListings",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    ItemId = table.Column<int>(type: "int", nullable: false),
                    ServerId = table.Column<int>(type: "int", nullable: false),
                    SellerName = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    Price = table.Column<int>(type: "int", nullable: false),
                    Quantity = table.Column<int>(type: "int", nullable: false),
                    Zone = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    FirstSeenAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    LastSeenAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ReportedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BazaarListings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BazaarListings_GameItems_ItemId",
                        column: x => x.ItemId,
                        principalTable: "GameItems",
                        principalColumn: "ItemId",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_BazaarListings_GameServers_ServerId",
                        column: x => x.ServerId,
                        principalTable: "GameServers",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_BazaarListings_Users_ReportedByUserId",
                        column: x => x.ReportedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "BazaarPresences",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    ServerId = table.Column<int>(type: "int", nullable: false),
                    PlayerName = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    Zone = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    FirstSeenAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    LastSeenAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ReportedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BazaarPresences", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BazaarPresences_GameServers_ServerId",
                        column: x => x.ServerId,
                        principalTable: "GameServers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_BazaarPresences_Users_ReportedByUserId",
                        column: x => x.ReportedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_BazaarListings_ItemId_ServerId_IsActive",
                table: "BazaarListings",
                columns: new[] { "ItemId", "ServerId", "IsActive" });

            migrationBuilder.CreateIndex(
                name: "IX_BazaarListings_ReportedByUserId",
                table: "BazaarListings",
                column: "ReportedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_BazaarListings_SellerName_ServerId_IsActive",
                table: "BazaarListings",
                columns: new[] { "SellerName", "ServerId", "IsActive" });

            migrationBuilder.CreateIndex(
                name: "IX_BazaarListings_ServerId",
                table: "BazaarListings",
                column: "ServerId");

            migrationBuilder.CreateIndex(
                name: "IX_BazaarPresences_PlayerName_ServerId",
                table: "BazaarPresences",
                columns: new[] { "PlayerName", "ServerId" });

            migrationBuilder.CreateIndex(
                name: "IX_BazaarPresences_ReportedByUserId",
                table: "BazaarPresences",
                column: "ReportedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_BazaarPresences_ServerId_IsActive_Zone",
                table: "BazaarPresences",
                columns: new[] { "ServerId", "IsActive", "Zone" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BazaarListings");

            migrationBuilder.DropTable(
                name: "BazaarPresences");
        }
    }
}

using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vanalytics.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddInventoryAnomalyTables : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "DismissedAnomalies",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    CharacterId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AnomalyKey = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    DismissedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DismissedAnomalies", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DismissedAnomalies_Characters_CharacterId",
                        column: x => x.CharacterId,
                        principalTable: "Characters",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "InventoryMoveOrders",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    CharacterId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ItemId = table.Column<int>(type: "int", nullable: false),
                    FromBag = table.Column<int>(type: "int", nullable: false),
                    FromSlot = table.Column<int>(type: "int", nullable: false),
                    ToBag = table.Column<int>(type: "int", nullable: false),
                    Quantity = table.Column<int>(type: "int", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CompletedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InventoryMoveOrders", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InventoryMoveOrders_Characters_CharacterId",
                        column: x => x.CharacterId,
                        principalTable: "Characters",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DismissedAnomalies_CharacterId_AnomalyKey",
                table: "DismissedAnomalies",
                columns: new[] { "CharacterId", "AnomalyKey" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_InventoryMoveOrders_CharacterId_Status",
                table: "InventoryMoveOrders",
                columns: new[] { "CharacterId", "Status" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DismissedAnomalies");

            migrationBuilder.DropTable(
                name: "InventoryMoveOrders");
        }
    }
}

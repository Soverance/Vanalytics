using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vanalytics.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddEquippedGearItemFK : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_EquippedGear_ItemId",
                table: "EquippedGear",
                column: "ItemId");

            migrationBuilder.AddForeignKey(
                name: "FK_EquippedGear_GameItems_ItemId",
                table: "EquippedGear",
                column: "ItemId",
                principalTable: "GameItems",
                principalColumn: "ItemId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_EquippedGear_GameItems_ItemId",
                table: "EquippedGear");

            migrationBuilder.DropIndex(
                name: "IX_EquippedGear_ItemId",
                table: "EquippedGear");
        }
    }
}

using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vanalytics.Data.Migrations
{
    /// <inheritdoc />
    public partial class NormalizeGearSetSlots : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "GearSetSlots",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    GearSetId = table.Column<long>(type: "bigint", nullable: false),
                    Slot = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    ItemId = table.Column<int>(type: "int", nullable: false),
                    ItemName = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    AugmentsJson = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GearSetSlots", x => x.Id);
                    table.ForeignKey(
                        name: "FK_GearSetSlots_CharacterGearSets_GearSetId",
                        column: x => x.GearSetId,
                        principalTable: "CharacterGearSets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_GearSetSlots_GearSetId",
                table: "GearSetSlots",
                column: "GearSetId");

            migrationBuilder.CreateIndex(
                name: "IX_GearSetSlots_ItemId",
                table: "GearSetSlots",
                column: "ItemId");

            // One-time backfill: flatten legacy SlotsJson blobs into GearSetSlot rows
            // before the column is dropped. See GearSetSlotBackfill (single-sourced, tested).
            migrationBuilder.Sql(
                GearSetSlotBackfill.BuildInsertSql("CharacterGearSets", "GearSetSlots"));

            migrationBuilder.DropColumn(
                name: "SlotsJson",
                table: "CharacterGearSets");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "GearSetSlots");

            migrationBuilder.AddColumn<string>(
                name: "SlotsJson",
                table: "CharacterGearSets",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");
        }
    }
}

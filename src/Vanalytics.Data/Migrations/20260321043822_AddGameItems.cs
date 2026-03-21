using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vanalytics.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddGameItems : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "GameItems",
                columns: table => new
                {
                    ItemId = table.Column<int>(type: "int", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    NameJa = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: true),
                    NameLong = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: true),
                    Description = table.Column<string>(type: "nvarchar(max)", maxLength: 4096, nullable: true),
                    DescriptionJa = table.Column<string>(type: "nvarchar(max)", maxLength: 4096, nullable: true),
                    Category = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    Type = table.Column<int>(type: "int", nullable: false),
                    Flags = table.Column<int>(type: "int", nullable: false),
                    StackSize = table.Column<int>(type: "int", nullable: false),
                    Level = table.Column<int>(type: "int", nullable: true),
                    Jobs = table.Column<int>(type: "int", nullable: true),
                    Races = table.Column<int>(type: "int", nullable: true),
                    Slots = table.Column<int>(type: "int", nullable: true),
                    Skill = table.Column<int>(type: "int", nullable: true),
                    Damage = table.Column<int>(type: "int", nullable: true),
                    Delay = table.Column<int>(type: "int", nullable: true),
                    DEF = table.Column<int>(type: "int", nullable: true),
                    HP = table.Column<int>(type: "int", nullable: true),
                    MP = table.Column<int>(type: "int", nullable: true),
                    STR = table.Column<int>(type: "int", nullable: true),
                    DEX = table.Column<int>(type: "int", nullable: true),
                    VIT = table.Column<int>(type: "int", nullable: true),
                    AGI = table.Column<int>(type: "int", nullable: true),
                    INT = table.Column<int>(type: "int", nullable: true),
                    MND = table.Column<int>(type: "int", nullable: true),
                    CHR = table.Column<int>(type: "int", nullable: true),
                    Accuracy = table.Column<int>(type: "int", nullable: true),
                    Attack = table.Column<int>(type: "int", nullable: true),
                    RangedAccuracy = table.Column<int>(type: "int", nullable: true),
                    RangedAttack = table.Column<int>(type: "int", nullable: true),
                    MagicAccuracy = table.Column<int>(type: "int", nullable: true),
                    MagicDamage = table.Column<int>(type: "int", nullable: true),
                    MagicEvasion = table.Column<int>(type: "int", nullable: true),
                    Evasion = table.Column<int>(type: "int", nullable: true),
                    Enmity = table.Column<int>(type: "int", nullable: true),
                    Haste = table.Column<int>(type: "int", nullable: true),
                    StoreTP = table.Column<int>(type: "int", nullable: true),
                    TPBonus = table.Column<int>(type: "int", nullable: true),
                    PhysicalDamageTaken = table.Column<int>(type: "int", nullable: true),
                    MagicDamageTaken = table.Column<int>(type: "int", nullable: true),
                    IconPath = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: true),
                    PreviewImagePath = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GameItems", x => x.ItemId);
                });

            migrationBuilder.CreateIndex(
                name: "IX_GameItems_Category",
                table: "GameItems",
                column: "Category");

            migrationBuilder.CreateIndex(
                name: "IX_GameItems_Level",
                table: "GameItems",
                column: "Level");

            migrationBuilder.CreateIndex(
                name: "IX_GameItems_Name",
                table: "GameItems",
                column: "Name");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "GameItems");
        }
    }
}

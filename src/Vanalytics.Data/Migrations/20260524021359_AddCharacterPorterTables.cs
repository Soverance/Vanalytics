using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vanalytics.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddCharacterPorterTables : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CharacterPorterItems",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    CharacterId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SlipItemId = table.Column<int>(type: "int", nullable: false),
                    SlipNumber = table.Column<int>(type: "int", nullable: false),
                    ItemId = table.Column<int>(type: "int", nullable: false),
                    LastSeenAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CharacterPorterItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CharacterPorterItems_Characters_CharacterId",
                        column: x => x.CharacterId,
                        principalTable: "Characters",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "CharacterPorterSlips",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    CharacterId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SlipItemId = table.Column<int>(type: "int", nullable: false),
                    SlipNumber = table.Column<int>(type: "int", nullable: false),
                    SyncedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserHidden = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CharacterPorterSlips", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CharacterPorterSlips_Characters_CharacterId",
                        column: x => x.CharacterId,
                        principalTable: "Characters",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CharacterPorterItems_CharacterId",
                table: "CharacterPorterItems",
                column: "CharacterId");

            migrationBuilder.CreateIndex(
                name: "IX_CharacterPorterItems_CharacterId_SlipItemId_ItemId",
                table: "CharacterPorterItems",
                columns: new[] { "CharacterId", "SlipItemId", "ItemId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CharacterPorterSlips_CharacterId_SlipItemId",
                table: "CharacterPorterSlips",
                columns: new[] { "CharacterId", "SlipItemId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CharacterPorterItems");

            migrationBuilder.DropTable(
                name: "CharacterPorterSlips");
        }
    }
}

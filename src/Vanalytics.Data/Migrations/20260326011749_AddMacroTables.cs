using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vanalytics.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddMacroTables : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "MacroBooks",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CharacterId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    BookNumber = table.Column<int>(type: "int", nullable: false),
                    ContentHash = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    PendingPush = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MacroBooks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MacroBooks_Characters_CharacterId",
                        column: x => x.CharacterId,
                        principalTable: "Characters",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "MacroPages",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MacroBookId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PageNumber = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MacroPages", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MacroPages_MacroBooks_MacroBookId",
                        column: x => x.MacroBookId,
                        principalTable: "MacroBooks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Macros",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MacroPageId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Set = table.Column<string>(type: "nvarchar(4)", maxLength: 4, nullable: false),
                    Position = table.Column<int>(type: "int", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(8)", maxLength: 8, nullable: false),
                    Icon = table.Column<int>(type: "int", nullable: false),
                    Line1 = table.Column<string>(type: "nvarchar(61)", maxLength: 61, nullable: false),
                    Line2 = table.Column<string>(type: "nvarchar(61)", maxLength: 61, nullable: false),
                    Line3 = table.Column<string>(type: "nvarchar(61)", maxLength: 61, nullable: false),
                    Line4 = table.Column<string>(type: "nvarchar(61)", maxLength: 61, nullable: false),
                    Line5 = table.Column<string>(type: "nvarchar(61)", maxLength: 61, nullable: false),
                    Line6 = table.Column<string>(type: "nvarchar(61)", maxLength: 61, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Macros", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Macros_MacroPages_MacroPageId",
                        column: x => x.MacroPageId,
                        principalTable: "MacroPages",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_MacroBooks_CharacterId_BookNumber",
                table: "MacroBooks",
                columns: new[] { "CharacterId", "BookNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MacroPages_MacroBookId_PageNumber",
                table: "MacroPages",
                columns: new[] { "MacroBookId", "PageNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Macros_MacroPageId_Set_Position",
                table: "Macros",
                columns: new[] { "MacroPageId", "Set", "Position" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Macros");

            migrationBuilder.DropTable(
                name: "MacroPages");

            migrationBuilder.DropTable(
                name: "MacroBooks");
        }
    }
}

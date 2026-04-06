using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vanalytics.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddMacroBookSnapshots : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "MacroBookSnapshots",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MacroBookId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    BookNumber = table.Column<int>(type: "int", nullable: false),
                    ContentHash = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    BookTitle = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false, defaultValue: ""),
                    SnapshotData = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Reason = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MacroBookSnapshots", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MacroBookSnapshots_MacroBooks_MacroBookId",
                        column: x => x.MacroBookId,
                        principalTable: "MacroBooks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_MacroBookSnapshots_MacroBookId_CreatedAt",
                table: "MacroBookSnapshots",
                columns: new[] { "MacroBookId", "CreatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "MacroBookSnapshots");
        }
    }
}

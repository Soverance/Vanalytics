using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vanalytics.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddAchievements : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CharacterAchievements",
                columns: table => new
                {
                    CharacterId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TotalScore = table.Column<int>(type: "int", nullable: false),
                    BreakdownJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    RubricVersion = table.Column<int>(type: "int", nullable: false),
                    ComputedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CharacterAchievements", x => x.CharacterId);
                    table.ForeignKey(
                        name: "FK_CharacterAchievements_Characters_CharacterId",
                        column: x => x.CharacterId,
                        principalTable: "Characters",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "LinkshellAchievements",
                columns: table => new
                {
                    LinkshellId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TotalScore = table.Column<int>(type: "int", nullable: false),
                    AverageScore = table.Column<double>(type: "float", nullable: false),
                    RankedMemberCount = table.Column<int>(type: "int", nullable: false),
                    ComputedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LinkshellAchievements", x => x.LinkshellId);
                    table.ForeignKey(
                        name: "FK_LinkshellAchievements_Linkshells_LinkshellId",
                        column: x => x.LinkshellId,
                        principalTable: "Linkshells",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CharacterAchievements_TotalScore",
                table: "CharacterAchievements",
                column: "TotalScore");

            migrationBuilder.CreateIndex(
                name: "IX_LinkshellAchievements_AverageScore",
                table: "LinkshellAchievements",
                column: "AverageScore");

            migrationBuilder.CreateIndex(
                name: "IX_LinkshellAchievements_TotalScore",
                table: "LinkshellAchievements",
                column: "TotalScore");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CharacterAchievements");

            migrationBuilder.DropTable(
                name: "LinkshellAchievements");
        }
    }
}

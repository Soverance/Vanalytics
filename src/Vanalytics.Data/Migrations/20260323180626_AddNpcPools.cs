using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vanalytics.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddNpcPools : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "NpcPools",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    PoolId = table.Column<int>(type: "int", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    PacketName = table.Column<string>(type: "nvarchar(48)", maxLength: 48, nullable: true),
                    FamilyId = table.Column<int>(type: "int", nullable: false),
                    ModelId = table.Column<int>(type: "int", nullable: false),
                    IsMonster = table.Column<bool>(type: "bit", nullable: false),
                    ModelData = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_NpcPools", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_NpcPools_FamilyId",
                table: "NpcPools",
                column: "FamilyId");

            migrationBuilder.CreateIndex(
                name: "IX_NpcPools_Name",
                table: "NpcPools",
                column: "Name");

            migrationBuilder.CreateIndex(
                name: "IX_NpcPools_PoolId",
                table: "NpcPools",
                column: "PoolId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "NpcPools");
        }
    }
}

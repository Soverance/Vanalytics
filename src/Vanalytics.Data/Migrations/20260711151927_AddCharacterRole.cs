using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vanalytics.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddCharacterRole : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "Role",
                table: "Characters",
                type: "int",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Role",
                table: "Characters");
        }
    }
}

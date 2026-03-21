using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vanalytics.Data.Migrations
{
    /// <inheritdoc />
    public partial class CommonIntegration : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsEnabled",
                table: "Users",
                type: "bit",
                nullable: false,
                defaultValue: true);

            migrationBuilder.CreateTable(
                name: "SamlConfigs",
                columns: table => new
                {
                    SamlConfigId = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    IsEnabled = table.Column<bool>(type: "bit", nullable: false),
                    IdpEntityId = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    IdpSsoUrl = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    IdpSloUrl = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    IdpCertificate = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    SpEntityId = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    AutoProvision = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SamlConfigs", x => x.SamlConfigId);
                });

            migrationBuilder.CreateTable(
                name: "SamlRoleMappings",
                columns: table => new
                {
                    SamlRoleMappingId = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    SamlConfigId = table.Column<int>(type: "int", nullable: false),
                    IdpGroupId = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    RoleName = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SamlRoleMappings", x => x.SamlRoleMappingId);
                    table.ForeignKey(
                        name: "FK_SamlRoleMappings_SamlConfigs_SamlConfigId",
                        column: x => x.SamlConfigId,
                        principalTable: "SamlConfigs",
                        principalColumn: "SamlConfigId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SamlRoleMappings_SamlConfigId",
                table: "SamlRoleMappings",
                column: "SamlConfigId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SamlRoleMappings");

            migrationBuilder.DropTable(
                name: "SamlConfigs");

            migrationBuilder.DropColumn(
                name: "IsEnabled",
                table: "Users");
        }
    }
}

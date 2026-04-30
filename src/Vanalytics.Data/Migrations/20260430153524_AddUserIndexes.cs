using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vanalytics.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddUserIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_Users_ApiKey1",
                table: "Users",
                column: "ApiKey",
                filter: "[ApiKey] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Users_OAuthProvider_OAuthId1",
                table: "Users",
                columns: new[] { "OAuthProvider", "OAuthId" },
                filter: "[OAuthProvider] IS NOT NULL AND [OAuthId] IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Users_ApiKey1",
                table: "Users");

            migrationBuilder.DropIndex(
                name: "IX_Users_OAuthProvider_OAuthId1",
                table: "Users");
        }
    }
}

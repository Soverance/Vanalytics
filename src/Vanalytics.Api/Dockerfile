FROM node:22-alpine AS frontend
WORKDIR /app
COPY src/Vanalytics.Web/package.json src/Vanalytics.Web/package-lock.json ./
RUN npm ci
COPY src/Vanalytics.Web/ ./
COPY src/lib/Common/src/Soverance.Web/ ./common-web/
RUN npm run build

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS base
WORKDIR /app
EXPOSE 8080

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY ["src/lib/Common/src/Soverance.Auth/Soverance.Auth.csproj", "src/lib/Common/src/Soverance.Auth/"]
COPY ["src/lib/Common/src/Soverance.Data/Soverance.Data.csproj", "src/lib/Common/src/Soverance.Data/"]
COPY ["src/Vanalytics.Core/Vanalytics.Core.csproj", "src/Vanalytics.Core/"]
COPY ["src/Vanalytics.Data/Vanalytics.Data.csproj", "src/Vanalytics.Data/"]
COPY ["src/Vanalytics.Api/Vanalytics.Api.csproj", "src/Vanalytics.Api/"]
RUN dotnet restore "src/Vanalytics.Api/Vanalytics.Api.csproj"
COPY . .
RUN dotnet publish "src/Vanalytics.Api/Vanalytics.Api.csproj" -c Release -o /app/publish

FROM base AS final
WORKDIR /app
COPY --from=build /app/publish .
COPY --from=frontend /app/dist/ ./wwwroot/
ENTRYPOINT ["dotnet", "Vanalytics.Api.dll"]

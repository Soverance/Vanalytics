FROM node:22-alpine AS frontend
ARG VITE_GOOGLE_CLIENT_ID=""
ARG VITE_MICROSOFT_CLIENT_ID=""
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
ENV VITE_MICROSOFT_CLIENT_ID=$VITE_MICROSOFT_CLIENT_ID
WORKDIR /app
COPY src/Vanalytics.Web/package.json src/Vanalytics.Web/package-lock.json src/Vanalytics.Web/.npmrc ./
RUN --mount=type=secret,id=github_token \
    GITHUB_TOKEN=$(cat /run/secrets/github_token) npm ci
COPY src/Vanalytics.Web/ ./
RUN npm run build

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS base
WORKDIR /app
EXPOSE 8080

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
ARG APP_VERSION=1.0.0
WORKDIR /src
COPY nuget.config .
COPY ["src/Vanalytics.Core/Vanalytics.Core.csproj", "src/Vanalytics.Core/"]
COPY ["src/Vanalytics.Data/Vanalytics.Data.csproj", "src/Vanalytics.Data/"]
COPY ["src/Vanalytics.Api/Vanalytics.Api.csproj", "src/Vanalytics.Api/"]
RUN --mount=type=secret,id=github_token \
    dotnet nuget update source github --username soverance --password $(cat /run/secrets/github_token) --store-password-in-clear-text --configfile nuget.config && \
    dotnet restore "src/Vanalytics.Api/Vanalytics.Api.csproj"
COPY . .
RUN dotnet publish "src/Vanalytics.Api/Vanalytics.Api.csproj" -c Release -o /app/publish -p:Version=$APP_VERSION

FROM base AS final
WORKDIR /app
COPY --from=build /app/publish .
COPY --from=frontend /app/dist/ ./wwwroot/
ENTRYPOINT ["dotnet", "Vanalytics.Api.dll"]

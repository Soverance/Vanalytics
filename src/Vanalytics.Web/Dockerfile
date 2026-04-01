FROM node:22-alpine
WORKDIR /app
COPY src/Vanalytics.Web/package.json src/Vanalytics.Web/package-lock.json src/Vanalytics.Web/.npmrc ./
RUN --mount=type=secret,id=github_token \
    GITHUB_TOKEN=$(cat /run/secrets/github_token) npm install
COPY src/Vanalytics.Web/ ./
EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--host"]


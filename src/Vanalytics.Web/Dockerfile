FROM node:22-alpine
WORKDIR /app
COPY src/Vanalytics.Web/package.json src/Vanalytics.Web/package-lock.json ./
RUN npm install
COPY src/Vanalytics.Web/ ./
EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--host"]


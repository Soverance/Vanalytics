FROM node:22-alpine
WORKDIR /app
COPY src/Vanalytics.Web/package*.json ./
RUN npm install
COPY src/Vanalytics.Web/ ./
COPY src/lib/Common/src/Soverance.Web/ ./common-web/
EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--host"]


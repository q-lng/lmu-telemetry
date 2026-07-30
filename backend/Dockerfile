FROM node:20-slim

WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src

ENV DATA_DIR=/data
ENV PORT=3001
EXPOSE 3001

CMD ["npm", "run", "dev"]

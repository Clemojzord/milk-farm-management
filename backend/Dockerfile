FROM node:20-alpine

WORKDIR /app

COPY server.js ./server.js
COPY data ./data

ENV API_HOST=0.0.0.0
ENV API_PORT=8080

EXPOSE 8080

CMD ["node", "server.js"]

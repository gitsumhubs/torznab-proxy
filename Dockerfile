FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY server.js ./
EXPOSE 9797
ENV PORT=9797
CMD ["node", "server.js"]

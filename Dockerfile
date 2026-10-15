FROM node:24-alpine
WORKDIR /app
COPY package.json server.cjs ./
COPY public ./public
ENV NODE_ENV=production HOST=0.0.0.0 COOKIE_SECURE=1 DATA_DIR=/data
EXPOSE 8080
CMD ["node", "server.cjs"]

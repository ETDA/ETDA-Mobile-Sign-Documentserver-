FROM node:12-alpine
RUN apk update && apk upgrade && apk add --no-cache bash git openssh curl busybox-extras
WORKDIR /app

COPY . /app
RUN npm install -ci

CMD ["node", "app.js"]
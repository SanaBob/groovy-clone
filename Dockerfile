FROM node:17-alpine3.12

WORKDIR /

COPY package*.json ./

RUN npm install

COPY . .

CMD npm start

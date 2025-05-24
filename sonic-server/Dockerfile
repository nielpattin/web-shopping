FROM node:22-alpine

WORKDIR /app

# Install curl and gcompat for compatibility with the Sonic binary
RUN apk update && apk add --no-cache curl gcompat

RUN curl -sSfL https://github.com/valeriansaliou/sonic/releases/download/v1.4.9/v1.4.9-x86_64-gnu.tar.gz -o sonic.tar.gz \
    && tar -xzf sonic.tar.gz \
    && rm sonic.tar.gz \
    && chmod +x ./sonic/sonic

COPY package*.json ./

RUN npm install

COPY index.js .
COPY proto ./proto/

# Expose the gRPC port and the Express port
EXPOSE 50051

CMD ["node", "index.js"]
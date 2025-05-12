

## Run MongoDB and Sonic Search Engine

### Run MongoDB

```bash
docker run -d --name mongodb -p 27017:27017 -v mongodb_data:/data/db --restart unless-stopped mongo:latest
```
### Run Sonic Search Engine

```bash
docker run -d --name sonic_search_engine -p 1491:1491 -e SONIC_PASSWORD=SecretPassword -v ${PWD}/sonic.cfg:/etc/sonic.cfg  --restart unless-stopped valeriansaliou/sonic:v1.4.9
```

### Run Project 

```bash
npm run start
```
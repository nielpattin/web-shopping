# Development Environment Setup

## Prerequisites

- Node.js installed (version 22 or higher)
- MongoDB instance running (e.g., on `mongodb://localhost:27017`)

## Environment Configuration (.env files)

For local development, both `sonic-server` and `main-app` are configured using `.env` files in their respective directories.

### Sonic Server (`sonic-server/.env`)

Create a file named `.env` in the `sonic-server/` directory with the following content:

```bash
MONGO_URI=mongodb://mongouser:mongopassword@127.0.0.1:27017/
DB_NAME=web-shopping
SONIC_HOST=localhost
SONIC_PORT=1491
SONIC_AUTH=SecretPassword
GRPC_PORT=50051
NODE_ENV=development
```

- `MONGO_URI`: Points to your local MongoDB instance.
- `DB_NAME`: The database name to use.
- `GRPC_PORT`: The port on which this `sonic-server` instance will listen for gRPC connections from `main-app`.

### Main Application (`main-app/.env`)

Create a file named `.env` in the `main-app/` directory with the following content:

```bash
SONIC_GRPC_ENDPOINT=localhost:50051
NODE_ENV=development
```

**Key `main-app` variables:**
- `SONIC_GRPC_ENDPOINT`: Tells `main-app` where to connect to the `sonic-server`'s gRPC service.

## Running the Services Locally

After creating the `.env` files, follow these steps to start the development environment:

1.  **Start the Sonic Server:**
Open a terminal, navigate to the `sonic-server/` directory, and run:
```bash
npm install
npm start
```
The `sonic-server` will connect to MongoDB and start its gRPC server on `localhost:50051`.

2. **Create Mock Data for MongoDB:**
- Navigate to the `sonic-server/` directory.
```bash
node generateMockData.js
```

3.  **Start the Main Application:**
Open another terminal, navigate to the `main-app/` directory, and run:
```bash
npm install
npm start
```
The `main-app` will start its web server on `http://localhost:3030` and connect to the `sonic-server`'s gRPC service.

You should then be able to access the main application in your browser at `http://localhost:3030`.

## Port Configurations for Local Development

- **Main Application (`main-app`)**: Runs its web server on port `3030`.
- **Sonic Server (`sonic-server`)**: Runs its gRPC service on port `50051` (configured by `GRPC_PORT` in `sonic-server/.env`).
- **MongoDB**: Runs on port `27017`.
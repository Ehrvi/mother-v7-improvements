// Generated autonomously by MOTHER v80.0 — Ciclo C119
import express from 'express';
import dotenv from 'dotenv';
import { setupRoutes } from './dashboard-api';
import { SensorIngestionService } from './sensor-ingestion';
import { AlertManager } from './alert-manager';
import { MotherClient } from './mother-client';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT ?? '3000', 10);

app.use(express.json());

// Initialize MOTHER client and services
const motherClient = new MotherClient();
const sensorIngestionService = new SensorIngestionService(motherClient);
const alertManager = new AlertManager(motherClient);

// Setup routes
setupRoutes(app, motherClient);
app.use('/api', sensorIngestionService.getRouter());

const startServer = async () => {
  try {
    console.log('Starting SHMS Agent...');

    // Start alert polling
    alertManager.startPolling();

    const server = app.listen(PORT, () => {
      console.log(`SHMS Agent listening on port ${PORT}`);
    });

    // Graceful shutdown
    const shutdown = () => {
      console.log('Shutting down SHMS Agent...');
      server.close(() => {
        alertManager.stopPolling();
        console.log('SHMS Agent gracefully shut down.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

  } catch (error) {
    console.error(`Failed to start SHMS Agent: ${error}`);
    process.exit(1);
  }
};

startServer();

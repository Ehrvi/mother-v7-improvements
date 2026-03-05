// Generated autonomously by MOTHER v80.0 — Ciclo C119
import express from 'express';
import dotenv from 'dotenv';
import { setupRoutes as setupDashboardRoutes } from './api/dashboard-api';
import { SensorIngestionService } from './services/SensorIngestionService';
import { AlertManager } from './services/AlertManager';
import { logger } from './utils/logger';
import { config } from './config';
import { connectToMother } from './utils/motherConnection';

dotenv.config();

const app = express();
const PORT = config.port;

app.use(express.json());

// Setup routes
setupDashboardRoutes(app);

// Initialize services
const sensorIngestionService = new SensorIngestionService();
const alertManager = new AlertManager();

const startServer = async () => {
  try {
    logger.info('Starting SHMS Agent...');

    // Connect to MOTHER
    await connectToMother();

    // Start sensor ingestion and alert management
    sensorIngestionService.start();
    alertManager.start();

    const server = app.listen(PORT, () => {
      logger.info(`SHMS Agent listening on port ${PORT}`);
      logger.info(`MOTHER Endpoint: ${config.motherEndpoint}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM signal received: closing HTTP server');
      server.close(async () => {
        logger.info('HTTP server closed.');
        await sensorIngestionService.stop();
        await alertManager.stop();
        logger.info('SHMS Agent gracefully shut down.');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      logger.info('SIGINT signal received: closing HTTP server');
      server.close(async () => {
        logger.info('HTTP server closed.');
        await sensorIngestionService.stop();
        await alertManager.stop();
        logger.info('SHMS Agent gracefully shut down.');
        process.exit(0);
      });
    });

  } catch (error) {
    logger.error(`Failed to start SHMS Agent: ${error}`);
    process.exit(1);
  }
};

startServer();
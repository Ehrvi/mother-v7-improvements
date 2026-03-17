// Generated autonomously by MOTHER v80.0 — Ciclo C119
import express, { type Express } from 'express';
import { MotherClient } from './mother-client';
import type { DashboardData, SensorStatus, Alert } from './types';

export function setupRoutes(app: Express, motherClient?: MotherClient): void {
  const router = express.Router();

  router.get('/dashboard', async (req, res) => {
    try {
      if (!motherClient) throw new Error('MotherClient not initialized');
      const dashboardData: DashboardData = await motherClient.getDashboard();
      res.json(dashboardData);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      res.status(500).json({ message: 'Failed to retrieve dashboard data', error: (error as Error).message });
    }
  });

  router.get('/alerts', async (req, res) => {
    try {
      if (!motherClient) throw new Error('MotherClient not initialized');
      const alerts: Alert[] = await motherClient.getAlerts();
      res.json(alerts);
    } catch (error) {
      console.error('Error fetching recent alerts:', error);
      res.status(500).json({ message: 'Failed to retrieve recent alerts', error: (error as Error).message });
    }
  });

  router.get('/health', (req, res) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || 'unknown',
      uptime: process.uptime(),
    });
  });

  app.use('/api', router);
}
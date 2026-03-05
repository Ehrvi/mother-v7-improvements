// Generated autonomously by MOTHER v80.0 — Ciclo C119
import express from 'express';
import { getDashboardData, getActiveSensors, getRecentAlerts } from './mother-client';
import { DashboardData, SensorStatus, Alert } from './types';

const router = express.Router();

/**
 * @route GET /dashboard
 * @description Retrieves aggregated dashboard data from MOTHER.
 * @returns {DashboardData} Aggregated sensor status, recent alerts summary, etc.
 */
router.get('/dashboard', async (req, res) => {
  try {
    const dashboardData: DashboardData = await getDashboardData();
    res.json(dashboardData);
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ message: 'Failed to retrieve dashboard data', error: (error as Error).message });
  }
});

/**
 * @route GET /sensors
 * @description Retrieves a list of active sensors and their current status from MOTHER.
 * @returns {SensorStatus[]} Array of active sensors with their status.
 */
router.get('/sensors', async (req, res) => {
  try {
    const sensors: SensorStatus[] = await getActiveSensors();
    res.json(sensors);
  } catch (error) {
    console.error('Error fetching active sensors:', error);
    res.status(500).json({ message: 'Failed to retrieve active sensors', error: (error as Error).message });
  }
});

/**
 * @route GET /alerts
 * @description Retrieves a list of recent alerts from MOTHER.
 * @returns {Alert[]} Array of recent alerts.
 */
router.get('/alerts', async (req, res) => {
  try {
    const alerts: Alert[] = await getRecentAlerts();
    res.json(alerts);
  } catch (error) {
    console.error('Error fetching recent alerts:', error);
    res.status(500).json({ message: 'Failed to retrieve recent alerts', error: (error as Error).message });
  }
});

/**
 * @route GET /health
 * @description Health check endpoint for the shms-agent.
 * @returns {object} Status of the agent.
 */
router.get('/health', (req, res) => {
  // In a more complex scenario, this could check database connections, external service reachability, etc.
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || 'unknown',
    uptime: process.uptime(),
  });
});

export default router;
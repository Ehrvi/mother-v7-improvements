// Generated autonomously by MOTHER v80.0 — Ciclo C119
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { MotherClient } from '../src/mother-client';
import { SensorIngestionService } from '../src/services/sensor-ingestion.service';
import { AlertManager } from '../src/services/alert-manager.service';
import { SensorData, SensorType, SensorUnit } from '../src/types';

// Mock axios to prevent actual HTTP requests during tests
vi.mock('axios');

const MOCK_MOTHER_API_URL = 'https://mother-interface-qtvghovzxa-ts.a.run.app/api/a2a';

describe('Integration Tests', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
  });

  describe('MotherClient Integration', () => {
    it('should successfully check Mother health', async () => {
      const mockResponse = { data: { status: 'healthy', version: 'v2.0' } };
      (axios.get as vi.Mock).mockResolvedValue(mockResponse);

      const motherClient = new MotherClient(MOCK_MOTHER_API_URL);
      const healthStatus = await motherClient.checkHealth();

      expect(axios.get).toHaveBeenCalledWith(`${MOCK_MOTHER_API_URL}/shms/v2/bridge/health`);
      expect(healthStatus).toEqual(mockResponse.data);
    });

    it('should handle Mother health check failure', async () => {
      const mockError = new Error('Network Error');
      (axios.get as vi.Mock).mockRejectedValue(mockError);

      const motherClient = new MotherClient(MOCK_MOTHER_API_URL);
      await expect(motherClient.checkHealth()).rejects.toThrow('Failed to connect to Mother SHMS v2 health endpoint');
      expect(axios.get).toHaveBeenCalledWith(`${MOCK_MOTHER_API_URL}/shms/v2/bridge/health`);
    });
  });

  describe('SensorIngestionService Integration', () => {
    it('should successfully ingest sensor data to Mother', async () => {
      const mockSensorData: SensorData = {
        sensorId: 'PIEZO-001',
        timestamp: new Date().toISOString(),
        value: 10.5,
        type: SensorType.Piezometer,
        unit: SensorUnit.Meters,
        location: { latitude: -33.45, longitude: -70.66, altitude: 500 },
        damId: 'DAM-001',
        projectId: 'PROJ-001',
      };

      const mockMotherResponse = { data: { message: 'Data ingested successfully', recordId: 'abc-123' } };
      (axios.post as vi.Mock).mockResolvedValue(mockMotherResponse);

      const motherClient = new MotherClient(MOCK_MOTHER_API_URL);
      const ingestionService = new SensorIngestionService(motherClient);

      const result = await ingestionService.ingest(mockSensorData);

      expect(axios.post).toHaveBeenCalledWith(
        `${MOCK_MOTHER_API_URL}/shms/v2/bridge/ingest`,
        mockSensorData,
        expect.any(Object) // Expecting headers
      );
      expect(result).toEqual(mockMotherResponse.data);
    });

    it('should handle ingestion failure', async () => {
      const mockSensorData: SensorData = {
        sensorId: 'PIEZO-002',
        timestamp: new Date().toISOString(),
        value: 12.1,
        type: SensorType.Piezometer,
        unit: SensorUnit.Meters,
        location: { latitude: -33.45, longitude: -70.66, altitude: 500 },
        damId: 'DAM-001',
        projectId: 'PROJ-001',
      };

      const mockError = new Error('Mother API Error');
      (axios.post as vi.Mock).mockRejectedValue(mockError);

      const motherClient = new MotherClient(MOCK_MOTHER_API_URL);
      const ingestionService = new SensorIngestionService(motherClient);

      await expect(ingestionService.ingest(mockSensorData)).rejects.toThrow('Failed to ingest sensor data to Mother SHMS v2');
      expect(axios.post).toHaveBeenCalledWith(
        `${MOCK_MOTHER_API_URL}/shms/v2/bridge/ingest`,
        mockSensorData,
        expect.any(Object)
      );
    });
  });

  describe('AlertManager Integration', () => {
    it('should initialize AlertManager without errors', () => {
      // This test primarily checks if the constructor runs without throwing,
      // implying dependencies (if any) are correctly handled or mocked.
      // For a real integration, you might mock a notification service.
      const alertManager = new AlertManager();
      expect(alertManager).toBeInstanceOf(AlertManager);
      // No external calls are made on initialization, so no axios calls expected.
      expect(axios.get).not.toHaveBeenCalled();
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('should send an alert successfully', async () => {
      const mockAlertPayload = {
        alertId: 'ALERT-001',
        damId: 'DAM-001',
        projectId: 'PROJ-001',
        sensorId: 'PIEZO-001',
        timestamp: new Date().toISOString(),
        message: 'Piezometer reading exceeded threshold',
        severity: 'HIGH',
        value: 15.2,
        threshold: 15.0,
      };

      const mockMotherResponse = { data: { message: 'Alert sent successfully', alertRecordId: 'xyz-456' } };
      (axios.post as vi.Mock).mockResolvedValue(mockMotherResponse);

      const motherClient = new MotherClient(MOCK_MOTHER_API_URL);
      const alertManager = new AlertManager();

      // Mock the internal motherClient call within AlertManager
      // This is more of a unit test for AlertManager's `sendAlert` method,
      // but it demonstrates the interaction with the (mocked) MotherClient.
      vi.spyOn(motherClient, 'sendAlert').mockResolvedValue(mockMotherResponse.data);
      alertManager.setMotherClient(motherClient); // Inject the mocked client

      const result = await alertManager.sendAlert(mockAlertPayload);

      expect(motherClient.sendAlert).toHaveBeenCalledWith(mockAlertPayload);
      expect(result).toEqual(mockMotherResponse.data);
    });

    it('should handle alert sending failure', async () => {
      const mockAlertPayload = {
        alertId: 'ALERT-002',
        damId: 'DAM-001',
        projectId: 'PROJ-001',
        sensorId: 'PIEZO-002',
        timestamp: new Date().toISOString(),
        message: 'Inclinometer reading out of range',
        severity: 'CRITICAL',
        value: 2.5,
        threshold: 2.0,
      };

      const mockError = new Error('Alert API Error');
      const motherClient = new MotherClient(MOCK_MOTHER_API_URL);
      const alertManager = new AlertManager();

      vi.spyOn(motherClient, 'sendAlert').mockRejectedValue(mockError);
      alertManager.setMotherClient(motherClient);

      await expect(alertManager.sendAlert(mockAlertPayload)).rejects.toThrow('Failed to send alert to Mother SHMS v2');
      expect(motherClient.sendAlert).toHaveBeenCalledWith(mockAlertPayload);
    });
  });
});
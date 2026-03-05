// Generated autonomously by MOTHER v80.0 — Ciclo C119
import axios, { AxiosInstance, AxiosError } from 'axios';
import { SensorReading, MotherAlert, MotherDashboard } from './types';

const MOTHER_BASE_URL = 'https://mother-interface-qtvghovzxa-ts.a.run.app/api/a2a/shms/v2';

export class MotherClient {
  private client: AxiosInstance;
  private maxRetries: number;

  constructor(maxRetries: number = 3) {
    this.client = axios.create({
      baseURL: MOTHER_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 10000, // 10 seconds timeout
    });
    this.maxRetries = maxRetries;
  }

  private async requestWithRetry<T>(
    method: 'post' | 'get',
    url: string,
    data?: any,
    attempt: number = 1
  ): Promise<T> {
    try {
      const response = await this.client[method]<T>(url, data);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && (error.response?.status === 500 || error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') && attempt < this.maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s, 8s
        console.warn(`MOTHER Client: Request to ${url} failed (attempt ${attempt}). Retrying in ${delay / 1000}s...`, error.message);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.requestWithRetry<T>(method, url, data, attempt + 1);
      }
      console.error(`MOTHER Client: Final attempt to ${url} failed after ${attempt} retries.`, error.message);
      throw error;
    }
  }

  /**
   * Ingests a sensor reading into the MOTHER SHMS v2 system.
   * @param reading The sensor reading data.
   * @returns A promise that resolves to the response from MOTHER.
   */
  async ingestReading(reading: SensorReading): Promise<any> {
    return this.requestWithRetry('post', '/bridge/ingest', reading);
  }

  /**
   * Retrieves alerts from the MOTHER SHMS v2 system.
   * @returns A promise that resolves to an array of MotherAlerts.
   */
  async getAlerts(): Promise<MotherAlert[]> {
    return this.requestWithRetry('get', '/alerts');
  }

  /**
   * Retrieves dashboard data from the MOTHER SHMS v2 system.
   * @returns A promise that resolves to MotherDashboard data.
   */
  async getDashboard(): Promise<MotherDashboard> {
    return this.requestWithRetry('get', '/dashboard');
  }

  /**
   * Checks the health of the MOTHER SHMS v2 API.
   * @returns A promise that resolves to a health status object.
   */
  async checkHealth(): Promise<{ status: string }> {
    return this.requestWithRetry('get', '/health');
  }
}
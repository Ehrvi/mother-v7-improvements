// Generated autonomously by MOTHER v80.0 — Ciclo C119
import express from 'express';
import { z } from 'zod';
import { MotherClient } from './mother-client';
import { SensorReadingSchema, type SensorReading } from './types';

const BatchSensorReadingSchema = z.array(SensorReadingSchema).max(100);

export class SensorIngestionService {
    private router: express.Router;
    private motherClient: MotherClient;

    constructor(motherClient: MotherClient) {
        this.router = express.Router();
        this.motherClient = motherClient;
        this.setupRoutes();
    }

    public getRouter(): express.Router {
        return this.router;
    }

    private setupRoutes(): void {
        this.router.post('/ingest', express.json(), async (req, res) => {
            try {
                const body = req.body;

                // Check if it's a single reading or a batch
                if (Array.isArray(body)) {
                    const validatedReadings = BatchSensorReadingSchema.parse(body);
                    console.log(`Received batch of ${validatedReadings.length} sensor readings.`);
                    const results = await Promise.allSettled(
                        validatedReadings.map(reading => this.motherClient.ingestReading(reading as SensorReading))
                    );

                    const successfulIngestions = results.filter(r => r.status === 'fulfilled').length;
                    const failedIngestions = results.filter(r => r.status === 'rejected').length;

                    if (failedIngestions > 0) {
                        console.warn(`Batch ingestion completed with ${successfulIngestions} successes and ${failedIngestions} failures.`);
                        res.status(207).json({
                            message: `Batch ingestion partially successful. ${successfulIngestions} readings ingested, ${failedIngestions} failed.`,
                            details: results.map(r => r.status === 'rejected' ? (r as PromiseRejectedResult).reason.message : 'Success')
                        });
                    } else {
                        console.log(`Batch ingestion successful for all ${successfulIngestions} readings.`);
                        res.status(200).json({ message: `Successfully ingested ${successfulIngestions} sensor readings.` });
                    }

                } else {
                    const validatedReading = SensorReadingSchema.parse(body);
                    console.log(`Received single sensor reading for device ${validatedReading.sensorId}.`);
                    await this.motherClient.ingestReading(validatedReading as SensorReading);
                    console.log(`Successfully ingested single sensor reading for device ${validatedReading.sensorId}.`);
                    res.status(200).json({ message: 'Sensor reading ingested successfully.' });
                }
            } catch (error: any) {
                if (error instanceof z.ZodError) {
                    console.error('Validation error during sensor ingestion:', error.issues);
                    res.status(400).json({ message: 'Invalid sensor data format.', errors: error.issues });
                } else {
                    console.error('Error during sensor ingestion:', error.message);
                    res.status(500).json({ message: 'Failed to ingest sensor reading.', error: error.message });
                }
            }
        });
    }
}
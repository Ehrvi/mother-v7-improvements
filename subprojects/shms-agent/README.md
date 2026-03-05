# shms-agent

## Geotechnical Sensor Adapter for MOTHER SHMS v2

`shms-agent` is a robust and intelligent adapter designed to bridge the gap between various IoT geotechnical sensors and the MOTHER SHMS v2 (Structural Health Monitoring System) platform. It acts as a crucial intermediary, receiving raw sensor data, performing initial processing and validation, and securely forwarding it to the MOTHER system for advanced analysis, digital twin integration, and alert generation.

## Architecture

+-------------------+      +-------------------+      +-------------------+
|                   |      |                   |      |                   |
|   IoT Sensors     |      |    shms-agent     |      |    MOTHER SHMS    |
| (Piezometers,     |----->| (Node.js/Express) |----->| (LSTM, Digital    |
|  Inclinometers,   | HTTP |  - Data Ingestion | HTTP |  Twin, Alerts)    |
|  Settlement       |/MQTT |  - Validation     |/HTTPS|                   |
|  Gauges, etc.)    |      |  - Forwarding     |      |                   |
|                   |      |                   |      |                   |
+-------------------+      +-------------------+      +-------------------+
                                   |
                                   | (Optional)
                                   v
                         +-------------------+
                         |                   |
                         |   Webhook System  |
                         | (for notifications|
                         |   or external     |
                         |   integrations)   |
                         +-------------------+

## Installation

To get started with `shms-agent`, follow these steps:

1.  **Clone the repository:**
    bash
    git clone <repository-url>
    cd shms-agent
    
2.  **Install dependencies:**
    bash
    npm install
    
## Usage

1.  **Configure Environment Variables:**
    Create a `.env` file in the root directory and set the required environment variables (see "Environment Variables" section below).

2.  **Start the server:**
    bash
    npm run dev
        The server will start on the configured `PORT` (default: 3001).

## API Endpoints

`shms-agent` exposes the following primary API endpoints for data ingestion:

*   **`POST /api/v1/ingest`**:
    *   Receives raw sensor data from IoT devices.
    *   Validates the incoming payload against predefined schemas.
    *   Forwards the validated data to the MOTHER SHMS v2 `/api/a2a/shms/v2/bridge/ingest` endpoint.

*   **`POST /api/v1/webhook`**:
    *   Receives data from MOTHER SHMS v2 or other internal systems.
    *   Forwards the data to a configurable external webhook URL.

## Environment Variables

The following environment variables are required for `shms-agent` to function correctly:

*   **`PORT`**: The port on which the Express server will listen.
    *   *Default:* `3001`
*   **`MOTHER_ENDPOINT`**: The base URL of the MOTHER SHMS v2 API.
    *   *Example:* `https://mother-interface-qtvghovzxa-ts.a.run.app`
*   **`WEBHOOK_URL`**: (Optional) The URL of an external webhook endpoint to which `shms-agent` will forward data received on its `/api/v1/webhook` endpoint.

## Scientific Basis

The design and implementation of `shms-agent` are informed by leading practices and research in geotechnical engineering, structural health monitoring, and digital twin technologies:

*   **ICOLD Bulletin 158 (2014) - Monitoring of Dams and their Foundations**: Provides guidelines and best practices for instrumentation, data acquisition, and interpretation in dam safety monitoring, directly influencing the types of sensor data `shms-agent` is designed to handle.
*   **ISO 19650 - Organization and digitization of information about buildings and civil engineering works, including building information modelling (BIM) - Information management using building information modelling**: Emphasizes structured data management and information exchange, which is critical for seamless integration with the MOTHER SHMS v2 platform.
*   **Grieves, M. (2017). Digital Twin: Manufacturing Excellence through Virtual Replicas**: The concept of the Digital Twin, as articulated by Grieves, underpins the MOTHER SHMS v2 system, making `shms-agent` a vital data conduit for creating and maintaining these virtual replicas.
*   **Hochreiter, S. (1997). Long Short-Term Memory**: The MOTHER SHMS v2 system leverages advanced machine learning techniques like LSTMs for predictive analysis and anomaly detection, requiring reliable and timely data input from `shms-agent`.
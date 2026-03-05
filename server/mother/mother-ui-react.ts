// server/mother/mother-ui-react.ts
import express from 'express';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const MOTHER_DIR = existsSync('/app/server') ? '/app' : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const getUIHtml = () => {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>MOTHER UI</title>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
        <style>
            body {
                background-color: #0d1117;
                color: #e6edf3;
                font-family: Arial, sans-serif;
                margin: 0;
                display: flex;
                height: 100vh;
            }
            #chat {
                width: 40%;
                border-right: 1px solid #444;
                display: flex;
                flex-direction: column;
            }
            #shell {
                width: 60%;
                display: flex;
                flex-direction: column;
            }
            #chat-history {
                flex: 1;
                overflow-y: auto;
                padding: 10px;
            }
            #input-area {
                display: flex;
                padding: 10px;
                border-top: 1px solid #444;
            }
            #input {
                flex: 1;
                padding: 10px;
                border: 1px solid #444;
                background-color: #1f1f1f;
                color: #e6edf3;
            }
            #shell-output {
                flex: 1;
                overflow-y: auto;
                padding: 10px;
                background-color: #1f1f1f;
                border-top: 1px solid #444;
            }
        </style>
    </head>
    <body>
        <div id="chat">
            <div id="chat-history"></div>
            <div id="input-area">
                <input type="text" id="input" placeholder="Type a message..." />
            </div>
        </div>
        <div id="shell">
            <div id="shell-output"></div>
        </div>
        <script src="https://unpkg.com/react/umd/react.production.min.js"></script>
        <script src="https://unpkg.com/react-dom/umd/react-dom.production.min.js"></script>
        <script>
            const chatHistory = document.getElementById('chat-history');
            const input = document.getElementById('input');
            const shellOutput = document.getElementById('shell-output');

            const eventSource = new EventSource('/api/a2a/stream/hub');

            eventSource.onmessage = function(event) {
                const message = document.createElement('div');
                message.textContent = event.data;
                chatHistory.appendChild(message);
                chatHistory.scrollTop = chatHistory.scrollHeight;
            };

            input.addEventListener('keypress', function(event) {
                if (event.key === 'Enter') {
                    const message = input.value;
                    fetch('/api/a2a/send', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ message })
                    });
                    input.value = '';
                }
            });

            const shellEventSource = new EventSource('/api/a2a/shell');

            shellEventSource.onmessage = function(event) {
                const outputLine = document.createElement('div');
                outputLine.textContent = event.data;
                shellOutput.appendChild(outputLine);
                shellOutput.scrollTop = shellOutput.scrollHeight;
            };
        </script>
    </body>
    </html>
    `;
};

export const handleMotherUI = (req: import("express").Request, res: import("express").Response): void => {
    res.send(getUIHtml());
};

app.get('/api/a2a/ui', handleMotherUI);

export default app;
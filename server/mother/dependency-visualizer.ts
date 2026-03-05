// server/mother/dependency-visualizer.ts
import express from 'express';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const app = express();
const MOTHER_DIR = existsSync('/app/server') ? '/app' : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const handleDependencyVisualizer = async (req: import("express").Request, res: import("express").Response): Promise<void> => {
    try {
        const html = getVisualizerHtml();
        res.status(200).send(html);
    } catch (error) {
        console.error('Error generating dependency visualizer:', error);
        res.status(500).send('Internal Server Error');
    }
};

const getVisualizerHtml = () => {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Dependency Visualizer</title>
        <script src="https://d3js.org/d3.v7.min.js"></script>
        <style>
            body {
                font-family: Arial, sans-serif;
                margin: 0;
                padding: 0;
            }
            svg {
                border: 1px solid #ccc;
                width: 100%;
                height: 100vh;
            }
            .node {
                cursor: pointer;
            }
            .core { fill: #4299e1; }
            .mother { fill: #48bb78; }
            .shms { fill: #ed8936; }
            .a2a { fill: #9f7aea; }
        </style>
    </head>
    <body>
        <svg id="visualization"></svg>
        <script>
            const width = window.innerWidth;
            const height = window.innerHeight;

            const svg = d3.select("#visualization")
                .attr("width", width)
                .attr("height", height);

            const simulation = d3.forceSimulation()
                .force("link", d3.forceLink().id(d => d.id).distance(100))
                .force("charge", d3.forceManyBody().strength(-300))
                .force("center", d3.forceCenter(width / 2, height / 2));

            async function fetchGraphData() {
                const response = await axios.get('/api/a2a/dependency-graph');
                return response.data;
            }

            async function renderGraph() {
                const graph = await fetchGraphData();

                const link = svg.append("g")
                    .attr("class", "links")
                    .selectAll("line")
                    .data(graph.links)
                    .enter().append("line")
                    .attr("stroke-width", 2);

                const node = svg.append("g")
                    .attr("class", "nodes")
                    .selectAll("circle")
                    .data(graph.nodes)
                    .enter().append("circle")
                    .attr("r", 5)
                    .attr("class", d => d.category)
                    .on("click", d => showDetails(d))
                    .call(d3.drag()
                        .on("start", dragstarted)
                        .on("drag", dragged)
                        .on("end", dragended));

                node.append("title")
                    .text(d => d.id);

                simulation
                    .nodes(graph.nodes)
                    .on("tick", ticked);

                simulation.force("link")
                    .links(graph.links);

                function ticked() {
                    link
                        .attr("x1", d => d.source.x)
                        .attr("y1", d => d.source.y)
                        .attr("x2", d => d.target.x)
                        .attr("y2", d => d.target.y);

                    node
                        .attr("cx", d => d.x)
                        .attr("cy", d => d.y);
                }

                function dragstarted(event, d) {
                    if (!event.active) simulation.alphaTarget(0.3).restart();
                    d.fx = d.x;
                    d.fy = d.y;
                }

                function dragged(event, d) {
                    d.fx = event.x;
                    d.fy = event.y;
                }

                function dragended(event, d) {
                    if (!event.active) simulation.alphaTarget(0);
                    d.fx = null;
                    d.fy = null;
                }
            }

            function showDetails(node) {
                alert('Module: ' + node.id + '\\nExports: ' + node.exports + '\\nDependencies: ' + node.dependencies.join(", "));
            }

            renderGraph();
        </script>
    </body>
    </html>
    `;
}; 

app.get('/api/a2a/dependency-visualizer', handleDependencyVisualizer); 

export default app;
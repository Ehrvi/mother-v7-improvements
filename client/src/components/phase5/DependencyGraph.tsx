import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { trpc } from '@/lib/trpc';

interface GraphNode extends d3.SimulationNodeDatum { id: string; group: number; }
interface GraphLink extends d3.SimulationLinkDatum<GraphNode> { value?: number; }

export default function DependencyGraph() {
  const svgRef = useRef<SVGSVGElement>(null);
  const { data: proposals } = trpc.mother.dgmPendingProposals.useQuery();

  useEffect(() => {
    if (!svgRef.current || !proposals?.length) return;

    const nodes: GraphNode[] = proposals.map((p) => ({ id: p.id, group: 1 }));
    const links: GraphLink[] = [];
    const width = svgRef.current.clientWidth || 600;
    const height = svgRef.current.clientHeight || 400;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const simulation = d3.forceSimulation<GraphNode>(nodes)
      .force('link', d3.forceLink<GraphNode, GraphLink>(links).id(d => d.id))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2));

    const link = svg.append('g').selectAll('line').data(links).join('line')
      .attr('stroke', 'oklch(35% 0.10 300)').attr('stroke-opacity', 0.6);

    const node = svg.append('g').selectAll('circle').data(nodes).join('circle')
      .attr('r', 10).attr('fill', 'oklch(68% 0.16 285)')
      .call(d3.drag<SVGCircleElement, GraphNode>()
        .on('start', (event: d3.D3DragEvent<SVGCircleElement, GraphNode, GraphNode>, d: GraphNode) => { if (!event.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on('drag', (event: d3.D3DragEvent<SVGCircleElement, GraphNode, GraphNode>, d: GraphNode) => { d.fx = event.x; d.fy = event.y; })
        .on('end', (event: d3.D3DragEvent<SVGCircleElement, GraphNode, GraphNode>, d: GraphNode) => { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }) as unknown as (selection: d3.Selection<SVGCircleElement | d3.BaseType, GraphNode, SVGGElement, unknown>) => void);

    simulation.on('tick', () => {
      link.attr('x1', d => (d.source as GraphNode).x!).attr('y1', d => (d.source as GraphNode).y!)
          .attr('x2', d => (d.target as GraphNode).x!).attr('y2', d => (d.target as GraphNode).y!);
      node.attr('cx', d => d.x!).attr('cy', d => d.y!);
    });

    return () => { simulation.stop(); };
  }, [proposals]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-[var(--color-border-subtle)]">
        <h2 className="text-sm font-semibold">DGM Dependency Graph</h2>
        <p className="text-xs text-[var(--color-fg-muted)]">Proposal relationships — creator only</p>
      </div>
      <div className="flex-1 relative">
        {(!proposals || proposals.length === 0) && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-[var(--color-fg-subtle)]">
            No proposals to visualize
          </div>
        )}
        <svg ref={svgRef} className="w-full h-full" />
      </div>
    </div>
  );
}

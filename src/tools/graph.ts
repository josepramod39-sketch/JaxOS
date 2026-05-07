import { join } from "path";
import { homedir } from "os";

const JAXOS_HOME = join(homedir(), "jaxos");
const GRAPH_PATH = join(JAXOS_HOME, "knowledge_graph.json");

export interface GraphNode {
  id: string;
  type: "concept" | "paper";
  metadata?: any;
  degree?: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  relation: string;
  weight: number;
  disputed?: boolean;
}

export interface KnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export async function loadGraph(): Promise<KnowledgeGraph> {
  const file = Bun.file(GRAPH_PATH);
  if (!(await file.exists())) {
    return { nodes: [], edges: [] };
  }
  try {
    return await file.json();
  } catch {
    return { nodes: [], edges: [] };
  }
}

export async function saveGraph(graph: KnowledgeGraph) {
  // Update degrees
  const counts: Record<string, number> = {};
  for (const edge of graph.edges) {
    counts[edge.source] = (counts[edge.source] || 0) + 1;
    counts[edge.target] = (counts[edge.target] || 0) + 1;
  }
  
  for (const node of graph.nodes) {
    node.degree = counts[node.id] || 0;
  }

  await Bun.write(GRAPH_PATH, JSON.stringify(graph, null, 2));
}

export async function addTriples(triples: { source: string; target: string; relation: string }[], paperMetadata?: any) {
  const graph = await loadGraph();

  for (const triple of triples) {
    const { source, target, relation } = triple;

    // Add nodes if they don't exist
    if (!graph.nodes.find(n => n.id === source)) {
      graph.nodes.push({ id: source, type: "concept" });
    }
    if (!graph.nodes.find(n => n.id === target)) {
      graph.nodes.push({ id: target, type: "concept" });
    }

    // --- CONFLICT DETECTION (Truth Maintenance) ---
    // If we have same source + relation, but different target -> Conflict
    const conflictingEdges = graph.edges.filter(e => 
      e.source === source && e.relation === relation && e.target !== target
    );

    if (conflictingEdges.length > 0) {
      conflictingEdges.forEach(e => e.disputed = true);
    }

    // Add or update edge
    const existingEdge = graph.edges.find(e => 
      (e.source === source && e.target === target && e.relation === relation)
    );

    if (existingEdge) {
      existingEdge.weight += 1;
      if (conflictingEdges.length > 0) existingEdge.disputed = true;
    } else {
      graph.edges.push({ 
        source, 
        target, 
        relation, 
        weight: 1, 
        disputed: conflictingEdges.length > 0 ? true : undefined 
      });
    }
  }

  // If paper metadata is provided, link the paper to all extracted concepts
  if (paperMetadata?.id) {
    const paperId = `paper:${paperMetadata.id}`;
    if (!graph.nodes.find(n => n.id === paperId)) {
      graph.nodes.push({ id: paperId, type: "paper", metadata: paperMetadata });
    }

    const concepts = new Set(triples.flatMap(t => [t.source, t.target]));
    for (const concept of concepts) {
      graph.edges.push({ source: paperId, target: concept, relation: "mentions", weight: 1 });
    }
  }

  await saveGraph(graph);
}

import ElkConstructor from 'elkjs';
import { Position, MarkerType, Node } from 'react-flow-renderer';

// this helper function returns the intersection point
// of the line between the center of the intersectionNode and the target node
function getNodeIntersection(intersectionNode: Node<any>, targetNode: Node<any>) {
    // https://math.stackexchange.com/questions/1724792/an-algorithm-for-finding-the-intersection-point-between-a-center-of-vision-and-a
    const {
        width: intersectionNodeWidth,
        height: intersectionNodeHeight,
        positionAbsolute: intersectionNodePosition,
    } = intersectionNode;
    const targetPosition = targetNode.positionAbsolute;
  
    const w = intersectionNodeWidth!! / 2;
    const h = intersectionNodeHeight!! / 2;
  
    const x2 = intersectionNodePosition!!.x + w;
    const y2 = intersectionNodePosition!!.y + h;
    const x1 = targetPosition!!.x + w;
    const y1 = targetPosition!!.y + h;
  
    const xx1 = (x1 - x2) / (2 * w) - (y1 - y2) / (2 * h);
    const yy1 = (x1 - x2) / (2 * w) + (y1 - y2) / (2 * h);
    const a = 1 / (Math.abs(xx1) + Math.abs(yy1));
    const xx3 = a * xx1;
    const yy3 = a * yy1;
    const x = w * (xx3 + yy3) + x2;
    const y = h * (-xx3 + yy3) + y2;
  
    return { x, y };
}

// returns the position (top,right,bottom or right) passed node compared to the intersection point
function getEdgePosition(node: Node<any>, intersectionPoint: { x: any; y: any; }) {
    const n = { ...node.positionAbsolute, ...node };
    const nx = Math.round(n.x!!);
    const ny = Math.round(n.y!!);
    const px = Math.round(intersectionPoint.x);
    const py = Math.round(intersectionPoint.y);

    if (px <= nx + 1) {
        return Position.Left;
    }
    if (px >= nx + n.width!! - 1) {
        return Position.Right;
    }
    if (py <= ny + 1) {
        return Position.Top;
    }
    if (py >= n.y!! + n.height!! - 1) {
        return Position.Bottom;
    }
  
    return Position.Top;
}

// returns the parameters (sx, sy, tx, ty, sourcePos, targetPos) you need to create an edge
export function getEdgeParams(source: Node<any>, target: Node<any>) {
    const sourceIntersectionPoint = getNodeIntersection(source, target);
    const targetIntersectionPoint = getNodeIntersection(target, source);
  
    const sourcePos = getEdgePosition(source, sourceIntersectionPoint);
    const targetPos = getEdgePosition(target, targetIntersectionPoint);

    return {
        sx: sourceIntersectionPoint.x,
        sy: sourceIntersectionPoint.y,
        tx: targetIntersectionPoint.x,
        ty: targetIntersectionPoint.y,
        sourcePos,
        targetPos,
    };
}

export const layoutDiagram = async (nodes: any[], edges: any[]):
    Promise<Map<string, {x: number, y: number}>> => {
    const elkNodes = [];
    const elkEdges = [];
    for (var node of nodes) {
        const fixed: boolean = node["data"]["layedOut"];
        const toPush: any = { id: node["id"], width: node["width"], height: node["height"] };
        if (fixed) {
            toPush["x"] = node["position"]["x"];
            toPush["y"] = node["position"]["y"];
        }
        elkNodes.push(toPush);
    }
    for (var edge of edges)
        elkEdges.push({
            id: edge["source"] + "-" + edge["target"],
            sources: [ edge["source"] ],
            targets: [ edge["target"] ]
        });

    const elk = new ElkConstructor();
    const graph = {
        id: "root",
        layoutOptions: { 'elk.algorithm': 'layered' },
        children: elkNodes,
        edges: elkEdges
    }
    
    const layedOut = await elk.layout(graph);

    const result: Map<string, {x: number, y: number}> = new Map();
    for (var layedOutNode of layedOut.children!!) {
        result.set(layedOutNode.id, {x: layedOutNode.x!!, y: layedOutNode.y!!});
    }

    return result;
}
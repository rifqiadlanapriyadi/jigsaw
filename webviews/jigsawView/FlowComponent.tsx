import { useCallback, useState } from "react";
import React = require("react");
import ReactFlow, { addEdge, Background, Connection, Controls, Edge, MiniMap, Node, useEdgesState, useNodesState } from "react-flow-renderer";
import { DebugState } from "./DebugState";
import { JigsawVariable } from "./JigsawVariable";

export function FlowComponent() {
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const onConnect = useCallback(
        (connection: Edge<any> | Connection) => setEdges((eds) => addEdge(connection, eds)),
        [setEdges]
    );

    window.addEventListener('message', event => {
        let data = event.data

        if (data["type"] == "response" && data["command"] == "variables") {
            for (var variable of data["body"]["variables"]) {
                const parsedVariable: JigsawVariable | undefined = parseVariable(variable);
                if (parsedVariable) {
                    DebugState.getInstance().updateVariable(parsedVariable);
                }
            }
            console.log(DebugState.getInstance().jigsawVariables);
        }

        const varNodes: React.SetStateAction<Node<any>[]>
            | { id: string; type: string; data: { label: string; }; position: { x: number; y: number; }; }[] = [];
        DebugState.getInstance().jigsawVariables.forEach((variable: JigsawVariable, key: string) => {
            const varName = variable.name;
            varNodes.push({
                id: varName,
                type:'input',
                data: {label: varName + ": " + variable.value},
                position: { x: 250, y: 25 }
            });
        });
        setNodes(varNodes);
    })

    // return <h1>Hello</h1>;

    return (
        <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
          fitView>
            <MiniMap/>
            <Controls/>
            <Background/>
          </ReactFlow>
    );
}

function parseVariable(toParse: {[key: string]: any}): JigsawVariable | undefined {
    const name: string = toParse["name"];
    const value: string = toParse["value"];
    const type: string = toParse["type"];
    const variablesReference: number = toParse["variablesReference"];
    const namedVariables: number = toParse["namedVariables"];
    const indexedVariables: number = toParse["indexedVariables"];
    const evaluateName: string = toParse["evaluateName"];

    // console.log("=================================");
    // console.log("name: " + name);
    // console.log("value: " + value);
    // console.log("type: " + type);
    // console.log("variablesReference: " + variablesReference);
    // console.log("namedVariables: " + namedVariables);
    // console.log("indexedVariables: " + indexedVariables);
    // console.log("evaluateName: " + evaluateName);
    
    if (
        !name
        || !value
        || !type
        || variablesReference == undefined
        || namedVariables == undefined
        || indexedVariables == undefined
        || !evaluateName
        ) {
            console.log("undedededede");
        return undefined;
    }
    return new JigsawVariable(name, value, type, variablesReference, namedVariables, indexedVariables, evaluateName);
}
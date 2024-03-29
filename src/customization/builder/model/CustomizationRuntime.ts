import { DebugState } from "../../../debugmodel/DebugState";
import { EdgeInfo, NodeInfo, rowToString, VariableInfo } from "../../../debugmodel/DiagramInfo";
import { JigsawVariable } from "../../../debugmodel/JigsawVariable";
import { StackFrame } from "../../../debugmodel/StackFrame";
import { RuntimeError } from "../error/RuntimeError";
import { Command } from "./command/language/Command";
import { CustSpecComponent } from "./CustSpecComponent";
import { ArrayType } from "./expr/collection/ArrayExpr";
import { MapType } from "./expr/collection/NewMapExpr";
import { ValueType } from "./expr/ValueType";
import { ClassLocation } from "./location/ClassLocation";
import { Location, LocationType } from "./location/Location";
import { MethodLocation } from "./location/MethodLocation";
import { RTLocationScope, Variable } from "./RTLocationScope";
import { Statement } from "./Statement";

export type Subject = {
	id: string
}

export class CustomizationRuntime extends CustSpecComponent {
    private topStatements: Statement[] = [];
    private runtimeScopes: RTLocationScope[] = [];

	private frame!: StackFrame;
	private allNodes: Map<string, NodeInfo> = new Map(); private shownNodes: Map<string, NodeInfo> = new Map();
	private allEdges: Map<string, EdgeInfo> = new Map(); private shownEdges: Map<string, EdgeInfo> = new Map();

	private allRelations: Map<string, string[]> = new Map(); // Node id -> Edge ids
	private shownRelations: Map<string, string[]> = new Map(); // Node id -> Edge ids

	private currentLocation!: Location;
	private currentVariable!: JigsawVariable;
	private executedMethodLocations!: MethodLocation[];

	public getTopLocations(): Location[]  {
		const result: Location[] = [];
		for (const topStatement of this.topStatements)
			if (topStatement instanceof Location)
				result.push(topStatement);
		return result;
	}

	private clearGraph() {
		this.allNodes.clear(); this.shownNodes.clear();
		this.allEdges.clear(); this.shownEdges.clear();
		this.allRelations.clear(); this.shownRelations.clear();
	}

	public setTopStatements(newStatements: Statement[]) {
		this.topStatements = newStatements;
	}

	private setupRelations() {
		for (const [_, edge] of this.allEdges) {
			this.addToAllRelations(edge);
			this.addToShownRelations(edge);
		}
	}

	private sortedInsertion(strings: string[], newString: string): boolean {
		var left: number = 0;
    	var right: number = strings.length - 1;

    	while (left < right) {
    		const mid: number = Math.floor((left + right) / 2);
    	    const midString: string = strings[mid];
    	    const afterMidString: string = strings[mid + 1];

			if (midString === newString || newString === afterMidString) return false;
        	if (midString < newString && newString < afterMidString) {
        	    strings.splice(mid + 1, 0, newString);
        	    return true;
        	}
        	if (midString < newString) left = mid + 1;
        	else right = mid - 1;
    	}

    	const rightString: string = strings[right];
    	if (newString === rightString) return false;
    	if (rightString < newString) strings.splice(right + 1, 0, newString);
    	else strings.splice(Math.max(right - 1, 0), 0, newString);
		return true;
	}

	private addToAllRelations(edge: EdgeInfo) {
		const sourceId: string = edge.source;
		if (!this.allRelations.has(sourceId)) this.allRelations.set(sourceId, []);
		this.sortedInsertion(this.allRelations.get(sourceId)!, edge.id);

		const targetId: string = edge.target;
		if (!this.allRelations.has(targetId)) this.allRelations.set(targetId, []);
		this.sortedInsertion(this.allRelations.get(targetId)!, edge.id);
	}

	private addToShownRelations(edge: EdgeInfo) {
		const sourceId: string = edge.source;
		if (!this.shownRelations.has(sourceId)) this.shownRelations.set(sourceId, []);
		this.sortedInsertion(this.shownRelations.get(sourceId)!, edge.id);

		const targetId: string = edge.target;
		if (!this.shownRelations.has(targetId)) this.shownRelations.set(targetId, []);
		this.sortedInsertion(this.shownRelations.get(targetId)!, edge.id);
	}

	private removeFromAllRelations(edge: EdgeInfo) {
		const edgeSourceId: string = edge.source;
		const edgeTargetId: string = edge.target;

		if (this.allRelations.has(edgeSourceId)) {
			const nodeEdges: string[] = this.allRelations.get(edgeSourceId)!;
			nodeEdges.splice(nodeEdges.indexOf(edge.id), 1);
			if (nodeEdges.length == 0) this.allRelations.delete(edgeSourceId);
		}
		if (this.allRelations.has(edgeTargetId)) {
			const nodeEdges: string[] = this.allRelations.get(edgeTargetId)!;
			nodeEdges.splice(nodeEdges.indexOf(edge.id), 1);
			if (nodeEdges.length == 0) this.allRelations.delete(edgeTargetId);
		}
	}

	private removeFromShownRelations(edge: EdgeInfo) {
		const edgeSourceId: string = edge.source;
		const edgeTargetId: string = edge.target;

		if (this.shownRelations.has(edgeSourceId)) {
			const nodeEdges: string[] = this.shownRelations.get(edgeSourceId)!;
			nodeEdges.splice(nodeEdges.indexOf(edge.id), 1);
			if (nodeEdges.length == 0) this.shownRelations.delete(edgeSourceId);
		}
		if (this.shownRelations.has(edgeTargetId)) {
			const nodeEdges: string[] = this.shownRelations.get(edgeTargetId)!;
			nodeEdges.splice(nodeEdges.indexOf(edge.id), 1);
			if (nodeEdges.length == 0) this.shownRelations.delete(edgeTargetId);
		}
	}

	private setupNodes(nodes: NodeInfo[]) {
		this.allNodes = new Map();
		this.shownNodes = new Map();
		for (const node of nodes) {
			this.allNodes.set(node.id, node);
			this.shownNodes.set(node.id, node);
		}
	}

	private setupEdges(edges: EdgeInfo[]) {
		this.allEdges = new Map();
		this.shownEdges = new Map();
		for (const edge of edges) {
			this.allEdges.set(edge.id, edge);
			this.shownEdges.set(edge.id, edge);
		}
	}

	public applyCustomization(nodes: NodeInfo[] = [], edges: EdgeInfo[] = [], stackPos: number = 0): {nodes: NodeInfo[], edges: EdgeInfo[]} | RuntimeError {
		this.setupNodes(nodes);
		this.setupEdges(edges);
		this.runtimeScopes = [];
		this.executedMethodLocations = [];
		this.openLocationScope();

		this.setupRelations();

		const frame: StackFrame = DebugState.getInstance().getFrameByPos(stackPos)!;
		this.frame = frame;

		for (const topStatement of this.topStatements) {
			if (topStatement instanceof Command) {
				const commandResult: RuntimeError | undefined = topStatement.execute();
				if (commandResult) return commandResult;
			} else if (topStatement instanceof Location) {
				if (topStatement instanceof ClassLocation) {
					const typeString: string = topStatement.getName();
					if (frame.typeCollection.has(typeString))
						for (const [_, variable] of frame.typeCollection.get(typeString)!) {
							const dispatchResult: RuntimeError | null | undefined = this.customizationDispatch(variable, {class: variable.type}, topStatement);
							if (dispatchResult instanceof RuntimeError) return dispatchResult;
						}
					else
						for (const methodLocation of topStatement.getMethodLocations())
							this.customizationDispatch(undefined, {}, methodLocation);
				} else
					// Should never happen since all top locations should only be class locations
					for (const [_, variable] of frame.jigsawVariables) {
						const dispatchResult: RuntimeError | null | undefined = this.customizationDispatch(variable, {class: variable.type}, topStatement);
						if (dispatchResult instanceof RuntimeError) return dispatchResult;
					}
			}
		}

		const result: {nodes: NodeInfo[], edges: EdgeInfo[]} = {nodes: [...this.shownNodes.values()], edges: [...this.shownEdges.values()]};
		this.clearGraph();
		return result;
    }

	private customizationDispatch(variable: JigsawVariable | undefined, interestNames: {class?: string, field?: string, local?: string}, location: Location): RuntimeError | null | undefined {
		switch (location.type()) {
			case LocationType.CLASS:
				if (variable === undefined) return undefined;
				if (interestNames.class !== undefined && interestNames.class !== null)
					return this.customizeLocation(variable, interestNames.class, location);
				break;
			case LocationType.FIELD:
				if (variable === undefined) return undefined;
				if (interestNames.field !== undefined && interestNames.field !== null)
					return this.customizeLocation(variable, interestNames.field, location);
				break;
			case LocationType.METHOD:
				return this.customizeMethod(location as MethodLocation);
			case LocationType.LOCAL:
				if (variable === undefined) return undefined;

				if (interestNames.local !== undefined && interestNames.local !== null)
					return this.customizeLocation(variable, interestNames.local, location);
				break;
		}
		return undefined;
	}

	private customizeMethod(mLocation: MethodLocation): RuntimeError | null | undefined {
		if (this.frame.signature.equals(mLocation.signature)) {
			this.openLocationScope();
			for (const statement of mLocation.getStatements()) {
				if (statement instanceof Command) {
					const commandResult: RuntimeError | undefined = statement.execute();
					if (commandResult) return commandResult;
				} else if (statement instanceof Location)
					for (const varKey of this.frame.getScopeTopVars()) {
						const variable: JigsawVariable = this.frame.jigsawVariables.get(varKey)!;
						const dispatchResult: RuntimeError | null | undefined = this.customizationDispatch(variable, {class: variable.type, local: variable.name}, statement);
						if (dispatchResult === null) break;
						else if (dispatchResult instanceof RuntimeError) return dispatchResult;
					}
			}
			this.closeLocationScope();

			return null;
		}
		return undefined;
	}

	private customizeLocation(variable: JigsawVariable, interestName: string, location: Location): RuntimeError | null | undefined {
		if (interestName === location.getName()) {
			this.currentLocation = location;
			this.currentVariable = variable;

			this.openLocationScope();
			for (const statement of location.getStatements()) {
				if (statement instanceof Command) {
					const commandResult: RuntimeError | undefined = statement.execute();
					if (commandResult) return commandResult;
				} else if (statement instanceof Location) {
					if (statement instanceof MethodLocation && !this.executedMethodLocations.includes(statement)) {
						const result: RuntimeError | null | undefined = this.customizeMethod(statement);
						if (result === null) break;
						else if (result instanceof RuntimeError) return result;
						this.executedMethodLocations.push(statement);
					} else
						for (const [fieldName, varsVarKey] of variable.variables) {
							const varsVarVariable: JigsawVariable = this.frame.jigsawVariables.get(varsVarKey)!;
							const dispatchResult: RuntimeError | null | undefined = this.customizationDispatch(varsVarVariable,
								{class: varsVarVariable.type, field: fieldName}, statement);
							if (dispatchResult === null) break;
							else if (dispatchResult instanceof RuntimeError) return dispatchResult;
						}
				}
			}
			this.closeLocationScope();

			return null;
		} else {
			const childrenLocations: Location[] = location.getChildrenLocations();
			this.openLocationScope();
			for (const childLocation of childrenLocations) {
				if (childLocation instanceof MethodLocation) {
					if (!this.executedMethodLocations.includes(childLocation)) {
						const result: RuntimeError | null | undefined = this.customizeMethod(childLocation);
						if (result === null) break;
						else if (result instanceof RuntimeError) return result;
						this.executedMethodLocations.push(childLocation);
					}
				}
			}
			this.closeLocationScope();
		}
		return undefined;
	}

	public getSubjectNode(subject: Subject): NodeInfo | null {
		const getResult: NodeInfo | undefined = this.allNodes.get(subject.id);
		return getResult ? getResult : null;
	}

	public getCurrentSubject(): Subject {
		return {id: this.currentVariable.id};
	}

	public getParentsOf(subject: Subject): Set<[string, string]> {
		const result: Map<string, Subject> = new Map();
		const subjectVariable: JigsawVariable | undefined = this.frame.jigsawVariables.get(subject.id);
		if (subjectVariable) return subjectVariable.parents;
		else return new Set();
    }

	public getField(fieldName: string, subject?: Subject): Subject | null {
		const variable: JigsawVariable = subject === undefined ? this.currentVariable : this.frame.jigsawVariables.get(subject.id)!;
		if (variable.variables.has(fieldName)) return {id: variable.variables.get(fieldName)!};
		return null;
	}

	public getChildrenOf(subject: Subject): Subject[] {
		const result: Subject[] = [];
		const variable: JigsawVariable = this.frame.jigsawVariables.get(subject.id)!;
		for (const [_, fieldKey] of variable.variables)
			result.push({id: fieldKey});
		return result;
	}

	public subjectValueIsNull(subject: Subject): boolean {
		const variable: JigsawVariable = this.frame.jigsawVariables.get(subject.id)!;
		return variable.value === "null";
	}

	public getLocalVariable(localVariableName: string): Subject | null {
		for (const localVarId of this.frame.getScopeTopVars()) {
			const variable: JigsawVariable = this.frame.jigsawVariables.get(localVarId)!;
			if (variable.name === localVariableName) return {id: localVarId};
		}
		return null;
	}

	public getSubjectValue(subject: Subject): {value: Object, type: ValueType | ArrayType | MapType} | null {
		const variable: JigsawVariable | undefined = this.frame.jigsawVariables.get(subject.id);
		if (variable) {
			var typeString: string = variable.type;
			if (variable.value.includes("size=") && variable.value.includes("Map")) {
				if (variable.value.includes("size=0")) return {value: new Map(), type: new MapType(undefined, undefined)};

				const mapResult: Map<Object, Object | null> = new Map();
				var keyType: ValueType | ArrayType | MapType | undefined;
				var valueType: ValueType | ArrayType | MapType | undefined;
				for (const [_, mapNodeKey] of variable.variables) {
					const mapNodeVariable: JigsawVariable | undefined = this.frame.jigsawVariables.get(mapNodeKey);
					if (mapNodeVariable === undefined) return null;

					// Key retrieval
					const nodeKey: {value: Object, type: ValueType | ArrayType | MapType} | null = this.getSubjectValue({id: mapNodeVariable.variables.get("key")!});
					if (nodeKey === null) return null;
					if (keyType === undefined
						|| keyType instanceof MapType && keyType.keyType === undefined
						|| keyType instanceof ArrayType && keyType.type === undefined && nodeKey.type instanceof ArrayType && (nodeKey.type.type !== undefined || nodeKey.type.dimension > keyType.dimension))
						keyType = nodeKey.type;

					// Key retrieval
					const nodeValue: {value: Object, type: ValueType | ArrayType | MapType} | null = this.getSubjectValue({id: mapNodeVariable.variables.get("value")!});
					if (nodeValue === null) return null;
					if (valueType === undefined
						|| valueType instanceof MapType && valueType.valueType === undefined
						|| valueType instanceof ArrayType && valueType.type === undefined && nodeValue.type instanceof ArrayType && (nodeValue.type.type !== undefined || nodeValue.type.dimension > valueType.dimension))
						valueType = nodeValue.type;

					mapResult.set(nodeKey.value, nodeValue.value);
				}

				return {value: mapResult, type: new MapType(keyType, valueType)};
			} else if (variable.value.includes("size=") && variable.value.includes("List")) {
				if (variable.value.includes("size=0")) return {value: [], type: new ArrayType(undefined, 1)};

				const arrayResult: Object[] = [];
				var innerType: ValueType | ArrayType | MapType | undefined;
				for (const [_, elementKey] of variable.variables) {
					const fieldValue: {value: Object, type: ValueType | ArrayType | MapType} | null = this.getSubjectValue({id: elementKey});
					if (fieldValue === null) return null;
					arrayResult.push(fieldValue.value);

					const fieldValueType: ValueType | ArrayType | MapType = fieldValue.type;
					if (innerType === undefined) innerType = fieldValueType;
					else if (innerType instanceof ArrayType && innerType.type === undefined) {
						const fieldValueArrayType: ArrayType = fieldValueType as ArrayType;
						if (fieldValueArrayType.type !== undefined) innerType = fieldValueArrayType;
						else if (fieldValueArrayType.dimension > innerType.dimension) innerType = fieldValueArrayType;
					}
				}

				const newDeepestType: ValueType | MapType | undefined = innerType! instanceof ArrayType ? innerType.type as (ValueType | undefined) : innerType!;
				const newDimension: number = innerType! instanceof ArrayType ? innerType.dimension + 1 : 1;
				return {value: arrayResult, type: new ArrayType(newDeepestType, newDimension)};
			} else if (typeString.endsWith("]")) {
				const arrayResult: Object[] = [];
				for (const [_, fieldKey] of variable.variables)  {
					const fieldValue: {value: Object, type: ValueType | ArrayType | MapType} | null = this.getSubjectValue({id: fieldKey});
					if (fieldValue === null) return null;
					arrayResult.push(fieldValue.value);
				}

				var deepestType: ValueType;
				var dimension: number = 0;
				var reduced: string = typeString;
				while (reduced.endsWith("]")) {
					reduced = reduced.substring(0, reduced.length - 2);
					dimension++;
				}
				switch (reduced) {
					case "boolean":
						deepestType = ValueType.BOOLEAN;
						break;
					case "int":
						deepestType = ValueType.NUM;
						break;
					case "String":
						deepestType = ValueType.STRING;
						break;
					default:
						return null;
				}

				return {value: arrayResult, type: new ArrayType(deepestType, dimension)};
			}
			if (variable.type === "boolean") return {value: variable.value === "true", type: ValueType.BOOLEAN};
			if (variable.type === "int") return {value: +variable.value, type: ValueType.NUM};
			if (variable.type === "String" || variable.type === "char")  {
				const stringValue: string = variable.value as string;
				return {value: stringValue.substring(1, stringValue.length - 1), type: ValueType.STRING};
			}
			if (variable.type === "Integer") {
				const getResult: {value: Object, type: ValueType | ArrayType} = this.getSubjectValue({id: variable.variables.get("value")!}) as {value: Object, type: ValueType | ArrayType};
				return {value: +getResult.value, type: ValueType.NUM};
			}
			return null;
		}
		return null;
	}

	public getAncestorLocationVariable(varName: string, upwardCount: number): Object | null {
		const scope: RTLocationScope = this.runtimeScopes[this.runtimeScopes.length - 1 - upwardCount];
		return scope.getVariable(varName)!.value;
	}

	public updateAncestorLocationVariable(varName: string, upwardCount: number, value: Object | null, type: ValueType | ArrayType | MapType): boolean {
		const scope: RTLocationScope = this.runtimeScopes[this.runtimeScopes.length - 1 - upwardCount];
		return scope.updateVariable(varName, type, value);
	}

	// ====================Customization Methods====================
	public showAll() {
		this.shownNodes = new Map(this.allNodes);
		this.shownEdges = new Map(this.allEdges);
		this.shownRelations = new Map(this.allRelations);
	}

	public omitAll() {
		this.shownNodes.clear();
		this.shownEdges.clear();
		this.shownRelations.clear();
	}

	public addNode(newNode: NodeInfo): boolean {
		if (this.allNodes.has(newNode.id)) return false;
		this.allNodes.set(newNode.id, newNode);
		return true;
	}

	public addNodes(newNodes: NodeInfo[]): boolean {
		var allSuccess: boolean = true;
		for (const newNode of newNodes)
			allSuccess = allSuccess && this.addNode(newNode);
		return allSuccess;
	}

	public addEdge(newEdge: EdgeInfo): boolean {
		var sourceFound: boolean = this.allNodes.get(newEdge.source) !== undefined;
		var targetFound: boolean = this.allNodes.get(newEdge.target) !== undefined;
		if (!sourceFound || !targetFound) return false;
		this.pushEdgeToAll(newEdge);
		return true;
    }

	public addEdges(newEdges: EdgeInfo[]): boolean {
		var allSuccess: boolean = true;
		for (const newEdge of newEdges)
			allSuccess = allSuccess && this.addEdge(newEdge);
		return allSuccess;
	}

	public showDispatch(object: Subject | NodeInfo | EdgeInfo | null): NodeInfo | EdgeInfo | null {
		if (object === null) return null;
		if (object.hasOwnProperty("source")) return this.showEdge(object as EdgeInfo);
		if (object.hasOwnProperty("position")) return this.showNode(object as NodeInfo);

		const subjectNode: NodeInfo | null = this.getSubjectNode(object);
		if (subjectNode === null) return null;
		return this.showNode(subjectNode);
	}

	public showNode(node: NodeInfo): NodeInfo {
		if (!this.shownNodes.has(node.id)) {
			this.shownNodes.set(node.id, node);
			const relatedEdgeIds: string[] | undefined = this.allRelations.get(node.id);
			if (relatedEdgeIds)
				for (const relatedEdgeId of relatedEdgeIds) {
					const edge: EdgeInfo | undefined = this.allEdges.get(relatedEdgeId);
					if (edge) this.showEdge(edge);
				}
		}
		return node;
	}

	public showNodes(newNodes: NodeInfo[]): NodeInfo[] {
		const result: NodeInfo[] = [];
		for (const newNode of newNodes)
			result.push(this.showNode(newNode));
		return result;
	}

	public showEdge(newEdge: EdgeInfo): EdgeInfo | null {
		var sourceFound: boolean = this.shownNodes.get(newEdge.source) !== undefined;
		var targetFound: boolean = this.shownNodes.get(newEdge.target) !== undefined;
		if (!sourceFound || !targetFound) return null;
		this.pushEdgeToShown(newEdge);
		return newEdge;
    }

	public showEdges(newEdges: EdgeInfo[]): (EdgeInfo | null)[] {
		const result: (EdgeInfo | null)[] = [];
		for (const newEdge of newEdges)
			result.push(this.showEdge(newEdge));
		return result;
	}

	public omitDispatch(object: NodeInfo | EdgeInfo | Subject | null): NodeInfo | EdgeInfo | null {
		if (object === null) return object;
		if (object.hasOwnProperty("source")) return this.omitEdge(object as EdgeInfo);
		if (object.hasOwnProperty("position")) return this.omitNode(object as NodeInfo);

		const subjectNode: NodeInfo | null = this.getSubjectNode(object);
		if (subjectNode === null) return subjectNode;
		return this.omitNode(subjectNode);
	}

	public omitNode(node: NodeInfo): NodeInfo {
		const removeResult: boolean = this.shownNodes.delete(node.id);
		if (removeResult) {
			const nodeRelations: string[] | undefined = this.shownRelations.get(node.id);

			if (nodeRelations) {
				const relatedEdgesIds: string[] = [];
				nodeRelations.forEach(val => relatedEdgesIds.push(val));
				for (const relatedEdgeId of relatedEdgesIds) {
					const edge: EdgeInfo = this.shownEdges.get(relatedEdgeId)!;
					this.removeFromShownRelations(edge);

					this.shownEdges.delete(edge.id);
				}
			}
		}
		return node;
	}

	public omitNodes(nodes: NodeInfo[]): NodeInfo[] {
		const result: NodeInfo[] = [];
		for (const node of nodes)
			result.push(this.omitNode(node));
		return result;
	}

	public omitEdge(toOmit: EdgeInfo): EdgeInfo {
		const removeResult: boolean = this.shownEdges.delete(toOmit.id);
		if (removeResult) this.removeFromShownRelations(toOmit);
		return toOmit;
	}

	public omitEdges(edges: EdgeInfo[]): EdgeInfo[] {
		const result: EdgeInfo[] = [];
		for (const edge of edges)
			result.push(this.omitEdge(edge));
		return result;
	}

	public omitNodeFromAll(node: NodeInfo): boolean {
		const removeResult: boolean = this.allNodes.delete(node.id);
		if (removeResult) {
			const nodeRelations: string[] | undefined = this.allRelations.get(node.id);

			if (nodeRelations) {
				const relatedEdgesIds: string[] = [];
				nodeRelations.forEach(val => relatedEdgesIds.push(val));
				for (const relatedEdgeId of relatedEdgesIds) {
					const edge: EdgeInfo = this.allEdges.get(relatedEdgeId)!;
					this.removeFromAllRelations(edge);

					this.allEdges.delete(edge.id);
				}
			}
		}
		return removeResult;
	}

	public getNodesOfType(typeName: string): NodeInfo[] {
		const result: NodeInfo[]= [];
		const typeVars: Map<string, JigsawVariable> | undefined = this.frame.typeCollection.get(typeName);
		if (typeVars)
			for (const [varKey, _] of typeVars) {
				const varNode: NodeInfo | undefined = this.allNodes.get(varKey);
				if (varNode) result.push(varNode);
			}
		return result;
	}

	public getSubjectsOfType(typeName: string): Subject[] {
		const result: Subject[] = [];
		if (this.frame.typeCollection.has(typeName))
			for (const varKey of this.frame.typeCollection.get(typeName)!.keys())
				result.push({id: varKey})
		return result;
	}

	public getFieldNodesOfNodes(originNodes: NodeInfo[], fieldName: string): NodeInfo[] {
		const result: NodeInfo[] = [];
		for (var originNode of originNodes) {
			const variable: JigsawVariable | undefined = this.frame.jigsawVariables.get(originNode.id);
			if (!variable) continue;
			const fieldKey: string | undefined = variable.variables.get(fieldName);
			if (fieldKey === undefined || fieldKey === null) continue;
			const correspondingNode: NodeInfo | undefined = this.allNodes.get(fieldKey);
			if (correspondingNode) result.push(correspondingNode);
		}
		return result;
	}

	public getNode(id: string): NodeInfo | undefined {
		return this.allNodes.get(id);
	}

	public getNodes(ids: string[]): (NodeInfo | null)[] {
		const result: (NodeInfo | null)[] = [];
		for (const id of ids) {
			const node: NodeInfo | undefined = this.allNodes.get(id);
			if (node) result.push(node);
			else result.push(null);
		}
		return result;
	}

	private pushEdgeToAll(newEdge: EdgeInfo) {
		if (this.allEdges.has(newEdge.id)) return false;
		this.addToAllRelations(newEdge);
		this.allEdges.set(newEdge.id, newEdge);
		return true;
	}

	private pushEdgeToShown(newEdge: EdgeInfo) {
		if (this.shownEdges.has(newEdge.id)) return;
		this.addToShownRelations(newEdge);
		this.shownEdges.set(newEdge.id, newEdge);
	}

	public getEdges(origin: NodeInfo, target: NodeInfo): EdgeInfo[] {
		const relations: string[] | undefined = this.allRelations.get(origin.id);

		const result: EdgeInfo[] = [];
		if (relations)
			for (const edgeId of relations) {
				const edge: EdgeInfo | undefined = this.allEdges.get(edgeId);
				if (edge && edge.source === origin.id && edge.target === target.id)
					result.push(edge);
			}

		return result;
	}

	public nodeIsShown(node: NodeInfo): boolean {
		return this.shownNodes.get(node.id) !== undefined;
	}

	// ====================Customization Shortcuts====================
	public inlineShownNodes(targets: (NodeInfo | null)[] | Subject[]): NodeInfo[] {
		const affectedNodes: Set<NodeInfo> = new Set();
		for (const target of targets) {
			if (target === null) continue;

			const wasSubject: boolean = !target.hasOwnProperty("position");
			const node: NodeInfo | null = wasSubject ? this.getSubjectNode(target) : target as NodeInfo;
			if (node === null) continue; // Should never happen
			if (!this.shownNodes.has(node.id)) continue; // If the node is not shown, then no shown nodes would be affected

			var rowValueString: string;
			if (wasSubject) {
				const targetVariable: JigsawVariable = this.frame.jigsawVariables.get(node.id)!;
				if (targetVariable.stringRep !== undefined) rowValueString = targetVariable.stringRep;
				else {
					const subjectValue: {value: Object, type: ValueType | ArrayType | MapType} | null = this.getSubjectValue(target as Subject);
					rowValueString = subjectValue !== null ? JSON.stringify(subjectValue.value) : "<Object has no representable string>";
				}
			} else rowValueString = node.id;

			const nodeEdgeIds: string[] | undefined = this.shownRelations.get(node.id);
			if (!nodeEdgeIds) continue;
			for (const nodeEdgeId of nodeEdgeIds) {
				const nodeEdge: EdgeInfo | undefined = this.shownEdges.get(nodeEdgeId);
				if (!nodeEdge || nodeEdge.target !== node.id) continue; // The current node should be the target

				const sourceNode: NodeInfo | undefined = this.shownNodes.get(nodeEdge.source);
				if (!sourceNode) continue;
				affectedNodes.add(sourceNode);

				sourceNode.data.rows.push(nodeEdge.label + ": " + rowValueString);
			}

			this.omitNode(node);
		}

		return Array.from(affectedNodes.values());
	}

	public mergeShownNodes(targets: (NodeInfo | null)[] | Subject[], isRefMerge: boolean): NodeInfo[] {
		const newTargetNodes: Set<NodeInfo> = new Set();
		for (const target of targets) {
			if (target === null) continue;

			const wasSubject: boolean = !target.hasOwnProperty("position");
			const node: NodeInfo | null = wasSubject ? this.getSubjectNode(target) : target as NodeInfo;
			if (node === null) continue; // Should never happen
			if (!this.shownNodes.has(node.id)) continue; // If the node is not shown, then no shown nodes would be affected

			const outgoingNodes: Map<NodeInfo, string> = new Map();
			const incomingNodes: NodeInfo[] = [];
			const nodeEdgeIds: string[] | undefined = this.shownRelations.get(node.id);
			if (!nodeEdgeIds) continue;
			for (const nodeEdgeId of nodeEdgeIds) {
				const nodeEdge: EdgeInfo | undefined = this.shownEdges.get(nodeEdgeId);
				if (!nodeEdge) continue;

				if (nodeEdge.source === node.id) { // outgoing
					const outgoingNode: NodeInfo | undefined = this.shownNodes.get(nodeEdge.target);
					if (outgoingNode) outgoingNodes.set(outgoingNode, nodeEdge.label);
				} else if (nodeEdge.target === node.id) { // incoming
					const incomingNode: NodeInfo | undefined = this.shownNodes.get(nodeEdge.source);
					if (!incomingNode) continue;
					incomingNodes.push(incomingNode);

					if (!isRefMerge)
						for (const row of node.data.rows)
							incomingNode.data.rows.push("(" + nodeEdge.label + ") " + rowToString(row));
				}
			}

			for (const incomingNode of incomingNodes)
				for (const [outgoingNode, outgoingLabel] of outgoingNodes) {
					const newEdge: EdgeInfo = {
						id: "(" + node.id + ") " + incomingNode.id + "-" + outgoingNode.id,
						source: incomingNode.id,
						target: outgoingNode.id,
						label: outgoingLabel,
						type: 'floating'
					};
					this.addEdge(newEdge);
					this.showEdge(newEdge);
				}

			this.omitNode(node);
			for (const [outgoingNode, _] of outgoingNodes)
				newTargetNodes.add(outgoingNode);
		}

		return Array.from(newTargetNodes.values());
	}

	// ====================Scope Methods====================
	public addVarible(name: string, type: ValueType | ArrayType | MapType, value: any): boolean {
		if (this.runtimeScopes.length == 0) return false;
		return this.runtimeScopes.at(-1)!.addVarible(name, type, value);
    }

    public reassignVariable(name: string, type: ValueType | ArrayType | MapType, value: any): boolean {
        if (this.runtimeScopes.length == 0) return false;
		return this.runtimeScopes.at(-1)!.updateVariable(name, type, value);
    }

    public getVariable(name: string): Variable | undefined {
		if (this.runtimeScopes.length == 0) return undefined;
		return this.runtimeScopes.at(-1)?.getVariable(name);
    }

    public containsVariable(name: string): boolean {
        return this.getVariable(name) != undefined && this.getVariable(name) != null;
    }

	public openVariableScope(): boolean {
		if (this.runtimeScopes.length == 0) return false;
		this.runtimeScopes.at(-1)!.openVariableScope();
		return true;
	}

	public closeVariableScope(): boolean {
		if (this.runtimeScopes.length == 0) return false;
		return this.runtimeScopes.at(-1)!.closeVariableScope();
	}

	public openLocationScope() {
		this.runtimeScopes.push(new RTLocationScope());
	}

	public closeLocationScope(): boolean {
        if (this.runtimeScopes.length == 0) return false;
        this.runtimeScopes.pop();
        return true;
    }
}
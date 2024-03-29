import { ArrayType } from "./expr/collection/ArrayExpr";
import { MapType } from "./expr/collection/NewMapExpr";
import { ValueType } from "./expr/ValueType";

export class TCLocationScope {
    private readonly vars: Map<String, ValueType | ArrayType | MapType>[] = [];

    constructor() {
        this.openVariableScope();
    }

    public addVariable(name: string, type: ValueType | ArrayType | MapType): boolean {
        if (this.vars.length == 0 || this.containsVariable(name)) return false;
        this.vars.at(-1)!.set(name, type);
        return true;
    }

    public getType(name: string): ValueType | ArrayType | MapType | undefined {
        for (var i = this.vars.length - 1; i >= 0; i--) {
            if (this.vars[i].has(name)) return this.vars[i].get(name);
        }
        return undefined;
    }

    public containsVariable(name: string): boolean {
        return this.getType(name) != undefined && this.getType(name) != null;
    }

    public openVariableScope() {
        this.vars.push(new Map());
    }

    public closeVariableScope(): boolean {
        if (this.vars.length == 0) return false;
        this.vars.pop();
        return true;
    }
}
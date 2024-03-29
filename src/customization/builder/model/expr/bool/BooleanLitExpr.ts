import { BooleanExpr } from "./BooleanExpr";

export class BooleanLitExpr extends BooleanExpr {
    private readonly booleanValue: boolean;

	constructor(booleanValue: boolean) {
        super();
        this.booleanValue = booleanValue;
	}

    public eval(): boolean {
        return this.booleanValue;
    }
}
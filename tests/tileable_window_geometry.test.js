const fs = require("fs");
const path = require("path");

// Mock global environment if needed (though 040_windowing.js is mostly pure functions)
global.debug = jest.fn();

// Load the files
const geometryCode = fs.readFileSync(path.join(__dirname, "..", "contents/code/038_geometry.js"), "utf8");
const windowingCode = fs.readFileSync(path.join(__dirname, "..", "contents/code/040_windowing.js"), "utf8");
eval.call(global, geometryCode);
eval.call(global, windowingCode);

describe("TileableWindowGeometry", () => {
    const rect1 = { x: 10, y: 20, width: 100, height: 200 };
    const rect2 = { x: 10, y: 20, width: 100, height: 200 };
    const rect3 = { x: 15, y: 25, width: 105, height: 205 }; // nearly equal with threshold 10
    const rect4 = { x: 50, y: 50, width: 100, height: 200 }; // not equal

    test("constructor sets properties and calculated edges", () => {
        const g = new TileableWindowGeometry(rect1);
        expect(g.x).toBe(10);
        expect(g.y).toBe(20);
        expect(g.width).toBe(100);
        expect(g.height).toBe(200);
        expect(g.left).toBe(10);
        expect(g.top).toBe(20);
        expect(g.right).toBe(110);
        expect(g.bottom).toBe(220);
    });

    test("copy() creates a new instance with same values", () => {
        const g1 = new TileableWindowGeometry(rect1);
        const g2 = g1.copy();
        expect(g2).not.toBe(g1);
        expect(g2).toBeInstanceOf(TileableWindowGeometry);
        expect(g2.x).toBe(g1.x);
        expect(g2.right).toBe(g1.right);
    });

    test("equals() performs strict equality check", () => {
        const g1 = new TileableWindowGeometry(rect1);
        expect(g1.equals(rect2)).toBe(true);
        expect(g1.equals(rect3)).toBe(false);
        expect(g1.equals(rect4)).toBe(false);
    });

    test("nearlyEquals() performs approximate equality check", () => {
        const g1 = new TileableWindowGeometry(rect1);
        expect(g1.nearlyEquals(rect2)).toBe(true);
        expect(g1.nearlyEquals(rect3)).toBe(true);
        expect(g1.nearlyEquals(rect3, 2)).toBe(false); // threshold too small
        expect(g1.nearlyEquals(rect4)).toBe(false);
    });

    test("toString() returns expected format", () => {
        const g = new TileableWindowGeometry(rect1);
        expect(g.toString()).toBe("x 10 100 110 y 20 200 220");
    });
});


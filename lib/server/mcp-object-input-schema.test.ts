import {describe,expect,it} from "vitest";
import {z} from "zod";
import {mcpObjectInputSchema} from "./mcp-object-input-schema";

describe("MCP input schema transport compatibility",()=>{
  const source=z.discriminatedUnion("kind",[
    z.object({kind:z.literal("drill"),title:z.string(),
      details:z.object({instructions:z.string()}).strict(),requestId:z.string()}).strict(),
    z.object({kind:z.literal("game"),title:z.string(),
      details:z.object({pgn:z.string()}).strict(),requestId:z.string()}).strict(),
  ]);
  it("publishes a root object with nested variant constraints",()=>{
    const published=mcpObjectInputSchema(z.toJSONSchema(source) as Record<string,unknown>);
    expect(published.type).toBe("object");
    expect(published).not.toHaveProperty("anyOf");
    expect(published).not.toHaveProperty("oneOf");
    expect(published).not.toHaveProperty("allOf");
    expect(published.required).toEqual(expect.arrayContaining(["kind","title","details","requestId"]));
    expect(published.properties).toHaveProperty("kind");
    expect(published.properties).toHaveProperty("details");
    expect((published.properties as Record<string,unknown>).details).toHaveProperty("anyOf");
    // Runtime validation retains the discriminant and rejects mismatched details.
    expect(source.safeParse({kind:"drill",title:"Forks",requestId:"test",
      details:{instructions:"Practice knight forks"}}).success).toBe(true);
    expect(source.safeParse({kind:"drill",title:"Forks",requestId:"test",
      details:{pgn:"1. e4 e5 *"}}).success).toBe(false);
  });
  it("does not alter already object-shaped schemas",()=>{
    const original=z.toJSONSchema(z.object({studentId:z.string().uuid()})) as Record<string,unknown>;
    expect(mcpObjectInputSchema(original)).toEqual(original);
  });
});

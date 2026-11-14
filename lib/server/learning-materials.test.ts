import {describe,expect,it} from "vitest";
import {structurallyValidFen,materialCatalogUpdateSchema,materialRelationSchema,materialLifecycleSchema} from "./learning-materials";

const requestId="f1f2f3f4-0000-4000-8000-000000000001";
const materialId="f1f2f3f4-0000-4000-8000-000000000002";

describe("canonical typed material correction contract",()=>{
  it("shares reviewed puzzle FEN validation, including one king each and no first-rank pawn",()=>{
    expect(structurallyValidFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")).toBe(true);
    expect(structurallyValidFen("8/8/8/8/8/8/8/8 w - - 0 1")).toBe(false);
    expect(structurallyValidFen("4k3/8/8/8/8/8/8/P3K3 w - - 0 1")).toBe(false);
    expect(structurallyValidFen("4k3/8/8/8/8/8/8/4K3 w - - -1 1")).toBe(false);
  });
  it("requires same-kind typed fields plus exact revision/confirmation/receipt",()=>{
    const pgn={kind:"game",title:"Original game",sourceUrl:null,description:"",
      details:{pgn:"1. e4 e5 *",whitePlayer:"White",blackPlayer:"Black",result:"*"},
      requestId,materialId,expectedRevision:1,confirmed:true};
    expect(materialCatalogUpdateSchema.safeParse(pgn).success).toBe(true);
    expect(materialCatalogUpdateSchema.safeParse({...pgn,expectedRevision:0}).success).toBe(false);
    expect(materialCatalogUpdateSchema.safeParse({...pgn,confirmed:false}).success).toBe(false);
    expect(materialCatalogUpdateSchema.safeParse({...pgn,kind:"puzzle"}).success).toBe(false);
    expect(materialCatalogUpdateSchema.safeParse({...pgn,unknown:"unguarded field"}).success).toBe(false);
  });
  it("guards material relation ownership inputs, self-reference and confirmation",()=>{
    const valid={fromMaterialId:materialId,toMaterialId:requestId,
      relationType:"derived_from",action:"link",
      expectedRevision:1,requestId,confirmed:true};
    expect(materialRelationSchema.safeParse(valid).success).toBe(true);
    expect(materialRelationSchema.safeParse({...valid,toMaterialId:materialId}).success).toBe(false);
    expect(materialRelationSchema.safeParse({...valid,confirmed:false}).success).toBe(false);
    expect(materialRelationSchema.safeParse({...valid,expectedRevision:0}).success).toBe(false);
    expect(materialRelationSchema.safeParse({...valid,relationType:"teaches"}).success).toBe(false);
  });
  it("guards archive/restore with revision, request receipt and approval",()=>{
    const valid={materialId,expectedRevision:2,action:"archive",requestId,confirmed:true};
    expect(materialLifecycleSchema.safeParse(valid).success).toBe(true);
    expect(materialLifecycleSchema.safeParse({...valid,action:"delete"}).success).toBe(false);
    expect(materialLifecycleSchema.safeParse({...valid,confirmed:false}).success).toBe(false);
    expect(materialLifecycleSchema.safeParse({...valid,expectedRevision:-1}).success).toBe(false);
    expect(materialLifecycleSchema.safeParse({...valid,unknown:"column"}).success).toBe(false);
  });
});

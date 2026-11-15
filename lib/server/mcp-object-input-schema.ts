/**
 * MCP tool arguments are JSON objects. Zod discriminated unions export a root
 * anyOf/oneOf schema, which Claude's deferred tool loader can silently omit.
 *
 * Publish a flat object envelope (with variant constraints nested in properties)
 * while keeping the original Zod schema as the authoritative server-side parser.
 * This is a transport adapter, not a relaxation of input validation.
 */
type JsonObject = Record<string, unknown>;
const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function mcpObjectInputSchema(schema: JsonObject): JsonObject {
  if (schema.type === "object" &&
      !("oneOf" in schema) && !("anyOf" in schema) && !("allOf" in schema))
    return schema;

  const mode = "oneOf" in schema ? "oneOf" :
    "anyOf" in schema ? "anyOf" : "allOf" in schema ? "allOf" : null;
  const alternatives = mode ? schema[mode] : null;
  if (!Array.isArray(alternatives) || alternatives.length < 2 ||
      !alternatives.every(value =>
        isObject(value) && value.type === "object" && isObject(value.properties))) {
    throw new Error("MCP tool arguments must publish a root object JSON Schema");
  }

  const branches = alternatives as Array<JsonObject>;
  const propertyMaps = branches.map(branch => branch.properties as JsonObject);
  const allKeys = [...new Set(propertyMaps.flatMap(properties => Object.keys(properties)))];
  const properties: JsonObject = {};
  for (const key of allKeys) {
    const alternativesForKey = propertyMaps.map(map => map[key])
      .filter((value): value is unknown => value !== undefined);
    const unique = [...new Map(alternativesForKey.map(value =>
      [JSON.stringify(value), value])).values()];
    if (unique.length === 1) {
      properties[key] = unique[0];
    } else if (unique.every(value => isObject(value) && typeof value.const === "string")) {
      properties[key] = {type:"string",enum:unique.map(value => (value as JsonObject).const)};
    } else {
      // Nested schema unions are supported; top-level unions are not.
      properties[key] = {anyOf:unique};
    }
  }
  const requiredSets = branches.map(branch =>
    Array.isArray(branch.required) ? branch.required as string[] : []);
  const required = mode === "allOf"
    ? [...new Set(requiredSets.flat())]
    : requiredSets[0].filter(key => requiredSets.every(keys => keys.includes(key)));
  const metadata: JsonObject = {};
  for (const [key,value] of Object.entries(schema))
    if (!["anyOf","oneOf","allOf","properties","required","type","additionalProperties"].includes(key))
      metadata[key] = value;
  return {...metadata,type:"object",properties,required,additionalProperties:false};
}

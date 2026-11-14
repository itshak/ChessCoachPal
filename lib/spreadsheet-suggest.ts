import {z} from "zod";
const header=z.string().max(200);
const row=z.record(header,z.string().max(512)).refine(
 value=>Object.keys(value).length<=150,"Limit each sample to 150 columns");
/** Local suggestions are the safe DEFAULT on both website and delegated MCP;
 * only an explicit, confirmed useAi=true may share private student samples.
 */
export const spreadsheetSuggestInputSchema=z.object({
 headers:z.array(header).min(1).max(150),
 sampleRows:z.array(row).max(8).optional(),
 useAi:z.boolean().default(false),
 confirmedExternal:z.boolean().optional(),
}).strict();
export const spreadsheetSuggestMcpSchema=spreadsheetSuggestInputSchema.refine(
 args=>!args.useAi||args.confirmedExternal===true,
 "External AI sharing requires explicit approval");

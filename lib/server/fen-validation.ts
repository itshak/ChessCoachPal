import "server-only";
import {validateFenPosition} from "@/lib/lichess-puzzles";

/** One stateless authoritative FEN review used by website and delegated MCP. */
export function teacherFenValidate(fen:string,source:"manual"|"image"="manual"){
 return validateFenPosition(fen,source);
}

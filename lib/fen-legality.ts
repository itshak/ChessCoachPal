/**
 * Conservative standard-chess FEN consistency checks. This is not a chess
 * engine: it must never certify move legality, checkmate, or mastery.
 */
export function fenStaticValidation(board:string[][],turn:string,
 castling:string,ep:string):void{
 let whitePieces=0,blackPieces=0,whitePawns=0,blackPawns=0;
 let whiteKing:[number,number]|null=null,blackKing:[number,number]|null=null;
 for(let r=0;r<8;r++)for(let c=0;c<8;c++){
  const p=board[r][c];if(!p)continue;
  if(p===p.toUpperCase())whitePieces++;else blackPieces++;
  if(p==="P")whitePawns++;if(p==="p")blackPawns++;
  if(p==="K")whiteKing=[r,c];if(p==="k")blackKing=[r,c];
 }
 if(whitePieces>16||blackPieces>16||whitePawns>8||blackPawns>8)
  throw new Error("FEN contains too many pieces or pawns for standard chess");
 if(!whiteKing||!blackKing)throw new Error("Both kings are required");
 if(Math.max(Math.abs(whiteKing[0]-blackKing[0]),
    Math.abs(whiteKing[1]-blackKing[1]))<=1)
  throw new Error("The kings cannot occupy adjacent squares");
 if(castling.includes("K")&&(board[7][4]!=="K"||board[7][7]!=="R")||
    castling.includes("Q")&&(board[7][4]!=="K"||board[7][0]!=="R")||
    castling.includes("k")&&(board[0][4]!=="k"||board[0][7]!=="r")||
    castling.includes("q")&&(board[0][4]!=="k"||board[0][0]!=="r"))
  throw new Error("Castling rights contradict king/rook home squares");
 if(ep!=="-"){
  const file=ep.charCodeAt(0)-97,rank=Number(ep[1]);
  if((turn==="w"&&rank!==6)||(turn==="b"&&rank!==3)||
    board[8-rank][file]!==""||
    board[turn==="w"?3:4][file] !== (turn==="w"?"p":"P"))
   throw new Error("En-passant target conflicts with the last pawn move");
 }
 const attacked=(square:[number,number],attacker:"w"|"b")=>{
  const [tr,tc]=square;
  const white=attacker==="w";
  const same=(piece:string)=>white?piece===piece.toUpperCase():
    piece===piece.toLowerCase();
  const pawn=white?"P":"p",knight=white?"N":"n",king=white?"K":"k";
  for(const delta of [-1,1]){
   const row=tr+(white?1:-1),col=tc+delta;
   if(row>=0&&row<8&&col>=0&&col<8&&board[row][col]===pawn)return true;
  }
  for(const [dr,dc] of [[1,2],[1,-2],[-1,2],[-1,-2],[2,1],[2,-1],[-2,1],[-2,-1]]){
   const r=tr+dr,c=tc+dc;
   if(r>=0&&r<8&&c>=0&&c<8&&board[r][c]===knight)return true;
  }
  for(const dr of [-1,0,1])for(const dc of [-1,0,1]){
   if(dr===0&&dc===0)continue;
   const r=tr+dr,c=tc+dc;
   if(r>=0&&r<8&&c>=0&&c<8&&board[r][c]===king)return true;
   for(let distance=1;distance<=7;distance++){
    const rr=tr+dr*distance,cc=tc+dc*distance;
    if(rr<0||rr>7||cc<0||cc>7)break;
    const piece=board[rr][cc];if(!piece)continue;
    if(same(piece)){
     const diagonal=dr!==0&&dc!==0;
     const type=piece.toLowerCase();
     if(type==="q"||diagonal&&type==="b"||!diagonal&&type==="r")return true;
    }
    break;
   }
  }
  return false;
 };
 // The last mover is never allowed to leave their own king in check.
 if(turn==="w"&&attacked(blackKing,"w")||
    turn==="b"&&attacked(whiteKing,"b"))
  throw new Error("The side that just moved cannot leave its king in check");
}

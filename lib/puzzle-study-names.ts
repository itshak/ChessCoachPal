export function puzzleSeriesSuffix(name:string):number|null{
 const match=/^Puzzles(?: ([2-9][0-9]*))?$/i.exec(name.trim());
 return match?match[1]?Number(match[1]):1:null;
}
export function nextPuzzleStudyName(names:string[]){
 const numbers=names.map(puzzleSeriesSuffix).filter((x):x is number=>
  x!==null&&Number.isSafeInteger(x)&&x>=1&&x<=1000000);
 const max=numbers.length?Math.max(...numbers):0;
 return {nextSuffix:max?max+1:1,nextName:max?"Puzzles "+(max+1):"Puzzles"};
}

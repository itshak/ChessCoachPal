"use client";

import {useLayoutEffect,useRef,type ReactNode} from "react";

// Presentation state only. Never store learner data or search text in browser
// storage. Bound the in-memory entries and reset them on owner changes.
let owner:string|undefined;
const positions=new Map<string,number>();

export function StudentDirectoryScroll({ownerId,scopeKey,children}:{ownerId:string;scopeKey:string;children:ReactNode}){
 const ref=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{
  if(owner!==ownerId){positions.clear();owner=ownerId;}
  const node=ref.current;
  if(!node)return;
  node.scrollTop=positions.get(scopeKey)??0;
  const hash=window.location.hash;
  if(hash.startsWith("#student-row-")){
   const target=document.getElementById(hash.slice(1));
   if(target&&node.contains(target)){
    target.scrollIntoView({block:"nearest"});
    target.focus({preventScroll:true});
   }
  }
 },[ownerId,scopeKey]);
 return <div ref={ref} className="min-w-0 max-h-[65dvh] overflow-y-auto pe-1"
  onScroll={e=>{
   if(owner!==ownerId){positions.clear();owner=ownerId;}
   positions.delete(scopeKey);
   positions.set(scopeKey,e.currentTarget.scrollTop);
   if(positions.size>12){
    const first=positions.keys().next().value;
    if(first!==undefined)positions.delete(first);
   }
  }}>{children}</div>;
}

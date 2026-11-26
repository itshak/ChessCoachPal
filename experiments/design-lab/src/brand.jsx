import original from "./logo-source.svg?raw";
import {useMemo} from "react";
// The approved contours are copied verbatim from public/icon/chesscoachpal.svg.
// Only paint values change: all experimental colors come from the selected tokens.
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
const mix=(a,b,t)=>"#"+rgb(a).map((v,i)=>Math.round(v+(rgb(b)[i]-v)*t).toString(16).padStart(2,"0")).join("");
export function logoSvg(tone,mode,variant) {
  if(variant==="original")return original;
  return original.replace(/<desc id="desc">[^<]*<\/desc>/, '<desc id="desc">Knight teacher, pupil pawn and open book in the selected workspace palette.</desc>').replace(/#[0-9a-fA-F]{6}\b/g,hex=>{
    const [r,g,b]=rgb(hex),max=Math.max(r,g,b),min=Math.min(r,g,b),l=(r*.2126+g*.7152+b*.0722)/255;
    const chromatic=max-min>35;
    if(l<.22)return tone.bg;
    if(chromatic&&((g>r*1.13&&g>b*.95)||(r>b*1.35&&g>b*1.15&&l<.82)))return variant==="flat"?tone.accent:mix(tone.border,tone.accent,Math.min(1,l+.25));
    if(r>b*1.12&&g>b*1.06&&l<.5)return tone.border;
    if(variant==="flat")return l>.56?tone.fg:tone.muted;
    return mix(tone.muted,tone.fg,Math.max(0,Math.min(1,(l-.42)/.56)));
  });
}
export function BrandMark({tone,mode,variant,size=40}) {
  const src=useMemo(()=>"data:image/svg+xml,"+encodeURIComponent(logoSvg(tone,mode,variant)),[tone,mode,variant]);
  return <img src={src} alt="" width={size} height={size}/>;
}
export function BrandStudy({tone,mode}) {
  return <div className="brand-study">{["original","palette","flat"].map(variant=><section key={variant}><h3>{variant==="original"?"Existing reference":variant==="palette"?"Palette-matched":"Simplified paint"}</h3><div className="brand-samples">{[64,32,24,16].map(size=><span key={size}><BrandMark tone={tone} mode={mode} variant={variant} size={size}/><small>{size}px</small></span>)}</div></section>)}</div>;
}

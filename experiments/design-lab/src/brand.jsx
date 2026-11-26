import original from "./logo-source.svg?raw";
import {useMemo} from "react";
// The approved contours are copied verbatim from public/icon/chesscoachpal.svg.
// Preserve the existing knight contour for every geometry study; new pawn/book geometry is deliberately simplified.
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
const mix=(a,b,t)=>"#"+rgb(a).map((v,i)=>Math.round(v+(rgb(b)[i]-v)*t).toString(16).padStart(2,"0")).join("");
export const logoOptions=[
 {id:"original",label:"Original reference",description:"Existing midnight, gold and teal logo."},
 {id:"palette",label:"Palette-matched original",description:"Preserves the original detail, shading and silhouette."},
 {id:"flat",label:"Simplified paint",description:"Original contours with flatter color treatment."},
 {id:"mentor",label:"Mentor & pupil",description:"Unframed, full-size knight and smaller pearl pawn above a champagne book."},
 {id:"seal",label:"Academy seal",description:"A circular champagne outline and compact coaching emblem."},
 {id:"book",label:"Open-book signature",description:"Iris teacher, pearl pupil, prominent open-book outline without a surrounding frame."},
 {id:"compact",label:"Compact coaching mark",description:"Simplified solid silhouettes and sturdy book spine for small icons."},
 {id:"mono",label:"Monochrome imprint",description:"Single-color compact mark for printing and constrained contexts."}
];
const horse=original.match(/<clipPath id="horseClip"><path d="([^"]+)"/)?.[1];
function geometrySvg(tone,variant){
 const ink=variant==="mono"?tone.fg:tone.accent;
 const pupil=variant==="mono"?tone.fg:tone.fg;
 const gold=variant==="mono"?tone.fg:(tone.secondary||tone.accent);
 const framed=variant==="seal";
 const compact=variant==="compact"||variant==="mono";
 const book=variant==="book";
 // Exact traced horse contour, not a generic knight substitute. Crop to its bounds.
 const scale=framed?.79:compact?.85:.94;
 const body=`<g transform="translate(${framed?124:compact?91:48} ${framed?105:compact?55:0}) scale(${scale})"><path d="${horse}" fill="${ink}" fill-rule="evenodd"/><circle cx="833" cy="598" r="${compact?76:64}" fill="${pupil}"/><path d="M783 680Q833 699 883 680L872 715Q885 750 923 780H743Q781 750 794 715Z" fill="${pupil}"/>${book?'<path d="M178 828Q432 754 624 925Q816 754 1070 828V1000Q816 926 624 1045Q432 926 178 1000Z M624 925V1045" fill="none" stroke="'+gold+'" stroke-width="32" stroke-linejoin="round"/>':'<path d="M172 824Q430 754 624 925Q818 754 1076 824L1076 928Q818 877 624 1018Q430 877 172 928Z" fill="'+gold+'"/><path d="M624 925V1018" stroke="'+tone.bg+'" stroke-width="18" stroke-linecap="round"/>'}</g>`;
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1254 1254"><title>ChessCoachPal — ${variant}</title>${framed?'<circle cx="627" cy="627" r="570" fill="'+tone.surface+'" stroke="'+gold+'" stroke-width="24"/>':compact?'<rect x="30" y="30" width="1194" height="1194" rx="210" fill="'+tone.bg+'"/>':''}${body}</svg>`;
}
export function logoSvg(tone,mode,variant) {
  if(variant==="original")return original;
  if(!["palette","flat"].includes(variant))return geometrySvg(tone,variant);
  return original.replace(/<desc id="desc">[^<]*<\/desc>/, '<desc id="desc">Knight teacher, pupil pawn and open book in the selected workspace palette.</desc>').replace(/#[0-9a-fA-F]{6}\b/g,hex=>{
    const [r,g,b]=rgb(hex),max=Math.max(r,g,b),min=Math.min(r,g,b),l=(r*.2126+g*.7152+b*.0722)/255;
    const chromatic=max-min>35;
    if(l<.22)return tone.bg;
    if(chromatic&&g>r*1.13&&g>b*.95)return variant==="flat"?tone.accent:mix(tone.border,tone.accent,Math.min(1,l+.25));
    if(chromatic&&r>b*1.35&&g>b*1.15&&l<.82){const secondary=tone.secondary||tone.accent;return variant==="flat"?secondary:mix(tone.border,secondary,Math.min(1,l+.25));}
    if(r>b*1.12&&g>b*1.06&&l<.5)return tone.border;
    if(variant==="flat")return l>.56?tone.fg:tone.muted;
    return mix(tone.muted,tone.fg,Math.max(0,Math.min(1,(l-.42)/.56)));
  });
}
export function BrandMark({tone,mode,variant,size=40}) {
  const src=useMemo(()=>"data:image/svg+xml,"+encodeURIComponent(logoSvg(tone,mode,variant)),[tone,mode,variant]);
  return <img src={src} alt="" width={size} height={size}/>;
}
export function BrandStudy({tone,mode,selected,onSelect}) {
 return <div className="brand-study">{logoOptions.map(({id,label,description})=><section key={id} data-selected={selected===id}><h3>{label}</h3><p>{description}</p><div className="brand-lockup"><BrandMark tone={tone} mode={mode} variant={id} size={112}/><strong>ChessCoach<span>Pal</span></strong></div><div className="brand-samples">{[64,32,24,16].map(size=><span key={size}><BrandMark tone={tone} mode={mode} variant={id} size={size}/><small>{size}px</small></span>)}</div><button type="button" aria-pressed={selected===id} onClick={()=>onSelect(id)}>{selected===id?"Selected":"Use "+label}</button></section>)}</div>;
}

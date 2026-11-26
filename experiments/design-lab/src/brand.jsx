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
 {id:"mentor",label:"Mentor & pupil",description:"Unframed iris knight and pearl pawn, each following the curved champagne book pages."},
 {id:"seal",label:"Academy seal",description:"A circular champagne outline and compact coaching emblem."},
 {id:"book",label:"Open-book signature",description:"Iris teacher, pearl pupil, prominent open-book outline without a surrounding frame."},
 {id:"compact",label:"Compact coaching mark",description:"Same grounded coaching composition, with the same curved pawn base and a thicker silhouette for small icons."},
 {id:"compact-large",label:"Compact — larger pieces",description:"Approved knight, curved pawn and book unchanged; tighter framing for 16–48 px."},
 {id:"compact-max",label:"Compact — maximum fill",description:"Same approved geometry with minimal safe outer margin; compare actual small sizes."},
 {id:"mono",label:"Monochrome imprint",description:"Single-color compact mark for printing and constrained contexts."}
];
const horse=original.match(/<clipPath id="horseClip"><path d="([^"]+)"/)?.[1];
function geometrySvg(tone,variant,mode,lightStyle="theme",darkTone=tone){
 const selected=["mentor","compact","compact-large","compact-max"].includes(variant);
 const black=selected&&mode==="light"&&lightStyle==="black";
 const outlined=selected&&mode==="light"&&lightStyle==="outline";
 const paint=outlined?darkTone:tone;
 const edge=outlined?` stroke="${tone.fg}" stroke-width="18" stroke-linejoin="round" paint-order="stroke fill"`:"";
 const ink=black?"#1C1D23":variant==="mono"?tone.fg:paint.accent;
 const pupil=black?"#1C1D23":paint.fg;
 const gold=variant==="mono"?tone.fg:(paint.secondary||paint.accent);
 const framed=variant==="seal";
 const compact=variant.startsWith("compact")||variant==="mono";
 const book=variant==="book";
 // Exact traced horse contour, not a generic knight substitute. Crop to its bounds.
 const scale=framed?.79:compact?.85:.94;
 // The selected pair uses the same footed pawn and page relationship. Draw the
 // book first so the bases overlap the page instead of appearing suspended above it.
 if(selected){
   // Trace the original reference's curved, asymmetric foot. Its underside is
   // exactly the reverse of the matching cubic on the book's right page.
   // No horizontal pedestal or rectangular slab; the foot follows the page.
   const foot=compact
     ?'<path data-part="pawn-foot" d="M766 747 C810 745 857 745 898 751 C922 758 931 781 935 797 C851 774 792 785 727 818 C727 783 743 762 766 747 Z" transform="translate(0 30)" fill="'+pupil+'"/>'
     :'<path data-part="pawn-foot" d="M766 755 C810 753 857 755 898 759 C922 766 931 785 935 797 C851 774 792 785 727 818 C727 787 743 769 766 755 Z" transform="translate(0 30)" fill="'+pupil+'"/>';
   const torso=compact
     ?'M799 665H867L877 701H865Q872 752 906 790H760Q794 752 801 701H789Z'
     :'M804 658H862L867 676H877V695H864Q870 744 900 786H766Q796 744 802 695H789V676H799Z';
   const groundedBook='<path data-part="book" d="M172 824Q430 754 624 925C652 891 685 869 727 848C792 815 851 804 935 827C990 811 1036 812 1076 824L1076 928Q818 877 624 1018Q430 877 172 928Z" fill="'+gold+'"/><path d="M624 925V1018" stroke="'+tone.bg+'" stroke-width="'+(compact?24:18)+'" stroke-linecap="round"/>';
   const pawn='<circle cx="833" cy="598" r="'+(compact?76:64)+'" fill="'+pupil+'"/><path d="'+torso+'" fill="'+pupil+'"/>'+foot;
   // Outline a duplicate silhouette behind the actual fills: no dark seams between pawn parts.
   const pawnOutline=outlined?'<g aria-hidden="true" stroke="'+tone.fg+'" stroke-width="18" stroke-linejoin="round">'+pawn.replace('data-part="pawn-foot"','data-outline="pawn-foot"')+'</g>':'';
   const page=groundedBook.replace('data-part="book"','data-part="book"'+edge);
   const knight='<path data-part="knight" d="'+horse+'" transform="translate(0 15)" fill="'+ink+'" fill-rule="evenodd"'+edge+'/>';
   const groundedBody='<g transform="translate('+(compact?91:48)+' '+(compact?55:0)+') scale('+scale+')">'+page+knight+pawnOutline+'<g data-part="pawn">'+pawn+'</g></g>';
   // Change the viewport only; every piece/path and its relationship is identical.
   const frame=variant==="compact-large"?[155,125,940]:variant==="compact-max"?[190,150,870]:[0,0,1254];
   const [x,y,size]=frame;
   const backdrop=compact?'<rect x="'+(x+size*.024)+'" y="'+(y+size*.024)+'" width="'+size*.952+'" height="'+size*.952+'" rx="'+size*.1675+'" fill="'+tone.bg+'"/>':'';
   return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="'+frame.join(' ')+' '+size+'"><title>ChessCoachPal — '+variant+'</title>'+backdrop+groundedBody+'</svg>';

 }
 const body=`<g transform="translate(${framed?124:compact?91:48} ${framed?105:compact?55:0}) scale(${scale})"><path d="${horse}" fill="${ink}" fill-rule="evenodd"/><circle cx="833" cy="598" r="${compact?76:64}" fill="${pupil}"/><path d="M783 680Q833 699 883 680L872 715Q885 750 923 780H743Q781 750 794 715Z" fill="${pupil}"/>${book?'<path d="M178 828Q432 754 624 925Q816 754 1070 828V1000Q816 926 624 1045Q432 926 178 1000Z M624 925V1045" fill="none" stroke="'+gold+'" stroke-width="32" stroke-linejoin="round"/>':'<path d="M172 824Q430 754 624 925Q818 754 1076 824L1076 928Q818 877 624 1018Q430 877 172 928Z" fill="'+gold+'"/><path d="M624 925V1018" stroke="'+tone.bg+'" stroke-width="18" stroke-linecap="round"/>'}</g>`;
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1254 1254"><title>ChessCoachPal — ${variant}</title>${framed?'<circle cx="627" cy="627" r="570" fill="'+tone.surface+'" stroke="'+gold+'" stroke-width="24"/>':compact?'<rect x="30" y="30" width="1194" height="1194" rx="210" fill="'+tone.bg+'"/>':''}${body}</svg>`;
}
export function logoSvg(tone,mode,variant,lightStyle="theme",darkTone=tone) {
  if(variant==="original")return original;
  if(!["palette","flat"].includes(variant))return geometrySvg(tone,variant,mode,lightStyle,darkTone);
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
export function BrandMark({tone,mode,variant,size=40,lightStyle="theme",darkTone=tone}) {
  const src=useMemo(()=>"data:image/svg+xml,"+encodeURIComponent(logoSvg(tone,mode,variant,lightStyle,darkTone)),[tone,mode,variant,lightStyle,darkTone]);
  return <img src={src} alt="" width={size} height={size}/>;
}
export function Wordmark({emphasis="iris"}){return <strong className="wordmark" dir="ltr" data-emphasis={emphasis}>ChessCoach<span>Pal</span></strong>;}
export function BrandStudy({tone,mode,selected,onSelect,lightStyle,darkTone,emphasis}) {
 return <div className="brand-study">{logoOptions.map(({id,label,description})=><section key={id} data-selected={selected===id}><h3>{label}</h3><p>{description}</p><div className="brand-lockup"><BrandMark tone={tone} mode={mode} variant={id} lightStyle={lightStyle} darkTone={darkTone} size={112}/><Wordmark emphasis={emphasis}/></div><div className="brand-samples">{[64,32,24,16].map(size=><span key={size}><BrandMark tone={tone} mode={mode} variant={id} lightStyle={lightStyle} darkTone={darkTone} size={size}/><small>{size}px</small></span>)}</div><button type="button" aria-pressed={selected===id} onClick={()=>onSelect(id)}>{selected===id?"Selected":"Use "+label}</button></section>)}</div>;
}

export function OpticalStudy({tone,mode,darkTone,lightStyle,emphasis}) {
 const variants=["compact","compact-large","compact-max"];
 return <section className="optical-study"><h3>Small-icon comparison — unchanged pieces</h3><div className="optical-scroll"><table><thead><tr><th>Version</th>{[64,48,32,24,16].map(n=><th key={n}>{n}px</th>)}</tr></thead><tbody>{variants.map(id=><tr key={id}><th scope="row">{logoOptions.find(o=>o.id===id).label}</th>{[64,48,32,24,16].map(n=><td key={n}><BrandMark tone={tone} mode={mode} variant={id} size={n} lightStyle={lightStyle} darkTone={darkTone}/></td>)}</tr>)}</tbody></table></div><h3>Light-mode treatments</h3><div className="light-studies">{[["theme","Theme-adapted"],["black","Graphite chess pieces"],["outline","Original colors + dark outline"]].map(([style,label])=><div key={style} className="light-study" style={{background:"#F4F2F9",color:"#292638"}}><strong>{label}</strong><BrandMark tone={{bg:"#F4F2F9",fg:"#292638",accent:"#58418F",secondary:"#76572E",border:"#868098"}} darkTone={{bg:"#1C1D23",fg:"#F1F2F8",accent:"#B3A9E8",secondary:"#CDB58D",border:"#686C80"}} mode="light" variant="mentor" lightStyle={style} size={112}/><div style={{display:"flex",gap:12,alignItems:"center"}}>{[32,16].map(n=><BrandMark key={n} tone={{bg:"#F4F2F9",fg:"#292638",accent:"#58418F",secondary:"#76572E"}} darkTone={{bg:"#1C1D23",fg:"#F1F2F8",accent:"#B3A9E8",secondary:"#CDB58D"}} mode="light" variant="compact-large" lightStyle={style} size={n}/>)}</div></div>)}</div></section>;
}

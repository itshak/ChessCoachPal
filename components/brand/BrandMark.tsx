import Image from "next/image";
type BrandMarkProps = {size: number; alt?: string; className?: string; variant?: "mentor" | "compact"};
export function BrandMark({size,alt="",className="",variant=size>=64?"mentor":"compact"}: BrandMarkProps) {
  const dark = variant==="compact"?"/icon/chesscoachpal.svg":"/icon/chesscoachpal-mentor-dark.svg";
  const role=alt?("img" as const):undefined;
  return <span className={`ccp-brand-mark ${className}`} style={{width:size,height:size}} role={role} aria-label={alt||undefined} aria-hidden={alt?undefined:true}>
    <Image className="ccp-brand-dark" src={dark} alt="" width={size} height={size}/>
    <Image className="ccp-brand-light" src={`/icon/chesscoachpal-${variant}-light.svg`} alt="" width={size} height={size}/>
  </span>;
}
const brandName="ChessCoach";
const brandEmphasis="Pal";
export function Wordmark({className=""}:{className?:string}) {
  return <span className={`ccp-wordmark ${className}`} dir="ltr">{brandName}<span>{brandEmphasis}</span></span>;
}

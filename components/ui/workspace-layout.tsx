"use client";
import {useId,useRef,type ReactNode} from "react";
import "./workspace-layout.css";

type MasterDetailProps={
 master:ReactNode; detail:ReactNode; masterLabel:string; detailLabel:string;
 detailOpen:boolean; onDetailOpenChange:(open:boolean)=>void;
 mobileDetail:boolean; onBack:()=>void; backLabel:string;
 showDetailLabel:string; hideDetailLabel:string;
};
/** Selection, routing and data belong to callers. On mobile callers must choose
 * an explicit detail state and restore row focus/scroll when returning. */
export function MasterDetail({master,detail,masterLabel,detailLabel,detailOpen,onDetailOpenChange,mobileDetail,onBack,backLabel,showDetailLabel,hideDetailLabel}:MasterDetailProps){
 const id=useId(),toggle=useRef<HTMLButtonElement>(null);
 return <div className="ccp-master-detail" data-open={detailOpen} data-mobile-detail={mobileDetail}>
  <section className="ccp-master" aria-label={masterLabel}>
   <div className="ccp-inspector-toggle"><button ref={toggle} type="button" className="ccp-quiet-action" aria-controls={id} aria-expanded={detailOpen} onClick={()=>onDetailOpenChange(!detailOpen)}>{detailOpen?hideDetailLabel:showDetailLabel}</button></div>
   {master}
  </section>
  <aside id={id} className="ccp-inspector" aria-label={detailLabel}>
   <button type="button" className="ccp-mobile-back ccp-quiet-action" onClick={onBack}>{backLabel}</button>
   {detail}
  </aside>
 </div>;
}
export function FocusedPage({children,className=""}:{children:ReactNode;className?:string}){
 return <div className={`ccp-focused-page ${className}`}>{children}</div>;
}
export function PageHeading({title,actions,hideTitleOnMobile=false}:{title:string;actions?:ReactNode;hideTitleOnMobile?:boolean}){
 return <header className="ccp-page-heading"><h1 className={hideTitleOnMobile?"ccp-mobile-sr-only":undefined}>{title}</h1>{actions&&<div className="ccp-context-actions">{actions}</div>}</header>;
}
export function RecordTitle({title,subtitle,actions}:{title:ReactNode;subtitle?:ReactNode;actions?:ReactNode}){
 return <header className="ccp-record-title"><div><h2>{title}</h2>{subtitle&&<div className="ccp-record-meta">{subtitle}</div>}</div>{actions&&<div className="ccp-context-actions">{actions}</div>}</header>;
}
export function RecordSection({title,children}:{title:ReactNode;children:ReactNode}){
 return <section className="ccp-record-section"><h3>{title}</h3>{children}</section>;
}
export function MetricGrid({children}:{children:ReactNode}){return <dl className="ccp-metrics">{children}</dl>;}
export function RecordMetric({label,value,context}:{label:ReactNode;value:ReactNode;context?:ReactNode}){
 return <div><dt>{label}</dt><dd>{value}</dd>{context&&<dd className="ccp-record-meta">{context}</dd>}</div>;
}
export function RecordProse({children}:{children:ReactNode}){return <div className="ccp-record-prose" data-user-content>{children}</div>;}
export function Timeline({children}:{children:ReactNode}){return <ol className="ccp-timeline">{children}</ol>;}
export function TimelineEntry({title,when,children}:{title:ReactNode;when:ReactNode;children?:ReactNode}){
 return <li><div className="ccp-timeline-heading"><strong>{title}</strong><span className="ccp-record-meta">{when}</span></div>{children&&<div className="ccp-record-prose">{children}</div>}</li>;
}
export function StatusLabel({children,tone="neutral"}:{children:ReactNode;tone?:"neutral"|"success"|"warning"|"error"|"accent"}){
 return <span className="ccp-status" data-tone={tone}>{children}</span>;
}
export function ContextActions({children}:{children:ReactNode}){return <div className="ccp-context-actions">{children}</div>;}
export function RecordRow({title,description,meta,selected,onSelect}:{title:ReactNode;description?:ReactNode;meta?:ReactNode;selected?:boolean;onSelect:()=>void}){
 return <button type="button" className="ccp-record-row" aria-pressed={selected} onClick={onSelect}><span className="ccp-row-text"><strong>{title}</strong>{description&&<span className="ccp-record-meta">{description}</span>}</span>{meta&&<span className="ccp-row-meta">{meta}</span>}</button>;
}

"use client";
import {useEffect,useRef,useState,type ReactNode} from "react";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {useLocale,useTranslations} from "next-intl";
import {Dialog} from "@ark-ui/react/dialog";
import {LocaleProvider} from "@ark-ui/react/locale";
import {Portal} from "@ark-ui/react/portal";
import {BrandMark,Wordmark} from "@/components/brand/BrandMark";
import "./workspace-shell.css";

const paths={
 home:"M3 10 12 3l9 7v11h-6v-7H9v7H3Z",
 calendar:"M3 6h18v15H3z M3 10h18 M7 3v5 M17 3v5",
 students:"M16 21v-3a5 5 0 0 0-5-5H7a5 5 0 0 0-5 5v3 M9 9a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M17 3a4 4 0 0 1 0 8 M22 21v-3a5 5 0 0 0-4-5",
 capture:"M12 5v14 M5 12h14", more:"M5 12h.01 M12 12h.01 M19 12h.01",
 lessons:"M5 3h14v18H5z M8 7h8 M8 11h8 M8 15h5",
 learning:"M3 4h7l2 2 2-2h7v15h-7l-2 2-2-2H3z M12 6v15",
 settings:"M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2",
 reports:"M4 20V4 M4 20h16 M8 16v-5 M13 16V7 M18 16v-8",
 search:"M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14 M15 15l6 6",
 close:"M6 6l12 12 M6 18 18 6", next:"M9 5l7 7-7 7",
} as const;
type IconName=keyof typeof paths;
function Icon({name}:{name:IconName}){return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name==="more"?3.7:1.8} strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]}/></svg>;}
const primary=[
 {href:"/dashboard",key:"home",icon:"home",tour:"dashboard"},
 {href:"/schedule",key:"calendar",icon:"calendar",tour:"schedule"},
 {href:"/students",key:"students",icon:"students",tour:"students"},
 {href:"/coaching",key:"lessons",icon:"lessons",tour:"coaching"},
 {href:"/learning",key:"learning",icon:"learning",tour:"learning"},
 {href:"/settings",key:"settings",icon:"settings",tour:"settings"},
] as const;
const secondary=[
 {href:"/reports",key:"reports",icon:"reports",tour:"reports"},
 {href:"/contacts",key:"contacts",icon:"students",tour:"families"},
 {href:"/events",key:"events",icon:"calendar",tour:"events"},
 {href:"/billing",key:"billing",icon:"reports",tour:"billing"},
] as const;
const mobile=[...primary.slice(0,3),{href:"/coaching",key:"capture",icon:"capture",tour:"coaching"}] as const;
const destinations=[...primary,...secondary,{href:"/account",key:"account",icon:"settings",tour:"account"},{href:"/help",key:"help",icon:"learning",tour:"help"}] as const;
type Destination=(typeof destinations)[number]|(typeof mobile)[number];
function active(path:string,href:string){return path===href||path.startsWith(href+"/");}
export function WorkspaceShell({utilities,children}:{utilities:ReactNode;children:ReactNode}){
 const t=useTranslations("nav"),locale=useLocale(),pathname=usePathname()||"";
 const [dialog,setDialog]=useState<"search"|"more"|null>(null),[query,setQuery]=useState("");
 const search=useRef<HTMLButtonElement>(null),trigger=useRef<HTMLElement|null>(null),input=useRef<HTMLInputElement>(null);
 function open(kind:"search"|"more",element:HTMLElement|null){trigger.current=element;setQuery("");setDialog(kind);}
 useEffect(()=>{function key(e:KeyboardEvent){if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="k"&&!e.repeat){e.preventDefault();trigger.current=search.current;setQuery("");setDialog("search");}}window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key);},[]);
 const isMore=secondary.some(x=>active(pathname,x.href))||primary.slice(4).some(x=>active(pathname,x.href))||active(pathname,"/account")||active(pathname,"/help");
 const navLink=(x:Destination)=> <Link key={x.href} href={x.href} data-tour={x.tour} aria-current={active(pathname,x.href)?"page":undefined} className="ccp-nav-link" onClick={()=>setDialog(null)}><Icon name={x.icon}/><span>{t(x.key)}</span></Link>;
 const more=(mobileTab=false)=><button type="button" className="ccp-nav-link" aria-haspopup="dialog" aria-expanded={dialog==="more"} aria-label={mobileTab?t("toggleNavigation"):t("moreOptions")} data-active={isMore||undefined} onClick={e=>open("more",e.currentTarget)}><Icon name="more"/><span>{t("more")}</span></button>;
 const brand=<Link className="ccp-shell-brand" href="/dashboard"><BrandMark size={36}/><Wordmark/></Link>;
 const focused=["/settings","/account","/ai-connections"].some(x=>active(pathname,x));
 const matches=destinations.filter(x=>t(x.key).toLocaleLowerCase(locale).includes(query.trim().toLocaleLowerCase(locale)));
 return <LocaleProvider locale={locale}><div className="ccp-shell">
  <a className="ccp-skip" href="#workspace-main">{t("skipToContent")}</a>
  <div className="ccp-shell-sidebar">{brand}<nav aria-label={t("navigation")}>{primary.map(navLink)}{secondary.map(navLink)}</nav></div>
  <div className="ccp-shell-topbar"><div className="ccp-top-brand">{brand}</div><div className="ccp-legacy-toolbar">{utilities}</div><button ref={search} className="ccp-search-trigger" type="button" aria-haspopup="dialog" aria-label={t("searchPages")} onClick={e=>open("search",e.currentTarget)}><Icon name="search"/><span>{t("searchPages")}</span><kbd>Ctrl K</kbd></button></div>
  <nav className="ccp-tablet-nav" aria-label={t("navigation")}>{primary.map(navLink)}{more()}</nav>
  <main id="workspace-main" className="ccp-shell-main" data-focused={focused||undefined} tabIndex={-1}>{children}</main>
  <nav className="ccp-mobile-nav" aria-label={t("mobileNavigation")}>{mobile.map(navLink)}{more(true)}</nav>
  <Dialog.Root open={dialog!==null} onOpenChange={e=>{if(!e.open)setDialog(null);}} closeOnEscape initialFocusEl={()=>dialog==="search"?input.current:null} finalFocusEl={()=>trigger.current} lazyMount unmountOnExit>
   <Portal><Dialog.Backdrop className="ccp-dialog-backdrop"/><Dialog.Positioner className="ccp-dialog-positioner"><Dialog.Content className="ccp-dialog">
    <div className="ccp-dialog-header"><Dialog.Title>{dialog==="search"?t("searchPages"):t("more")}</Dialog.Title><Dialog.CloseTrigger type="button" className="ccp-icon-button" aria-label={t("closeSearch")}><Icon name="close"/></Dialog.CloseTrigger></div>
    {dialog==="search"&&<input ref={input} aria-label={t("searchPages")} className="ccp-page-search" value={query} onChange={e=>setQuery(e.target.value)} type="search" autoComplete="off"/>}
    <div className="ccp-dialog-links">{(dialog==="search"?matches:destinations).map(navLink)}{dialog==="search"&&!matches.length&&<p role="status">{t("searchNoResults")}</p>}</div>
   </Dialog.Content></Dialog.Positioner></Portal>
  </Dialog.Root>
 </div></LocaleProvider>;
}

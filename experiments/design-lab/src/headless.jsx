import {Combobox,ComboboxInput,ComboboxButton,ComboboxOptions,ComboboxOption,Menu,MenuButton,MenuItems,MenuItem,Dialog,DialogPanel,DialogTitle,DialogBackdrop,Field,Label,Input,Checkbox,Description} from "@headlessui/react";
import {useState} from "react";
export function Provider({children}){return children;}
export function Picker({label,items,onPick}){
 const [query,setQuery]=useState("");const [value,setValue]=useState(null);
 return <Combobox value={value} by="id" onChange={item=>{setValue(item);if(item)onPick(item.id);}} onClose={()=>setQuery("")}><label>{label}<div className="combo"><ComboboxInput aria-label={label} displayValue={item=>item?.label||""} onChange={e=>setQuery(e.target.value)}/><ComboboxButton aria-label={label+" options"}>⌄</ComboboxButton></div></label><ComboboxOptions anchor="bottom start" className="popup">{items.filter(i=>i.label.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(i=><ComboboxOption key={i.id} value={i} className="option">{i.label}</ComboboxOption>)}</ComboboxOptions></Combobox>;
}
export function Actions({label,items,onPick}){return <Menu><MenuButton type="button">{label}</MenuButton><MenuItems anchor="bottom start" className="popup">{items.map(i=><MenuItem key={i.id}><button type="button" className="option" onClick={()=>onPick(i.id)}>{i.label}</button></MenuItem>)}</MenuItems></Menu>;}
export function Modal({open,onOpenChange,label,children}){return <Dialog open={open} onClose={onOpenChange} className="headless-dialog"><DialogBackdrop className="backdrop"/><DialogPanel className="modal"><DialogTitle>{label}</DialogTitle>{children}<button type="button" onClick={()=>onOpenChange(false)}>Close</button></DialogPanel></Dialog>;}
export function Objective({label,value,onChange,invalid,error}){return <Field><Label>{label}</Label><Input required value={value} invalid={invalid} aria-invalid={invalid} onChange={e=>onChange(e.target.value)}/>{invalid&&<Description role="alert">{error}</Description>}</Field>;}
export function Check({label,checked,onChange}){return <Field className="check"><Checkbox checked={checked} onChange={onChange}>{checked?"✓":""}</Checkbox><Label>{label}</Label></Field>;}

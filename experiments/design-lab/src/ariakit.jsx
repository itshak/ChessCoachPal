import * as A from "@ariakit/react";
import {useState} from "react";
export function Provider({children}) {return children;}
export function Picker({label,items,onPick}) {
  const [query,setQuery]=useState("");
  return <A.ComboboxProvider value={query} setValue={setQuery}><A.ComboboxLabel>{label}</A.ComboboxLabel><div className="combo"><A.Combobox/><A.ComboboxDisclosure aria-label={label+" options"}>⌄</A.ComboboxDisclosure></div><A.ComboboxPopover className="popup" sameWidth gutter={4}>{items.filter(i=>i.label.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(i=><A.ComboboxItem className="option" key={i.id} value={i.label} onClick={()=>onPick(i.id)}>{i.label}</A.ComboboxItem>)}</A.ComboboxPopover></A.ComboboxProvider>;
}
export function Actions({label,items,onPick}) {
  return <A.MenuProvider><A.MenuButton>{label}</A.MenuButton><A.Menu className="popup" gutter={4}>{items.map(i=><A.MenuItem className="option" key={i.id} onClick={()=>onPick(i.id)}>{i.label}</A.MenuItem>)}</A.Menu></A.MenuProvider>;
}
export function Modal({open,onOpenChange,label,children}) {
  return <A.Dialog open={open} onClose={()=>onOpenChange(false)} className="modal" backdrop={<div className="backdrop"/>}><A.DialogHeading>{label}</A.DialogHeading>{children}<A.DialogDismiss>Close</A.DialogDismiss></A.Dialog>;
}
export function Objective({label,value,onChange,invalid,error}) {
  // Ariakit field/validation adapter uses its Form components and the common
  // controlled validation rule, rather than nesting a second HTML form.
  return <label>{label}<A.Role.input required value={value} aria-invalid={invalid} aria-describedby={invalid?"objective-error":undefined} onChange={e=>onChange(e.target.value)}/>{invalid&&<span id="objective-error" role="alert">{error}</span>}</label>;
}
export function Check({label,checked,onChange}) {return <label className="check"><A.Checkbox checked={checked} onChange={e=>onChange(e.target.checked)}/>{label}</label>;}

import {Combobox,createListCollection} from "@ark-ui/react/combobox";
import {Dialog} from "@ark-ui/react/dialog";
import {Menu} from "@ark-ui/react/menu";
import {Field} from "@ark-ui/react/field";
import {Checkbox} from "@ark-ui/react/checkbox";
import {LocaleProvider} from "@ark-ui/react/locale";
import {Portal} from "@ark-ui/react/portal";
import {useMemo,useState,useRef} from "react";
export function Provider({locale,children}) {return <LocaleProvider locale={locale}>{children}</LocaleProvider>;}
export function Picker({label,items,onPick}) {
  const [query,setQuery]=useState("");
  const collection=useMemo(()=>createListCollection({items:items.filter(i=>i.label.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(i=>({label:i.label,value:i.id}))}),[items,query]);
  return <Combobox.Root collection={collection} onInputValueChange={e=>setQuery(e.inputValue)} onValueChange={e=>{if(e.value[0])onPick(e.value[0]);}}>
    <Combobox.Label>{label}</Combobox.Label><Combobox.Control className="combo"><Combobox.Input/><Combobox.Trigger aria-label={label+" options"}>⌄</Combobox.Trigger></Combobox.Control>
    <Combobox.Positioner className="positioner"><Combobox.Content className="popup">{collection.items.map(item=><Combobox.Item className="option" key={item.value} item={item}><Combobox.ItemText>{item.label}</Combobox.ItemText></Combobox.Item>)}</Combobox.Content></Combobox.Positioner>
  </Combobox.Root>;
}
export function Actions({label,items,onPick}) {
  return <Menu.Root onSelect={e=>onPick(e.value)}><Menu.Trigger type="button">{label}</Menu.Trigger><Menu.Positioner className="positioner"><Menu.Content className="popup">{items.map(i=><Menu.Item className="option" key={i.id} value={i.id}>{i.label}</Menu.Item>)}</Menu.Content></Menu.Positioner></Menu.Root>;
}
export function Modal({open,onOpenChange,label,children,returnFocus}) {
  const content=useRef(null);
  return <Dialog.Root open={open} onOpenChange={e=>onOpenChange(e.open)} closeOnEscape initialFocusEl={()=>content.current?.querySelector('[role="combobox"]')||null} finalFocusEl={()=>returnFocus?.current||null} lazyMount unmountOnExit><Portal><Dialog.Backdrop className="backdrop"/><Dialog.Positioner className="ark-dialog-positioner"><Dialog.Content ref={content} className="modal ark-dialog"><Dialog.Title>{label}</Dialog.Title>{children}<Dialog.CloseTrigger type="button">Close</Dialog.CloseTrigger></Dialog.Content></Dialog.Positioner></Portal></Dialog.Root>;
}
export function Objective({label,value,onChange,invalid,error}) {
  return <Field.Root invalid={invalid} required><Field.Label>{label}</Field.Label><Field.Input value={value} onChange={e=>onChange(e.target.value)}/><Field.ErrorText>{error}</Field.ErrorText></Field.Root>;
}
export function Check({label,checked,onChange}) {
  return <Checkbox.Root className="check" checked={checked} onCheckedChange={e=>onChange(e.checked===true)}><Checkbox.HiddenInput/><Checkbox.Control><Checkbox.Indicator>✓</Checkbox.Indicator></Checkbox.Control><Checkbox.Label>{label}</Checkbox.Label></Checkbox.Root>;
}

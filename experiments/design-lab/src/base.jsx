import {Combobox} from "@base-ui/react/combobox";
import {Dialog} from "@base-ui/react/dialog";
import {Menu} from "@base-ui/react/menu";
import {Field} from "@base-ui/react/field";
import {Checkbox} from "@base-ui/react/checkbox";
import {DirectionProvider} from "@base-ui/react/direction-provider";
export function Provider({direction,children}) {return <DirectionProvider direction={direction}>{children}</DirectionProvider>;}
export function Picker({label,items,onPick}) {
  return <Combobox.Root items={items} onValueChange={value=>{if(value)onPick(value.id);}} itemToStringLabel={item=>item.label} itemToStringValue={item=>item.id}>
    <label>{label}<Combobox.Input /></label><Combobox.Trigger aria-label={label+" options"}>⌄</Combobox.Trigger>
    <Combobox.Portal><Combobox.Positioner className="positioner" sideOffset={4}><Combobox.Popup className="popup"><Combobox.Empty>No matches</Combobox.Empty><Combobox.List>{item=><Combobox.Item className="option" key={item.id} value={item}>{item.label}</Combobox.Item>}</Combobox.List></Combobox.Popup></Combobox.Positioner></Combobox.Portal>
  </Combobox.Root>;
}
export function Actions({label,items,onPick}) {
  return <Menu.Root><Menu.Trigger>{label}</Menu.Trigger><Menu.Portal><Menu.Positioner className="positioner" sideOffset={4}><Menu.Popup className="popup">{items.map(i=><Menu.Item className="option" key={i.id} onClick={()=>onPick(i.id)}>{i.label}</Menu.Item>)}</Menu.Popup></Menu.Positioner></Menu.Portal></Menu.Root>;
}
export function Modal({open,onOpenChange,label,children}) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Backdrop className="backdrop"/><Dialog.Popup className="modal"><Dialog.Title>{label}</Dialog.Title>{children}<Dialog.Close>Close</Dialog.Close></Dialog.Popup></Dialog.Portal></Dialog.Root>;
}
export function Objective({label,value,onChange,invalid,error}) {
  return <Field.Root invalid={invalid}><Field.Label>{label}</Field.Label><Field.Control required value={value} onChange={e=>onChange(e.target.value)}/><Field.Error match={invalid}>{error}</Field.Error></Field.Root>;
}
export function Check({label,checked,onChange}) {return <label className="check"><Checkbox.Root checked={checked} onCheckedChange={onChange}><Checkbox.Indicator>✓</Checkbox.Indicator></Checkbox.Root>{label}</label>;}

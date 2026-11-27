import {Button,ComboBox,Input,Label,ListBox,ListBoxItem,Popover,MenuTrigger,Menu,MenuItem,Modal as AriaModal,ModalOverlay,Dialog,Heading,TextField,FieldError,Checkbox,I18nProvider} from "react-aria-components";
export function Provider({locale,children}) {return <I18nProvider locale={locale}>{children}</I18nProvider>;}
export function Picker({label,items,onPick}) {
  return <ComboBox defaultItems={items} onSelectionChange={id=>{if(id!==null)onPick(String(id));}}><Label>{label}</Label><div className="combo"><Input/><Button aria-label={label+" options"}>⌄</Button></div><Popover className="popup"><ListBox renderEmptyState={()=>"No matches"}>{item=><ListBoxItem className="option" id={item.id} textValue={item.label}>{item.label}</ListBoxItem>}</ListBox></Popover></ComboBox>;
}
export function Actions({label,items,onPick}) {
  return <MenuTrigger><Button>{label}</Button><Popover className="popup"><Menu items={items} onAction={id=>onPick(String(id))}>{item=><MenuItem id={item.id} className="option">{item.label}</MenuItem>}</Menu></Popover></MenuTrigger>;
}
export function Modal({open,onOpenChange,label,children}) {
  return <ModalOverlay isOpen={open} onOpenChange={onOpenChange} isDismissable className="backdrop"><AriaModal className="modal"><Dialog><Heading slot="title">{label}</Heading>{children}<Button onPress={()=>onOpenChange(false)}>Close</Button></Dialog></AriaModal></ModalOverlay>;
}
export function Objective({label,value,onChange,invalid,error}) {
  return <TextField isRequired isInvalid={invalid} value={value} onChange={onChange} validationBehavior="aria"><Label>{label}</Label><Input/><FieldError>{error}</FieldError></TextField>;
}
export function Check({label,checked,onChange}) {return <Checkbox className="check" isSelected={checked} onChange={onChange}><span className="checkmark">{checked?"✓":""}</span>{label}</Checkbox>;}

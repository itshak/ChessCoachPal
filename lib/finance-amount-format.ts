export function currencyAmount(cents:number,currency:string,locale:string){
 const amount=BigInt(cents),centsPerUnit=BigInt(100);
 const digits=new Intl.NumberFormat(locale,{minimumIntegerDigits:2,useGrouping:false});
 const money=new Intl.NumberFormat(locale,{style:"currency",currency,currencyDisplay:"code",
  minimumFractionDigits:2,maximumFractionDigits:2});
 return money.formatToParts(amount/centsPerUnit).map(part=>part.type==="fraction"?digits.format(amount%centsPerUnit):part.value).join("");
}

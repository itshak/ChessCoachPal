export const CONTACT_QUERY_MAX_LENGTH=160;

export function normalizedDisplayName(value:string){
 return value.normalize("NFKC").trim().replace(/\s+/gu," ").toLowerCase();
}

/** Only the explicitly visible display name participates; no private context. */
export function filterContactsByDisplayName<T extends {displayName:unknown}>(
 contacts:T[],query:string,
):T[]{
 const needle=normalizedDisplayName(query);
 return needle?contacts.filter(row=>typeof row.displayName==="string"&&
  normalizedDisplayName(row.displayName).includes(needle)):contacts;
}

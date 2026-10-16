/**
 * Participant-facing display normalization. Original application details remain untouched.
 * Personal names capitalize each word; trades use sentence case.
 */
function tidyPitchText(value:string){
  return value.normalize('NFC').trim().replace(/\s+/g,' ')
}
export function formatPitchName(value:string){
  return tidyPitchText(value).toLocaleLowerCase('en-NG')
    .replace(/(^|[\s\-'’])(\p{L})/gu,(_match,prefix:string,letter:string)=>prefix+letter.toLocaleUpperCase('en-NG'))
}
export function formatPitchTrade(value:string){
  return tidyPitchText(value).toLocaleLowerCase('en-NG')
    .replace(/\p{L}/u,(letter:string)=>letter.toLocaleUpperCase('en-NG'))
}
export function validPitchDetails(name:string,trade:string){
  return name.length>0&&name.length<=120&&!/[\u0000-\u001f\u007f]/.test(name)
    &&trade.length>0&&trade.length<=120&&!/[\u0000-\u001f\u007f]/.test(trade)
}

import {Spinner} from './ui';
export function BackgroundStatus({active,label='Saving changes…'}:{active:boolean;label?:string}){
 return active?<div role="status" className="flex items-center gap-2 py-1 text-xs text-gray-dark"><Spinner/><span>{label}</span></div>:null;
}

import type {Ball} from './ballInCourt';
export type MyItemKind='deals'|'orders'|'tasks'|'pricing';
export type MyItemRow={id:string;href:string;title:string;label:string;color:string;date:string|null;dateLabel:string;overdue?:boolean;ball?:Ball};

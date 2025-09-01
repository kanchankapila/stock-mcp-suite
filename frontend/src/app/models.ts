export interface Overview { symbol:string; lastClose:number; periodChangePct:number; nPrices:number; }
export interface NewsItem { id:string; date:string; title:string; summary:string; url:string; sentiment:number; }
export interface Analysis { sentiment:number; predictedClose:number; score:number; recommendation:string; }

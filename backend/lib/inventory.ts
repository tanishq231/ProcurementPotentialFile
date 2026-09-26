export function calculateInventory<T extends {stock:number|string|null;backOrder:number|string|null;amc:number|string|null}>(part:T){
  const actualStock=part.stock==null?null:Number(part.stock)-Number(part.backOrder??0);
  const amc=part.amc==null?null:Number(part.amc);
  const cov=actualStock==null||amc==null||!Number.isFinite(amc)||amc===0?null:actualStock/amc*30;
  return {...part,actualStock,cov};
}

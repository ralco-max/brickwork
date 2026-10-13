"use client";
import {useMemo} from "react";
import {Download,ArrowUpRight,ShoppingBag,PackageCheck,Info,Check,AlertTriangle} from "lucide-react";
import {Tabs,TabsList,TabsTrigger,TabsContent} from "@/components/ui/tabs";
import {COLORS,PARTS,bricklinkXML} from "@/lib/bridge";
import type {InventoryRow} from "@/lib/bridge";
import type {Quote} from "@/lib/design-project";
import {LEGO_CATALOG_INFO} from "@/lib/lego-elements";
import {prepareLegoShopping,legoUploadBatches} from "./lego-shopping-data";
import PartImage from "./part-image";
import QuoteEditor from "./quote-editor";

const pab="https://www.lego.com/en-us/pick-and-build/pick-a-brick";
const money=(value:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(value);
type Props={inventory:InventoryRow[];owned:Record<string,number>;elementIds:Record<string,string>;priceOverrides:Record<string,number>;quotes:Record<string,Quote>;filename:string;download:(text:string,name:string,type?:string)=>void;exportCSV:()=>void;onElementId:(key:string,value:string)=>void;onPrice:(key:string,value:number)=>void;onQuote:(key:string,quote:Quote)=>void};
export default function LegoShopping({inventory,owned,elementIds,priceOverrides,quotes,filename,download,exportCSV,onElementId,onPrice,onQuote}:Props){
 const shopping=useMemo(()=>prepareLegoShopping(inventory,owned,elementIds),[inventory,owned,elementIds]);
 const unit=(row:InventoryRow)=>priceOverrides[row.key]??PARTS[row.part].price;
 const subtotal=shopping.rows.reduce((sum,row)=>sum+row.needed*unit(row),0);
 const exportBrickLink=()=>download(bricklinkXML(inventory,owned),`${filename}-bricklink.xml`,"application/xml");
 const uploadBatches=legoUploadBatches(shopping.matched);
 const exportLego=(index=0)=>{const batch=uploadBatches[index];if(batch)download(batch.csv,`${filename}-pick-a-brick${uploadBatches.length>1?`-${index+1}-of-${uploadBatches.length}`:""}.csv`,"text/csv");};
 const hasAssemblies=shopping.rows.some(row=>row.catalog.status==="assembly");
 return <div className="shopping-body shopping-auto">
  <div className="shopping-summary"><span>Estimated parts subtotal<strong>{money(subtotal)}</strong></span><ShoppingBag size={30}/></div>
  <p className="shopping-note">A planning estimate for the {shopping.pieceCount} pieces you still need. Store prices, stock, shipping and tax are checked when you order.</p>
  <Tabs defaultValue="lego">
   <TabsList className="shopping-tabs"><TabsTrigger value="lego">LEGO Pick a Brick</TabsTrigger><TabsTrigger value="bricklink">BrickLink</TabsTrigger></TabsList>
   <TabsContent value="lego"><div className="shopping-how">
    <h3>Your part colors, matched automatically.</h3><p>Element IDs come from the catalog. Your owned pieces are already subtracted from the upload quantities.</p>
    <div className="lego-coverage" aria-live="polite">{shopping.matched.length||!shopping.rows.length?<Check size={18}/>:<AlertTriangle size={18}/>}<div><strong>{shopping.catalogCount} types matched automatically{shopping.manualCount>0?` · ${shopping.manualCount} saved ${shopping.manualCount===1?"override":"overrides"}`:""}</strong><span>{shopping.unmatched.length?`${shopping.unmatched.length} types need another source`:shopping.rows.length?"Every part and color has an element ID":"No pieces left to buy"}</span></div></div>
    <div className="shop-action-row">{uploadBatches.length>1?uploadBatches.map((batch,index)=><button className="button primary" key={index} onClick={()=>exportLego(index)}><Download size={16}/>File {index+1} of {uploadBatches.length} · {batch.types} types</button>):<button className="button primary" disabled={!shopping.matched.length} onClick={()=>exportLego()}><Download size={16}/>{shopping.unmatched.length?`Download ${shopping.matched.length} matched types`:"Download LEGO CSV"}</button>}<a className="button secondary" href={pab} target="_blank" rel="noreferrer">Open Pick a Brick<ArrowUpRight size={15}/></a></div>
    <p className="shopping-note">{uploadBatches.length>1?"LEGO accepts 400 different elements per upload. Download and upload each file separately. ":""}Upload {uploadBatches.length>1?"these CSVs":"this CSV"} on LEGO to check current availability and prices, then add available pieces to your bag.{shopping.manualCount>0?" Your saved ID overrides are included and have not been catalog-verified.":""}</p>
    {shopping.unmatched.length>0&&<div className="lego-unmatched"><div><AlertTriangle size={18}/><strong>{shopping.unmatched.length} {shopping.unmatched.length===1?"type is":"types are"} excluded from the LEGO CSV</strong></div><p>{shopping.unmatched.reduce((sum,row)=>sum+row.needed,0)} pieces still need sourcing. Export all modeled part rows to BrickLink, or add an optional element-ID override below.</p><details><summary>See unmatched parts</summary><ul>{shopping.unmatched.map(row=><li key={row.key}><span>{PARTS[row.part].name} · {COLORS[row.color].name}<small>{row.match==="assembly"?"Rim and tire need separate elements":row.catalog.pending?"No exact LEGO element yet — verify on BrickLink":"No exact part/color match in the catalog"}</small></span><strong>× {row.needed}</strong></li>)}</ul></details><button className="button secondary" onClick={exportBrickLink}><Download size={15}/>Download all rows for BrickLink</button></div>}
   </div></TabsContent>
   <TabsContent value="bricklink"><div className="shopping-how"><h3>Take your list to BrickLink</h3><p>The wanted list includes every modeled part and color you still need, including rows without a LEGO element match. Compare seller prices and stock after uploading.</p><div className="shop-action-row"><button className="button primary" disabled={!shopping.rows.length} onClick={exportBrickLink}><Download size={16}/>Wanted list XML</button><a className="button secondary" href="https://www.bricklink.com/v2/wanted/upload.page" target="_blank" rel="noreferrer">Open BrickLink upload<ArrowUpRight size={15}/></a></div>{hasAssemblies&&<p className="shopping-note">Wheel rows use the rim’s part number. Tires must be sourced separately; a wheel row alone does not include its tire.</p>}</div></TabsContent>
  </Tabs>
  {hasAssemblies&&<p className="shopping-note">Wheel assemblies need both a rim and a tire. A saved element-ID override supplies only that element; check that you also source the matching tire.</p>}
  <div className="shopping-list-title"><h3>Your shopping list</h3><button onClick={exportCSV}><Download size={14}/>Parts list (.csv)</button></div>
  {!shopping.rows.length?<div className="all-owned"><PackageCheck/><h3>You have every piece.</h3><p>Change your owned quantities in the parts list to create a shopping list.</p></div>:shopping.rows.map(row=><div className="shopping-row" key={row.key}>
   <PartImage row={row}/><div className="shopping-part"><strong>{PARTS[row.part].name}</strong><span>{COLORS[row.color].name} · #{row.part}</span><span className={`lego-match ${row.elementId?"matched":"missing"}`}>{row.elementId?`Element ${row.elementId} · ${row.match==="manual"?"Your override":"Auto matched"}`:row.match==="assembly"?"Rim + tire: separate elements needed":row.catalog.pending?"No exact LEGO element yet — verify on BrickLink":"No exact LEGO match"}</span><a href={`${pab}?query=${row.elementId||row.part.replace(/b$/,"")}`} target="_blank" rel="noreferrer">Check on LEGO<ArrowUpRight size={12}/></a></div>
   <div className="shopping-row-price"><strong>× {row.needed}</strong><span>{money(row.needed*unit(row))}</span><small>Est. {money(unit(row))} each</small></div>
   <details className="shopping-adjustments"><summary>Adjust this item <span>(optional)</span></summary><div className="shopping-override-fields"><label>LEGO element-ID override<input aria-label={`${COLORS[row.color].name} ${PARTS[row.part].name} optional LEGO element ID`} placeholder={row.catalog.elementId||"Optional element ID"} inputMode="numeric" value={elementIds[row.key]||""} maxLength={8} onChange={e=>onElementId(row.key,e.target.value.replace(/\D/g,""))}/><small>Leave blank to use the automatic match. Overrides are not verified.</small></label><label>Estimated USD per piece<input type="number" aria-label={`${COLORS[row.color].name} ${PARTS[row.part].name} estimated unit price`} min="0" max="10000" step="0.01" value={unit(row)} onChange={e=>onPrice(row.key,Math.min(10000,Math.max(0,Number(e.target.value)||0)))}/></label></div><QuoteEditor row={row} quote={quotes[row.key]} unitPrice={unit(row)} onSave={quote=>onQuote(row.key,quote)}/></details>
  </div>)}
  <div className="shopping-source"><Info size={16}/><p>Element IDs: <a href={LEGO_CATALOG_INFO.sourceUrl} target="_blank" rel="noreferrer">{LEGO_CATALOG_INFO.attribution}</a> · snapshot {LEGO_CATALOG_INFO.updatedAt.slice(0,10)}. An exact catalog match does not guarantee current Pick a Brick stock.</p></div>
 </div>;
}

import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';

export function budgetDb(path=':memory:',initialize=true){
 const sqlite=new DatabaseSync(path);
 if(initialize)for(const file of readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort())sqlite.exec(readFileSync('drizzle/'+file,'utf8'));
 const db={prepare(sql){let values=[];return {
  bind(...next){values=next;return this;},
  async run(){return {meta:{changes:Number(sqlite.prepare(sql).run(...values).changes)}};},
  async first(){return sqlite.prepare(sql).get(...values)??null;}
 };}};
 return {db,sqlite};
}

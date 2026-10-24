/* manual-kit search (generated) */
(function () {
const tokenize = function lH(e){let t=e.normalize("NFC").toLowerCase(),n=[];if(typeof Intl<"u"&&typeof Intl.Segmenter=="function")for(let i of new Intl.Segmenter("th",{granularity:"word"}).segment(t))i.isWordLike&&n.push(i.segment);else for(let i of t.split(/[^\p{L}\p{N}\p{M}]+/u))i&&n.push(i);return n};
const search = function awe(e,t,n){let i=n(t);if(!i.length)return[];let r=t.normalize("NFC").toLowerCase().trim(),s=Object.keys(e.terms),o=null;for(let l of i){let c=new Map;for(let u of e.terms[l]??[])c.set(u,3);for(let u of s)if(u!==l&&u.startsWith(l))for(let f of e.terms[u]??[])c.set(f,Math.max(c.get(f)??0,2));if(e.docs.forEach((u,f)=>{!c.has(f)&&`${u.t} ${u.x}`.toLowerCase().includes(l)&&c.set(f,1)}),o===null)o=c;else{let u=new Map;for(let[f,p]of o)c.has(f)&&u.set(f,p+(c.get(f)??0));o=u}}let a=[];for(let[l,c]of o??new Map){let u=e.docs[l];if(!u)continue;let f=c;u.t.toLowerCase().includes(r)?f+=5:u.x.toLowerCase().includes(r)&&(f+=2),a.push({doc:l,score:f})}return a.sort((l,c)=>c.score-l.score||l.doc-c.doc)};
window.ManualKitSearch = { tokenize, search: (index, q) => search(index, q, tokenize) };
})();

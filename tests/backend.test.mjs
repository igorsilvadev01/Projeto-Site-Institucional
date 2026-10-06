import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { DatabaseSync } from "node:sqlite";
import { assessmentQuestions, calculateAssessment } from "../lib/assessment.js";

// Nunca envia SMTP ou usa dados do site: banco e caixa de e-mails isolados.
for (const key of ["SMTP_HOST","SMTP_USER","SMTP_PASS","SMTP_PORT","SMTP_SECURE","MAIL_FROM","CONTACT_EMAIL","PORTFOLIO_TRUST_PROXY"]) delete process.env[key];
process.env.NODE_ENV = "development";
process.env.SITE_URL = "http://localhost";
const directory = mkdtempSync(path.join(os.tmpdir(), "portfolio-test-"));
process.env.PORTFOLIO_DATA_DIR = directory;
const api = await import("../lib/server/core.js");
const answers = value => Object.fromEntries(assessmentQuestions.map(item => [item.id, value]));
const request = (pathname, payload, headers = {}) => new Request(`http://localhost${pathname}`, {method:"POST",headers:{"Content-Type":"application/json",Origin:"http://localhost",...headers},body:JSON.stringify(payload)});
const invoke = (name, req, params = {}) => api.handled(api[name])(req, {params:Promise.resolve(params)});
const openDatabase = () => new DatabaseSync(path.join(directory, "portfolio.sqlite"));
const contactInput = {name:"Pessoa de teste",email:"teste@example.invalid",company:"Empresa fictícia",phone:"",interest:"privacidade",message:"Solicitação automática para testar o formulário.",consent:true,website:""};

after(() => {
  const key = Symbol.for("privacy-platform.sqlite");
  globalThis[key]?.close(); delete globalThis[key];
  const resolved = path.resolve(directory), parent = path.resolve(os.tmpdir());
  if (path.dirname(resolved) === parent && path.basename(resolved).startsWith("portfolio-test-")) rmSync(resolved, {recursive:true,force:true});
});

test("scores usam os controles aplicáveis e pesos iguais entre domínios", () => {
  assert.deepEqual(calculateAssessment(answers("yes")).scores,{security:100,privacy:100,overall:100});
  assert.equal(calculateAssessment(answers("yes")).actions.length,0);
  assert.equal(calculateAssessment(answers("partial")).scores.overall,50);
  assert.equal(calculateAssessment(answers("no")).actions.length,12);
  const mixed = {...answers("yes"),...Object.fromEntries(assessmentQuestions.filter(q=>q.domain==="privacy").map(q=>[q.id,"no"]))};
  assert.deepEqual(calculateAssessment(mixed).scores,{security:100,privacy:0,overall:50});
  mixed["security-1"]="na";mixed["security-2"]="partial";
  assert.deepEqual(calculateAssessment(mixed).scores,{security:90,privacy:0,overall:45});
  assert.throws(()=>calculateAssessment(answers("na")),/aplicável/);
  assert.throws(()=>calculateAssessment({}),/todas/);
  assert.throws(()=>calculateAssessment({...answers("yes"),"privacy-1":"invalid"}),/todas/);
});

test("contato rejeita entrada inválida e preserva solicitação com protocolo", async () => {
  for (const changed of [{consent:false},{email:"inválido"},{name:"x"},{message:"curta"},{interest:"inexistente"},{phone:"not-a-phone"},{website:"bot.example"}]) {
    const response = await invoke("contact",request("/api/contato",{...contactInput,...changed}));
    assert.equal(response.status,400);
  }
  assert.equal((await invoke("contact",request("/api/contato",contactInput,{Origin:"https://outra-origem.invalid"}))).status,403);
  assert.equal((await invoke("contact",request("/api/contato",{...contactInput,message:"x".repeat(40000)}))).status,413);
  const response = await invoke("contact",request("/api/contato",{...contactInput,company:""}));
  assert.equal(response.status,201);assert.equal(response.headers.get("Cache-Control"),"no-store");
  const result = await response.json();
  assert.match(result.reference,/^PORTFOLIO-/);assert.equal(result.emailDelivered,false);
  const database = openDatabase();
  try {const stored = database.prepare("SELECT * FROM contact_requests WHERE reference=?").get(result.reference);assert.equal(stored.email,contactInput.email);assert.equal(JSON.parse(stored.payload).consent,true);} finally {database.close();}
});

test("newsletter exige confirmação explícita, expiração, uso único e cancelamento", async () => {
  assert.equal((await invoke("subscribe",request("/api/newsletter",{email:"assinatura@example.invalid",consent:false}))).status,400);
  const response = await invoke("subscribe",request("/api/newsletter",{name:"Teste",email:"assinatura@example.invalid",consent:true,website:""}));
  assert.equal(response.status,202);
  const result = await response.json();assert.equal(Object.hasOwn(result,"token"),false);
  const outbox = path.join(directory,"outbox");
  const mails = readdirSync(outbox).map(file=>readFileSync(path.join(outbox,file),"utf8").replace(/=\r?\n/g,"").replace(/=([0-9A-F]{2})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16))));
  const mail = mails.find(text=>text.includes("/newsletter/confirmar?token="));
  assert.ok(mail);
  const confirmation = mail.match(/\/newsletter\/confirmar\?token=([\w-]{43})/)[1];
  const cancellation = mail.match(/\/newsletter\/cancelar\?token=([\w-]{43})/)[1];
  const database = openDatabase();
  try {
    const pending = database.prepare("SELECT * FROM subscribers WHERE email=?").get("assinatura@example.invalid");
    assert.equal(pending.status,"pending");assert.notEqual(pending.confirm_hash,confirmation);
    database.prepare("UPDATE subscribers SET confirm_expires_at=? WHERE email=?").run(Date.now()-1,pending.email);
    assert.equal((await invoke("confirmSubscription",request("/api/newsletter/confirmar",{token:confirmation}))).status,410);
    database.prepare("UPDATE subscribers SET confirm_expires_at=? WHERE email=?").run(Date.now()+86400000,pending.email);
    assert.equal((await invoke("confirmSubscription",request("/api/newsletter/confirmar",{token:confirmation}))).status,200);
    assert.equal(database.prepare("SELECT status FROM subscribers WHERE email=?").get(pending.email).status,"subscribed");
    assert.equal((await invoke("confirmSubscription",request("/api/newsletter/confirmar",{token:confirmation}))).status,410);
    const resubscribe = await invoke("subscribe",request("/api/newsletter",{name:"Teste",email:pending.email,consent:true,website:""}));
    assert.equal(resubscribe.status,202);
    assert.equal(database.prepare("SELECT status FROM subscribers WHERE email=?").get(pending.email).status,"subscribed");
    assert.equal((await invoke("cancelSubscription",request("/api/newsletter/cancelar",{token:cancellation}))).status,200);
    assert.equal(database.prepare("SELECT status FROM subscribers WHERE email=?").get(pending.email).status,"unsubscribed");
    assert.equal((await invoke("cancelSubscription",request("/api/newsletter/cancelar",{token:cancellation}))).status,200);
    assert.equal((await invoke("confirmSubscription",request("/api/newsletter/confirmar",{token:confirmation}))).status,410);
    assert.equal((await invoke("subscribe",request("/api/newsletter",{name:"Teste",email:pending.email,consent:true,website:""}))).status,202);
    assert.equal(database.prepare("SELECT status FROM subscribers WHERE email=?").get(pending.email).status,"pending");
    assert.equal((await invoke("cancelSubscription",request("/api/newsletter/cancelar",{token:cancellation}))).status,410);
    assert.equal(database.prepare("SELECT status FROM subscribers WHERE email=?").get(pending.email).status,"pending");
  } finally {database.close();}
});

test("relatório privado e ciclo de evidências com validação e limites", async () => {
  const input = {company:"Empresa fictícia",name:"Teste",email:"avaliacao@example.invalid",sector:"Tecnologia",answers:answers("partial"),consent:true,website:""};
  assert.equal((await invoke("createAssessment",request("/api/avaliacoes",{...input,answers:answers("na")}))).status,400);
  assert.equal((await invoke("createAssessment",request("/api/avaliacoes",{...input,answers:{...input.answers,extra:"yes"}}))).status,400);
  assert.equal((await invoke("createAssessment",request("/api/avaliacoes",{...input,consent:false}))).status,400);
  const created = await invoke("createAssessment",request("/api/avaliacoes",input));assert.equal(created.status,201);
  const {id,token} = await created.json();const base=`http://localhost/api/avaliacoes/${id}`, headers={Authorization:`Bearer ${token}`};
  assert.equal((await invoke("getAssessment",new Request(base),{id})).status,404);
  assert.equal((await invoke("getAssessment",new Request(base,{headers:{Authorization:"Bearer invalid"}}),{id})).status,404);
  const read = await invoke("getAssessment",new Request(base,{headers}),{id});assert.equal(read.status,200);
  const report=await read.json();assert.equal(report.scores.overall,50);assert.equal(report.actions.length,12);assert.equal(Object.hasOwn(report,"email"),false);assert.equal(Object.hasOwn(report,"token_hash"),false);
  async function upload(content,filename,type="application/pdf") {const data=new FormData();data.set("file",new File([content],filename,{type}));data.set("category","security");return invoke("uploadEvidence",new Request(`${base}/evidencias`,{method:"POST",headers,body:data}),{id});}
  assert.equal((await upload("texto inválido","falso.pdf")).status,400);
  assert.equal((await upload(new Uint8Array([0xA5,0xD0,0xC4,0xC6,0xAD]),"alto-bit.pdf")).status,400);
  const pdf="%PDF-1.4\nDocumento de teste\n%%EOF";
  assert.equal((await upload(pdf,"arquivo.html")).status,400);
  assert.equal((await upload(pdf,"arquivo.png","image/png")).status,400);
  assert.equal((await upload(new Uint8Array(5*1024*1024+1),"grande.pdf")).status,413);
  const first=await upload(pdf,"evidencia.pdf");assert.equal(first.status,201);const evidence=await first.json();
  for (let index=0;index<4;index++)assert.equal((await upload(pdf,`evidencia-${index}.pdf`)).status,201);
  assert.equal((await upload(pdf,"excedente.pdf")).status,409);
  const evidenceUrl=`${base}/evidencias/${evidence.id}`,params={id,evidenceId:evidence.id};
  assert.equal((await invoke("downloadEvidence",new Request(evidenceUrl),params)).status,404);
  const downloaded=await invoke("downloadEvidence",new Request(evidenceUrl,{headers}),params);assert.equal(downloaded.status,200);assert.match(downloaded.headers.get("Content-Disposition"),/^attachment/);assert.equal(await downloaded.text(),pdf);
  assert.equal((await invoke("deleteEvidence",new Request(evidenceUrl,{method:"DELETE",headers}),params)).status,200);
  assert.equal((await invoke("downloadEvidence",new Request(evidenceUrl,{headers}),params)).status,404);
  assert.equal((await upload(pdf,"substituta.pdf")).status,201);
});

test("produção não finge confirmar newsletter sem SMTP",async()=>{
  process.env.NODE_ENV="production";
  try {const response=await invoke("subscribe",request("/api/newsletter",{email:"producao@example.invalid",name:"Teste",consent:true,website:""}));assert.equal(response.status,503);} finally {process.env.NODE_ENV="development";}
});

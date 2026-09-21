import { pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
const phoneDigits=(process.env.ADMIN_PHONE||"").replace(/\D/g,""), phone=phoneDigits.length===11?`+55${phoneDigits}`:phoneDigits.startsWith("55")?`+${phoneDigits}`:"", email=process.env.ADMIN_EMAIL?.trim().toLowerCase()||`admin-${phoneDigits}@local.invalid`, password=process.env.ADMIN_PASSWORD, name=process.env.ADMIN_NAME||"Administrador", pepper=process.env.PASSWORD_PEPPER, database=process.env.ADMIN_DATABASE||"membros-local", remote=process.env.ADMIN_REMOTE==="true";
if(!phone||!password||password.length<12||!pepper) throw new Error("Defina ADMIN_PHONE, ADMIN_PASSWORD (12+ caracteres) e PASSWORD_PEPPER.");
if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("DEV_ADMIN_EMAIL inválido.");
const salt=randomBytes(16),iterations=210000,hash=pbkdf2Sync(password+pepper,salt,iterations,32,"sha256").toString("base64"),parameters=JSON.stringify({iterations,salt:salt.toString("base64")}),now=new Date().toISOString(),quote=value=>`'${String(value).replaceAll("'","''")}'`;
const sql=`INSERT INTO users(id,email,phone,password_hash,password_algorithm,password_parameters,role,status,must_change_password,display_name,email_verified_at,created_at,updated_at) VALUES(${[randomUUID(),email,phone,hash,"pbkdf2-sha256",parameters,"admin","active",1,name,now,now,now].map(quote).join(",")});`;
const file=".seed-admin.sql";writeFileSync(file,sql,{mode:0o600});try{execFileSync("npx",["wrangler","d1","execute",database,remote?"--remote":"--local","--file",file],{stdio:"inherit"})}finally{rmSync(file,{force:true})}

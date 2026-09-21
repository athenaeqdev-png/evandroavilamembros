import { pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
const email=process.env.DEV_ADMIN_EMAIL?.trim().toLowerCase(), password=process.env.DEV_ADMIN_PASSWORD, name=process.env.DEV_ADMIN_NAME||"Administrador local", pepper=process.env.PASSWORD_PEPPER;
if(!email||!password||password.length<12||!pepper) throw new Error("Defina DEV_ADMIN_EMAIL, DEV_ADMIN_PASSWORD (12+ caracteres) e PASSWORD_PEPPER.");
if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("DEV_ADMIN_EMAIL inválido.");
const salt=randomBytes(16),iterations=210000,hash=pbkdf2Sync(password+pepper,salt,iterations,32,"sha256").toString("base64"),parameters=JSON.stringify({iterations,salt:salt.toString("base64")}),now=new Date().toISOString(),quote=value=>`'${String(value).replaceAll("'","''")}'`;
const sql=`INSERT INTO users(id,email,password_hash,password_algorithm,password_parameters,role,status,display_name,email_verified_at,created_at,updated_at) VALUES(${[randomUUID(),email,hash,"pbkdf2-sha256",parameters,"admin","active",name,now,now,now].map(quote).join(",")});`;
const file=".seed-admin.sql";writeFileSync(file,sql,{mode:0o600});try{execFileSync("npx",["wrangler","d1","execute","membros-local","--local","--file",file],{stdio:"inherit"})}finally{rmSync(file,{force:true})}

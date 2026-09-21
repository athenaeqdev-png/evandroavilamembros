const name=document.querySelector("#member-name");
fetch("/api/v1/auth/session").then(async response=>{if(!response.ok){location.replace("/login");return}const data=await response.json();name.textContent=data.user.displayName.split(" ")[0]}).catch(()=>location.replace("/login"));
const csrf=()=>document.cookie.split(";").map(value=>value.trim()).find(value=>value.startsWith("csrf="))?.slice(5)||"";
document.querySelector("#logout").addEventListener("click",async()=>{await fetch("/api/v1/auth/logout",{method:"POST",headers:{"x-csrf-token":csrf()}});location.replace("/login")});

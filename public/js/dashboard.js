const name=document.querySelector("#member-name");
fetch("/api/v1/auth/session").then(async response=>{if(!response.ok){location.replace("/login");return}const data=await response.json();name.textContent=data.user.displayName.split(" ")[0]}).catch(()=>location.replace("/login"));
document.querySelector("#logout").addEventListener("click",async()=>{await fetch("/api/v1/auth/logout",{method:"POST"});location.replace("/login")});

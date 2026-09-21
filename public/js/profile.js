const csrf=()=>document.cookie.split(";").map(value=>value.trim()).find(value=>value.startsWith("csrf="))?.slice(5)||"";
let mandatoryChange=false;
fetch("/api/v1/auth/session",{cache:"no-store"}).then(async response=>{if(!response.ok){location.replace("/login");return}const data=await response.json();mandatoryChange=data.user.mustChangePassword}).catch(()=>location.replace("/login"));

document.querySelectorAll(".password-toggle").forEach(toggle=>{
  toggle.addEventListener("click",()=>{
    const input=document.querySelector(`#${toggle.getAttribute("aria-controls")}`);
    const isVisible=input.type==="text";
    input.type=isVisible?"password":"text";
    toggle.textContent=isVisible?"Exibir":"Ocultar";
    toggle.setAttribute("aria-label",`${isVisible?"Exibir":"Ocultar"} ${input.id==="current-password"?"senha atual":"nova senha"}`);
  });
});

document.querySelector("#password-form").addEventListener("submit",async event=>{event.preventDefault();const status=document.querySelector("#status"),button=event.currentTarget.querySelector(".submit-button"),data=Object.fromEntries(new FormData(event.currentTarget));button.disabled=true;status.classList.remove("success");status.textContent="";try{const response=await fetch("/api/v1/auth/change-password",{method:"POST",headers:{"content-type":"application/json","x-csrf-token":csrf()},body:JSON.stringify(data)}),result=await response.json();if(!response.ok)throw new Error(result.error);event.currentTarget.reset();status.classList.add("success");status.textContent="Senha alterada com sucesso.";if(mandatoryChange)location.replace("/inicio")}catch(error){status.textContent=error.message||"Não foi possível alterar a senha."}finally{button.disabled=false}});

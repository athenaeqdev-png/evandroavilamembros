const loginForm = document.querySelector("#login-form");
const emailInput = document.querySelector("#email");
const passwordInput = document.querySelector("#password");
const passwordToggle = document.querySelector("#password-toggle");
const forgotPasswordButton = document.querySelector("#forgot-password");
const recoveryModal = document.querySelector("#recovery-modal");
const recoveryForm = document.querySelector("#recovery-form");
const recoveryEmailInput = document.querySelector("#recovery-email");
const recoveryStatus = document.querySelector("#recovery-status");

let previouslyFocusedElement = null;

function setFieldError(input, message) {
  const error = document.querySelector(`#${input.getAttribute("aria-describedby")}`);
  input.setAttribute("aria-invalid", String(Boolean(message)));
  error.textContent = message;
}

function validateRequired(input, message) {
  const isEmpty = !input.value.trim();
  setFieldError(input, isEmpty ? message : "");
  return !isEmpty;
}

function validateEmail(input) {
  if (!validateRequired(input, "Informe seu e-mail.")) return false;

  const isValid = input.validity.valid;
  setFieldError(input, isValid ? "" : "Informe um e-mail válido.");
  return isValid;
}

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const emailIsValid = validateEmail(emailInput);
  const passwordIsValid = validateRequired(passwordInput, "Informe sua senha.");

  if (!emailIsValid) emailInput.focus();
  else if (!passwordIsValid) passwordInput.focus();
});

[emailInput, passwordInput].forEach((input) => {
  input.addEventListener("input", () => {
    if (input.getAttribute("aria-invalid") === "true") {
      if (input === emailInput) validateEmail(input);
      else validateRequired(input, "Informe sua senha.");
    }
  });
});

passwordToggle.addEventListener("click", () => {
  const showPassword = passwordInput.type === "password";
  passwordInput.type = showPassword ? "text" : "password";
  passwordToggle.setAttribute("aria-pressed", String(showPassword));
  passwordToggle.setAttribute("aria-label", showPassword ? "Ocultar senha" : "Mostrar senha");
  passwordInput.focus();
});

function openModal() {
  previouslyFocusedElement = document.activeElement;
  recoveryModal.hidden = false;
  document.body.classList.add("modal-open");
  recoveryEmailInput.focus();
}

function closeModal() {
  recoveryModal.hidden = true;
  document.body.classList.remove("modal-open");
  recoveryForm.reset();
  setFieldError(recoveryEmailInput, "");
  recoveryStatus.textContent = "";
  previouslyFocusedElement?.focus();
}

forgotPasswordButton.addEventListener("click", openModal);
recoveryModal.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", closeModal));

recoveryForm.addEventListener("submit", (event) => {
  event.preventDefault();
  recoveryStatus.textContent = "";

  if (!validateEmail(recoveryEmailInput)) {
    recoveryEmailInput.focus();
    return;
  }

  recoveryStatus.textContent = "Funcionalidade de recuperação será ativada em breve.";
});

recoveryEmailInput.addEventListener("input", () => {
  recoveryStatus.textContent = "";
  if (recoveryEmailInput.getAttribute("aria-invalid") === "true") validateEmail(recoveryEmailInput);
});

document.addEventListener("keydown", (event) => {
  if (recoveryModal.hidden) return;

  if (event.key === "Escape") {
    closeModal();
    return;
  }

  if (event.key === "Tab") {
    const focusableElements = [...recoveryModal.querySelectorAll("button, input")];
    const firstElement = focusableElements[0];
    const lastElement = focusableElements.at(-1);

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }
});

const dialog = document.querySelector("dialog");
document.querySelector("#explore").addEventListener("click", () => {
  document.querySelector("#projects").scrollIntoView();
});
document.querySelectorAll("[data-detail]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelector("#detail-title").textContent = button.dataset.detail;
    dialog.showModal();
  });
});
document.querySelector("#close-detail").addEventListener("click", () => dialog.close());
document.querySelector("form").addEventListener("submit", (event) => {
  event.preventDefault();
  document.querySelector("#form-status").textContent = "Mensaje de prueba recibido. No se ha enviado ningún dato.";
});

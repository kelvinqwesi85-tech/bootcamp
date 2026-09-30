const requestForm = document.querySelector("#service-request");
const requestStatus = document.querySelector(".request-status");
const serviceName = requestForm.dataset.service;
const packageField = requestForm.querySelector('[name="package"]');
const packageLabel = document.querySelector("#selected-package");

document.querySelectorAll("[data-package]").forEach((packageLink) => {
  packageLink.addEventListener("click", () => {
    packageField.value = packageLink.dataset.package;
    packageLabel.textContent = `Selected package: ${packageLink.dataset.package}`;
  });
});

requestForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = requestForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = "Sending request...";
  requestStatus.className = "request-status";
  requestStatus.textContent = "";

  const payload = Object.fromEntries(new FormData(requestForm));
  payload.service = serviceName;

  try {
    const response = await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error || "Request could not be sent.");
    requestStatus.textContent =
      "Request received. An Eagle specialist will contact you within one working day.";
    requestForm.reset();
    packageLabel.textContent =
      "Choose a package above or describe a custom requirement.";
  } catch (error) {
    requestStatus.className = "request-status error";
    requestStatus.textContent =
      "The request could not be sent. Please call the control room directly.";
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Request this service";
  }
});

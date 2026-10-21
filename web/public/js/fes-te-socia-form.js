import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDCVaFfq9sCwlthP8z4qmO-SoRH0nYr_9E",
  authDomain: "cineclub-socis.firebaseapp.com",
  projectId: "cineclub-socis",
  storageBucket: "cineclub-socis.firebasestorage.app",
  messagingSenderId: "875624975916",
  appId: "1:875624975916:web:a5ac3c47b9e0955c77cb89",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const LLETRES_DNI = "TRWAGMYFPDXBNJZSQVHLCKE";
const PREFIXOS_NIE = { X: "0", Y: "1", Z: "2" };

function dniValid(valor) {
  const net = valor.trim().toUpperCase();
  const dni = /^(\d{8})([A-Z])$/.exec(net);
  if (dni) return LLETRES_DNI[Number(dni[1]) % 23] === dni[2];
  const nie = /^([XYZ])(\d{7})([A-Z])$/.exec(net);
  if (nie) return LLETRES_DNI[Number(PREFIXOS_NIE[nie[1]] + nie[2]) % 23] === nie[3];
  return false;
}

function telefonValid(valor) {
  const net = valor.trim().replace(/[\s-]/g, "");
  return /^(\+34|0034)?[6789]\d{8}$/.test(net);
}

function emailValid(valor) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor.trim());
}

const form = document.querySelector("[data-fes-te-socia-form]");
if (form) {
  const errorEl = form.querySelector("[data-form-error]");
  const submitBtn = form.querySelector("[data-form-submit]");
  const confirmacioEl = document.querySelector("[data-form-confirmacio]");
  const emailField = form.querySelector("[data-email-field]");
  const senseEmailCheckbox = form.querySelector("[data-sense-email]");

  senseEmailCheckbox.addEventListener("change", () => {
    const senseEmail = senseEmailCheckbox.checked;
    emailField.hidden = senseEmail;
    form.correuElectronic.required = !senseEmail;
    if (senseEmail) form.correuElectronic.value = "";
  });

  form.querySelectorAll(".signup-form__input, input[type=\"checkbox\"]").forEach((camp) => {
    camp.addEventListener("input", () => camp.classList.remove("signup-form__input--error"));
    camp.addEventListener("change", () => camp.classList.remove("signup-form__input--error"));
  });

  function marcarError(camp, missatge) {
    form.querySelectorAll(".signup-form__input--error").forEach((el) => {
      el.classList.remove("signup-form__input--error");
    });
    errorEl.textContent = missatge;
    camp.classList.add("signup-form__input--error");
    camp.focus();
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    form.querySelectorAll(".signup-form__input--error").forEach((el) => {
      el.classList.remove("signup-form__input--error");
    });
    errorEl.textContent = "";

    const dades = {
      nom: form.nom.value.trim(),
      cognoms: form.cognoms.value.trim(),
      dni: form.dni.value.trim().toUpperCase(),
      poblacio: form.poblacio.value.trim(),
      codiPostal: form.codiPostal.value.trim(),
      telefon: form.telefon.value.trim(),
      correuElectronic: form.correuElectronic.value.trim(),
      comentaris: form.comentaris.value.trim(),
      acceptaPrivacitat: form.acceptaPrivacitat.checked,
      acceptaDadesPersonals: form.acceptaDadesPersonals.checked,
    };

    const campsObligatoris = [
      [form.nom, dades.nom],
      [form.cognoms, dades.cognoms],
      [form.dni, dades.dni],
      [form.poblacio, dades.poblacio],
      [form.codiPostal, dades.codiPostal],
      [form.telefon, dades.telefon],
    ];
    const campBuit = campsObligatoris.find(([, valor]) => !valor);
    if (campBuit) {
      marcarError(campBuit[0], "Cal omplir tots els camps obligatoris.");
      return;
    }
    if (!dades.correuElectronic && !senseEmailCheckbox.checked) {
      marcarError(form.correuElectronic, "Cal indicar un correu electrònic, o marcar que no en tens.");
      return;
    }
    if (!dniValid(dades.dni)) {
      marcarError(form.dni, "El DNI o NIE no té un format vàlid.");
      return;
    }
    if (!telefonValid(dades.telefon)) {
      marcarError(form.telefon, "El telèfon no té un format vàlid.");
      return;
    }
    if (dades.correuElectronic && !emailValid(dades.correuElectronic)) {
      marcarError(form.correuElectronic, "El correu electrònic no té un format vàlid.");
      return;
    }
    if (!dades.acceptaPrivacitat) {
      marcarError(form.acceptaPrivacitat, "Cal acceptar la política de privacitat.");
      return;
    }
    if (!dades.acceptaDadesPersonals) {
      marcarError(form.acceptaDadesPersonals, "Cal autoritzar el tractament de les dades.");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Enviant…";
    try {
      await addDoc(collection(db, "solicituds"), {
        ...dades,
        timestamp: serverTimestamp(),
        estat: "pendent",
      });
      form.hidden = true;
      confirmacioEl.hidden = false;
    } catch {
      errorEl.textContent = "No s'ha pogut enviar. Torna-ho a provar.";
      submitBtn.disabled = false;
      submitBtn.textContent = "Enviar sol·licitud";
    }
  });
}

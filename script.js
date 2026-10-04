(() => {
  "use strict";

  const STORAGE_KEY = "kyukyutaimuke-record-v1";
  const emptyRecord = () => ({
    patient: { name: "", age: "", sex: "", complaint: "" },
    vitals: [],
    activities: [],
    checks: {},
    timerStartedAt: null,
    timerElapsed: 0
  });

  const elements = {
    patientForm: document.querySelector("#patient-form"),
    vitalsForm: document.querySelector("#vitals-form"),
    activityForm: document.querySelector("#activity-form"),
    vitalsList: document.querySelector("#vitals-list"),
    vitalsEmpty: document.querySelector("#vitals-empty"),
    activityList: document.querySelector("#activity-list"),
    activityEmpty: document.querySelector("#activity-empty"),
    timer: document.querySelector("#timer"),
    timerButton: document.querySelector("#timer-button"),
    saveStatus: document.querySelector("#save-status"),
    appMessage: document.querySelector("#app-message")
  };
  let record = loadRecord();
  let timerInterval;

  function loadRecord() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return emptyRecord();
      const parsed = JSON.parse(saved);
      return {
        ...emptyRecord(),
        ...parsed,
        patient: { ...emptyRecord().patient, ...(parsed.patient || {}) },
        vitals: Array.isArray(parsed.vitals) ? parsed.vitals : [],
        activities: Array.isArray(parsed.activities) ? parsed.activities : [],
        checks: parsed.checks && typeof parsed.checks === "object" ? parsed.checks : {}
      };
    } catch (error) {
      console.error("記録を読み込めませんでした", error);
      showMessage("保存データを読み込めませんでした。ブラウザーの保存領域を確認してください。");
      return emptyRecord();
    }
  }

  function saveRecord() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
      elements.saveStatus.textContent = "この端末に保存済み";
      elements.appMessage.textContent = "";
      return true;
    } catch (error) {
      console.error("記録を保存できませんでした", error);
      elements.saveStatus.textContent = "保存できません";
      showMessage("記録を保存できませんでした。ブラウザーの保存領域を確認してください。");
      return false;
    }
  }

  function showMessage(message) {
    elements.appMessage.textContent = message;
  }

  function localTime() {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  }

  function setDefaultTimes() {
    for (const form of [elements.vitalsForm, elements.activityForm]) {
      form.elements.time.value = localTime();
    }
  }

  function fillPatientForm() {
    for (const [key, value] of Object.entries(record.patient)) {
      const field = elements.patientForm.elements.namedItem(key);
      if (field) field.value = value;
    }
  }

  function renderVitals() {
    elements.vitalsList.replaceChildren();
    elements.vitalsEmpty.hidden = record.vitals.length > 0;

    for (const entry of [...record.vitals].reverse()) {
      const row = document.createElement("tr");
      const values = [
        entry.time,
        entry.bloodPressure || "—",
        entry.pulse ? `${entry.pulse} /分` : "—",
        entry.respiration ? `${entry.respiration} /分` : "—",
        entry.spo2 ? `${entry.spo2}%` : "—",
        entry.temperature ? `${entry.temperature}℃` : "—"
      ];
      for (const value of values) {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.append(cell);
      }
      const actionCell = document.createElement("td");
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "delete-record";
      removeButton.dataset.removeVital = entry.id;
      removeButton.textContent = "削除";
      removeButton.setAttribute("aria-label", `${entry.time}のバイタル記録を削除`);
      actionCell.append(removeButton);
      row.append(actionCell);
      elements.vitalsList.append(row);
    }
  }

  function renderActivities() {
    elements.activityList.replaceChildren();
    elements.activityEmpty.hidden = record.activities.length > 0;

    for (const entry of [...record.activities].reverse()) {
      const item = document.createElement("li");
      const time = document.createElement("span");
      time.className = "activity-time";
      time.textContent = entry.time;
      const note = document.createElement("span");
      note.className = "activity-copy";
      note.textContent = entry.note;
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "delete-record";
      removeButton.dataset.removeActivity = entry.id;
      removeButton.textContent = "削除";
      removeButton.setAttribute("aria-label", `${entry.time}の活動メモを削除`);
      item.append(time, note, removeButton);
      elements.activityList.append(item);
    }
  }

  function renderChecks() {
    const boxes = document.querySelectorAll("[data-check]");
    let checked = 0;
    for (const box of boxes) {
      box.checked = Boolean(record.checks[box.dataset.check]);
      if (box.checked) checked += 1;
    }
    document.querySelector("#check-progress-text").textContent = `${checked} / ${boxes.length} 項目`;
    document.querySelector("#check-progress-bar").style.width = `${boxes.length ? checked / boxes.length * 100 : 0}%`;
  }

  function elapsedSeconds() {
    const runningTime = record.timerStartedAt ? Math.floor((Date.now() - record.timerStartedAt) / 1000) : 0;
    return Math.max(0, record.timerElapsed + runningTime);
  }

  function renderTimer() {
    const seconds = elapsedSeconds();
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = seconds % 60;
    elements.timer.textContent = [hours, minutes, remainder].map(value => String(value).padStart(2, "0")).join(":");
    elements.timerButton.textContent = record.timerStartedAt ? "活動を終了" : record.timerElapsed ? "活動を再開" : "活動開始";
    elements.timerButton.setAttribute("aria-pressed", String(Boolean(record.timerStartedAt)));
  }

  elements.patientForm.addEventListener("input", () => {
    record.patient = Object.fromEntries(new FormData(elements.patientForm));
    saveRecord();
  });

  elements.patientForm.addEventListener("submit", event => {
    event.preventDefault();
    record.patient = Object.fromEntries(new FormData(elements.patientForm));
    saveRecord();
    elements.saveStatus.textContent = "基本情報を保存しました";
  });

  elements.vitalsForm.addEventListener("submit", event => {
    event.preventDefault();
    const data = new FormData(elements.vitalsForm);
    const entry = { id: crypto.randomUUID(), time: data.get("time") };
    for (const key of ["bloodPressure", "pulse", "respiration", "spo2", "temperature"]) {
      entry[key] = String(data.get(key) || "").trim();
    }
    record.vitals.push(entry);
    saveRecord();
    renderVitals();
    elements.vitalsForm.reset();
    setDefaultTimes();
  });

  elements.activityForm.addEventListener("submit", event => {
    event.preventDefault();
    const data = new FormData(elements.activityForm);
    record.activities.push({
      id: crypto.randomUUID(),
      time: data.get("time"),
      note: String(data.get("note")).trim()
    });
    saveRecord();
    renderActivities();
    elements.activityForm.reset();
    setDefaultTimes();
  });

  elements.vitalsList.addEventListener("click", event => {
    const button = event.target.closest("[data-remove-vital]");
    if (!button) return;
    record.vitals = record.vitals.filter(entry => entry.id !== button.dataset.removeVital);
    saveRecord();
    renderVitals();
  });

  elements.activityList.addEventListener("click", event => {
    const button = event.target.closest("[data-remove-activity]");
    if (!button) return;
    record.activities = record.activities.filter(entry => entry.id !== button.dataset.removeActivity);
    saveRecord();
    renderActivities();
  });

  document.querySelectorAll("[data-check]").forEach(box => {
    box.addEventListener("change", () => {
      record.checks[box.dataset.check] = box.checked;
      saveRecord();
      renderChecks();
    });
  });

  elements.timerButton.addEventListener("click", () => {
    if (record.timerStartedAt) {
      record.timerElapsed += Math.floor((Date.now() - record.timerStartedAt) / 1000);
      record.timerStartedAt = null;
      clearInterval(timerInterval);
      timerInterval = null;
    } else {
      record.timerStartedAt = Date.now();
      if (!timerInterval) timerInterval = window.setInterval(renderTimer, 1000);
    }
    saveRecord();
    renderTimer();
  });

  document.querySelector("#reset-button").addEventListener("click", () => {
    if (!window.confirm("この端末に保存された活動記録をすべて削除します。よろしいですか？")) return;
    const previous = record;
    record = emptyRecord();
    if (!saveRecord()) {
      record = previous;
      return;
    }
    clearInterval(timerInterval);
    timerInterval = null;
    elements.patientForm.reset();
    elements.vitalsForm.reset();
    elements.activityForm.reset();
    setDefaultTimes();
    renderVitals();
    renderActivities();
    renderChecks();
    renderTimer();
    elements.saveStatus.textContent = "記録をリセットしました";
  });

  fillPatientForm();
  setDefaultTimes();
  renderVitals();
  renderActivities();
  renderChecks();
  renderTimer();
  if (record.timerStartedAt) timerInterval = window.setInterval(renderTimer, 1000);
})();

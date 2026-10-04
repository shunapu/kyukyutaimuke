(() => {
  "use strict";

  const STORAGE_KEY = "kyukyutaimuke-hospitals-v1";
  const emptyMessage = "登録された病院情報はありません。上のフォームから施設情報を追加してください。";
  const elements = {
    form: document.querySelector("#hospital-form"),
    submit: document.querySelector("#submit-hospital"),
    cancel: document.querySelector("#cancel-edit"),
    status: document.querySelector("#save-status"),
    searchForm: document.querySelector("#search-form"),
    keyword: document.querySelector("#keyword"),
    area: document.querySelector("#area-filter"),
    department: document.querySelector("#department-filter"),
    sort: document.querySelector("#sort-filter"),
    list: document.querySelector("#hospital-list"),
    count: document.querySelector("#result-count"),
    empty: document.querySelector("#no-results")
  };
  let hospitals = loadHospitals();

  function loadHospitals() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) throw new TypeError("保存データの形式が正しくありません");
      return parsed.filter(hospital =>
        hospital
        && typeof hospital.id === "string"
        && typeof hospital.name === "string"
        && typeof hospital.area === "string"
      ).map(hospital => ({
        id: hospital.id,
        name: hospital.name,
        area: hospital.area,
        address: typeof hospital.address === "string" ? hospital.address : "",
        phone: typeof hospital.phone === "string" ? hospital.phone : "",
        hours: typeof hospital.hours === "string" ? hospital.hours : "",
        departments: Array.isArray(hospital.departments) ? hospital.departments.filter(value => typeof value === "string") : [],
        services: Array.isArray(hospital.services) ? hospital.services.filter(value => typeof value === "string") : []
      }));
    } catch (error) {
      console.error("病院情報を読み込めませんでした", error);
      elements.status.textContent = "保存済み情報を読み込めません。ブラウザーの保存領域を確認してください。";
      return [];
    }
  }

  function saveHospitals() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(hospitals));
      elements.status.textContent = "変更をこの端末に保存しました。";
      return true;
    } catch (error) {
      console.error("病院情報を保存できませんでした", error);
      elements.status.textContent = "保存できませんでした。ブラウザーの保存領域を確認してください。";
      return false;
    }
  }

  function splitValues(value) {
    return value.split(/[,、，]/).map(item => item.trim()).filter(Boolean);
  }

  function createTag(text, className = "") {
    const tag = document.createElement("span");
    tag.className = `tag ${className}`.trim();
    tag.textContent = text;
    return tag;
  }

  function createHospitalCard(hospital) {
    const card = document.createElement("article");
    card.className = "hospital-card";

    const header = document.createElement("div");
    header.className = "hospital-card-header";
    const icon = document.createElement("span");
    icon.className = "hospital-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "＋";
    const titleGroup = document.createElement("div");
    titleGroup.className = "hospital-title";
    const title = document.createElement("h3");
    title.textContent = hospital.name || "病院名未登録";
    const area = document.createElement("span");
    area.className = "area-label";
    area.textContent = hospital.area || "地域未登録";
    titleGroup.append(title, area);
    header.append(icon, titleGroup);

    const details = document.createElement("dl");
    details.className = "hospital-details";
    addDetail(details, "住所", hospital.address || "未登録");
    if (hospital.phone) {
      const term = document.createElement("dt");
      term.textContent = "電話番号";
      const definition = document.createElement("dd");
      const link = document.createElement("a");
      link.href = `tel:${hospital.phone.replace(/[^\d+]/g, "")}`;
      link.textContent = hospital.phone;
      link.className = "phone-link";
      definition.append(link);
      details.append(term, definition);
    }
    addDetail(details, "診療時間", hospital.hours || "未登録");
    addDetail(details, "救急受入", "要電話確認");

    const departmentTags = document.createElement("div");
    departmentTags.className = "tag-list";
    if (hospital.departments.length) {
      for (const department of hospital.departments) departmentTags.append(createTag(department));
    } else {
      departmentTags.append(createTag("診療科未登録", "tag-muted"));
    }

    const footer = document.createElement("div");
    footer.className = "hospital-card-footer";
    const serviceTags = document.createElement("div");
    serviceTags.className = "tag-list service-tags";
    for (const service of hospital.services) serviceTags.append(createTag(service, "tag-muted"));
    const actions = document.createElement("div");
    actions.className = "card-actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "text-button";
    edit.dataset.edit = hospital.id;
    edit.textContent = "編集";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "text-button delete-button";
    remove.dataset.delete = hospital.id;
    remove.textContent = "削除";
    remove.setAttribute("aria-label", `${hospital.name}を削除`);
    actions.append(edit, remove);
    footer.append(serviceTags, actions);

    card.append(header, details, departmentTags, footer);
    return card;
  }

  function addDetail(list, label, value) {
    const term = document.createElement("dt");
    term.textContent = label;
    const definition = document.createElement("dd");
    definition.textContent = value;
    list.append(term, definition);
  }

  function updateFilter(select, values, defaultLabel, selectedValue) {
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = defaultLabel;
    const options = [...new Set(values)].sort((a, b) => a.localeCompare(b, "ja"));
    select.replaceChildren(placeholder);
    for (const value of options) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.append(option);
    }
    select.value = options.includes(selectedValue) ? selectedValue : "";
  }

  function render() {
    updateFilter(elements.area, hospitals.map(hospital => hospital.area), "すべての地域", elements.area.value);
    updateFilter(elements.department, hospitals.flatMap(hospital => hospital.departments), "すべての診療科", elements.department.value);

    const keyword = elements.keyword.value.trim().toLocaleLowerCase("ja");
    const area = elements.area.value;
    const department = elements.department.value;
    const sort = elements.sort.value;
    const results = hospitals.filter(hospital => {
      const searchable = [
        hospital.name, hospital.area, hospital.address, hospital.phone, hospital.hours,
        ...hospital.departments, ...hospital.services
      ].join(" ").toLocaleLowerCase("ja");
      return (!keyword || searchable.includes(keyword))
        && (!area || hospital.area === area)
        && (!department || hospital.departments.includes(department));
    });
    results.sort((first, second) => {
      const firstValue = sort === "area" ? first.area : first.name;
      const secondValue = sort === "area" ? second.area : second.name;
      return firstValue.localeCompare(secondValue, "ja");
    });

    elements.list.replaceChildren(...results.map(createHospitalCard));
    elements.count.textContent = `${results.length} 件`;
    elements.empty.textContent = hospitals.length ? "条件に一致する施設がありません。検索条件を変更してください。" : emptyMessage;
    elements.empty.hidden = results.length > 0;
  }

  function resetForm() {
    elements.form.reset();
    elements.form.elements.id.value = "";
    elements.submit.textContent = "施設情報を追加";
    elements.cancel.hidden = true;
    document.querySelector("#editor-heading").textContent = "病院情報を追加";
  }

  elements.form.addEventListener("submit", event => {
    event.preventDefault();
    if (!elements.form.reportValidity()) return;

    const data = new FormData(elements.form);
    const id = String(data.get("id") || "");
    const hospital = {
      id: id || crypto.randomUUID(),
      name: String(data.get("name")).trim(),
      area: String(data.get("area")).trim(),
      address: String(data.get("address")).trim(),
      phone: String(data.get("phone")).trim(),
      hours: String(data.get("hours")).trim(),
      departments: splitValues(String(data.get("departments"))),
      services: splitValues(String(data.get("services")))
    };
    const previous = hospitals;
    hospitals = id
      ? hospitals.map(item => item.id === id ? hospital : item)
      : [...hospitals, hospital];
    if (!saveHospitals()) {
      hospitals = previous;
      return;
    }
    resetForm();
    render();
    elements.status.textContent = id ? "施設情報を更新しました。" : "施設情報を追加しました。";
  });

  elements.cancel.addEventListener("click", resetForm);

  elements.list.addEventListener("click", event => {
    const editButton = event.target.closest("[data-edit]");
    if (editButton) {
      const hospital = hospitals.find(item => item.id === editButton.dataset.edit);
      if (!hospital) return;
      for (const field of ["id", "name", "area", "address", "phone", "hours"]) {
        elements.form.elements[field].value = hospital[field];
      }
      elements.form.elements.departments.value = hospital.departments.join("、");
      elements.form.elements.services.value = hospital.services.join("、");
      elements.submit.textContent = "変更を保存";
      elements.cancel.hidden = false;
      document.querySelector("#editor-heading").textContent = "病院情報を編集";
      elements.form.scrollIntoView({ behavior: "smooth", block: "start" });
      elements.form.elements.name.focus({ preventScroll: true });
      return;
    }

    const deleteButton = event.target.closest("[data-delete]");
    if (!deleteButton) return;
    const hospital = hospitals.find(item => item.id === deleteButton.dataset.delete);
    if (!hospital || !window.confirm(`「${hospital.name}」を削除しますか？`)) return;
    const previous = hospitals;
    hospitals = hospitals.filter(item => item.id !== hospital.id);
    if (!saveHospitals()) {
      hospitals = previous;
      return;
    }
    if (elements.form.elements.id.value === hospital.id) resetForm();
    render();
  });

  elements.searchForm.addEventListener("submit", event => {
    event.preventDefault();
    render();
  });
  elements.keyword.addEventListener("input", render);
  elements.area.addEventListener("change", render);
  elements.department.addEventListener("change", render);
  elements.sort.addEventListener("change", render);

  render();
})();

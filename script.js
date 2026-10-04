(() => {
  "use strict";

  // All facilities are fictional placeholders for the UI prototype.
  const hospitals = [
    {
      name: "青葉総合医療センター（サンプル）",
      area: "青葉区",
      address: "青葉区中央 1-2-3（架空住所）",
      departments: ["内科", "外科", "脳神経外科", "整形外科"],
      services: ["救急告示（例）", "CT（例）", "MRI（例）"],
      hours: "診療時間は要確認",
      updated: "サンプル情報"
    },
    {
      name: "みなと市民病院（サンプル）",
      area: "港区",
      address: "港区海岸通り 4-5-6（架空住所）",
      departments: ["内科", "循環器内科", "小児科"],
      services: ["救急告示（例）", "CCU（例）"],
      hours: "診療時間は要確認",
      updated: "サンプル情報"
    },
    {
      name: "さくら脳神経センター（サンプル）",
      area: "中央区",
      address: "中央区さくら町 7-8-9（架空住所）",
      departments: ["脳神経外科", "神経内科", "リハビリテーション科"],
      services: ["CT（例）", "MRI（例）"],
      hours: "診療時間は要確認",
      updated: "サンプル情報"
    },
    {
      name: "北町こども医療センター（サンプル）",
      area: "北区",
      address: "北区北町 2-3-4（架空住所）",
      departments: ["小児科", "小児外科", "新生児科"],
      services: ["小児救急（例）", "NICU（例）"],
      hours: "診療時間は要確認",
      updated: "サンプル情報"
    },
    {
      name: "東部メディカル病院（サンプル）",
      area: "東区",
      address: "東区若葉 5-6-7（架空住所）",
      departments: ["内科", "外科", "整形外科", "産婦人科"],
      services: ["救急告示（例）", "手術室（例）"],
      hours: "診療時間は要確認",
      updated: "サンプル情報"
    },
    {
      name: "西ヶ丘総合病院（サンプル）",
      area: "西区",
      address: "西区西ヶ丘 8-9-1（架空住所）",
      departments: ["内科", "循環器内科", "呼吸器内科", "外科"],
      services: ["救急告示（例）", "CT（例）"],
      hours: "診療時間は要確認",
      updated: "サンプル情報"
    }
  ];

  const elements = {
    form: document.querySelector("#search-form"),
    keyword: document.querySelector("#keyword"),
    area: document.querySelector("#area-filter"),
    department: document.querySelector("#department-filter"),
    sort: document.querySelector("#sort-filter"),
    list: document.querySelector("#hospital-list"),
    count: document.querySelector("#result-count"),
    empty: document.querySelector("#no-results")
  };

  function addOptions(select, options) {
    for (const option of options) {
      const element = document.createElement("option");
      element.value = option;
      element.textContent = option;
      select.append(element);
    }
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
    title.textContent = hospital.name;
    const area = document.createElement("span");
    area.className = "area-label";
    area.textContent = hospital.area;
    titleGroup.append(title, area);
    header.append(icon, titleGroup);

    const address = document.createElement("p");
    address.className = "hospital-address";
    address.textContent = hospital.address;

    const departments = document.createElement("div");
    departments.className = "tag-list";
    for (const department of hospital.departments) {
      departments.append(createTag(department));
    }

    const details = document.createElement("dl");
    details.className = "hospital-details";
    const hoursTerm = document.createElement("dt");
    hoursTerm.textContent = "診療時間";
    const hoursValue = document.createElement("dd");
    hoursValue.textContent = hospital.hours;
    const intakeTerm = document.createElement("dt");
    intakeTerm.textContent = "救急受入";
    const intakeValue = document.createElement("dd");
    intakeValue.className = "confirm-status";
    intakeValue.textContent = "要電話確認";
    details.append(hoursTerm, hoursValue, intakeTerm, intakeValue);

    const footer = document.createElement("div");
    footer.className = "hospital-card-footer";
    const services = document.createElement("div");
    services.className = "tag-list service-tags";
    for (const service of hospital.services) {
      services.append(createTag(service, "tag-muted"));
    }
    const updated = document.createElement("span");
    updated.className = "updated-label";
    updated.textContent = hospital.updated;
    footer.append(services, updated);

    card.append(header, address, departments, details, footer);
    return card;
  }

  function render() {
    const keyword = elements.keyword.value.trim().toLocaleLowerCase("ja");
    const area = elements.area.value;
    const department = elements.department.value;
    const sort = elements.sort.value;

    const results = hospitals.filter(hospital => {
      const searchable = [
        hospital.name,
        hospital.area,
        hospital.address,
        ...hospital.departments,
        ...hospital.services
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
    elements.empty.hidden = results.length > 0;
  }

  addOptions(elements.area, [...new Set(hospitals.map(hospital => hospital.area))].sort((a, b) => a.localeCompare(b, "ja")));
  addOptions(elements.department, [...new Set(hospitals.flatMap(hospital => hospital.departments))].sort((a, b) => a.localeCompare(b, "ja")));

  elements.form.addEventListener("submit", event => {
    event.preventDefault();
    render();
  });
  elements.keyword.addEventListener("input", render);
  elements.area.addEventListener("change", render);
  elements.department.addEventListener("change", render);
  elements.sort.addEventListener("change", render);
  render();
})();

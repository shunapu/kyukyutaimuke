(() => {
  "use strict";

  const DATABASE_NAME = "kyukyutaimuke-protocols";
  const STORE_NAME = "documents";
  const MAX_FILE_SIZE = 50 * 1024 * 1024;
  const documentUrls = new Set();
  const elements = {
    form: document.querySelector("#protocol-form"),
    status: document.querySelector("#protocol-status"),
    list: document.querySelector("#protocol-list"),
    count: document.querySelector("#protocol-count"),
    empty: document.querySelector("#protocol-empty")
  };

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, 1);
      request.addEventListener("upgradeneeded", () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      });
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error || new Error("資料保存領域を開けませんでした")), { once: true });
    });
  }

  async function withStore(mode, action) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      let result;
      try {
        result = action(store);
      } catch (error) {
        database.close();
        reject(error);
        return;
      }
      transaction.addEventListener("complete", () => {
        database.close();
        resolve(result && result.result !== undefined ? result.result : result);
      }, { once: true });
      transaction.addEventListener("error", () => {
        database.close();
        reject(transaction.error || new Error("資料を保存領域から取得できませんでした"));
      }, { once: true });
      transaction.addEventListener("abort", () => {
        database.close();
        reject(transaction.error || new Error("資料の処理が中断されました"));
      }, { once: true });
    });
  }

  function showError(error, action) {
    console.error(action, error);
    elements.status.textContent = `${action}。ブラウザーの保存領域を確認してください。`;
  }

  function createDocumentCard(documentInfo) {
    const card = document.createElement("article");
    card.className = "protocol-card";

    const information = document.createElement("div");
    information.className = "protocol-info";
    const category = document.createElement("span");
    category.className = "tag";
    category.textContent = documentInfo.category;
    const title = document.createElement("h3");
    title.textContent = documentInfo.title;
    const details = document.createElement("p");
    details.className = "protocol-meta";
    const date = new Date(documentInfo.addedAt).toLocaleDateString("ja-JP");
    details.textContent = [documentInfo.revision, `${date} 登録`, documentInfo.fileName].filter(Boolean).join(" ・ ");
    information.append(category, title, details);

    const actions = document.createElement("div");
    actions.className = "protocol-actions";
    const open = document.createElement("button");
    open.type = "button";
    open.className = "button button-secondary";
    open.dataset.open = documentInfo.id;
    open.textContent = "PDFを開く";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "text-button delete-button";
    remove.dataset.delete = documentInfo.id;
    remove.textContent = "削除";
    remove.setAttribute("aria-label", `${documentInfo.title}を削除`);
    actions.append(open, remove);
    card.append(information, actions);
    return card;
  }

  async function render() {
    try {
      const documents = await withStore("readonly", store => store.getAll());
      documents.sort((first, second) => second.addedAt - first.addedAt);
      elements.list.replaceChildren(...documents.map(createDocumentCard));
      elements.count.textContent = `${documents.length} 件`;
      elements.empty.hidden = documents.length > 0;
    } catch (error) {
      showError(error, "資料一覧を読み込めませんでした");
    }
  }

  elements.form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!elements.form.reportValidity()) return;

    const data = new FormData(elements.form);
    const file = data.get("file");
    if (!(file instanceof File) || file.size === 0) {
      elements.status.textContent = "登録するPDFファイルを選択してください。";
      return;
    }
    if (file.type !== "application/pdf" && !file.name.toLocaleLowerCase("ja").endsWith(".pdf")) {
      elements.status.textContent = "PDFファイルを選択してください。";
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      elements.status.textContent = "ファイルサイズは50MB以下にしてください。";
      return;
    }

    const record = {
      id: crypto.randomUUID(),
      title: String(data.get("title")).trim(),
      category: String(data.get("category")),
      revision: String(data.get("revision")).trim(),
      fileName: file.name,
      addedAt: Date.now(),
      file: file.type === "application/pdf" ? file : file.slice(0, file.size, "application/pdf")
    };
    try {
      await withStore("readwrite", store => store.add(record));
      elements.form.reset();
      elements.status.textContent = "資料をこの端末に登録しました。";
      await render();
    } catch (error) {
      showError(error, "資料を登録できませんでした");
    }
  });

  elements.list.addEventListener("click", async event => {
    const openButton = event.target.closest("[data-open]");
    const deleteButton = event.target.closest("[data-delete]");
    const button = openButton || deleteButton;
    if (!button) return;

    const viewer = openButton ? window.open("about:blank", "_blank") : null;
    if (openButton && !viewer) {
      elements.status.textContent = "PDFを開けませんでした。ブラウザーのポップアップ設定を確認してください。";
      return;
    }
    if (viewer) viewer.opener = null;

    try {
      const documentInfo = await withStore("readonly", store => store.get(button.dataset.open || button.dataset.delete));
      if (!documentInfo) {
        if (viewer) viewer.close();
        elements.status.textContent = "資料が見つかりません。一覧を更新してください。";
        await render();
        return;
      }

      if (openButton) {
        const url = URL.createObjectURL(documentInfo.file);
        documentUrls.add(url);
        viewer.location.href = url;
        return;
      }

      if (!window.confirm(`「${documentInfo.title}」を削除しますか？`)) return;
      await withStore("readwrite", store => store.delete(documentInfo.id));
      elements.status.textContent = "資料を削除しました。";
      await render();
    } catch (error) {
      if (viewer) viewer.close();
      showError(error, openButton ? "PDFを開けませんでした" : "資料を削除できませんでした");
    }
  });

  window.addEventListener("pagehide", () => {
    for (const url of documentUrls) URL.revokeObjectURL(url);
    documentUrls.clear();
  });

  render();
})();

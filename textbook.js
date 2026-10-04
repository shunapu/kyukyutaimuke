(() => {
  "use strict";

  const DATABASE_NAME = "kyukyutaimuke-textbook";
  const STORE_NAME = "books";
  const BOOK_KEY = "standard-textbook";
  const documentUrls = new Set();
  const elements = {
    form: document.querySelector("#textbook-form"),
    status: document.querySelector("#textbook-status"),
    save: document.querySelector("#save-textbook"),
    actions: document.querySelector("#textbook-actions"),
    open: document.querySelector("#open-textbook"),
    remove: document.querySelector("#delete-textbook"),
    empty: document.querySelector("#textbook-empty"),
    viewer: document.querySelector("#textbook-viewer")
  };

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, 1);
      request.addEventListener("upgradeneeded", () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      });
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error || new Error("教材の保存領域を開けませんでした")), { once: true });
    });
  }

  async function withStore(mode, action) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      let request;
      try {
        request = action(transaction.objectStore(STORE_NAME));
      } catch (error) {
        database.close();
        reject(error);
        return;
      }
      transaction.addEventListener("complete", () => {
        database.close();
        resolve(request && "result" in request ? request.result : undefined);
      }, { once: true });
      transaction.addEventListener("error", () => {
        database.close();
        reject(transaction.error || new Error("教材を保存領域から取得できませんでした"));
      }, { once: true });
      transaction.addEventListener("abort", () => {
        database.close();
        reject(transaction.error || new Error("教材の処理が中断されました"));
      }, { once: true });
    });
  }

  function createViewer(book) {
    const previousFrame = elements.viewer.querySelector("iframe");
    if (previousFrame) previousFrame.src = "about:blank";
    const url = URL.createObjectURL(book.file);
    documentUrls.add(url);
    const frame = document.createElement("iframe");
    frame.className = "textbook-frame";
    frame.title = `${book.title} PDF`;
    frame.src = url;
    elements.viewer.replaceChildren(frame);
    elements.viewer.hidden = false;
    elements.empty.hidden = true;
    elements.actions.hidden = false;
    elements.status.textContent = `「${book.title}」${book.edition ? `（${book.edition}）` : ""}を表示しています。`;
  }

  async function render() {
    try {
      const book = await withStore("readonly", store => store.get(BOOK_KEY));
      if (!book) {
        elements.viewer.replaceChildren();
        elements.viewer.hidden = true;
        elements.actions.hidden = true;
        elements.empty.hidden = false;
        elements.save.textContent = "PDFを登録";
        return;
      }
      elements.save.textContent = "PDFを差し替え";
      createViewer(book);
    } catch (error) {
      console.error("救急救命士標準テキストを読み込めませんでした", error);
      elements.status.textContent = "教材を読み込めませんでした。ブラウザーの保存領域を確認してください。";
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

    const replacing = elements.save.textContent === "PDFを差し替え";
    if (replacing && !window.confirm("登録済みのテキストを新しいPDFに差し替えますか？")) return;

    const book = {
      id: BOOK_KEY,
      title: String(data.get("title")).trim(),
      edition: String(data.get("edition")).trim(),
      fileName: file.name,
      file: file.type === "application/pdf" ? file : file.slice(0, file.size, "application/pdf"),
      updatedAt: Date.now()
    };
    elements.save.disabled = true;
    elements.status.textContent = "PDFを保存しています。ファイルサイズにより時間がかかる場合があります。";
    try {
      await withStore("readwrite", store => store.put(book));
      elements.form.reset();
      elements.form.elements.title.value = book.title;
      elements.form.elements.edition.value = book.edition;
      elements.status.textContent = "PDFをこの端末に登録しました。";
      await render();
    } catch (error) {
      console.error("救急救命士標準テキストを保存できませんでした", error);
      elements.status.textContent = error.name === "QuotaExceededError"
        ? "ブラウザーの保存容量が不足しているため登録できません。空き容量を確保するか、より小さいPDFを使用してください。"
        : "PDFを保存できませんでした。ブラウザーの保存領域と空き容量を確認してください。";
    } finally {
      elements.save.disabled = false;
    }
  });

  elements.open.addEventListener("click", async () => {
    const viewer = window.open("about:blank", "_blank");
    if (!viewer) {
      elements.status.textContent = "PDFを開けませんでした。ブラウザーのポップアップ設定を確認してください。";
      return;
    }
    viewer.opener = null;
    try {
      const book = await withStore("readonly", store => store.get(BOOK_KEY));
      if (!book) {
        viewer.close();
        elements.status.textContent = "登録済みテキストが見つかりません。";
        await render();
        return;
      }
      const url = URL.createObjectURL(book.file);
      documentUrls.add(url);
      viewer.location.href = url;
    } catch (error) {
      viewer.close();
      console.error("救急救命士標準テキストを開けませんでした", error);
      elements.status.textContent = "PDFを開けませんでした。ブラウザーの保存領域を確認してください。";
    }
  });

  elements.remove.addEventListener("click", async () => {
    if (!window.confirm("登録済みの救急救命士標準テキストを削除しますか？")) return;
    try {
      await withStore("readwrite", store => store.delete(BOOK_KEY));
      elements.status.textContent = "登録済みテキストを削除しました。";
      await render();
    } catch (error) {
      console.error("救急救命士標準テキストを削除できませんでした", error);
      elements.status.textContent = "教材を削除できませんでした。ブラウザーの保存領域を確認してください。";
    }
  });

  window.addEventListener("pagehide", () => {
    for (const url of documentUrls) URL.revokeObjectURL(url);
    documentUrls.clear();
  });

  render();
})();

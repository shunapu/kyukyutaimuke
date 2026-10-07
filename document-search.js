(() => {
  "use strict";

  const pdfWorkerUrl = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const pdfLibraryUrl = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
  const maxResults = 100;
  const elements = {
    form: document.querySelector("#document-search-form"),
    keyword: document.querySelector("#document-search-keyword"),
    status: document.querySelector("#document-search-status"),
    results: document.querySelector("#document-search-results")
  };
  let searchedDocuments = [];
  let pdfLibraryPromise;
  const documentUrls = new Set();

  function loadPdfLibrary() {
    if (window.pdfjsLib) return Promise.resolve();
    if (!pdfLibraryPromise) {
      pdfLibraryPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = pdfLibraryUrl;
        script.onload = () => {
          if (!window.pdfjsLib) {
            pdfLibraryPromise = null;
            reject(new Error("PDF検索ライブラリーを初期化できませんでした"));
            return;
          }
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
          resolve();
        };
        script.onerror = () => {
          pdfLibraryPromise = null;
          reject(new Error("PDF検索ライブラリーを読み込めませんでした"));
        };
        document.head.append(script);
      });
    }
    return pdfLibraryPromise;
  }

  function openDatabase(name, version, storeName) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(name, version);
      request.addEventListener("upgradeneeded", () => {
        if (!request.result.objectStoreNames.contains(storeName)) {
          request.result.createObjectStore(storeName, { keyPath: "id" });
        }
      });
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error || new Error("資料保存領域を開けませんでした")), { once: true });
    });
  }

  async function readStore(databaseName, version, storeName, action) {
    const database = await openDatabase(databaseName, version, storeName);
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, "readonly");
      let request;
      try {
        request = action(transaction.objectStore(storeName));
      } catch (error) {
        database.close();
        reject(error);
        return;
      }
      transaction.addEventListener("complete", () => {
        database.close();
        resolve(request.result);
      }, { once: true });
      transaction.addEventListener("error", () => {
        database.close();
        reject(transaction.error || new Error("資料を読み込めませんでした"));
      }, { once: true });
      transaction.addEventListener("abort", () => {
        database.close();
        reject(transaction.error || new Error("資料の読み込みが中断されました"));
      }, { once: true });
    });
  }

  async function loadDocuments() {
    const [protocols, textbook] = await Promise.all([
      readStore("kyukyutaimuke-protocols", 1, "documents", store => store.getAll()),
      readStore("kyukyutaimuke-textbook", 1, "books", store => store.get("standard-textbook"))
    ]);
    const documents = protocols.map(item => ({
      title: item.title,
      detail: [item.category, item.revision].filter(Boolean).join(" ・ "),
      file: item.file,
      fileName: item.fileName,
      fileType: "pdf"
    }));
    if (textbook) {
      documents.push({
        title: textbook.title,
        detail: textbook.edition || "",
        file: textbook.file,
        fileName: textbook.fileName,
        fileType: textbook.fileType || "pdf"
      });
    }
    return documents;
  }

  function normalize(value) {
    return value.normalize("NFKC").toLocaleLowerCase("ja");
  }

  function findKeywordIndex(text, keyword) {
    const normalizedText = normalize(text);
    const directIndex = normalizedText.indexOf(keyword);
    if (directIndex >= 0) return directIndex;

    const compactKeyword = keyword.replace(/\s/g, "");
    const compactIndex = normalizedText.replace(/\s/g, "").indexOf(compactKeyword);
    if (compactIndex < 0) return -1;
    let seen = 0;
    for (let index = 0; index < normalizedText.length; index += 1) {
      if (/\s/.test(normalizedText[index])) continue;
      if (seen === compactIndex) return index;
      seen += 1;
    }
    return -1;
  }

  function createSnippet(text, keyword) {
    const normalizedText = normalize(text);
    const index = findKeywordIndex(text, keyword);
    if (index < 0) return "";
    const start = Math.max(0, index - 55);
    const end = Math.min(normalizedText.length, index + keyword.length + 95);
    return `${start > 0 ? "…" : ""}${normalizedText.slice(start, end).replace(/\s+/g, " ")}${end < normalizedText.length ? "…" : ""}`;
  }

  async function searchText(documentInfo, keyword, documentIndex) {
    const text = await documentInfo.file.text();
    if (findKeywordIndex(text, keyword) < 0) return [];
    const lines = text.split(/\r?\n/);
    const matches = [];
    for (const [index, line] of lines.entries()) {
      if (findKeywordIndex(line, keyword) >= 0) {
        matches.push({ documentIndex, location: `行 ${index + 1}`, snippet: createSnippet(line, keyword) });
      }
    }
    if (!matches.length) {
      matches.push({ documentIndex, location: "本文", snippet: createSnippet(text, keyword) });
    }
    return matches;
  }

  async function searchPdf(documentInfo, keyword, documentIndex, updateProgress) {
    const pdf = await window.pdfjsLib.getDocument({
      data: new Uint8Array(await documentInfo.file.arrayBuffer())
    }).promise;
    const matches = [];
    try {
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        const text = content.items.map(item => "str" in item ? item.str : "").join("");
        if (findKeywordIndex(text, keyword) >= 0) {
          matches.push({ documentIndex, location: `ページ ${pageNumber}`, snippet: createSnippet(text, keyword), page: pageNumber });
        }
        page.cleanup();
        if (pageNumber % 8 === 0) {
          updateProgress(`${documentInfo.title} を検索中（${pageNumber}/${pdf.numPages} ページ）`);
          await new Promise(resolve => window.setTimeout(resolve, 0));
        }
      }
    } finally {
      await pdf.destroy();
    }
    return matches;
  }

  function createResult(match) {
    const documentInfo = searchedDocuments[match.documentIndex];
    const card = document.createElement("article");
    card.className = "document-search-result";
    const heading = document.createElement("div");
    heading.className = "document-search-result-heading";
    const title = document.createElement("h3");
    title.textContent = [documentInfo.title, documentInfo.detail, match.location].filter(Boolean).join(" ・ ");
    const open = document.createElement("button");
    open.type = "button";
    open.className = "button button-secondary document-search-open";
    open.dataset.openIndex = String(match.documentIndex);
    open.dataset.page = String(match.page || "");
    open.textContent = "資料を開く";
    const snippet = document.createElement("p");
    snippet.textContent = match.snippet;
    heading.append(title, open);
    card.append(heading, snippet);
    return card;
  }

  elements.form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!elements.form.reportValidity()) return;
    const keyword = normalize(elements.keyword.value.trim());
    if (!keyword) return;
    elements.form.querySelector("button[type=submit]").disabled = true;
    elements.results.replaceChildren();
    elements.status.textContent = "登録済み資料を読み込んでいます。";
    const matches = [];
    const errors = [];
    try {
      searchedDocuments = await loadDocuments();
      if (!searchedDocuments.length) {
        elements.status.textContent = "検索できる登録済み資料がありません。";
        return;
      }
      const hasPdfs = searchedDocuments.some(documentInfo => documentInfo.fileType !== "text");
      let pdfLibraryError;
      if (hasPdfs) {
        elements.status.textContent = "PDF検索ライブラリーを読み込んでいます。";
        try {
          await loadPdfLibrary();
        } catch (error) {
          console.error("PDF検索ライブラリーを読み込めませんでした", error);
          pdfLibraryError = error;
        }
      }
      for (const [documentIndex, documentInfo] of searchedDocuments.entries()) {
        try {
          if (documentInfo.fileType !== "text" && !window.pdfjsLib) {
            throw pdfLibraryError || new Error("PDF検索ライブラリーを読み込めません");
          }
          const documentMatches = documentInfo.fileType === "text"
            ? await searchText(documentInfo, keyword, documentIndex)
            : await searchPdf(documentInfo, keyword, documentIndex, status => {
              elements.status.textContent = status;
            });
          matches.push(...documentMatches);
        } catch (error) {
          console.error(`「${documentInfo.title}」を検索できませんでした`, error);
          errors.push(documentInfo.title);
        }
      }
      elements.results.replaceChildren(...matches.slice(0, maxResults).map(createResult));
      const countMessage = matches.length
        ? `${matches.length}${matches.length > maxResults ? `（先頭${maxResults}件を表示）` : ""} 件見つかりました。`
        : "一致する箇所は見つかりませんでした。";
      elements.status.textContent = errors.length
        ? `${countMessage} ${errors.join("、")}は検索できませんでした。${pdfLibraryError ? "PDF検索にはインターネット接続が必要です。" : ""}`
        : countMessage;
    } catch (error) {
      console.error("登録済み資料を検索できませんでした", error);
      elements.status.textContent = "登録済み資料を検索できませんでした。ブラウザーの保存領域を確認してください。";
    } finally {
      elements.form.querySelector("button[type=submit]").disabled = false;
    }
  });

  elements.results.addEventListener("click", event => {
    const button = event.target.closest("[data-open-index]");
    if (!button) return;
    const documentInfo = searchedDocuments[Number(button.dataset.openIndex)];
    if (!documentInfo) return;
    const viewer = window.open("about:blank", "_blank");
    if (!viewer) {
      elements.status.textContent = "資料を開けませんでした。ブラウザーのポップアップ設定を確認してください。";
      return;
    }
    viewer.opener = null;
    const url = URL.createObjectURL(documentInfo.file);
    documentUrls.add(url);
    viewer.location.href = `${url}${button.dataset.page ? `#page=${button.dataset.page}` : ""}`;
  });

  window.addEventListener("pagehide", () => {
    for (const url of documentUrls) URL.revokeObjectURL(url);
    documentUrls.clear();
  });
})();

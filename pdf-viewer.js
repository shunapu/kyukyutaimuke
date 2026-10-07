(() => {
  "use strict";

  const versions = ["https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174", "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build"];
  const activeViewers = new WeakMap();
  let libraryPromise;

  function loadLibrary() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (!libraryPromise) {
      libraryPromise = (async () => {
        let lastError;
        for (const baseUrl of versions) {
          try {
            await new Promise((resolve, reject) => {
              const script = document.createElement("script");
              script.src = `${baseUrl}/pdf.min.js`;
              script.onload = resolve;
              script.onerror = () => reject(new Error(`PDF.jsを読み込めませんでした: ${baseUrl}`));
              document.head.append(script);
            });
            if (!window.pdfjsLib) throw new Error("PDF.jsを初期化できませんでした");
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${baseUrl}/pdf.worker.min.js`;
            return window.pdfjsLib;
          } catch (error) {
            lastError = error;
          }
        }
        throw lastError || new Error("PDF.jsを読み込めませんでした");
      })().catch(error => {
        libraryPromise = null;
        throw error;
      });
    }
    return libraryPromise;
  }

  function createButton(label, text, className = "button button-secondary") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = text;
    button.setAttribute("aria-label", label);
    return button;
  }

  async function mount(container, file, title, initialPage = 1) {
    const previous = activeViewers.get(container);
    if (previous) await previous.destroy();
    container.replaceChildren();
    const library = await loadLibrary();
    const loadingTask = library.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    const pdf = await loadingTask.promise;
    const toolbar = document.createElement("div");
    toolbar.className = "pdf-viewer-toolbar";
    const previousPage = createButton("前のページ", "前へ");
    const pageInput = document.createElement("input");
    pageInput.type = "number";
    pageInput.min = "1";
    pageInput.max = String(pdf.numPages);
    pageInput.value = String(Math.min(Math.max(initialPage, 1), pdf.numPages));
    pageInput.setAttribute("aria-label", "ページ番号");
    const pageCount = document.createElement("span");
    pageCount.textContent = `/ ${pdf.numPages} ページ`;
    const nextPage = createButton("次のページ", "次へ");
    const zoomOut = createButton("縮小", "−");
    const zoomIn = createButton("拡大", "＋");
    const canvas = document.createElement("canvas");
    canvas.className = "pdf-viewer-canvas";
    canvas.setAttribute("aria-label", `${title}のPDFページ`);
    const stage = document.createElement("div");
    stage.className = "pdf-viewer-stage";
    stage.append(canvas);
    toolbar.append(previousPage, pageInput, pageCount, nextPage, zoomOut, zoomIn);
    container.replaceChildren(toolbar, stage);

    let scale = 1;
    let renderTask;
    let destroyed = false;
    const viewer = {
      async render() {
        if (destroyed) return;
        const pageNumber = Math.min(Math.max(Number(pageInput.value) || 1, 1), pdf.numPages);
        pageInput.value = String(pageNumber);
        pageInput.disabled = true;
        previousPage.disabled = true;
        nextPage.disabled = true;
        if (renderTask) renderTask.cancel();
        try {
          const page = await pdf.getPage(pageNumber);
          if (destroyed) return;
          const availableWidth = Math.max(stage.clientWidth - 24, 280);
          const baseViewport = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({
            scale: Math.min(Math.max(availableWidth / baseViewport.width, 0.5), 2) * scale
          });
          const ratio = window.devicePixelRatio || 1;
          canvas.width = Math.floor(viewport.width * ratio);
          canvas.height = Math.floor(viewport.height * ratio);
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;
          const context = canvas.getContext("2d");
          context.setTransform(ratio, 0, 0, ratio, 0, 0);
          renderTask = page.render({ canvasContext: context, viewport });
          await renderTask.promise;
          page.cleanup();
        } catch (error) {
          if (error.name !== "RenderingCancelledException") throw error;
        } finally {
          pageInput.disabled = false;
          previousPage.disabled = Number(pageInput.value) <= 1;
          nextPage.disabled = Number(pageInput.value) >= pdf.numPages;
        }
      },
      async destroy() {
        destroyed = true;
        if (renderTask) renderTask.cancel();
        await loadingTask.destroy();
      }
    };
    activeViewers.set(container, viewer);
    previousPage.addEventListener("click", () => {
      pageInput.value = String(Math.max(1, Number(pageInput.value) - 1));
      viewer.render().catch(showRenderError);
    });
    nextPage.addEventListener("click", () => {
      pageInput.value = String(Math.min(pdf.numPages, Number(pageInput.value) + 1));
      viewer.render().catch(showRenderError);
    });
    pageInput.addEventListener("change", () => viewer.render().catch(showRenderError));
    zoomOut.addEventListener("click", () => {
      scale = Math.max(0.6, scale - 0.2);
      viewer.render().catch(showRenderError);
    });
    zoomIn.addEventListener("click", () => {
      scale = Math.min(2.4, scale + 0.2);
      viewer.render().catch(showRenderError);
    });
    await viewer.render();
    return viewer;
  }

  function showRenderError(error) {
    console.error("PDFを表示できませんでした", error);
  }

  function open(file, title, page = 1, fileType = "pdf") {
    const dialog = document.createElement("dialog");
    dialog.className = "pdf-viewer-dialog";
    const header = document.createElement("div");
    header.className = "pdf-viewer-dialog-header";
    const heading = document.createElement("h2");
    heading.textContent = title;
    const close = createButton("閉じる", "閉じる", "text-button");
    header.append(heading, close);
    const container = document.createElement("div");
    container.className = "pdf-dialog-viewer";
    dialog.append(header, container);
    document.body.append(dialog);

    close.addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", event => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener("close", () => {
      const viewer = activeViewers.get(container);
      if (viewer) viewer.destroy().catch(showRenderError);
      dialog.remove();
    }, { once: true });
    dialog.showModal();
    if (fileType === "text" || file.type.startsWith("text/") || /\.(txt|md)$/i.test(file.name || "")) {
      const text = document.createElement("pre");
      text.className = "textbook-text";
      container.replaceChildren(text);
      file.text().then(value => {
        text.textContent = value;
      }).catch(error => {
        console.error("テキストを表示できませんでした", error);
        text.textContent = "テキストを表示できませんでした。ファイル形式を確認してください。";
      });
      return;
    }
    mount(container, file, title, page).catch(error => {
      console.error("PDFを表示できませんでした", error);
      const message = document.createElement("p");
      message.className = "empty-state";
      message.textContent = "PDFを表示できませんでした。インターネット接続またはPDFファイルを確認してください。";
      container.replaceChildren(message);
    });
  }

  async function clear(container) {
    const viewer = activeViewers.get(container);
    if (viewer) {
      await viewer.destroy();
      activeViewers.delete(container);
    }
    container.replaceChildren();
  }

  window.PdfDocumentViewer = { loadLibrary, mount, open, clear };
})();

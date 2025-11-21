"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };

  // src/app/github/filenames.ts
  var DEFAULT_GITHUB_FILENAME = "tokens.json";
  var INVALID_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001F]/;
  var MAX_FILENAME_LENGTH = 128;
  function validateGithubFilename(raw) {
    const initial = typeof raw === "string" ? raw : DEFAULT_GITHUB_FILENAME;
    const trimmed = initial.trim();
    if (!trimmed) {
      return {
        ok: false,
        message: "GitHub: Enter a filename (e.g., tokens.json)."
      };
    }
    if (trimmed === "." || trimmed === "..") {
      return {
        ok: false,
        message: 'GitHub: Filename cannot be "." or "..".'
      };
    }
    if (trimmed.length > MAX_FILENAME_LENGTH) {
      return {
        ok: false,
        message: `GitHub: Filename must be ${MAX_FILENAME_LENGTH} characters or fewer.`
      };
    }
    if (INVALID_FILENAME_CHARS.test(trimmed)) {
      return {
        ok: false,
        message: 'GitHub: Filename contains unsupported characters like / \\ : * ? " < > |.'
      };
    }
    if (!/\.json$/i.test(trimmed)) {
      return { ok: false, message: "GitHub: Filename must end with .json." };
    }
    return { ok: true, filename: trimmed };
  }

  // src/app/github/ui.ts
  var GH_MASK = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";
  var BRANCH_TTL_MS = 6e4;
  function createGithubUi(deps) {
    let doc = null;
    let win = null;
    let ghTokenInput = null;
    let ghRememberChk = null;
    let ghConnectBtn = null;
    let ghVerifyBtn = null;
    let ghRepoSelect = null;
    let ghLogoutBtn = null;
    let ghBranchInput = null;
    let ghBranchToggleBtn = null;
    let ghBranchMenu = null;
    let ghBranchCountEl = null;
    let ghBranchRefreshBtn = null;
    let ghNewBranchBtn = null;
    let ghNewBranchRow = null;
    let ghNewBranchName = null;
    let ghCreateBranchConfirmBtn = null;
    let ghCancelBranchBtn = null;
    let ghFolderInput = null;
    let ghFolderDisplay = null;
    let ghPickFolderBtn = null;
    let ghFilenameInput = null;
    let ghFilenameErrorEl = null;
    let ghCollectionsRefreshing = false;
    let ghCommitMsgInput = null;
    let ghExportAndCommitBtn = null;
    let ghCreatePrChk = null;
    let ghPrOptionsEl = null;
    let ghPrTitleInput = null;
    let ghPrBodyInput = null;
    let ghFetchPathInput = null;
    let ghFetchTokensBtn = null;
    let ghScopeSelected = null;
    let ghScopeAll = null;
    let ghScopeTypography = null;
    let styleDictionaryCheckbox = null;
    let flatTokensCheckbox = null;
    let ghImportStatusEl = null;
    let ghAuthStatusEl = null;
    let ghTokenMetaEl = null;
    let folderPickerOverlay = null;
    let folderPickerTitleEl = null;
    let folderPickerPathInput = null;
    let folderPickerUseBtn = null;
    let folderPickerListEl = null;
    let folderPickerCancelBtn = null;
    let folderPickerIsOpen = false;
    let folderPickerCurrentPath = "";
    let folderPickerLastFocus = null;
    let folderPickerRefreshNonce = 0;
    const folderListWaiters = [];
    const folderCreateWaiters = [];
    let ghIsAuthed = false;
    let ghTokenExpiresAt = null;
    let ghRememberPref = true;
    let filenameValidation = validateGithubFilename(
      DEFAULT_GITHUB_FILENAME
    );
    let currentOwner = "";
    let currentRepo = "";
    let desiredBranch = null;
    let defaultBranchFromApi = void 0;
    let loadedPages = 0;
    let hasMorePages = false;
    let isFetchingBranches = false;
    let lastBranchesFetchedAtMs = 0;
    let allBranches = [];
    let filteredBranches = [];
    let renderCount = 0;
    let branchMenuVisible = false;
    let branchHighlightIndex = -1;
    const RENDER_STEP = 200;
    const BRANCH_INPUT_PLACEHOLDER = "Search branches\u2026 (press Enter to refresh)";
    const GH_FOLDER_PLACEHOLDER = "Path in repository\u2026";
    let branchLastQuery = "";
    let branchInputPristine = true;
    let ghImportInFlight = false;
    let lastImportTarget = null;
    const IMPORT_PROMPT_SELECT = "Select a repository and branch to enable imports.";
    const IMPORT_PROMPT_BRANCH = "Pick a branch to import from.";
    const IMPORT_PROMPT_PATH = "Enter the path to a DTCG token file, then press Import.";
    let currentImportStatus = "idle";
    function setImportStatus(kind, message) {
      if (!ghImportStatusEl) return;
      currentImportStatus = kind;
      ghImportStatusEl.textContent = message;
      ghImportStatusEl.classList.remove(
        "gh-import-status--ready",
        "gh-import-status--progress",
        "gh-import-status--success",
        "gh-import-status--error"
      );
      if (kind === "ready")
        ghImportStatusEl.classList.add("gh-import-status--ready");
      else if (kind === "progress")
        ghImportStatusEl.classList.add("gh-import-status--progress");
      else if (kind === "success")
        ghImportStatusEl.classList.add("gh-import-status--success");
      else if (kind === "error")
        ghImportStatusEl.classList.add("gh-import-status--error");
    }
    function pickCollectionSelect() {
      return deps.getCollectionSelect();
    }
    function pickModeSelect() {
      return deps.getModeSelect();
    }
    function pickAllowHexCheckbox() {
      return deps.getAllowHexCheckbox();
    }
    function pickStyleDictionaryCheckbox() {
      if (!styleDictionaryCheckbox)
        styleDictionaryCheckbox = deps.getStyleDictionaryCheckbox();
      return styleDictionaryCheckbox;
    }
    function pickFlatTokensCheckbox() {
      if (!flatTokensCheckbox)
        flatTokensCheckbox = deps.getFlatTokensCheckbox();
      return flatTokensCheckbox;
    }
    function findTokenInput() {
      if (!doc) return null;
      return doc.getElementById(
        "githubTokenInput"
      ) || doc.getElementById("ghTokenInput") || doc.getElementById("githubPatInput") || doc.querySelector(
        'input[name="githubToken"]'
      ) || doc.querySelector(
        'input[type="password"]'
      );
    }
    function readPatFromUi() {
      if (!ghTokenInput) ghTokenInput = findTokenInput();
      if (!ghTokenInput) return "";
      if (ghTokenInput.getAttribute("data-filled") === "1") return GH_MASK;
      return (ghTokenInput.value || "").trim();
    }
    function updateRememberPref(pref, persist = false) {
      const next = !!pref;
      ghRememberPref = next;
      if (ghRememberChk) {
        ghRememberChk.checked = ghRememberPref;
      }
      updateGhStatusUi();
      if (persist) {
        deps.postToPlugin({
          type: "SAVE_PREFS",
          payload: { githubRememberToken: ghRememberPref }
        });
      }
    }
    function ensureGhStatusElements() {
      if (!doc) return;
      if (!ghAuthStatusEl)
        ghAuthStatusEl = doc.getElementById("ghAuthStatus");
      if (!ghTokenMetaEl) ghTokenMetaEl = doc.getElementById("ghTokenMeta");
      if (!ghLogoutBtn)
        ghLogoutBtn = doc.getElementById(
          "ghLogoutBtn"
        );
    }
    function formatTimeLeft(expInput) {
      const exp = typeof expInput === "number" ? expInput : Date.parse(expInput);
      if (!isFinite(exp)) return "expiration: unknown";
      const now = Date.now();
      const ms = exp - now;
      if (ms <= 0) return "expired";
      const days = Math.floor(ms / (24 * 60 * 60 * 1e3));
      const hours = Math.floor(
        ms % (24 * 60 * 60 * 1e3) / (60 * 60 * 1e3)
      );
      if (days > 0) return `${days}d ${hours}h left`;
      const mins = Math.floor(ms % (60 * 60 * 1e3) / (60 * 1e3));
      if (hours > 0) return `${hours}h ${mins}m left`;
      const secs = Math.floor(ms % (60 * 1e3) / 1e3);
      if (mins > 0) return `${mins}m ${secs}s left`;
      return `${secs}s left`;
    }
    function setPatFieldObfuscated(filled) {
      if (!ghTokenInput) ghTokenInput = findTokenInput();
      if (!ghTokenInput) return;
      ghTokenInput.type = "password";
      if (filled) {
        ghTokenInput.value = GH_MASK;
        ghTokenInput.setAttribute("data-filled", "1");
      } else {
        ghTokenInput.value = "";
        ghTokenInput.removeAttribute("data-filled");
      }
    }
    function updateGhStatusUi() {
      ensureGhStatusElements();
      if (ghAuthStatusEl) {
        ghAuthStatusEl.textContent = ghIsAuthed ? "GitHub: authenticated." : "GitHub: not authenticated.";
      }
      if (ghTokenMetaEl) {
        const rememberTxt = ghRememberPref ? "Remember me: on" : "Remember me: off";
        const expTxt = ghTokenExpiresAt ? `Token ${formatTimeLeft(ghTokenExpiresAt)}` : "Token expiration: unknown";
        ghTokenMetaEl.textContent = `${expTxt} \u2022 ${rememberTxt}`;
      }
      if (ghTokenInput) {
        ghTokenInput.oninput = () => {
          if (ghTokenInput && ghTokenInput.getAttribute("data-filled") === "1") {
            ghTokenInput.removeAttribute("data-filled");
          }
          if (ghConnectBtn) ghConnectBtn.disabled = false;
        };
      }
      if (ghConnectBtn && ghTokenInput) {
        const isMasked = ghTokenInput.getAttribute("data-filled") === "1";
        ghConnectBtn.disabled = ghIsAuthed && isMasked;
      }
      if (ghLogoutBtn) {
        ghLogoutBtn.disabled = !ghIsAuthed;
      }
      if (ghRememberChk) {
        ghRememberChk.checked = ghRememberPref;
      }
    }
    function showNewBranchRow(show) {
      if (!ghNewBranchRow) return;
      ghNewBranchRow.style.display = show ? "flex" : "none";
      if (show && ghNewBranchName) {
        if (!ghNewBranchName.value) {
          ghNewBranchName.value = `tokens/update-${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
        }
        ghNewBranchName.focus();
        ghNewBranchName.select();
      }
    }
    function isNewBranchRowVisible() {
      if (!ghNewBranchRow) return false;
      return ghNewBranchRow.style.display !== "none";
    }
    function cancelNewBranchFlow(refocusBtn) {
      showNewBranchRow(false);
      if (ghNewBranchName) ghNewBranchName.value = "";
      if (refocusBtn && ghNewBranchBtn) ghNewBranchBtn.focus();
    }
    function requestNewBranchCreation() {
      if (!ghCreateBranchConfirmBtn || ghCreateBranchConfirmBtn.disabled)
        return;
      if (!currentOwner || !currentRepo) {
        deps.log("Pick a repository before creating a branch.");
        return;
      }
      const baseBranch = defaultBranchFromApi || "";
      if (!baseBranch) {
        deps.log(
          "GitHub: Unable to determine the repository default branch. Refresh branches first."
        );
        return;
      }
      const newBranch = ((ghNewBranchName == null ? void 0 : ghNewBranchName.value) || "").trim();
      if (!newBranch) {
        deps.log("Enter a branch name to create.");
        if (ghNewBranchName) ghNewBranchName.focus();
        return;
      }
      if (newBranch === baseBranch) {
        deps.log(
          "Enter a branch name that differs from the source branch."
        );
        if (ghNewBranchName) ghNewBranchName.focus();
        return;
      }
      ghCreateBranchConfirmBtn.disabled = true;
      deps.log(`GitHub: creating ${newBranch} from ${baseBranch}\u2026`);
      deps.postToPlugin({
        type: "GITHUB_CREATE_BRANCH",
        payload: {
          owner: currentOwner,
          repo: currentRepo,
          baseBranch,
          newBranch
        }
      });
    }
    function revalidateBranchesIfStale(forceLog = false) {
      if (!ghRepoSelect || !ghBranchInput) return;
      if (!currentOwner || !currentRepo) return;
      const stale = Date.now() - lastBranchesFetchedAtMs > BRANCH_TTL_MS;
      if (!stale) {
        if (forceLog)
          deps.log("Branches are up to date (no refresh needed).");
        return;
      }
      desiredBranch = desiredBranch || null;
      defaultBranchFromApi = void 0;
      loadedPages = 0;
      hasMorePages = false;
      isFetchingBranches = true;
      allBranches = [];
      filteredBranches = [];
      renderCount = 0;
      setBranchDisabled(true, "Refreshing branches\u2026");
      updateBranchCount();
      if (ghBranchInput) {
        ghBranchInput.value = "";
        branchLastQuery = "";
        branchInputPristine = true;
      }
      deps.log("Refreshing branches\u2026");
      deps.postToPlugin({
        type: "GITHUB_FETCH_BRANCHES",
        payload: { owner: currentOwner, repo: currentRepo, page: 1 }
      });
    }
    function setBranchDisabled(disabled, placeholder) {
      const nextPlaceholder = placeholder !== void 0 ? placeholder : BRANCH_INPUT_PLACEHOLDER;
      if (ghBranchInput) {
        ghBranchInput.disabled = disabled;
        ghBranchInput.placeholder = nextPlaceholder;
        if (disabled) {
          ghBranchInput.value = "";
          branchLastQuery = "";
          branchInputPristine = true;
        }
      }
      if (ghBranchToggleBtn) {
        ghBranchToggleBtn.disabled = disabled;
        ghBranchToggleBtn.setAttribute("aria-expanded", "false");
      }
      if (disabled) closeBranchMenu();
    }
    function updateBranchCount() {
      if (!ghBranchCountEl) return;
      const total = allBranches.length;
      const showing = filteredBranches.length;
      ghBranchCountEl.textContent = `${showing} / ${total}${hasMorePages ? " +" : ""}`;
    }
    function getBranchMenuItems() {
      if (!ghBranchMenu) return [];
      const items = [];
      let node = ghBranchMenu.firstElementChild;
      while (node) {
        if (node instanceof HTMLLIElement) items.push(node);
        node = node.nextElementSibling;
      }
      return items;
    }
    function setBranchHighlight(index, scrollIntoView) {
      const items = getBranchMenuItems();
      branchHighlightIndex = index;
      for (let i = 0; i < items.length; i++) {
        if (i === branchHighlightIndex)
          items[i].setAttribute("data-active", "1");
        else items[i].removeAttribute("data-active");
      }
      if (scrollIntoView && branchHighlightIndex >= 0 && branchHighlightIndex < items.length) {
        try {
          items[branchHighlightIndex].scrollIntoView({
            block: "nearest"
          });
        } catch (e) {
        }
      }
    }
    function findNextSelectable(startIndex, delta, items) {
      if (!items.length) return -1;
      let index = startIndex;
      for (let i = 0; i < items.length; i++) {
        index += delta;
        if (index < 0) index = items.length - 1;
        else if (index >= items.length) index = 0;
        const item = items[index];
        if (!item) continue;
        if (item.dataset.selectable === "1" && item.getAttribute("aria-disabled") !== "true")
          return index;
      }
      return -1;
    }
    function moveBranchHighlight(delta) {
      const items = getBranchMenuItems();
      if (!items.length) {
        setBranchHighlight(-1, false);
        return;
      }
      const next = findNextSelectable(branchHighlightIndex, delta, items);
      if (next >= 0) setBranchHighlight(next, true);
    }
    function syncBranchHighlightAfterRender() {
      const items = getBranchMenuItems();
      if (!branchMenuVisible) {
        setBranchHighlight(-1, false);
        return;
      }
      if (!items.length) {
        setBranchHighlight(-1, false);
        return;
      }
      if (branchHighlightIndex >= 0 && branchHighlightIndex < items.length) {
        const current = items[branchHighlightIndex];
        if (current && current.dataset.selectable === "1" && current.getAttribute("aria-disabled") !== "true") {
          setBranchHighlight(branchHighlightIndex, false);
          return;
        }
      }
      const first = findNextSelectable(-1, 1, items);
      setBranchHighlight(first, false);
    }
    function setBranchMenuVisible(show) {
      if (!ghBranchMenu) {
        branchMenuVisible = false;
        branchHighlightIndex = -1;
        return;
      }
      if (show && ghBranchInput && ghBranchInput.disabled) show = false;
      branchMenuVisible = show;
      if (branchMenuVisible) {
        ghBranchMenu.hidden = false;
        ghBranchMenu.setAttribute("data-open", "1");
        if (ghBranchToggleBtn)
          ghBranchToggleBtn.setAttribute("aria-expanded", "true");
        if (ghBranchInput)
          ghBranchInput.setAttribute("aria-expanded", "true");
      } else {
        ghBranchMenu.hidden = true;
        ghBranchMenu.removeAttribute("data-open");
        if (ghBranchToggleBtn)
          ghBranchToggleBtn.setAttribute("aria-expanded", "false");
        if (ghBranchInput)
          ghBranchInput.setAttribute("aria-expanded", "false");
        setBranchHighlight(-1, false);
      }
    }
    function openBranchMenu() {
      if (!ghBranchMenu) return;
      if (!branchMenuVisible) {
        if (!ghBranchMenu.childElementCount) renderOptions();
        setBranchMenuVisible(true);
      }
      syncBranchHighlightAfterRender();
    }
    function closeBranchMenu() {
      setBranchMenuVisible(false);
    }
    function renderOptions() {
      if (!ghBranchMenu) return;
      while (ghBranchMenu.firstChild)
        ghBranchMenu.removeChild(ghBranchMenu.firstChild);
      const slice = filteredBranches.slice(0, renderCount);
      if (slice.length > 0) {
        for (let i = 0; i < slice.length; i++) {
          const name = slice[i];
          const item = doc.createElement("li");
          item.className = "gh-branch-item";
          item.dataset.value = name;
          item.dataset.selectable = "1";
          item.setAttribute("role", "option");
          item.textContent = name;
          if (i === branchHighlightIndex)
            item.setAttribute("data-active", "1");
          ghBranchMenu.appendChild(item);
        }
      } else {
        const empty = doc.createElement("li");
        empty.className = "gh-branch-item gh-branch-item-empty";
        empty.setAttribute("aria-disabled", "true");
        empty.dataset.selectable = "0";
        empty.textContent = allBranches.length ? "No matching branches" : "No branches loaded yet";
        ghBranchMenu.appendChild(empty);
      }
      if (filteredBranches.length > renderCount) {
        const more = doc.createElement("li");
        more.className = "gh-branch-item gh-branch-item-action";
        more.dataset.value = "__more__";
        more.dataset.selectable = "1";
        more.textContent = `Load more\u2026 (${filteredBranches.length - renderCount} more)`;
        ghBranchMenu.appendChild(more);
      } else if (hasMorePages) {
        const fetch = doc.createElement("li");
        fetch.className = "gh-branch-item gh-branch-item-action";
        fetch.dataset.value = "__fetch__";
        fetch.dataset.selectable = "1";
        fetch.textContent = "Load next page\u2026";
        ghBranchMenu.appendChild(fetch);
      }
      if (ghBranchInput) {
        const want = desiredBranch || defaultBranchFromApi || "";
        if (!ghBranchInput.value && want && branchInputPristine) {
          ghBranchInput.value = want;
          branchLastQuery = want;
        }
      }
      if (branchMenuVisible) {
        syncBranchHighlightAfterRender();
      }
    }
    function applyBranchFilter() {
      const rawInput = ((ghBranchInput == null ? void 0 : ghBranchInput.value) || "").trim();
      const raw = rawInput === "__more__" || rawInput === "__fetch__" ? branchLastQuery.trim() : rawInput;
      const q = raw.toLowerCase();
      const isSelected = !!desiredBranch && raw === desiredBranch;
      const isDefaultShown = !desiredBranch && !!defaultBranchFromApi && raw === defaultBranchFromApi;
      const effectiveQuery = isSelected || isDefaultShown ? "" : q;
      filteredBranches = effectiveQuery ? allBranches.filter(
        (n) => n.toLowerCase().includes(effectiveQuery)
      ) : [...allBranches];
      renderCount = Math.min(RENDER_STEP, filteredBranches.length);
      renderOptions();
      updateBranchCount();
      if (!branchMenuVisible && ghBranchInput && !ghBranchInput.disabled) {
        const isFocused = !!doc && doc.activeElement === ghBranchInput;
        if (isFocused) {
          setBranchMenuVisible(true);
          syncBranchHighlightAfterRender();
        }
      }
    }
    function processBranchSelection(rawValue, fromMenu) {
      const value = (rawValue || "").trim();
      if (!ghBranchInput) return "noop";
      if (value === "__more__") {
        renderCount = Math.min(
          renderCount + RENDER_STEP,
          filteredBranches.length
        );
        renderOptions();
        updateBranchCount();
        ghBranchInput.value = branchLastQuery;
        if (fromMenu && !branchMenuVisible) setBranchMenuVisible(true);
        return "more";
      }
      if (value === "__fetch__") {
        ensureNextPageIfNeeded();
        ghBranchInput.value = branchLastQuery;
        return "fetch";
      }
      if (!value) return "noop";
      desiredBranch = value;
      branchLastQuery = value;
      ghBranchInput.value = value;
      branchInputPristine = false;
      deps.postToPlugin({
        type: "GITHUB_SELECT_BRANCH",
        payload: { owner: currentOwner, repo: currentRepo, branch: value }
      });
      applyBranchFilter();
      updateFolderControlsEnabled();
      updateExportCommitEnabled();
      updateFetchButtonEnabled();
      return "selected";
    }
    function ensureNextPageIfNeeded() {
      if (!ghBranchInput || !ghRepoSelect) return;
      if (!hasMorePages || isFetchingBranches) return;
      if (!currentOwner || !currentRepo) return;
      isFetchingBranches = true;
      deps.postToPlugin({
        type: "GITHUB_FETCH_BRANCHES",
        payload: {
          owner: currentOwner,
          repo: currentRepo,
          page: loadedPages + 1
        }
      });
    }
    function normalizeFolderInput(raw) {
      const trimmed = raw.trim();
      if (!trimmed) return { display: "", payload: "" };
      if (trimmed === "/" || trimmed === "./" || trimmed === ".") {
        return { display: "/", payload: "/" };
      }
      const collapsed = trimmed.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
      const stripped = collapsed.replace(/^\/+/, "").replace(/\/+$/, "");
      if (!stripped) return { display: "/", payload: "/" };
      return { display: stripped + "/", payload: stripped };
    }
    function normalizeFolderPickerPath(raw) {
      const trimmed = (raw || "").trim();
      if (!trimmed || trimmed === "/" || trimmed === "./" || trimmed === ".")
        return "";
      const collapsed = trimmed.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
      return collapsed.replace(/^\/+/, "").replace(/\/+$/, "");
    }
    function setGhFolderDisplay(display) {
      if (ghFolderInput) ghFolderInput.value = display || "";
      if (!ghFolderDisplay) return;
      if (display) {
        ghFolderDisplay.textContent = display;
        ghFolderDisplay.classList.remove("is-placeholder");
      } else {
        ghFolderDisplay.textContent = GH_FOLDER_PLACEHOLDER;
        ghFolderDisplay.classList.add("is-placeholder");
      }
    }
    function setFilenameError(message) {
      if (!ghFilenameErrorEl) return;
      if (message) {
        ghFilenameErrorEl.textContent = message;
        ghFilenameErrorEl.hidden = false;
      } else {
        ghFilenameErrorEl.textContent = "";
        ghFilenameErrorEl.hidden = true;
      }
    }
    function refreshFilenameValidation() {
      const raw = ghFilenameInput ? ghFilenameInput.value : "";
      const result = validateGithubFilename(raw || DEFAULT_GITHUB_FILENAME);
      filenameValidation = result;
      if (result.ok) setFilenameError(null);
      else setFilenameError(result.message);
    }
    function formatDestinationForLog(folderRaw, filename) {
      const normalized = normalizeFolderInput(folderRaw || "");
      const folderDisplay = normalized.display || "/";
      const base = folderDisplay || "/";
      const name = filename && filename.trim() ? filename.trim() : "(file)";
      const joiner = base.endsWith("/") ? "" : "/";
      return `${base}${joiner}${name}`;
    }
    function listDir(path) {
      return new Promise((resolve) => {
        const req = { path: path.replace(/^\/+|\/+$/g, "") };
        folderListWaiters.push({
          path: req.path,
          resolve: (v) => resolve(v),
          reject: (v) => resolve(v)
        });
        deps.postToPlugin({
          type: "GITHUB_FOLDER_LIST",
          payload: {
            owner: currentOwner,
            repo: currentRepo,
            branch: getCurrentBranch(),
            path: req.path
          }
        });
      });
    }
    function openFolderPicker() {
      if (!currentOwner || !currentRepo) {
        deps.log("Pick a repository first.");
        return;
      }
      const ref = getCurrentBranch();
      if (!ref) {
        deps.log("Pick a branch first.");
        return;
      }
      if (!(folderPickerOverlay && folderPickerTitleEl && folderPickerPathInput && folderPickerListEl)) {
        deps.log("Folder picker UI is unavailable.");
        return;
      }
      folderPickerLastFocus = doc && doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
      folderPickerOverlay.hidden = false;
      folderPickerOverlay.classList.add("is-open");
      folderPickerOverlay.setAttribute("aria-hidden", "false");
      folderPickerIsOpen = true;
      updateFolderPickerTitle(ref);
      const startNormalized = normalizeFolderInput(
        (ghFolderInput == null ? void 0 : ghFolderInput.value) || ""
      );
      const startPath = startNormalized.payload === "/" ? "" : startNormalized.payload;
      setFolderPickerPath(startPath, true);
      win == null ? void 0 : win.setTimeout(() => {
        folderPickerPathInput == null ? void 0 : folderPickerPathInput.focus();
        folderPickerPathInput == null ? void 0 : folderPickerPathInput.select();
      }, 0);
    }
    function closeFolderPicker() {
      if (!folderPickerOverlay) return;
      folderPickerOverlay.classList.remove("is-open");
      folderPickerOverlay.setAttribute("aria-hidden", "true");
      folderPickerOverlay.hidden = true;
      folderPickerIsOpen = false;
      folderPickerCurrentPath = "";
      folderPickerRefreshNonce++;
      if (folderPickerListEl) {
        folderPickerListEl.replaceChildren(
          createFolderPickerRow("Loading\u2026", {
            muted: true,
            disabled: true
          })
        );
      }
      if (folderPickerLastFocus && (doc == null ? void 0 : doc.contains(folderPickerLastFocus))) {
        folderPickerLastFocus.focus();
      }
      folderPickerLastFocus = null;
    }
    function createFolderPickerRow(label, options) {
      if (!doc) throw new Error("GitHub UI not attached");
      const btn = doc.createElement("button");
      btn.type = "button";
      btn.className = "folder-picker-row";
      btn.textContent = label;
      if (options == null ? void 0 : options.muted) btn.classList.add("is-muted");
      if (options == null ? void 0 : options.disabled) btn.disabled = true;
      if (options == null ? void 0 : options.onClick) {
        btn.addEventListener("click", (event) => {
          var _a;
          event.preventDefault();
          (_a = options.onClick) == null ? void 0 : _a.call(options);
        });
      }
      return btn;
    }
    function updateFolderPickerTitle(branch) {
      if (!folderPickerTitleEl) return;
      if (currentOwner && currentRepo) {
        folderPickerTitleEl.textContent = `${currentOwner}/${currentRepo} @ ${branch}`;
      } else {
        folderPickerTitleEl.textContent = "Select a repository first";
      }
    }
    function setFolderPickerPath(raw, refresh = true, syncInput = true) {
      const normalized = normalizeFolderPickerPath(raw);
      folderPickerCurrentPath = normalized;
      if (syncInput && folderPickerPathInput)
        folderPickerPathInput.value = normalized;
      if (refresh && folderPickerIsOpen) {
        void refreshFolderPickerList();
      }
    }
    async function refreshFolderPickerList() {
      if (!(folderPickerListEl && folderPickerIsOpen)) return;
      const listEl = folderPickerListEl;
      const requestId = ++folderPickerRefreshNonce;
      listEl.replaceChildren(
        createFolderPickerRow("Loading\u2026", { muted: true, disabled: true })
      );
      const path = folderPickerCurrentPath;
      const res = await listDir(path);
      if (requestId !== folderPickerRefreshNonce) return;
      if (!res.ok) {
        const status = typeof res.status === "number" ? res.status : 0;
        if (status === 404) {
          listEl.replaceChildren(
            createFolderPickerRow(
              "Folder not found. It will be created during export.",
              { muted: true, disabled: true }
            )
          );
          return;
        }
        if (status === 409) {
          listEl.replaceChildren(
            createFolderPickerRow(
              "Cannot open this path: an existing file blocks the folder.",
              { muted: true, disabled: true }
            )
          );
          return;
        }
        const message = res.message ? res.message : "failed to fetch";
        listEl.replaceChildren(
          createFolderPickerRow(`Error: ${message}`, {
            muted: true,
            disabled: true
          })
        );
        return;
      }
      const nodes = [];
      if (path) {
        nodes.push(
          createFolderPickerRow(".. (up one level)", {
            muted: true,
            onClick: () => {
              const parentParts = folderPickerCurrentPath.split("/").filter(Boolean);
              parentParts.pop();
              setFolderPickerPath(parentParts.join("/"));
            }
          })
        );
      }
      const entries = Array.isArray(res.entries) ? res.entries : [];
      const dirs = entries.filter((e) => e.type === "dir").sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      if (dirs.length === 0) {
        nodes.push(
          createFolderPickerRow("(no subfolders)", {
            muted: true,
            disabled: true
          })
        );
      } else {
        for (const d of dirs) {
          const name = d.name || "";
          nodes.push(
            createFolderPickerRow(`${name}/`, {
              onClick: () => {
                const next = folderPickerCurrentPath ? `${folderPickerCurrentPath}/${name}` : name;
                setFolderPickerPath(next);
              }
            })
          );
        }
      }
      listEl.replaceChildren(...nodes);
    }
    function handleFolderPickerKeydown(event) {
      if (!folderPickerIsOpen) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeFolderPicker();
      }
    }
    function populateGhRepos(list) {
      if (!ghRepoSelect) return;
      while (ghRepoSelect.options.length) ghRepoSelect.remove(0);
      for (const r of list) {
        const opt = doc.createElement("option");
        opt.value = r.full_name;
        opt.textContent = r.full_name;
        ghRepoSelect.appendChild(opt);
      }
      ghRepoSelect.disabled = list.length === 0;
      if (list.length > 0) {
        if (currentOwner && currentRepo) {
          const want = `${currentOwner}/${currentRepo}`;
          let matched = false;
          for (let i = 0; i < ghRepoSelect.options.length; i++) {
            if (ghRepoSelect.options[i].value === want) {
              ghRepoSelect.selectedIndex = i;
              matched = true;
              break;
            }
          }
          if (matched) {
            ghRepoSelect.dispatchEvent(
              new Event("change", { bubbles: true })
            );
          }
        } else {
          ghRepoSelect.selectedIndex = 0;
          ghRepoSelect.dispatchEvent(
            new Event("change", { bubbles: true })
          );
        }
      }
    }
    function getCurrentBranch() {
      if (desiredBranch) return desiredBranch;
      if (ghBranchInput && !ghBranchInput.disabled) {
        const raw = ghBranchInput.value.trim();
        if (raw && raw !== "__more__" && raw !== "__fetch__") {
          if (allBranches.includes(raw) || raw === defaultBranchFromApi)
            return raw;
        }
      }
      return defaultBranchFromApi || "";
    }
    function getPrBaseBranch() {
      return defaultBranchFromApi || "";
    }
    function persistGhState(partial) {
      deps.postToPlugin({ type: "GITHUB_SAVE_STATE", payload: partial });
    }
    function requestCollectionsRefresh() {
      if (ghCollectionsRefreshing) return;
      ghCollectionsRefreshing = true;
      deps.log("Refreshing Figma document state\u2026");
      deps.postToPlugin({ type: "FETCH_COLLECTIONS" });
      updateExportCommitEnabled();
    }
    function updateExportCommitEnabled() {
      const collectionSelect = pickCollectionSelect();
      const modeSelect = pickModeSelect();
      const hasRepo = !!(currentOwner && currentRepo);
      const br = getCurrentBranch();
      const commitMsg = ((ghCommitMsgInput == null ? void 0 : ghCommitMsgInput.value) || "").trim();
      const scopeAll = !!(ghScopeAll && ghScopeAll.checked);
      const scopeTypography = !!(ghScopeTypography && ghScopeTypography.checked);
      const folderRaw = ghFolderInput ? ghFolderInput.value.trim() : "";
      const hasFolder = normalizeFolderInput(folderRaw).display.length > 0;
      const hasFilename = filenameValidation.ok;
      const hasSelection = scopeAll || scopeTypography ? true : !!(collectionSelect && collectionSelect.value && modeSelect && modeSelect.value);
      let ready = !!(ghIsAuthed && hasRepo && br && commitMsg && hasSelection && hasFolder && hasFilename);
      if (ghCollectionsRefreshing) {
        ready = false;
      }
      if (ghCreatePrChk && ghCreatePrChk.checked) {
        const prBase = getPrBaseBranch();
        if (!prBase || prBase === br) {
          ready = false;
        }
      }
      if (ghExportAndCommitBtn) ghExportAndCommitBtn.disabled = !ready;
    }
    function updateFolderControlsEnabled() {
      const br = getCurrentBranch();
      const enable = !!(currentOwner && currentRepo && br);
      if (ghPickFolderBtn) ghPickFolderBtn.disabled = !enable;
      updateExportCommitEnabled();
      updateFetchButtonEnabled();
    }
    function updateFetchButtonEnabled() {
      const hasRepo = !!(ghIsAuthed && currentOwner && currentRepo);
      const branch = getCurrentBranch();
      const path = ((ghFetchPathInput == null ? void 0 : ghFetchPathInput.value) || "").trim();
      if (ghFetchPathInput)
        ghFetchPathInput.disabled = !(hasRepo && branch) || ghImportInFlight;
      if (ghFetchTokensBtn)
        ghFetchTokensBtn.disabled = ghImportInFlight || !(hasRepo && branch && path);
      if (ghImportInFlight) return;
      if (!hasRepo) {
        lastImportTarget = null;
        setImportStatus("idle", IMPORT_PROMPT_SELECT);
        return;
      }
      if (!branch) {
        lastImportTarget = null;
        setImportStatus("idle", IMPORT_PROMPT_BRANCH);
        return;
      }
      if (!path) {
        lastImportTarget = null;
        setImportStatus("idle", IMPORT_PROMPT_PATH);
        return;
      }
      if (currentImportStatus === "success" || currentImportStatus === "error") {
        if (!lastImportTarget || lastImportTarget.branch !== branch || lastImportTarget.path !== path) {
          currentImportStatus = "idle";
        }
      }
      if (currentImportStatus !== "success" && currentImportStatus !== "error") {
        setImportStatus("ready", `Ready to import from ${branch}.`);
      }
    }
    function attach(context) {
      doc = context.document;
      win = context.window;
      ghTokenInput = findTokenInput();
      ghRememberChk = doc.getElementById(
        "githubRememberChk"
      ) || doc.getElementById("ghRememberChk");
      ghConnectBtn = doc.getElementById(
        "githubConnectBtn"
      ) || doc.getElementById("ghConnectBtn");
      ghVerifyBtn = doc.getElementById(
        "githubVerifyBtn"
      ) || doc.getElementById("ghVerifyBtn");
      ghLogoutBtn = doc.getElementById(
        "ghLogoutBtn"
      );
      ghRepoSelect = doc.getElementById(
        "ghRepoSelect"
      );
      ghBranchInput = doc.getElementById(
        "ghBranchInput"
      );
      ghBranchToggleBtn = doc.getElementById(
        "ghBranchToggleBtn"
      );
      ghBranchMenu = doc.getElementById(
        "ghBranchMenu"
      );
      ghBranchCountEl = doc.getElementById("ghBranchCount");
      ghBranchRefreshBtn = doc.getElementById(
        "ghBranchRefreshBtn"
      );
      ghNewBranchBtn = doc.getElementById(
        "ghNewBranchBtn"
      );
      ghNewBranchRow = doc.getElementById("ghNewBranchRow");
      ghNewBranchName = doc.getElementById(
        "ghNewBranchName"
      );
      ghCreateBranchConfirmBtn = doc.getElementById(
        "ghCreateBranchConfirmBtn"
      );
      ghCancelBranchBtn = doc.getElementById(
        "ghCancelBranchBtn"
      );
      ghFolderInput = doc.getElementById(
        "ghFolderInput"
      );
      ghFolderDisplay = doc.getElementById("ghFolderDisplay");
      setGhFolderDisplay((ghFolderInput == null ? void 0 : ghFolderInput.value) || "");
      ghPickFolderBtn = doc.getElementById(
        "ghPickFolderBtn"
      );
      ghFilenameInput = doc.getElementById(
        "ghFilenameInput"
      );
      ghFilenameErrorEl = doc.getElementById("ghFilenameError");
      if (ghFilenameInput && !ghFilenameInput.value) {
        ghFilenameInput.value = DEFAULT_GITHUB_FILENAME;
      }
      refreshFilenameValidation();
      ghCommitMsgInput = doc.getElementById(
        "ghCommitMsgInput"
      );
      ghExportAndCommitBtn = doc.getElementById(
        "ghExportAndCommitBtn"
      );
      ghCreatePrChk = doc.getElementById(
        "ghCreatePrChk"
      );
      ghPrOptionsEl = doc.getElementById("ghPrOptions");
      ghPrTitleInput = doc.getElementById(
        "ghPrTitleInput"
      );
      ghPrBodyInput = doc.getElementById(
        "ghPrBodyInput"
      );
      ghFetchPathInput = doc.getElementById(
        "ghFetchPathInput"
      );
      ghFetchTokensBtn = doc.getElementById(
        "ghFetchTokensBtn"
      );
      ghScopeSelected = doc.getElementById(
        "ghScopeSelected"
      );
      ghScopeAll = doc.getElementById(
        "ghScopeAll"
      );
      ghScopeTypography = doc.getElementById(
        "ghScopeTypography"
      );
      ghImportStatusEl = doc.getElementById("ghImportStatus");
      if (ghBranchInput) {
        ghBranchInput.setAttribute("role", "combobox");
        ghBranchInput.setAttribute("aria-autocomplete", "list");
        ghBranchInput.setAttribute("aria-expanded", "false");
        ghBranchInput.setAttribute("aria-controls", "ghBranchMenu");
      }
      if (ghBranchToggleBtn)
        ghBranchToggleBtn.setAttribute("aria-expanded", "false");
      folderPickerOverlay = doc.getElementById("folderPickerOverlay");
      folderPickerTitleEl = doc.getElementById("folderPickerTitle");
      folderPickerPathInput = doc.getElementById(
        "folderPickerPath"
      );
      folderPickerUseBtn = doc.getElementById(
        "folderPickerUseBtn"
      );
      folderPickerListEl = doc.getElementById("folderPickerList");
      folderPickerCancelBtn = doc.getElementById(
        "folderPickerCancelBtn"
      );
      if (ghRememberChk) {
        ghRememberChk.checked = ghRememberPref;
        ghRememberChk.addEventListener("change", () => {
          updateRememberPref(!!ghRememberChk.checked, true);
        });
      }
      ensureGhStatusElements();
      if (ghConnectBtn)
        ghConnectBtn.addEventListener("click", onGitHubConnectClick);
      if (ghVerifyBtn)
        ghVerifyBtn.addEventListener("click", onGitHubVerifyClick);
      if (ghLogoutBtn)
        ghLogoutBtn.addEventListener("click", onGitHubLogoutClick);
      if (ghRepoSelect && ghBranchInput) {
        let lastRepoKey = "";
        ghRepoSelect.addEventListener("change", () => {
          const value = ghRepoSelect.value;
          if (!value) return;
          if (value === lastRepoKey) return;
          lastRepoKey = value;
          const parts = value.split("/");
          currentOwner = parts[0] || "";
          currentRepo = parts[1] || "";
          updateExportCommitEnabled();
          updateFetchButtonEnabled();
          lastBranchesFetchedAtMs = 0;
          deps.postToPlugin({
            type: "GITHUB_SELECT_REPO",
            payload: { owner: currentOwner, repo: currentRepo }
          });
          desiredBranch = null;
          defaultBranchFromApi = void 0;
          loadedPages = 0;
          hasMorePages = false;
          isFetchingBranches = false;
          allBranches = [];
          filteredBranches = [];
          renderCount = 0;
          if (ghBranchInput) {
            ghBranchInput.value = "";
            branchLastQuery = "";
            branchInputPristine = true;
          }
          if (ghBranchMenu)
            while (ghBranchMenu.firstChild)
              ghBranchMenu.removeChild(ghBranchMenu.firstChild);
          closeBranchMenu();
          setBranchDisabled(true, "Loading branches\u2026");
          updateBranchCount();
          updateFolderControlsEnabled();
          setGhFolderDisplay("");
          cancelNewBranchFlow(false);
          if (currentOwner && currentRepo) {
            deps.log(
              `GitHub: loading branches for ${currentOwner}/${currentRepo}\u2026`
            );
            isFetchingBranches = true;
            deps.postToPlugin({
              type: "GITHUB_FETCH_BRANCHES",
              payload: {
                owner: currentOwner,
                repo: currentRepo,
                page: 1
              }
            });
          }
          updateExportCommitEnabled();
        });
      }
      if (ghBranchInput) {
        let timeout;
        ghBranchInput.addEventListener("focus", () => {
          if (ghBranchInput.disabled) return;
          applyBranchFilter();
          openBranchMenu();
        });
        ghBranchInput.addEventListener("input", () => {
          if (timeout) win == null ? void 0 : win.clearTimeout(timeout);
          const value = ghBranchInput.value;
          if (value !== "__more__" && value !== "__fetch__") {
            branchLastQuery = value;
          }
          branchInputPristine = false;
          if (!branchMenuVisible) openBranchMenu();
          timeout = win == null ? void 0 : win.setTimeout(() => {
            applyBranchFilter();
          }, 120);
        });
        ghBranchInput.addEventListener("keydown", (e) => {
          if (e.key === "ArrowDown") {
            openBranchMenu();
            moveBranchHighlight(1);
            e.preventDefault();
            return;
          }
          if (e.key === "ArrowUp") {
            openBranchMenu();
            moveBranchHighlight(-1);
            e.preventDefault();
            return;
          }
          if (e.key === "Enter") {
            if (branchMenuVisible && branchHighlightIndex >= 0) {
              const items = getBranchMenuItems();
              const item = items[branchHighlightIndex];
              if (item && item.dataset.selectable === "1") {
                const value = item.getAttribute("data-value") || "";
                if (value) {
                  const result = processBranchSelection(
                    value,
                    true
                  );
                  if (result === "selected") closeBranchMenu();
                  else if (result === "more" || result === "fetch") {
                    syncBranchHighlightAfterRender();
                    openBranchMenu();
                  }
                }
              }
            } else {
              const result = processBranchSelection(
                ghBranchInput.value,
                false
              );
              if (result === "selected") closeBranchMenu();
              else if (result === "more" || result === "fetch")
                syncBranchHighlightAfterRender();
            }
            revalidateBranchesIfStale(true);
            e.preventDefault();
            return;
          }
          if (e.key === "Escape") {
            if (branchMenuVisible) {
              closeBranchMenu();
              e.preventDefault();
            }
          }
        });
        ghBranchInput.addEventListener("change", () => {
          const result = processBranchSelection(
            ghBranchInput.value,
            false
          );
          if (result === "selected") closeBranchMenu();
          else if (result === "more" || result === "fetch")
            syncBranchHighlightAfterRender();
        });
      }
      if (ghBranchToggleBtn) {
        ghBranchToggleBtn.addEventListener("click", () => {
          if (ghBranchToggleBtn.disabled) return;
          if (branchMenuVisible) {
            closeBranchMenu();
            return;
          }
          if (!ghBranchMenu || !ghBranchMenu.childElementCount)
            renderOptions();
          openBranchMenu();
          if (ghBranchInput && (doc == null ? void 0 : doc.activeElement) !== ghBranchInput)
            ghBranchInput.focus();
        });
      }
      if (ghBranchMenu) {
        ghBranchMenu.addEventListener("mousedown", (event) => {
          event.preventDefault();
        });
        ghBranchMenu.addEventListener("click", (event) => {
          const target = event.target;
          if (!target) return;
          const item = target.closest("li");
          if (!item || !(item instanceof HTMLLIElement)) return;
          if (item.getAttribute("aria-disabled") === "true") return;
          const value = item.getAttribute("data-value") || "";
          if (!value) return;
          const result = processBranchSelection(value, true);
          if (result === "selected") closeBranchMenu();
          else if (result === "more" || result === "fetch") {
            syncBranchHighlightAfterRender();
            openBranchMenu();
          }
          if (ghBranchInput) ghBranchInput.focus();
        });
      }
      if (doc) {
        doc.addEventListener("mousedown", (event) => {
          if (!branchMenuVisible) return;
          const target = event.target;
          if (!target) return;
          if (ghBranchMenu && ghBranchMenu.contains(target)) return;
          if (ghBranchInput && target === ghBranchInput) return;
          if (ghBranchToggleBtn && ghBranchToggleBtn.contains(target))
            return;
          closeBranchMenu();
        });
        doc.addEventListener("focusin", (event) => {
          if (!branchMenuVisible) return;
          const target = event.target;
          if (!target) {
            closeBranchMenu();
            return;
          }
          if (ghBranchMenu && ghBranchMenu.contains(target)) return;
          if (ghBranchInput && target === ghBranchInput) return;
          if (ghBranchToggleBtn && ghBranchToggleBtn.contains(target))
            return;
          closeBranchMenu();
        });
      }
      if (ghBranchRefreshBtn) {
        ghBranchRefreshBtn.addEventListener("click", () => {
          lastBranchesFetchedAtMs = 0;
          revalidateBranchesIfStale(true);
        });
      }
      if (ghNewBranchBtn) {
        ghNewBranchBtn.addEventListener("click", () => {
          if (ghNewBranchBtn.disabled) return;
          const next = !isNewBranchRowVisible();
          if (next) showNewBranchRow(true);
          else cancelNewBranchFlow(false);
        });
      }
      if (ghNewBranchName) {
        ghNewBranchName.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            requestNewBranchCreation();
          } else if (event.key === "Escape") {
            event.preventDefault();
            cancelNewBranchFlow(true);
          }
        });
      }
      if (ghCreateBranchConfirmBtn) {
        ghCreateBranchConfirmBtn.addEventListener("click", () => {
          requestNewBranchCreation();
        });
      }
      if (ghCancelBranchBtn) {
        ghCancelBranchBtn.addEventListener("click", () => {
          cancelNewBranchFlow(true);
        });
      }
      if (ghPickFolderBtn) {
        ghPickFolderBtn.addEventListener("click", openFolderPicker);
      }
      if (folderPickerOverlay) {
        folderPickerOverlay.addEventListener("click", (event) => {
          if (event.target === folderPickerOverlay) closeFolderPicker();
        });
      }
      if (folderPickerCancelBtn) {
        folderPickerCancelBtn.addEventListener(
          "click",
          () => closeFolderPicker()
        );
      }
      let folderPickerPathDebounce;
      if (folderPickerPathInput) {
        folderPickerPathInput.addEventListener("input", () => {
          if (folderPickerPathDebounce)
            win == null ? void 0 : win.clearTimeout(folderPickerPathDebounce);
          const value = folderPickerPathInput.value;
          folderPickerPathDebounce = win == null ? void 0 : win.setTimeout(() => {
            setFolderPickerPath(value, true, false);
          }, 120);
        });
        folderPickerPathInput.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            setFolderPickerPath(folderPickerPathInput.value);
          }
        });
        folderPickerPathInput.addEventListener("blur", () => {
          setFolderPickerPath(folderPickerPathInput.value);
        });
      }
      if (folderPickerUseBtn) {
        folderPickerUseBtn.addEventListener("click", () => {
          if (folderPickerPathInput) {
            setFolderPickerPath(folderPickerPathInput.value, false);
          }
          const selectionRaw = folderPickerCurrentPath ? `${folderPickerCurrentPath}/` : "/";
          const normalized = normalizeFolderInput(selectionRaw);
          setGhFolderDisplay(normalized.display);
          deps.postToPlugin({
            type: "GITHUB_SET_FOLDER",
            payload: {
              owner: currentOwner,
              repo: currentRepo,
              folder: normalized.payload
            }
          });
          persistGhState({ folder: normalized.payload });
          closeFolderPicker();
          deps.log(
            `Folder selected: ${normalized.display === "/" ? "(repo root)" : normalized.display}`
          );
          updateExportCommitEnabled();
          updateFetchButtonEnabled();
        });
      }
      if (ghCommitMsgInput) {
        ghCommitMsgInput.addEventListener("input", () => {
          updateExportCommitEnabled();
          persistGhState({
            commitMessage: ghCommitMsgInput.value || ""
          });
        });
      }
      if (ghFilenameInput) {
        ghFilenameInput.addEventListener("input", () => {
          refreshFilenameValidation();
          persistGhState({
            filename: (ghFilenameInput.value || "").trim()
          });
          updateExportCommitEnabled();
        });
        ghFilenameInput.addEventListener(
          "blur",
          () => refreshFilenameValidation()
        );
      }
      if (ghScopeSelected) {
        ghScopeSelected.addEventListener("change", () => {
          if ((ghScopeSelected == null ? void 0 : ghScopeSelected.checked) && ghPrOptionsEl) {
            ghPrOptionsEl.style.display = (ghCreatePrChk == null ? void 0 : ghCreatePrChk.checked) ? "flex" : "none";
          }
          if (ghScopeSelected.checked) {
            persistGhState({ scope: "selected" });
            requestCollectionsRefresh();
          }
          updateExportCommitEnabled();
        });
      }
      if (ghScopeAll) {
        ghScopeAll.addEventListener("change", () => {
          if (ghScopeAll.checked) {
            persistGhState({ scope: "all" });
            requestCollectionsRefresh();
          }
          updateExportCommitEnabled();
        });
      }
      if (ghScopeTypography) {
        ghScopeTypography.addEventListener("change", () => {
          if (ghScopeTypography.checked) {
            persistGhState({ scope: "typography" });
            requestCollectionsRefresh();
          }
          if (ghPrOptionsEl)
            ghPrOptionsEl.style.display = (ghCreatePrChk == null ? void 0 : ghCreatePrChk.checked) ? "flex" : "none";
          updateExportCommitEnabled();
        });
      }
      if (ghCreatePrChk) {
        ghCreatePrChk.addEventListener("change", () => {
          const on = !!ghCreatePrChk.checked;
          if (ghPrOptionsEl)
            ghPrOptionsEl.style.display = on ? "flex" : "none";
          const save = {
            createPr: on
          };
          if (on) save.prBase = getPrBaseBranch();
          persistGhState(save);
          updateExportCommitEnabled();
        });
      }
      if (ghPrTitleInput) {
        ghPrTitleInput.addEventListener("input", () => {
          persistGhState({ prTitle: ghPrTitleInput.value });
        });
      }
      if (ghPrBodyInput) {
        ghPrBodyInput.addEventListener("input", () => {
          persistGhState({ prBody: ghPrBodyInput.value });
        });
      }
      if (ghFetchPathInput)
        ghFetchPathInput.addEventListener(
          "input",
          updateFetchButtonEnabled
        );
      if (ghFetchTokensBtn) {
        ghFetchTokensBtn.addEventListener("click", () => {
          var _a;
          const branch = getCurrentBranch();
          const path = ((ghFetchPathInput == null ? void 0 : ghFetchPathInput.value) || "").trim().replace(/^\/+/, "");
          if (!currentOwner || !currentRepo) {
            deps.log("Pick a repository first.");
            return;
          }
          if (!branch) {
            deps.log("Pick a branch first.");
            return;
          }
          if (!path) {
            deps.log(
              "Enter a path to fetch (e.g., tokens/tokens.json)."
            );
            return;
          }
          ghImportInFlight = true;
          lastImportTarget = { branch, path };
          setImportStatus("progress", `Fetching ${path} from ${branch}\u2026`);
          updateFetchButtonEnabled();
          deps.log(
            `GitHub: fetching ${path} from ${currentOwner}/${currentRepo}@${branch}\u2026`
          );
          const allowHex = !!((_a = pickAllowHexCheckbox()) == null ? void 0 : _a.checked);
          const contexts = deps.getImportContexts();
          const payload = {
            type: "GITHUB_FETCH_TOKENS",
            payload: __spreadValues({
              owner: currentOwner,
              repo: currentRepo,
              branch,
              path,
              allowHexStrings: allowHex
            }, contexts.length > 0 ? { contexts } : {})
          };
          deps.postToPlugin(payload);
          if (contexts.length > 0) {
            deps.log(
              `GitHub: importing ${contexts.length} selected mode(s) based on current scope.`
            );
          }
        });
      }
      if (ghExportAndCommitBtn) {
        ghExportAndCommitBtn.addEventListener("click", () => {
          var _a, _b;
          const collectionSelect = pickCollectionSelect();
          const modeSelect = pickModeSelect();
          const scope = ghScopeAll && ghScopeAll.checked ? "all" : ghScopeTypography && ghScopeTypography.checked ? "typography" : "selected";
          const selectedCollection = collectionSelect ? collectionSelect.value || "" : "";
          const selectedMode = modeSelect ? modeSelect.value || "" : "";
          const commitMessage = ((ghCommitMsgInput == null ? void 0 : ghCommitMsgInput.value) || "Update tokens from Figma").trim();
          const normalizedFolder = normalizeFolderInput(
            (ghFolderInput == null ? void 0 : ghFolderInput.value) || ""
          );
          refreshFilenameValidation();
          if (scope === "selected") {
            if (!selectedCollection || !selectedMode) {
              deps.log(
                "Pick a collection and a mode before exporting."
              );
              if (!selectedCollection && collectionSelect)
                collectionSelect.focus();
              else if (!selectedMode && modeSelect)
                modeSelect.focus();
              updateExportCommitEnabled();
              return;
            }
          }
          if (!normalizedFolder.display) {
            deps.log("Pick a destination folder (e.g., tokens/).");
            ghPickFolderBtn == null ? void 0 : ghPickFolderBtn.focus();
            updateExportCommitEnabled();
            return;
          }
          if (!filenameValidation.ok) {
            deps.log(filenameValidation.message);
            ghFilenameInput == null ? void 0 : ghFilenameInput.focus();
            updateExportCommitEnabled();
            return;
          }
          const filenameToUse = filenameValidation.filename;
          setGhFolderDisplay(normalizedFolder.display);
          deps.postToPlugin({
            type: "GITHUB_SET_FOLDER",
            payload: {
              owner: currentOwner,
              repo: currentRepo,
              folder: normalizedFolder.payload
            }
          });
          persistGhState({
            folder: normalizedFolder.payload,
            filename: filenameToUse
          });
          const createPr = !!(ghCreatePrChk && ghCreatePrChk.checked);
          const payload = {
            type: "GITHUB_EXPORT_AND_COMMIT",
            payload: {
              owner: currentOwner,
              repo: currentRepo,
              branch: getCurrentBranch(),
              folder: normalizedFolder.payload,
              filename: filenameToUse,
              commitMessage,
              scope,
              styleDictionary: !!((_a = pickStyleDictionaryCheckbox()) == null ? void 0 : _a.checked),
              flatTokens: !!((_b = pickFlatTokensCheckbox()) == null ? void 0 : _b.checked),
              createPr
            }
          };
          if (selectedCollection)
            payload.payload.collection = selectedCollection;
          if (selectedMode) payload.payload.mode = selectedMode;
          if (createPr) {
            payload.payload.prBase = getPrBaseBranch();
            payload.payload.prTitle = ((ghPrTitleInput == null ? void 0 : ghPrTitleInput.value) || "").trim();
            payload.payload.prBody = (ghPrBodyInput == null ? void 0 : ghPrBodyInput.value) || "";
          }
          const scopeLabel = scope === "all" ? "all collections" : scope === "typography" ? "typography" : "selected mode";
          const summaryTarget = formatDestinationForLog(
            normalizedFolder.payload,
            filenameToUse
          );
          deps.log(
            `GitHub: Export summary \u2192 ${summaryTarget} (${scopeLabel})`
          );
          deps.log(
            createPr ? "Export, Commit & PR requested\u2026" : "Export & Commit requested\u2026"
          );
          deps.postToPlugin(payload);
        });
      }
      doc.addEventListener("keydown", handleFolderPickerKeydown);
      updateGhStatusUi();
      updateFolderControlsEnabled();
      updateExportCommitEnabled();
      updateFetchButtonEnabled();
    }
    function onGitHubConnectClick() {
      const tokenRaw = readPatFromUi();
      const isMasked = (ghTokenInput == null ? void 0 : ghTokenInput.getAttribute("data-filled")) === "1";
      if (ghIsAuthed && isMasked) return;
      if (!tokenRaw) {
        deps.log("GitHub: Paste a Personal Access Token first.");
        return;
      }
      const remember = !!(ghRememberChk && ghRememberChk.checked);
      deps.log("GitHub: Verifying token\u2026");
      deps.postToPlugin({
        type: "GITHUB_SET_TOKEN",
        payload: { token: tokenRaw, remember }
      });
    }
    function onGitHubVerifyClick() {
      onGitHubConnectClick();
    }
    function onGitHubLogoutClick() {
      deps.postToPlugin({ type: "GITHUB_FORGET_TOKEN" });
      ghIsAuthed = false;
      ghTokenExpiresAt = null;
      setPatFieldObfuscated(false);
      populateGhRepos([]);
      updateGhStatusUi();
      currentOwner = "";
      currentRepo = "";
      allBranches = [];
      filteredBranches = [];
      desiredBranch = null;
      defaultBranchFromApi = void 0;
      loadedPages = 0;
      hasMorePages = false;
      isFetchingBranches = false;
      if (ghBranchInput) {
        ghBranchInput.value = "";
        branchLastQuery = "";
        branchInputPristine = true;
      }
      if (ghBranchMenu)
        while (ghBranchMenu.firstChild)
          ghBranchMenu.removeChild(ghBranchMenu.firstChild);
      closeBranchMenu();
      setBranchDisabled(true, "Pick a repository first\u2026");
      updateBranchCount();
      updateFolderControlsEnabled();
      setGhFolderDisplay("");
      cancelNewBranchFlow(false);
      deps.log("GitHub: Logged out.");
    }
    function handleMessage(msg) {
      var _a, _b, _c;
      if (msg.type === "GITHUB_AUTH_RESULT") {
        const p = msg.payload || {};
        ghIsAuthed = !!p.ok;
        ghTokenExpiresAt = typeof p.exp !== "undefined" && p.exp !== null ? p.exp : typeof p.tokenExpiration !== "undefined" && p.tokenExpiration !== null ? p.tokenExpiration : null;
        if (typeof p.remember === "boolean") {
          updateRememberPref(p.remember, false);
        }
        if (ghIsAuthed) {
          setPatFieldObfuscated(true);
          const who = p.login || "unknown";
          const name = p.name ? ` (${p.name})` : "";
          deps.log(`GitHub: Authenticated as ${who}${name}.`);
        } else {
          setPatFieldObfuscated(false);
          const why = p.error ? `: ${p.error}` : ".";
          deps.log(`GitHub: Authentication failed${why}`);
        }
        updateGhStatusUi();
        updateExportCommitEnabled();
        updateFetchButtonEnabled();
        return true;
      }
      if (msg.type === "GITHUB_REPOS") {
        const repos = (_b = (_a = msg.payload) == null ? void 0 : _a.repos) != null ? _b : [];
        populateGhRepos(repos);
        deps.log(`GitHub: Repository list updated (${repos.length}).`);
        return true;
      }
      if (msg.type === "GITHUB_RESTORE_SELECTED") {
        const p = msg.payload || {};
        currentOwner = typeof p.owner === "string" ? p.owner : "";
        currentRepo = typeof p.repo === "string" ? p.repo : "";
        desiredBranch = typeof p.branch === "string" ? p.branch : null;
        if (typeof p.folder === "string") {
          const normalized = normalizeFolderInput(p.folder);
          setGhFolderDisplay(normalized.display);
        }
        if (ghFilenameInput) {
          if (typeof p.filename === "string" && p.filename.trim()) {
            ghFilenameInput.value = p.filename;
          } else if (!ghFilenameInput.value) {
            ghFilenameInput.value = DEFAULT_GITHUB_FILENAME;
          }
        }
        refreshFilenameValidation();
        if (typeof p.commitMessage === "string" && ghCommitMsgInput) {
          ghCommitMsgInput.value = p.commitMessage;
        }
        if (typeof p.scope === "string") {
          if (p.scope === "all" && ghScopeAll) ghScopeAll.checked = true;
          if (p.scope === "selected" && ghScopeSelected)
            ghScopeSelected.checked = true;
          if (p.scope === "typography" && ghScopeTypography)
            ghScopeTypography.checked = true;
        }
        const styleDictChk = pickStyleDictionaryCheckbox();
        if (styleDictChk && typeof p.styleDictionary === "boolean") {
          styleDictChk.checked = p.styleDictionary;
        }
        const flatChk = pickFlatTokensCheckbox();
        if (flatChk && typeof p.flatTokens === "boolean") {
          flatChk.checked = p.flatTokens;
        }
        if (typeof p.createPr === "boolean" && ghCreatePrChk) {
          ghCreatePrChk.checked = p.createPr;
          if (ghPrOptionsEl)
            ghPrOptionsEl.style.display = p.createPr ? "flex" : "none";
        }
        if (typeof p.prTitle === "string" && ghPrTitleInput)
          ghPrTitleInput.value = p.prTitle;
        if (typeof p.prBody === "string" && ghPrBodyInput)
          ghPrBodyInput.value = p.prBody;
        updateExportCommitEnabled();
        updateFetchButtonEnabled();
        return true;
      }
      if (msg.type === "GITHUB_BRANCHES") {
        const pl = msg.payload || {};
        const owner = String(pl.owner || "");
        const repo = String(pl.repo || "");
        if (owner !== currentOwner || repo !== currentRepo) return true;
        lastBranchesFetchedAtMs = Date.now();
        loadedPages = Number(pl.page || 1);
        hasMorePages = !!pl.hasMore;
        isFetchingBranches = false;
        if (typeof pl.defaultBranch === "string" && !defaultBranchFromApi) {
          defaultBranchFromApi = pl.defaultBranch;
        }
        if (ghNewBranchBtn) ghNewBranchBtn.disabled = false;
        const names = Array.isArray(pl.branches) ? pl.branches.map((b) => b.name) : [];
        const set = new Set(allBranches);
        for (const n of names) if (n) set.add(n);
        allBranches = Array.from(set).sort((a, b) => a.localeCompare(b));
        applyBranchFilter();
        setBranchDisabled(false);
        updateFolderControlsEnabled();
        const rate = pl.rate;
        if (rate && typeof rate.remaining === "number" && rate.remaining <= 3 && typeof rate.resetEpochSec === "number") {
          const t = new Date(
            rate.resetEpochSec * 1e3
          ).toLocaleTimeString();
          deps.log(`GitHub: near rate limit; resets ~${t}`);
        }
        deps.log(
          `Loaded ${names.length} branches (page ${loadedPages}) for ${repo}${hasMorePages ? "\u2026" : ""}`
        );
        return true;
      }
      if (msg.type === "GITHUB_BRANCHES_ERROR") {
        const pl = msg.payload || {};
        const owner = String(pl.owner || "");
        const repo = String(pl.repo || "");
        if (owner !== currentOwner || repo !== currentRepo) return true;
        isFetchingBranches = false;
        setBranchDisabled(false);
        updateFolderControlsEnabled();
        deps.log(
          `Branch load failed (status ${pl.status}): ${pl.message || "unknown error"}`
        );
        if (pl.samlRequired)
          deps.log(
            "This org requires SSO. Open the repo in your browser and authorize SSO for your token."
          );
        if (pl.rate && typeof pl.rate.resetEpochSec === "number") {
          const t = new Date(
            pl.rate.resetEpochSec * 1e3
          ).toLocaleTimeString();
          deps.log(`Rate limit issue; resets ~${t}`);
        }
        return true;
      }
      if (msg.type === "GITHUB_CREATE_BRANCH_RESULT") {
        const pl = msg.payload || {};
        if (ghCreateBranchConfirmBtn)
          ghCreateBranchConfirmBtn.disabled = false;
        if (typeof pl.ok !== "boolean") return true;
        if (pl.ok) {
          const baseBranch = String(pl.baseBranch || "");
          const newBranch = String(pl.newBranch || "");
          const url = String(pl.html_url || "");
          if (newBranch) {
            const s = new Set(allBranches);
            if (!s.has(newBranch)) {
              s.add(newBranch);
              allBranches = Array.from(s).sort(
                (a, b) => a.localeCompare(b)
              );
            }
            desiredBranch = newBranch;
            if (ghBranchInput) {
              ghBranchInput.value = newBranch;
              branchLastQuery = newBranch;
              branchInputPristine = false;
            }
            applyBranchFilter();
          }
          updateFolderControlsEnabled();
          showNewBranchRow(false);
          if (ghNewBranchName) ghNewBranchName.value = "";
          if (url) {
            deps.log(
              `Branch created: ${newBranch} (from ${baseBranch})`
            );
            const logEl = deps.getLogElement();
            if (logEl && doc) {
              const wrap = doc.createElement("div");
              const a = doc.createElement("a");
              a.href = url;
              a.target = "_blank";
              a.textContent = "View on GitHub";
              wrap.appendChild(a);
              logEl.appendChild(wrap);
              logEl.scrollTop = logEl.scrollHeight;
            }
          } else {
            deps.log(
              `Branch created: ${newBranch} (from ${baseBranch})`
            );
          }
          return true;
        }
        const status = (_c = pl.status) != null ? _c : 0;
        const message = pl.message || "unknown error";
        deps.log(`Create branch failed (status ${status}): ${message}`);
        if (pl.samlRequired) {
          deps.log(
            "This org requires SSO. Open the repo in your browser and authorize SSO for your token."
          );
        } else if (status === 403) {
          if (pl.noPushPermission) {
            deps.log(
              "You do not have push permission to this repository. Ask a maintainer for write access."
            );
          } else {
            deps.log("Likely a token permission issue:");
            deps.log(
              '\u2022 Classic PAT: add the "repo" scope (or "public_repo" for public repos).'
            );
            deps.log(
              '\u2022 Fine-grained PAT: grant this repository and set "Contents: Read and write".'
            );
          }
        }
        if (pl.rate && typeof pl.rate.resetEpochSec === "number") {
          const t = new Date(
            pl.rate.resetEpochSec * 1e3
          ).toLocaleTimeString();
          deps.log(`Rate limit issue; resets ~${t}`);
        }
        return true;
      }
      if (msg.type === "GITHUB_FOLDER_LIST_RESULT") {
        const pl = msg.payload || {};
        const path = String(pl.path || "").replace(/^\/+|\/+$/g, "");
        const ok = !!pl.ok;
        const entries = Array.isArray(pl.entries) ? pl.entries : [];
        const message = String(pl.message || "");
        for (let i = 0; i < folderListWaiters.length; i++) {
          if (folderListWaiters[i].path === path) {
            const waiter = folderListWaiters.splice(i, 1)[0];
            if (ok) waiter.resolve({ ok: true, entries });
            else
              waiter.reject({
                ok: false,
                message: message || `HTTP ${pl.status || 0}`,
                status: typeof pl.status === "number" ? pl.status : void 0
              });
            break;
          }
        }
        return true;
      }
      if (msg.type === "GITHUB_CREATE_FOLDER_RESULT") {
        const pl = msg.payload || {};
        const fp = String(pl.folderPath || "").replace(/^\/+|\/+$/g, "");
        const ok = !!pl.ok;
        const message = String(pl.message || "");
        for (let i = 0; i < folderCreateWaiters.length; i++) {
          if (folderCreateWaiters[i].folderPath === fp) {
            const waiter = folderCreateWaiters.splice(i, 1)[0];
            if (ok) waiter.resolve({ ok: true });
            else
              waiter.reject({
                ok: false,
                message: message || `HTTP ${pl.status || 0}`,
                status: pl.status
              });
            break;
          }
        }
        return true;
      }
      if (msg.type === "GITHUB_COMMIT_RESULT") {
        if (msg.payload.ok) {
          const url = String(msg.payload.commitUrl || "");
          const branch = msg.payload.branch || "";
          const destination = formatDestinationForLog(
            msg.payload.folder,
            msg.payload.filename
          );
          const committedPath = msg.payload.fullPath || destination;
          deps.log(`Commit succeeded (${branch}): ${url || "(no URL)"}`);
          deps.log(`Committed ${committedPath}`);
          if (url) {
            const logEl = deps.getLogElement();
            if (logEl && doc) {
              const wrap = doc.createElement("div");
              const a = doc.createElement("a");
              a.href = url;
              a.target = "_blank";
              a.textContent = "View commit";
              wrap.appendChild(a);
              logEl.appendChild(wrap);
              logEl.scrollTop = logEl.scrollHeight;
            }
          }
          if (msg.payload.createdPr) {
            const pr = msg.payload.createdPr;
            deps.log(
              `PR prepared (#${pr.number}) from ${pr.head} \u2192 ${pr.base}`
            );
          }
        } else {
          const status = typeof msg.payload.status === "number" ? msg.payload.status : 0;
          const message = msg.payload.message || "unknown error";
          const destination = formatDestinationForLog(
            msg.payload.folder,
            msg.payload.filename
          );
          const committedPath = msg.payload.fullPath || destination;
          if (status === 304) {
            deps.log(`Commit skipped: ${message} (${committedPath})`);
          } else {
            deps.log(
              `Commit failed (${status}): ${message} (${committedPath})`
            );
          }
        }
        return true;
      }
      if (msg.type === "GITHUB_PR_RESULT") {
        if (msg.payload.ok) {
          deps.log(
            `PR created: #${msg.payload.number} (${msg.payload.head} \u2192 ${msg.payload.base})`
          );
          const url = msg.payload.url;
          if (url) {
            const logEl = deps.getLogElement();
            if (logEl && doc) {
              const wrap = doc.createElement("div");
              const a = doc.createElement("a");
              a.href = url;
              a.target = "_blank";
              a.textContent = "View PR";
              wrap.appendChild(a);
              logEl.appendChild(wrap);
              logEl.scrollTop = logEl.scrollHeight;
            }
          }
        } else {
          deps.log(
            `PR creation failed (${msg.payload.status || 0}): ${msg.payload.message || "unknown error"}`
          );
        }
        return true;
      }
      if (msg.type === "GITHUB_FETCH_TOKENS_RESULT") {
        ghImportInFlight = false;
        if (msg.payload.ok) {
          deps.log(
            `Imported tokens from ${msg.payload.path} (${msg.payload.branch})`
          );
          const branch = String(msg.payload.branch || "");
          const path = String(msg.payload.path || "");
          lastImportTarget = { branch, path };
          setImportStatus(
            "success",
            `Imported tokens from ${branch}:${path}.`
          );
        } else {
          deps.log(
            `GitHub fetch failed (${msg.payload.status || 0}): ${msg.payload.message || "unknown error"}`
          );
          const status = typeof msg.payload.status === "number" ? msg.payload.status : 0;
          const message = msg.payload.message || "Unknown error";
          const branch = String(msg.payload.branch || "");
          const path = String(msg.payload.path || "");
          lastImportTarget = { branch, path };
          setImportStatus(
            "error",
            `GitHub import failed (${status}): ${message}`
          );
        }
        updateFetchButtonEnabled();
        return true;
      }
      return false;
    }
    function onSelectionChange() {
      updateExportCommitEnabled();
    }
    function onCollectionsData() {
      ghCollectionsRefreshing = false;
      updateExportCommitEnabled();
    }
    function applyRememberPrefFromPlugin(pref) {
      updateRememberPref(pref, false);
    }
    return {
      attach,
      handleMessage,
      onSelectionChange,
      onCollectionsData,
      setRememberPref: applyRememberPrefFromPlugin
    };
  }

  // src/app/ui/dom.ts
  var uiElements = {
    logEl: null,
    rawEl: null,
    exportAllChk: null,
    collectionSelect: null,
    modeSelect: null,
    fileInput: null,
    importBtn: null,
    exportBtn: null,
    exportTypographyBtn: null,
    exportPickers: null,
    refreshBtn: null,
    shellEl: null,
    drawerToggleBtn: null,
    resizeHandleEl: null,
    w3cPreviewEl: null,
    copyRawBtn: null,
    copyW3cBtn: null,
    copyLogBtn: null,
    allowHexChk: null,
    styleDictionaryChk: null,
    flatTokensChk: null,
    githubRememberChk: null,
    importScopeOverlay: null,
    importScopeBody: null,
    importScopeConfirmBtn: null,
    importScopeCancelBtn: null,
    importScopeRememberChk: null,
    importScopeMissingEl: null,
    importScopeSummaryEl: null,
    importScopeSummaryTextEl: null,
    importScopeClearBtn: null,
    importSkipLogListEl: null,
    importSkipLogEmptyEl: null
  };
  function initDomElements() {
    if (typeof document === "undefined") return;
    uiElements.logEl = document.getElementById("log");
    uiElements.rawEl = document.getElementById("raw");
    uiElements.exportAllChk = document.getElementById(
      "exportAllChk"
    );
    uiElements.collectionSelect = document.getElementById(
      "collectionSelect"
    );
    uiElements.modeSelect = document.getElementById(
      "modeSelect"
    );
    uiElements.fileInput = document.getElementById(
      "file"
    );
    uiElements.importBtn = document.getElementById(
      "importBtn"
    );
    uiElements.exportBtn = document.getElementById(
      "exportBtn"
    );
    uiElements.exportTypographyBtn = document.getElementById(
      "exportTypographyBtn"
    );
    uiElements.exportPickers = document.getElementById("exportPickers");
    uiElements.refreshBtn = document.getElementById(
      "refreshBtn"
    );
    uiElements.shellEl = document.querySelector(".shell");
    uiElements.drawerToggleBtn = document.getElementById(
      "drawerToggleBtn"
    );
    uiElements.resizeHandleEl = document.getElementById("resizeHandle");
    uiElements.w3cPreviewEl = document.getElementById(
      "w3cPreview"
    );
    uiElements.copyRawBtn = document.getElementById(
      "copyRawBtn"
    );
    uiElements.copyW3cBtn = document.getElementById(
      "copyW3cBtn"
    );
    uiElements.copyLogBtn = document.getElementById(
      "copyLogBtn"
    );
    uiElements.allowHexChk = document.getElementById(
      "allowHexChk"
    );
    uiElements.styleDictionaryChk = document.getElementById(
      "styleDictionaryChk"
    );
    uiElements.flatTokensChk = document.getElementById(
      "flatTokensChk"
    );
    uiElements.githubRememberChk = document.getElementById(
      "githubRememberChk"
    );
    uiElements.importScopeOverlay = document.getElementById("importScopeOverlay");
    uiElements.importScopeBody = document.getElementById("importScopeBody");
    uiElements.importScopeConfirmBtn = document.getElementById(
      "importScopeConfirmBtn"
    );
    uiElements.importScopeCancelBtn = document.getElementById(
      "importScopeCancelBtn"
    );
    uiElements.importScopeRememberChk = document.getElementById(
      "importScopeRememberChk"
    );
    uiElements.importScopeMissingEl = document.getElementById(
      "importScopeMissingNotice"
    );
    uiElements.importScopeSummaryEl = document.getElementById("importScopeSummary");
    uiElements.importScopeSummaryTextEl = document.getElementById(
      "importScopeSummaryText"
    );
    uiElements.importScopeClearBtn = document.getElementById(
      "importScopeClearBtn"
    );
    uiElements.importSkipLogListEl = document.getElementById("importSkipLogList");
    uiElements.importSkipLogEmptyEl = document.getElementById("importSkipLogEmpty");
  }

  // src/app/ui/utils.ts
  function log(msg) {
    const t = (/* @__PURE__ */ new Date()).toLocaleTimeString();
    const line = document.createElement("div");
    line.textContent = "[" + t + "] " + msg;
    if (uiElements.logEl) {
      uiElements.logEl.appendChild(line);
      uiElements.logEl.scrollTop = uiElements.logEl.scrollHeight;
    }
  }
  function postToPlugin(message) {
    parent.postMessage({ pluginMessage: message }, "*");
  }
  function prettyJson(obj) {
    try {
      return JSON.stringify(obj, null, 2);
    } catch (e) {
      return String(obj);
    }
  }
  function copyElText(el, label) {
    var _a;
    if (!el) return;
    try {
      const text = (_a = el.textContent) != null ? _a : "";
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        navigator.clipboard.writeText(text).then(() => {
          log(`Copied ${label} to clipboard.`);
        }).catch(() => {
          throw new Error("clipboard write failed");
        });
        return;
      }
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      if (ok) log(`Copied ${label} to clipboard (${text.length} chars).`);
      else throw new Error("execCommand(copy) returned false");
    } catch (e) {
      log(`Could not copy ${label}.`);
    }
  }

  // src/app/ui/state.ts
  var appState = {
    importPreference: null,
    importLogEntries: [],
    importScopeModalState: null,
    lastImportSelection: [],
    systemDarkMode: false,
    // Export state
    pendingSave: null,
    // Resize state
    resizeTracking: null,
    resizeQueued: null,
    resizeRaf: 0,
    // Collections state
    currentCollections: []
  };

  // src/app/ui/storage.ts
  var IMPORT_PREF_KEY = "dtcg.importPreference.v1";
  var IMPORT_LOG_KEY = "dtcg.importLog.v1";
  function normalizeContextList(list) {
    var _a;
    const seen = /* @__PURE__ */ new Set();
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const raw = String((_a = list[i]) != null ? _a : "").trim();
      if (!raw) continue;
      if (seen.has(raw)) continue;
      seen.add(raw);
      out.push(raw);
    }
    out.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
    return out;
  }
  function contextsEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  function readImportPreference() {
    var _a;
    try {
      const raw = (_a = window.localStorage) == null ? void 0 : _a.getItem(IMPORT_PREF_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      const ctxs = Array.isArray(parsed.contexts) ? normalizeContextList(parsed.contexts) : [];
      const ts = typeof parsed.updatedAt === "number" ? Number(parsed.updatedAt) : Date.now();
      if (ctxs.length > 0) return { contexts: ctxs, updatedAt: ts };
    } catch (e) {
    }
    return null;
  }
  function writeImportPreference(pref) {
    var _a;
    try {
      (_a = window.localStorage) == null ? void 0 : _a.setItem(IMPORT_PREF_KEY, JSON.stringify(pref));
    } catch (e) {
    }
  }
  function removeImportPreference() {
    var _a;
    try {
      (_a = window.localStorage) == null ? void 0 : _a.removeItem(IMPORT_PREF_KEY);
    } catch (e) {
    }
  }
  function readImportLog() {
    var _a;
    try {
      const raw = (_a = window.localStorage) == null ? void 0 : _a.getItem(IMPORT_LOG_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      const entries = [];
      for (let i = 0; i < parsed.length; i++) {
        const entry = parsed[i];
        if (!entry || typeof entry !== "object") continue;
        const timestamp = typeof entry.timestamp === "number" ? Number(entry.timestamp) : null;
        const summary = entry.summary;
        const source = entry.source === "github" ? "github" : entry.source === "local" ? "local" : void 0;
        if (!timestamp || !summary || typeof summary !== "object") continue;
        if (!Array.isArray(summary.appliedContexts) || !Array.isArray(summary.availableContexts))
          continue;
        if (!Array.isArray(summary.tokensWithRemovedContexts)) {
          summary.tokensWithRemovedContexts = [];
        }
        if (!Array.isArray(summary.skippedContexts)) {
          summary.skippedContexts = [];
        }
        if (!Array.isArray(summary.missingRequestedContexts)) {
          summary.missingRequestedContexts = [];
        }
        if (typeof summary.createdStyles !== "number" || !isFinite(summary.createdStyles)) {
          summary.createdStyles = 0;
        }
        entries.push({ timestamp, summary, source });
      }
      entries.sort((a, b) => a.timestamp - b.timestamp);
      return entries;
    } catch (e) {
      return [];
    }
  }
  function writeImportLog(entries) {
    var _a;
    try {
      (_a = window.localStorage) == null ? void 0 : _a.setItem(IMPORT_LOG_KEY, JSON.stringify(entries));
    } catch (e) {
    }
  }

  // src/app/ui/features/import.ts
  function formatContextList(contexts) {
    const normalized = normalizeContextList(contexts);
    if (normalized.length === 0) return "All contexts";
    const grouped = /* @__PURE__ */ new Map();
    for (let i = 0; i < normalized.length; i++) {
      const ctx = normalized[i];
      const slash = ctx.indexOf("/");
      const collection = slash >= 0 ? ctx.slice(0, slash) : ctx;
      const mode = slash >= 0 ? ctx.slice(slash + 1) : "Mode 1";
      const coll = collection ? collection : "Tokens";
      const modes = grouped.get(coll) || [];
      if (!grouped.has(coll)) grouped.set(coll, modes);
      if (!modes.includes(mode)) modes.push(mode);
    }
    const parts = [];
    const collections = Array.from(grouped.keys()).sort(
      (a, b) => a < b ? -1 : a > b ? 1 : 0
    );
    for (let i = 0; i < collections.length; i++) {
      const coll = collections[i];
      const modes = grouped.get(coll) || [];
      modes.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
      parts.push(`${coll} (${modes.join(", ")})`);
    }
    return parts.join("; ");
  }
  function renderImportPreferenceSummary() {
    if (!uiElements.importScopeSummaryEl || !uiElements.importScopeSummaryTextEl)
      return;
    const hasPref = !!appState.importPreference && appState.importPreference.contexts.length > 0;
    if (uiElements.importScopeClearBtn)
      uiElements.importScopeClearBtn.disabled = !hasPref;
    if (!hasPref) {
      uiElements.importScopeSummaryEl.hidden = true;
      return;
    }
    uiElements.importScopeSummaryEl.hidden = false;
    const when = new Date(
      appState.importPreference.updatedAt
    ).toLocaleString();
    uiElements.importScopeSummaryTextEl.textContent = `Remembered import scope (${when}): ${formatContextList(
      appState.importPreference.contexts
    )}.`;
  }
  function renderImportLog() {
    if (!(uiElements.importSkipLogListEl && uiElements.importSkipLogEmptyEl))
      return;
    uiElements.importSkipLogListEl.innerHTML = "";
    if (!appState.importLogEntries || appState.importLogEntries.length === 0) {
      uiElements.importSkipLogEmptyEl.hidden = false;
      return;
    }
    uiElements.importSkipLogEmptyEl.hidden = true;
    for (let idx = appState.importLogEntries.length - 1; idx >= 0; idx--) {
      const entry = appState.importLogEntries[idx];
      const container = document.createElement("div");
      container.className = "import-skip-log-entry";
      const header = document.createElement("div");
      header.className = "import-skip-log-entry-header";
      const label = entry.source === "github" ? "GitHub import" : "Manual import";
      header.textContent = `${label} \u2022 ${new Date(
        entry.timestamp
      ).toLocaleString()}`;
      container.appendChild(header);
      const stats = document.createElement("div");
      stats.className = "import-skip-log-entry-stats";
      const tokensText = `Imported ${entry.summary.importedTokens} of ${entry.summary.totalTokens} tokens.`;
      const stylesCreated = typeof entry.summary.createdStyles === "number" ? entry.summary.createdStyles : void 0;
      if (typeof stylesCreated === "number") {
        const stylesLabel = stylesCreated === 1 ? "style" : "styles";
        stats.textContent = `${tokensText} ${stylesCreated} ${stylesLabel} created.`;
      } else {
        stats.textContent = tokensText;
      }
      container.appendChild(stats);
      const contextsLine = document.createElement("div");
      contextsLine.className = "import-skip-log-entry-contexts";
      contextsLine.textContent = "Applied: " + formatContextList(entry.summary.appliedContexts);
      container.appendChild(contextsLine);
      if (entry.summary.skippedContexts.length > 0) {
        const skippedLine = document.createElement("div");
        skippedLine.className = "import-skip-log-entry-contexts";
        skippedLine.textContent = "Skipped modes: " + formatContextList(
          entry.summary.skippedContexts.map((s) => s.context)
        );
        container.appendChild(skippedLine);
      }
      if (entry.summary.missingRequestedContexts.length > 0) {
        const missingLine = document.createElement("div");
        missingLine.className = "import-skip-log-entry-note";
        missingLine.textContent = "Not found in file: " + formatContextList(entry.summary.missingRequestedContexts);
        container.appendChild(missingLine);
      }
      if (entry.summary.selectionFallbackToAll) {
        const fallbackLine = document.createElement("div");
        fallbackLine.className = "import-skip-log-entry-note";
        fallbackLine.textContent = "Requested modes were missing; imported all contexts instead.";
        container.appendChild(fallbackLine);
      }
      if (entry.summary.tokensWithRemovedContexts.length > 0) {
        const tokenList = document.createElement("ul");
        tokenList.className = "import-skip-log-token-list";
        const maxTokens = Math.min(
          entry.summary.tokensWithRemovedContexts.length,
          10
        );
        for (let t = 0; t < maxTokens; t++) {
          const tok = entry.summary.tokensWithRemovedContexts[t];
          const li = document.createElement("li");
          const removedLabel = tok.removedContexts.length > 0 ? formatContextList(tok.removedContexts) : "none";
          const keptLabel = tok.keptContexts.length > 0 ? formatContextList(tok.keptContexts) : "";
          li.textContent = `${tok.path} \u2014 skipped ${removedLabel}${keptLabel ? "; kept " + keptLabel : ""}`;
          tokenList.appendChild(li);
        }
        if (entry.summary.tokensWithRemovedContexts.length > maxTokens) {
          const more = document.createElement("li");
          more.textContent = `\u2026and ${entry.summary.tokensWithRemovedContexts.length - maxTokens} more token(s).`;
          tokenList.appendChild(more);
        }
        container.appendChild(tokenList);
      }
      if (entry.summary.skippedContexts.length > 0 && appState.importPreference && appState.importPreference.contexts.length > 0) {
        const tip = document.createElement("div");
        tip.className = "import-skip-log-entry-note";
        tip.textContent = "Tip: Clear the remembered import selection to restore skipped modes.";
        container.appendChild(tip);
      }
      uiElements.importSkipLogListEl.appendChild(container);
    }
  }
  function addImportLogEntry(entry) {
    appState.importLogEntries.push(entry);
    if (appState.importLogEntries.length > 10) {
      appState.importLogEntries = appState.importLogEntries.slice(
        appState.importLogEntries.length - 10
      );
    }
    writeImportLog(appState.importLogEntries);
    renderImportLog();
  }
  function setImportPreference(contexts) {
    const normalized = normalizeContextList(contexts);
    if (normalized.length === 0) {
      clearImportPreference(false);
      return;
    }
    const same = appState.importPreference && contextsEqual(appState.importPreference.contexts, normalized);
    appState.importPreference = { contexts: normalized, updatedAt: Date.now() };
    writeImportPreference(appState.importPreference);
    renderImportPreferenceSummary();
    if (!same) log("Remembered import selection for future imports.");
  }
  function clearImportPreference(logChange) {
    if (!appState.importPreference) return;
    appState.importPreference = null;
    removeImportPreference();
    renderImportPreferenceSummary();
    if (logChange)
      log(
        "Cleared remembered import selection. Next import will prompt for modes."
      );
  }
  function collectContextsFromJson(root) {
    const grouped = /* @__PURE__ */ new Map();
    function visit(node, path) {
      if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i++) visit(node[i], path);
        return;
      }
      if (!node || typeof node !== "object") return;
      const obj = node;
      if (Object.prototype.hasOwnProperty.call(obj, "$value")) {
        const rawCollection = path[0] ? String(path[0]).trim() : "Tokens";
        let mode = "Mode 1";
        try {
          const ext = obj["$extensions"];
          if (ext && typeof ext === "object") {
            const cf = ext["com.figma"];
            if (cf && typeof cf === "object" && typeof cf.modeName === "string") {
              const candidate = String(cf.modeName).trim();
              if (candidate) mode = candidate;
            }
          }
        } catch (e) {
        }
        const collection = rawCollection ? rawCollection : "Tokens";
        const set = grouped.get(collection) || /* @__PURE__ */ new Set();
        if (!grouped.has(collection)) grouped.set(collection, set);
        set.add(mode);
        return;
      }
      for (const key in obj) {
        if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
        if (key.startsWith("$")) continue;
        visit(obj[key], path.concat(String(key)));
      }
    }
    visit(root, []);
    const options = [];
    const collections = Array.from(grouped.keys()).sort(
      (a, b) => a < b ? -1 : a > b ? 1 : 0
    );
    for (let i = 0; i < collections.length; i++) {
      const collection = collections[i];
      const modes = Array.from(grouped.get(collection) || []).sort(
        (a, b) => a < b ? -1 : a > b ? 1 : 0
      );
      for (let j = 0; j < modes.length; j++) {
        const mode = modes[j];
        options.push({
          context: `${collection}/${mode}`,
          collection,
          mode
        });
      }
    }
    return options;
  }
  function updateImportScopeConfirmState() {
    if (!appState.importScopeModalState) return;
    const state = appState.importScopeModalState;
    let allCollectionsSelected = true;
    for (let i = 0; i < state.collections.length; i++) {
      const collection = state.collections[i];
      const inputs = state.inputsByCollection.get(collection) || [];
      if (!inputs.some((input) => input.checked)) {
        allCollectionsSelected = false;
        break;
      }
    }
    if (uiElements.importScopeConfirmBtn) {
      uiElements.importScopeConfirmBtn.disabled = !allCollectionsSelected;
      const label = state.collections.length > 1 ? "Import selected modes" : "Import selected mode";
      uiElements.importScopeConfirmBtn.textContent = label;
    }
  }
  var importScopeKeyListenerAttached = false;
  function handleImportScopeKeydown(ev) {
    if (ev.key === "Escape") {
      ev.preventDefault();
      closeImportScopeModal();
    }
  }
  function openImportScopeModal(opts) {
    var _a;
    if (!uiElements.importScopeOverlay || !uiElements.importScopeBody || !uiElements.importScopeConfirmBtn || !uiElements.importScopeCancelBtn) {
      opts.onConfirm(opts.initialSelection, opts.rememberInitially);
      return;
    }
    uiElements.importScopeBody.innerHTML = "";
    const grouped = /* @__PURE__ */ new Map();
    for (let i = 0; i < opts.options.length; i++) {
      const option = opts.options[i];
      const list = grouped.get(option.collection) || [];
      if (!grouped.has(option.collection))
        grouped.set(option.collection, list);
      list.push(option);
    }
    const collections = Array.from(grouped.keys()).sort(
      (a, b) => a < b ? -1 : a > b ? 1 : 0
    );
    appState.importScopeModalState = {
      options: opts.options,
      collections,
      inputs: [],
      inputsByCollection: /* @__PURE__ */ new Map(),
      onConfirm: opts.onConfirm
    };
    const initialSelectionsByCollection = /* @__PURE__ */ new Map();
    for (let i = 0; i < opts.initialSelection.length; i++) {
      const ctx = opts.initialSelection[i];
      const match = opts.options.find((opt) => opt.context === ctx);
      if (match)
        initialSelectionsByCollection.set(match.collection, match.context);
    }
    for (let i = 0; i < collections.length; i++) {
      const collection = collections[i];
      const groupEl = document.createElement("div");
      groupEl.className = "import-scope-group";
      const heading = document.createElement("h3");
      heading.textContent = collection;
      groupEl.appendChild(heading);
      const modes = (grouped.get(collection) || []).sort(
        (a, b) => a.mode < b.mode ? -1 : a.mode > b.mode ? 1 : 0
      );
      const defaultContext = initialSelectionsByCollection.get(collection) || ((_a = modes[0]) == null ? void 0 : _a.context) || null;
      const radioName = `importScopeMode_${i}`;
      for (let j = 0; j < modes.length; j++) {
        const opt = modes[j];
        const label = document.createElement("label");
        label.className = "import-scope-mode";
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = radioName;
        radio.value = opt.context;
        radio.checked = defaultContext === opt.context;
        radio.addEventListener("change", updateImportScopeConfirmState);
        appState.importScopeModalState.inputs.push(radio);
        const list = appState.importScopeModalState.inputsByCollection.get(
          collection
        ) || [];
        if (!appState.importScopeModalState.inputsByCollection.has(
          collection
        )) {
          appState.importScopeModalState.inputsByCollection.set(
            collection,
            list
          );
        }
        list.push(radio);
        const span = document.createElement("span");
        span.textContent = opt.mode;
        label.appendChild(radio);
        label.appendChild(span);
        groupEl.appendChild(label);
      }
      uiElements.importScopeBody.appendChild(groupEl);
    }
    if (uiElements.importScopeRememberChk)
      uiElements.importScopeRememberChk.checked = opts.rememberInitially;
    if (uiElements.importScopeMissingEl) {
      if (opts.missingPreferred.length > 0) {
        uiElements.importScopeMissingEl.hidden = false;
        uiElements.importScopeMissingEl.textContent = "Previously remembered modes not present in this file: " + formatContextList(opts.missingPreferred);
      } else {
        uiElements.importScopeMissingEl.hidden = true;
        uiElements.importScopeMissingEl.textContent = "";
      }
    }
    updateImportScopeConfirmState();
    uiElements.importScopeOverlay.hidden = false;
    uiElements.importScopeOverlay.classList.add("is-open");
    uiElements.importScopeOverlay.setAttribute("aria-hidden", "false");
    if (!importScopeKeyListenerAttached) {
      window.addEventListener("keydown", handleImportScopeKeydown, true);
      importScopeKeyListenerAttached = true;
    }
    if (uiElements.importScopeConfirmBtn)
      uiElements.importScopeConfirmBtn.focus();
  }
  function closeImportScopeModal() {
    if (!uiElements.importScopeOverlay) return;
    uiElements.importScopeOverlay.classList.remove("is-open");
    uiElements.importScopeOverlay.hidden = true;
    uiElements.importScopeOverlay.setAttribute("aria-hidden", "true");
    if (importScopeKeyListenerAttached) {
      window.removeEventListener("keydown", handleImportScopeKeydown, true);
      importScopeKeyListenerAttached = false;
    }
    appState.importScopeModalState = null;
  }
  function performImport(json, allowHex, contexts) {
    const normalized = normalizeContextList(contexts);
    const payload = normalized.length > 0 ? {
      type: "IMPORT_DTCG",
      payload: {
        json,
        allowHexStrings: allowHex,
        contexts: normalized
      }
    } : {
      type: "IMPORT_DTCG",
      payload: { json, allowHexStrings: allowHex }
    };
    postToPlugin(payload);
    appState.lastImportSelection = normalized.slice();
    const label = normalized.length > 0 ? formatContextList(normalized) : "all contexts";
    log(`Import requested (${label}).`);
  }
  function startImportFlow(json, allowHex) {
    const options = collectContextsFromJson(json);
    if (options.length === 0) {
      performImport(json, allowHex, []);
      return;
    }
    const grouped = /* @__PURE__ */ new Map();
    for (let i = 0; i < options.length; i++) {
      const option = options[i];
      const list = grouped.get(option.collection) || [];
      if (!grouped.has(option.collection))
        grouped.set(option.collection, list);
      list.push(option);
    }
    const availableSet = new Set(options.map((opt) => opt.context));
    const missingPreferred = [];
    let rememberInitially = false;
    const initialSelectionsByCollection = /* @__PURE__ */ new Map();
    if (appState.importPreference && appState.importPreference.contexts.length > 0) {
      for (let i = 0; i < appState.importPreference.contexts.length; i++) {
        const ctx = appState.importPreference.contexts[i];
        if (availableSet.has(ctx)) {
          const match = options.find((opt) => opt.context === ctx);
          if (match) {
            initialSelectionsByCollection.set(
              match.collection,
              match.context
            );
            rememberInitially = true;
          }
        } else {
          missingPreferred.push(ctx);
        }
      }
    }
    const collections = Array.from(grouped.keys()).sort(
      (a, b) => a < b ? -1 : a > b ? 1 : 0
    );
    for (let i = 0; i < collections.length; i++) {
      const collection = collections[i];
      if (!initialSelectionsByCollection.has(collection)) {
        const modes = (grouped.get(collection) || []).sort(
          (a, b) => a.mode < b.mode ? -1 : a.mode > b.mode ? 1 : 0
        );
        if (modes.length > 0)
          initialSelectionsByCollection.set(collection, modes[0].context);
      }
    }
    const initialSelection = collections.map((collection) => initialSelectionsByCollection.get(collection)).filter((ctx) => typeof ctx === "string");
    const requiresChoice = collections.some((collection) => {
      const list = grouped.get(collection) || [];
      return list.length > 1;
    });
    if (!requiresChoice) {
      performImport(json, allowHex, initialSelection);
      return;
    }
    openImportScopeModal({
      options,
      initialSelection,
      rememberInitially,
      missingPreferred,
      onConfirm: (selected, remember) => {
        if (remember) setImportPreference(selected);
        else if (appState.importPreference) clearImportPreference(true);
        performImport(json, allowHex, selected);
      }
    });
  }
  function getPreferredImportContexts() {
    if (appState.importPreference && appState.importPreference.contexts.length > 0)
      return appState.importPreference.contexts.slice();
    if (appState.lastImportSelection.length > 0)
      return appState.lastImportSelection.slice();
    return [];
  }

  // src/app/ui/features/export.ts
  function prettyExportName(original) {
    const name = original && typeof original === "string" ? original : "tokens.json";
    const m = name.match(/^(.*)_mode=(.*)\.tokens\.json$/);
    if (m) {
      const collection = m[1].trim();
      const mode = m[2].trim();
      return `${collection} - ${mode}.json`;
    }
    return name.endsWith(".json") ? name : name + ".json";
  }
  function supportsFilePicker() {
    return typeof window.showSaveFilePicker === "function";
  }
  async function beginPendingSave(suggestedName) {
    try {
      if (!supportsFilePicker()) return false;
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: "JSON",
            accept: { "application/json": [".json"] }
          }
        ]
      });
      const writable = await handle.createWritable();
      appState.pendingSave = { writable, name: suggestedName };
      return true;
    } catch (e) {
      appState.pendingSave = null;
      return false;
    }
  }
  async function finishPendingSave(text) {
    if (!appState.pendingSave) return false;
    try {
      await appState.pendingSave.writable.write(
        new Blob([text], { type: "application/json" })
      );
      await appState.pendingSave.writable.close();
      return true;
    } catch (e) {
      try {
        await appState.pendingSave.writable.close();
      } catch (e2) {
      }
      return false;
    } finally {
      appState.pendingSave = null;
    }
  }
  function triggerJsonDownload(filename, text) {
    try {
      const blob = new Blob([text], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.style.position = "absolute";
      a.style.left = "-9999px";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
      }, 0);
    } catch (e) {
    }
  }

  // src/app/ui/features/resize.ts
  function postResize(width, height) {
    const w = Math.max(720, Math.min(1600, Math.floor(width)));
    const h = Math.max(420, Math.min(1200, Math.floor(height)));
    postToPlugin({ type: "UI_RESIZE", payload: { width: w, height: h } });
  }
  function queueResize(width, height) {
    appState.resizeQueued = { width, height };
    if (appState.resizeRaf !== 0) return;
    appState.resizeRaf = window.requestAnimationFrame(() => {
      appState.resizeRaf = 0;
      if (!appState.resizeQueued) return;
      postResize(appState.resizeQueued.width, appState.resizeQueued.height);
      appState.resizeQueued = null;
    });
  }
  function applyResizeDelta(ev) {
    if (!appState.resizeTracking || ev.pointerId !== appState.resizeTracking.pointerId)
      return;
    const dx = ev.clientX - appState.resizeTracking.startX;
    const dy = ev.clientY - appState.resizeTracking.startY;
    const nextW = appState.resizeTracking.startWidth + dx;
    const nextH = appState.resizeTracking.startHeight + dy;
    queueResize(nextW, nextH);
    ev.preventDefault();
  }
  function endResize(ev) {
    if (!appState.resizeTracking || ev.pointerId !== appState.resizeTracking.pointerId)
      return;
    applyResizeDelta(ev);
    window.removeEventListener("pointermove", handleResizeMove, true);
    window.removeEventListener("pointerup", endResize, true);
    window.removeEventListener("pointercancel", cancelResize, true);
    if (uiElements.resizeHandleEl) {
      try {
        uiElements.resizeHandleEl.releasePointerCapture(
          appState.resizeTracking.pointerId
        );
      } catch (e) {
      }
    }
    appState.resizeTracking = null;
  }
  function cancelResize(ev) {
    if (!appState.resizeTracking || ev.pointerId !== appState.resizeTracking.pointerId)
      return;
    window.removeEventListener("pointermove", handleResizeMove, true);
    window.removeEventListener("pointerup", endResize, true);
    window.removeEventListener("pointercancel", cancelResize, true);
    if (uiElements.resizeHandleEl) {
      try {
        uiElements.resizeHandleEl.releasePointerCapture(
          appState.resizeTracking.pointerId
        );
      } catch (e) {
      }
    }
    appState.resizeTracking = null;
  }
  function handleResizeMove(ev) {
    applyResizeDelta(ev);
  }
  function autoFitOnce() {
    if (typeof document === "undefined") return;
    const contentW = Math.max(
      document.documentElement.scrollWidth,
      document.body ? document.body.scrollWidth : 0
    );
    const contentH = Math.max(
      document.documentElement.scrollHeight,
      document.body ? document.body.scrollHeight : 0
    );
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const needsW = contentW > vw ? contentW : vw;
    const needsH = contentH > vh ? contentH : vh;
    if (needsW > vw || needsH > vh) postResize(needsW, needsH);
  }

  // src/app/ui.ts
  function applyTheme() {
    const effective = appState.systemDarkMode ? "dark" : "light";
    if (effective === "light") {
      document.documentElement.setAttribute("data-theme", "light");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }
  var githubUi = createGithubUi({
    postToPlugin: (message) => postToPlugin(message),
    log: (message) => log(message),
    getLogElement: () => uiElements.logEl,
    getCollectionSelect: () => uiElements.collectionSelect,
    getModeSelect: () => uiElements.modeSelect,
    getAllowHexCheckbox: () => uiElements.allowHexChk,
    getStyleDictionaryCheckbox: () => uiElements.styleDictionaryChk,
    getFlatTokensCheckbox: () => uiElements.flatTokensChk,
    getImportContexts: () => getPreferredImportContexts()
  });
  function clearSelect(sel) {
    while (sel.options.length > 0) sel.remove(0);
  }
  function setDisabledStates() {
    if (uiElements.importBtn && uiElements.fileInput) {
      const hasFile = !!(uiElements.fileInput.files && uiElements.fileInput.files.length > 0);
      uiElements.importBtn.disabled = !hasFile;
    }
    if (uiElements.exportBtn && uiElements.exportAllChk && uiElements.collectionSelect && uiElements.modeSelect && uiElements.exportPickers) {
      const exportAll = !!uiElements.exportAllChk.checked;
      if (exportAll) {
        uiElements.exportBtn.disabled = false;
        uiElements.exportPickers.style.opacity = "0.5";
      } else {
        uiElements.exportPickers.style.opacity = "1";
        const hasSelection = !!uiElements.collectionSelect.value && !!uiElements.modeSelect.value;
        uiElements.exportBtn.disabled = !hasSelection;
      }
    }
    if (uiElements.exportTypographyBtn) {
      uiElements.exportTypographyBtn.disabled = false;
    }
  }
  function populateCollections(data) {
    appState.currentCollections = data.collections;
    if (!(uiElements.collectionSelect && uiElements.modeSelect)) return;
    clearSelect(uiElements.collectionSelect);
    for (let i = 0; i < data.collections.length; i++) {
      const c = data.collections[i];
      const opt = document.createElement("option");
      opt.value = c.name;
      opt.textContent = c.name;
      uiElements.collectionSelect.appendChild(opt);
    }
    onCollectionChange();
  }
  function onCollectionChange() {
    if (!(uiElements.collectionSelect && uiElements.modeSelect)) return;
    const selected = uiElements.collectionSelect.value;
    clearSelect(uiElements.modeSelect);
    let firstModeSet = false;
    for (let i = 0; i < appState.currentCollections.length; i++) {
      const c = appState.currentCollections[i];
      if (c.name === selected) {
        for (let j = 0; j < c.modes.length; j++) {
          const m = c.modes[j];
          const opt = document.createElement("option");
          opt.value = m.name;
          opt.textContent = m.name;
          uiElements.modeSelect.appendChild(opt);
        }
        if (uiElements.modeSelect.options.length > 0 && uiElements.modeSelect.selectedIndex === -1) {
          uiElements.modeSelect.selectedIndex = 0;
          firstModeSet = true;
        }
        break;
      }
    }
    setDisabledStates();
    githubUi.onSelectionChange();
    if (firstModeSet) requestPreviewForCurrent();
  }
  function applyLastSelection(last) {
    if (!last || !(uiElements.collectionSelect && uiElements.modeSelect))
      return;
    let found = false;
    for (let i = 0; i < uiElements.collectionSelect.options.length; i++) {
      if (uiElements.collectionSelect.options[i].value === last.collection) {
        uiElements.collectionSelect.selectedIndex = i;
        found = true;
        break;
      }
    }
    onCollectionChange();
    if (found) {
      for (let j = 0; j < uiElements.modeSelect.options.length; j++) {
        if (uiElements.modeSelect.options[j].value === last.mode) {
          uiElements.modeSelect.selectedIndex = j;
          break;
        }
      }
    }
    setDisabledStates();
  }
  function requestPreviewForCurrent() {
    if (!(uiElements.collectionSelect && uiElements.modeSelect)) return;
    const collection = uiElements.collectionSelect.value || "";
    const mode = uiElements.modeSelect.value || "";
    if (!collection || !mode) {
      if (uiElements.w3cPreviewEl)
        uiElements.w3cPreviewEl.textContent = "{ /* select a collection & mode to preview */ }";
      return;
    }
    const styleDictionary = !!(uiElements.styleDictionaryChk && uiElements.styleDictionaryChk.checked);
    const flatTokens = !!(uiElements.flatTokensChk && uiElements.flatTokensChk.checked);
    postToPlugin({
      type: "PREVIEW_REQUEST",
      payload: { collection, mode, styleDictionary, flatTokens }
    });
  }
  window.addEventListener("message", async (event) => {
    var _a, _b, _c, _d, _e;
    const data = event.data;
    if (!data || typeof data !== "object") return;
    let msg = null;
    if (data.pluginMessage && typeof data.pluginMessage === "object") {
      const maybe = data.pluginMessage;
      if (maybe && typeof maybe.type === "string") msg = maybe;
    }
    if (!msg) return;
    if (msg.type === "ERROR") {
      log("ERROR: " + ((_b = (_a = msg.payload) == null ? void 0 : _a.message) != null ? _b : ""));
      return;
    }
    if (msg.type === "INFO") {
      log((_d = (_c = msg.payload) == null ? void 0 : _c.message) != null ? _d : "");
      return;
    }
    if (msg.type === "IMPORT_SUMMARY") {
      const summary = msg.payload.summary;
      if (summary && Array.isArray(summary.appliedContexts)) {
        appState.lastImportSelection = summary.appliedContexts.slice();
      } else {
        appState.lastImportSelection = [];
      }
      addImportLogEntry({
        timestamp: msg.payload.timestamp,
        source: msg.payload.source,
        summary
      });
      renderImportPreferenceSummary();
      return;
    }
    if (githubUi.handleMessage(msg)) return;
    if (msg.type === "EXPORT_RESULT") {
      const files = Array.isArray((_e = msg.payload) == null ? void 0 : _e.files) ? msg.payload.files : [];
      if (files.length === 0) {
        log("Nothing to export.");
        return;
      }
      if (appState.pendingSave && files.length === 1) {
        const only = files[0];
        const fname = prettyExportName(only == null ? void 0 : only.name);
        const text = prettyJson(only == null ? void 0 : only.json);
        const ok = await finishPendingSave(text);
        if (ok) {
          log("Saved " + fname + " via file picker.");
          const div = document.createElement("div");
          const link = document.createElement("a");
          link.href = "#";
          link.textContent = "Download " + fname + " again";
          link.addEventListener("click", (e) => {
            e.preventDefault();
            triggerJsonDownload(fname, text);
          });
          if (uiElements.logEl) {
            div.appendChild(link);
            uiElements.logEl.appendChild(div);
            uiElements.logEl.scrollTop = uiElements.logEl.scrollHeight;
          }
          log("Export ready.");
          return;
        }
        log(
          "Could not write via file picker; falling back to download links."
        );
      }
      setDrawerOpen(true);
      for (let k = 0; k < files.length; k++) {
        const f = files[k];
        const fname = prettyExportName(f == null ? void 0 : f.name);
        const text = prettyJson(f == null ? void 0 : f.json);
        triggerJsonDownload(fname, text);
        const div = document.createElement("div");
        const link = document.createElement("a");
        link.href = "#";
        link.textContent = "Download " + fname;
        link.addEventListener("click", (e) => {
          e.preventDefault();
          triggerJsonDownload(fname, text);
        });
        if (uiElements.logEl) {
          div.appendChild(link);
          uiElements.logEl.appendChild(div);
          uiElements.logEl.scrollTop = uiElements.logEl.scrollHeight;
        }
      }
      log("Export ready.");
      return;
    }
    if (msg.type === "W3C_PREVIEW") {
      const displayName = prettyExportName(msg.payload.name);
      const header = `/* ${displayName} */
`;
      if (uiElements.w3cPreviewEl)
        uiElements.w3cPreviewEl.textContent = header + prettyJson(msg.payload.json);
      return;
    }
    if (msg.type === "COLLECTIONS_DATA") {
      githubUi.onCollectionsData();
      populateCollections({ collections: msg.payload.collections });
      if (uiElements.exportAllChk)
        uiElements.exportAllChk.checked = !!msg.payload.exportAllPref;
      if (uiElements.styleDictionaryChk && typeof msg.payload.styleDictionaryPref === "boolean") {
        uiElements.styleDictionaryChk.checked = !!msg.payload.styleDictionaryPref;
      }
      if (uiElements.flatTokensChk && typeof msg.payload.flatTokensPref === "boolean") {
        uiElements.flatTokensChk.checked = !!msg.payload.flatTokensPref;
      }
      if (uiElements.allowHexChk && typeof msg.payload.allowHexPref === "boolean") {
        uiElements.allowHexChk.checked = !!msg.payload.allowHexPref;
      }
      if (typeof msg.payload.githubRememberPref === "boolean") {
        if (uiElements.githubRememberChk)
          uiElements.githubRememberChk.checked = msg.payload.githubRememberPref;
      }
      const last = msg.payload.last;
      applyLastSelection(last);
      setDisabledStates();
      requestPreviewForCurrent();
      return;
    }
    if (msg.type === "RAW_COLLECTIONS_TEXT") {
      if (uiElements.rawEl) uiElements.rawEl.textContent = msg.payload.text;
      return;
    }
  });
  document.addEventListener("DOMContentLoaded", () => {
    if (typeof document === "undefined") return;
    initDomElements();
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    appState.systemDarkMode = mediaQuery.matches;
    mediaQuery.addEventListener("change", (e) => {
      appState.systemDarkMode = e.matches;
      applyTheme();
    });
    applyTheme();
    appState.importPreference = readImportPreference();
    appState.importLogEntries = readImportLog();
    renderImportPreferenceSummary();
    renderImportLog();
    if (uiElements.importScopeClearBtn) {
      uiElements.importScopeClearBtn.addEventListener(
        "click",
        () => clearImportPreference(true)
      );
    }
    if (uiElements.importScopeConfirmBtn) {
      uiElements.importScopeConfirmBtn.addEventListener("click", () => {
        if (!appState.importScopeModalState) {
          closeImportScopeModal();
          return;
        }
        const state = appState.importScopeModalState;
        const selections = [];
        for (let i = 0; i < state.collections.length; i++) {
          const collection = state.collections[i];
          const inputs = state.inputsByCollection.get(collection) || [];
          const selected = inputs.find((input) => input.checked);
          if (!selected) return;
          selections.push(selected.value);
        }
        const remember = uiElements.importScopeRememberChk ? !!uiElements.importScopeRememberChk.checked : false;
        closeImportScopeModal();
        state.onConfirm(selections, remember);
      });
    }
    if (uiElements.importScopeCancelBtn) {
      uiElements.importScopeCancelBtn.addEventListener(
        "click",
        () => closeImportScopeModal()
      );
    }
    if (uiElements.importScopeOverlay) {
      uiElements.importScopeOverlay.addEventListener("click", (ev) => {
        if (ev.target === uiElements.importScopeOverlay)
          closeImportScopeModal();
      });
    }
    if (uiElements.resizeHandleEl) {
      uiElements.resizeHandleEl.addEventListener(
        "pointerdown",
        (event) => {
          if (event.button !== 0 && event.pointerType === "mouse") return;
          if (appState.resizeTracking) return;
          event.preventDefault();
          appState.resizeTracking = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            startWidth: window.innerWidth,
            startHeight: window.innerHeight
          };
          try {
            uiElements.resizeHandleEl.setPointerCapture(
              event.pointerId
            );
          } catch (e) {
          }
          window.addEventListener("pointermove", handleResizeMove, true);
          window.addEventListener("pointerup", endResize, true);
          window.addEventListener("pointercancel", cancelResize, true);
        }
      );
    }
    githubUi.attach({ document, window });
    if (uiElements.fileInput)
      uiElements.fileInput.addEventListener("change", setDisabledStates);
    if (uiElements.exportAllChk) {
      uiElements.exportAllChk.addEventListener("change", () => {
        setDisabledStates();
        postToPlugin({
          type: "SAVE_PREFS",
          payload: { exportAll: !!uiElements.exportAllChk.checked }
        });
        githubUi.onSelectionChange();
      });
    }
    if (uiElements.styleDictionaryChk) {
      uiElements.styleDictionaryChk.addEventListener("change", () => {
        postToPlugin({
          type: "SAVE_PREFS",
          payload: {
            styleDictionary: !!uiElements.styleDictionaryChk.checked
          }
        });
        requestPreviewForCurrent();
        githubUi.onSelectionChange();
      });
    }
    if (uiElements.flatTokensChk) {
      uiElements.flatTokensChk.addEventListener("change", () => {
        postToPlugin({
          type: "SAVE_PREFS",
          payload: { flatTokens: !!uiElements.flatTokensChk.checked }
        });
        requestPreviewForCurrent();
        githubUi.onSelectionChange();
      });
    }
    if (uiElements.githubRememberChk) {
      uiElements.githubRememberChk.addEventListener("change", () => {
        postToPlugin({
          type: "SAVE_PREFS",
          payload: {
            githubRememberToken: !!uiElements.githubRememberChk.checked
          }
        });
      });
    }
    if (uiElements.refreshBtn) {
      uiElements.refreshBtn.addEventListener("click", () => {
        postToPlugin({ type: "FETCH_COLLECTIONS" });
      });
    }
    if (uiElements.importBtn && uiElements.fileInput) {
      uiElements.importBtn.addEventListener("click", () => {
        if (!uiElements.fileInput.files || uiElements.fileInput.files.length === 0) {
          log("Select a JSON file first.");
          return;
        }
        const reader = new FileReader();
        reader.onload = function() {
          try {
            const text = String(reader.result);
            const json = JSON.parse(text);
            if (!json || typeof json !== "object" || json instanceof Array) {
              log(
                "Invalid JSON structure for tokens (expected an object)."
              );
              return;
            }
            const allowHex = !!(uiElements.allowHexChk && uiElements.allowHexChk.checked);
            startImportFlow(json, allowHex);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            log("Failed to parse JSON: " + msg);
          }
        };
        reader.readAsText(uiElements.fileInput.files[0]);
      });
    }
    if (uiElements.exportBtn) {
      uiElements.exportBtn.addEventListener("click", async () => {
        var _a, _b;
        let exportAll = false;
        if (uiElements.exportAllChk)
          exportAll = !!uiElements.exportAllChk.checked;
        const styleDictionary = !!(uiElements.styleDictionaryChk && uiElements.styleDictionaryChk.checked);
        const flatTokens = !!(uiElements.flatTokensChk && uiElements.flatTokensChk.checked);
        const payload = { exportAll, styleDictionary, flatTokens };
        if (!exportAll && uiElements.collectionSelect && uiElements.modeSelect) {
          payload.collection = uiElements.collectionSelect.value;
          payload.mode = uiElements.modeSelect.value;
          if (!(payload.collection && payload.mode)) {
            log('Pick collection and mode or use "Export all".');
            return;
          }
        }
        const suggestedName = exportAll ? "tokens.json" : prettyExportName(
          `${(_a = payload.collection) != null ? _a : "Tokens"}_mode=${(_b = payload.mode) != null ? _b : "Mode 1"}.tokens.json`
        );
        await beginPendingSave(suggestedName);
        postToPlugin({ type: "EXPORT_DTCG", payload });
        if (exportAll) log("Export all requested.");
        else
          log(
            `Export requested for "${payload.collection || ""}" / "${payload.mode || ""}".`
          );
      });
    }
    if (uiElements.exportTypographyBtn) {
      uiElements.exportTypographyBtn.addEventListener("click", async () => {
        await beginPendingSave("typography.json");
        postToPlugin({ type: "EXPORT_TYPOGRAPHY" });
        log("Typography export requested.");
      });
    }
    if (uiElements.drawerToggleBtn) {
      uiElements.drawerToggleBtn.addEventListener("click", () => {
        const current = uiElements.drawerToggleBtn.getAttribute("aria-expanded") === "true";
        setDrawerOpen(!current);
      });
    }
    if (uiElements.collectionSelect) {
      uiElements.collectionSelect.addEventListener("change", () => {
        onCollectionChange();
        if (uiElements.collectionSelect && uiElements.modeSelect) {
          postToPlugin({
            type: "SAVE_LAST",
            payload: {
              collection: uiElements.collectionSelect.value,
              mode: uiElements.modeSelect.value
            }
          });
          requestPreviewForCurrent();
        }
        githubUi.onSelectionChange();
      });
    }
    if (uiElements.modeSelect) {
      uiElements.modeSelect.addEventListener("change", () => {
        if (uiElements.collectionSelect && uiElements.modeSelect) {
          postToPlugin({
            type: "SAVE_LAST",
            payload: {
              collection: uiElements.collectionSelect.value,
              mode: uiElements.modeSelect.value
            }
          });
        }
        setDisabledStates();
        requestPreviewForCurrent();
        githubUi.onSelectionChange();
      });
    }
    if (uiElements.copyRawBtn)
      uiElements.copyRawBtn.addEventListener(
        "click",
        () => copyElText(uiElements.rawEl, "Raw Figma Collections")
      );
    if (uiElements.copyW3cBtn)
      uiElements.copyW3cBtn.addEventListener(
        "click",
        () => copyElText(uiElements.w3cPreviewEl, "W3C Preview")
      );
    if (uiElements.copyLogBtn)
      uiElements.copyLogBtn.addEventListener(
        "click",
        () => copyElText(uiElements.logEl, "Log")
      );
    githubUi.onSelectionChange();
    autoFitOnce();
    if (uiElements.rawEl)
      uiElements.rawEl.textContent = "Loading variable collections\u2026";
    setDisabledStates();
    setDrawerOpen(getSavedDrawerOpen());
    postToPlugin({ type: "UI_READY" });
    setInterval(() => {
      postToPlugin({ type: "PING" });
    }, 500);
  });
  function setDrawerOpen(open) {
    if (uiElements.shellEl) {
      if (open) uiElements.shellEl.classList.remove("drawer-collapsed");
      else uiElements.shellEl.classList.add("drawer-collapsed");
    }
    if (uiElements.drawerToggleBtn) {
      uiElements.drawerToggleBtn.setAttribute(
        "aria-expanded",
        open ? "true" : "false"
      );
      uiElements.drawerToggleBtn.textContent = open ? "Hide" : "Show";
      uiElements.drawerToggleBtn.title = open ? "Hide log" : "Show log";
    }
    try {
      window.localStorage.setItem("drawerOpen", open ? "1" : "0");
    } catch (e) {
    }
  }
  function getSavedDrawerOpen() {
    try {
      const v = window.localStorage.getItem("drawerOpen");
      if (v === "0") return false;
      if (v === "1") return true;
    } catch (e) {
    }
    return true;
  }
})();
//# sourceMappingURL=ui.js.map

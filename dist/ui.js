"use strict";
(() => {
  // src/app/github/ui/auth.ts
  var GH_MASK = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";
  var GithubAuthUi = class {
    constructor(deps) {
      this.doc = null;
      this.ghTokenInput = null;
      this.ghRememberChk = null;
      this.ghConnectBtn = null;
      this.ghVerifyBtn = null;
      this.ghLogoutBtn = null;
      this.ghAuthStatusEl = null;
      this.ghTokenMetaEl = null;
      this.ghIsAuthed = false;
      this.ghTokenExpiresAt = null;
      this.ghRememberPref = true;
      this.deps = deps;
    }
    attach(context) {
      this.doc = context.document;
      this.ghTokenInput = this.findTokenInput();
      this.ghRememberChk = this.doc.getElementById(
        "githubRememberChk"
      ) || this.doc.getElementById("ghRememberChk");
      this.ghConnectBtn = this.doc.getElementById(
        "githubConnectBtn"
      ) || this.doc.getElementById("ghConnectBtn");
      this.ghVerifyBtn = this.doc.getElementById("githubVerifyBtn") || this.doc.getElementById("ghVerifyBtn");
      this.ghLogoutBtn = this.doc.getElementById(
        "ghLogoutBtn"
      );
      this.ensureGhStatusElements();
      if (this.ghRememberChk) {
        this.ghRememberChk.checked = this.ghRememberPref;
        this.ghRememberChk.addEventListener("change", () => {
          this.updateRememberPref(!!this.ghRememberChk.checked, true);
        });
      }
      if (this.ghConnectBtn) {
        this.ghConnectBtn.addEventListener(
          "click",
          () => this.onGitHubConnectClick()
        );
      }
      if (this.ghVerifyBtn) {
        this.ghVerifyBtn.addEventListener(
          "click",
          () => this.onGitHubVerifyClick()
        );
      }
      if (this.ghLogoutBtn) {
        this.ghLogoutBtn.addEventListener(
          "click",
          () => this.onGitHubLogoutClick()
        );
      }
      this.updateGhStatusUi();
    }
    handleMessage(msg) {
      if (msg.type === "GITHUB_AUTH_RESULT") {
        const p = msg.payload || {};
        this.ghIsAuthed = !!p.ok;
        this.ghTokenExpiresAt = typeof p.exp !== "undefined" && p.exp !== null ? p.exp : typeof p.tokenExpiration !== "undefined" && p.tokenExpiration !== null ? p.tokenExpiration : null;
        if (typeof p.remember === "boolean") {
          this.updateRememberPref(p.remember, false);
        }
        if (this.ghIsAuthed) {
          this.setPatFieldObfuscated(true);
          const who = p.login || "unknown";
          const name = p.name ? ` (${p.name})` : "";
          this.deps.log(`GitHub: Authenticated as ${who}${name}.`);
        } else {
          this.setPatFieldObfuscated(false);
          const why = p.error ? `: ${p.error}` : ".";
          this.deps.log(`GitHub: Authentication failed${why}`);
        }
        this.updateGhStatusUi();
        return true;
      }
      return false;
    }
    isAuthed() {
      return this.ghIsAuthed;
    }
    logout() {
      this.onGitHubLogoutClick();
    }
    findTokenInput() {
      if (!this.doc) return null;
      return this.doc.getElementById("githubTokenInput") || this.doc.getElementById("ghTokenInput") || this.doc.getElementById("githubPatInput") || this.doc.querySelector(
        'input[name="githubToken"]'
      ) || this.doc.querySelector(
        'input[type="password"]'
      );
    }
    readPatFromUi() {
      if (!this.ghTokenInput) this.ghTokenInput = this.findTokenInput();
      if (!this.ghTokenInput) return "";
      if (this.ghTokenInput.getAttribute("data-filled") === "1")
        return GH_MASK;
      return (this.ghTokenInput.value || "").trim();
    }
    updateRememberPref(pref, persist = false) {
      const next = !!pref;
      this.ghRememberPref = next;
      if (this.ghRememberChk) {
        this.ghRememberChk.checked = this.ghRememberPref;
      }
      this.updateGhStatusUi();
      if (persist) {
        this.deps.postToPlugin({
          type: "SAVE_PREFS",
          payload: { githubRememberToken: this.ghRememberPref }
        });
      }
    }
    ensureGhStatusElements() {
      if (!this.doc) return;
      if (!this.ghAuthStatusEl)
        this.ghAuthStatusEl = this.doc.getElementById("ghAuthStatus");
      if (!this.ghTokenMetaEl)
        this.ghTokenMetaEl = this.doc.getElementById("ghTokenMeta");
      if (!this.ghLogoutBtn)
        this.ghLogoutBtn = this.doc.getElementById(
          "ghLogoutBtn"
        );
    }
    formatTimeLeft(expInput) {
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
    setPatFieldObfuscated(filled) {
      if (!this.ghTokenInput) this.ghTokenInput = this.findTokenInput();
      if (!this.ghTokenInput) return;
      this.ghTokenInput.type = "password";
      if (filled) {
        this.ghTokenInput.value = GH_MASK;
        this.ghTokenInput.setAttribute("data-filled", "1");
      } else {
        this.ghTokenInput.value = "";
        this.ghTokenInput.removeAttribute("data-filled");
      }
    }
    updateGhStatusUi() {
      this.ensureGhStatusElements();
      if (this.ghAuthStatusEl) {
        this.ghAuthStatusEl.textContent = this.ghIsAuthed ? "GitHub: authenticated." : "GitHub: not authenticated.";
      }
      if (this.ghTokenMetaEl) {
        const rememberTxt = this.ghRememberPref ? "Remember me: on" : "Remember me: off";
        const expTxt = this.ghTokenExpiresAt ? `Token ${this.formatTimeLeft(this.ghTokenExpiresAt)}` : "Token expiration: unknown";
        this.ghTokenMetaEl.textContent = `${expTxt} \u2022 ${rememberTxt}`;
      }
      if (this.ghTokenInput) {
        this.ghTokenInput.oninput = () => {
          if (this.ghTokenInput && this.ghTokenInput.getAttribute("data-filled") === "1") {
            this.ghTokenInput.removeAttribute("data-filled");
          }
          if (this.ghConnectBtn) this.ghConnectBtn.disabled = false;
        };
      }
      if (this.ghConnectBtn && this.ghTokenInput) {
        const isMasked = this.ghTokenInput.getAttribute("data-filled") === "1";
        this.ghConnectBtn.disabled = this.ghIsAuthed && isMasked;
      }
      if (this.ghLogoutBtn) {
        this.ghLogoutBtn.disabled = !this.ghIsAuthed;
      }
      if (this.ghRememberChk) {
        this.ghRememberChk.checked = this.ghRememberPref;
      }
    }
    onGitHubConnectClick() {
      var _a;
      const tokenRaw = this.readPatFromUi();
      const isMasked = ((_a = this.ghTokenInput) == null ? void 0 : _a.getAttribute("data-filled")) === "1";
      if (this.ghIsAuthed && isMasked) return;
      if (!tokenRaw) {
        this.deps.log("GitHub: Paste a Personal Access Token first.");
        return;
      }
      const remember = !!(this.ghRememberChk && this.ghRememberChk.checked);
      this.deps.log("GitHub: Verifying token\u2026");
      this.deps.postToPlugin({
        type: "GITHUB_SET_TOKEN",
        payload: { token: tokenRaw, remember }
      });
    }
    onGitHubVerifyClick() {
      this.onGitHubConnectClick();
    }
    onGitHubLogoutClick() {
      this.deps.postToPlugin({ type: "GITHUB_FORGET_TOKEN" });
      this.ghIsAuthed = false;
      this.ghTokenExpiresAt = null;
      this.setPatFieldObfuscated(false);
      this.updateGhStatusUi();
      this.deps.log("GitHub: Logged out.");
    }
  };

  // src/app/ui/dom-helpers.ts
  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    if (props) {
      for (const key in props) {
        if (Object.prototype.hasOwnProperty.call(props, key)) {
          const val = props[key];
          if (key === "className") {
            el.className = val;
          } else if (key === "dataset" && typeof val === "object") {
            for (const dKey in val) {
              el.dataset[dKey] = val[dKey];
            }
          } else if (key === "style" && typeof val === "object") {
            Object.assign(el.style, val);
          } else if (key.startsWith("on") && typeof val === "function") {
            el.addEventListener(key.substring(2).toLowerCase(), val);
          } else if (key === "textContent") {
            el.textContent = val;
          } else if (val === true) {
            if (key in el && typeof el[key] === "boolean") {
              el[key] = true;
            }
            el.setAttribute(key, "");
          } else if (val === false || val === null || val === void 0) {
          } else {
            el.setAttribute(key, String(val));
          }
        }
      }
    }
    for (const child of children) {
      if (typeof child === "string") {
        el.appendChild(document.createTextNode(child));
      } else if (child instanceof Node) {
        el.appendChild(child);
      }
    }
    return el;
  }
  function clearChildren(el) {
    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }
  }

  // src/app/github/ui/repo.ts
  var GithubRepoUi = class {
    constructor(deps) {
      this.doc = null;
      this.ghRepoSelect = null;
      this.currentOwner = "";
      this.currentRepo = "";
      // Callbacks
      this.onRepoChange = null;
      this.deps = deps;
    }
    attach(context) {
      this.doc = context.document;
      this.ghRepoSelect = this.doc.getElementById(
        "ghRepoSelect"
      );
      if (this.ghRepoSelect) {
        let lastRepoKey = "";
        this.ghRepoSelect.addEventListener("change", () => {
          const value = this.ghRepoSelect.value;
          if (!value) return;
          if (value === lastRepoKey) return;
          lastRepoKey = value;
          const parts = value.split("/");
          this.currentOwner = parts[0] || "";
          this.currentRepo = parts[1] || "";
          this.deps.postToPlugin({
            type: "GITHUB_SELECT_REPO",
            payload: {
              owner: this.currentOwner,
              repo: this.currentRepo
            }
          });
          if (this.onRepoChange) {
            this.onRepoChange(this.currentOwner, this.currentRepo);
          }
        });
      }
    }
    handleMessage(msg) {
      var _a, _b;
      if (msg.type === "GITHUB_REPOS") {
        const repos = (_b = (_a = msg.payload) == null ? void 0 : _a.repos) != null ? _b : [];
        this.populateGhRepos(repos);
        this.deps.log(`GitHub: Repository list updated (${repos.length}).`);
        return true;
      }
      if (msg.type === "GITHUB_RESTORE_SELECTED") {
        const p = msg.payload || {};
        const newOwner = typeof p.owner === "string" ? p.owner : "";
        const newRepo = typeof p.repo === "string" ? p.repo : "";
        if (newOwner === this.currentOwner && newRepo === this.currentRepo) {
          return false;
        }
        this.currentOwner = newOwner;
        this.currentRepo = newRepo;
        this.syncSelect();
        if (this.currentOwner && this.currentRepo && this.onRepoChange) {
          this.onRepoChange(this.currentOwner, this.currentRepo);
        }
        return false;
      }
      return false;
    }
    reset() {
      this.populateGhRepos([]);
      this.currentOwner = "";
      this.currentRepo = "";
    }
    getSelected() {
      return { owner: this.currentOwner, repo: this.currentRepo };
    }
    populateGhRepos(list) {
      if (!this.ghRepoSelect || !this.doc) return;
      clearChildren(this.ghRepoSelect);
      for (const r of list) {
        this.ghRepoSelect.appendChild(
          h("option", { value: r.full_name }, r.full_name)
        );
      }
      this.ghRepoSelect.disabled = list.length === 0;
      if (list.length > 0) {
        const prevOwner = this.currentOwner;
        const prevRepo = this.currentRepo;
        this.syncSelect();
        if ((this.currentOwner !== prevOwner || this.currentRepo !== prevRepo) && this.onRepoChange) {
          this.onRepoChange(this.currentOwner, this.currentRepo);
        }
      }
    }
    syncSelect() {
      if (!this.ghRepoSelect) return;
      if (this.currentOwner && this.currentRepo) {
        const want = `${this.currentOwner}/${this.currentRepo}`;
        let matched = false;
        for (let i = 0; i < this.ghRepoSelect.options.length; i++) {
          if (this.ghRepoSelect.options[i].value === want) {
            this.ghRepoSelect.selectedIndex = i;
            matched = true;
            break;
          }
        }
        if (matched) {
        }
      } else {
        if (this.ghRepoSelect.options.length > 0) {
          this.ghRepoSelect.selectedIndex = 0;
          const val = this.ghRepoSelect.options[0].value;
          const parts = val.split("/");
          if (parts.length === 2) {
            this.currentOwner = parts[0];
            this.currentRepo = parts[1];
          }
        }
      }
    }
  };

  // src/app/ui/components/autocomplete.ts
  var Autocomplete = class {
    constructor(options) {
      this.items = [];
      this.highlightIndex = -1;
      this.isOpen = false;
      // Bound event handlers for add/remove symmetry
      this.onInputFocus = () => {
        this.open();
        this.onQuery(this.input.value);
      };
      this.onInputInput = () => {
        if (this.debounceTimer) window.clearTimeout(this.debounceTimer);
        this.debounceTimer = window.setTimeout(() => {
          this.open();
          this.onQuery(this.input.value);
        }, 120);
      };
      this.onInputKeydown = (e) => this.handleKeydown(e);
      this.onToggleClick = (e) => {
        e.preventDefault();
        this.toggle();
      };
      this.onMenuMouseDown = (e) => e.preventDefault();
      this.onMenuClick = (e) => {
        const target = e.target;
        const li = target.closest("li");
        if (li) {
          const index = Number(li.dataset.index);
          if (!isNaN(index) && this.items[index]) {
            this.select(index, false);
          }
        }
      };
      this.onDocumentMouseDown = (e) => {
        if (!this.isOpen) return;
        const target = e.target;
        if (this.menu.contains(target) || this.input.contains(target) || this.toggleBtn && this.toggleBtn.contains(target)) {
          return;
        }
        this.close();
      };
      this.input = options.input;
      this.menu = options.menu;
      this.toggleBtn = options.toggleBtn;
      this.onQuery = options.onQuery;
      this.onSelect = options.onSelect;
      this.renderItem = options.renderItem || this.defaultRenderItem;
      this.setupEvents();
    }
    setItems(items) {
      this.items = items;
      this.render();
      if (this.isOpen) {
        this.syncHighlight();
      }
    }
    open() {
      if (this.isOpen) return;
      this.isOpen = true;
      this.menu.hidden = false;
      this.menu.setAttribute("data-open", "1");
      this.input.setAttribute("aria-expanded", "true");
      if (this.toggleBtn)
        this.toggleBtn.setAttribute("aria-expanded", "true");
      this.syncHighlight();
    }
    close() {
      if (!this.isOpen) return;
      this.isOpen = false;
      this.menu.hidden = true;
      this.menu.removeAttribute("data-open");
      this.input.setAttribute("aria-expanded", "false");
      if (this.toggleBtn)
        this.toggleBtn.setAttribute("aria-expanded", "false");
      this.setHighlight(-1);
    }
    destroy() {
      window.clearTimeout(this.debounceTimer);
      this.input.removeEventListener("focus", this.onInputFocus);
      this.input.removeEventListener("input", this.onInputInput);
      this.input.removeEventListener("keydown", this.onInputKeydown);
      if (this.toggleBtn)
        this.toggleBtn.removeEventListener("click", this.onToggleClick);
      this.menu.removeEventListener("mousedown", this.onMenuMouseDown);
      this.menu.removeEventListener("click", this.onMenuClick);
      document.removeEventListener("mousedown", this.onDocumentMouseDown);
    }
    toggle() {
      if (this.isOpen) this.close();
      else {
        this.input.focus();
        this.open();
        this.onQuery(this.input.value);
      }
    }
    setupEvents() {
      this.input.addEventListener("focus", this.onInputFocus);
      this.input.addEventListener("input", this.onInputInput);
      this.input.addEventListener("keydown", this.onInputKeydown);
      if (this.toggleBtn) {
        this.toggleBtn.addEventListener("click", this.onToggleClick);
      }
      this.menu.addEventListener("mousedown", this.onMenuMouseDown);
      this.menu.addEventListener("click", this.onMenuClick);
      document.addEventListener("mousedown", this.onDocumentMouseDown);
    }
    handleKeydown(e) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        this.moveHighlight(1);
        this.open();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        this.moveHighlight(-1);
        this.open();
      } else if (e.key === "Enter") {
        if (this.isOpen && this.highlightIndex >= 0) {
          e.preventDefault();
          this.select(this.highlightIndex, true);
        }
      } else if (e.key === "Escape") {
        if (this.isOpen) {
          e.preventDefault();
          this.close();
        }
      }
    }
    moveHighlight(delta) {
      if (this.items.length === 0) return;
      let next = this.highlightIndex + delta;
      if (next >= this.items.length) next = 0;
      if (next < 0) next = this.items.length - 1;
      let scanned = 0;
      while (scanned < this.items.length) {
        const item = this.items[next];
        if (item.type !== "info" && !item.disabled) {
          this.setHighlight(next);
          return;
        }
        next += delta;
        if (next >= this.items.length) next = 0;
        if (next < 0) next = this.items.length - 1;
        scanned++;
      }
    }
    setHighlight(index) {
      this.highlightIndex = index;
      const children = this.menu.children;
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (i === index) {
          child.setAttribute("data-active", "1");
          child.scrollIntoView({ block: "nearest" });
        } else {
          child.removeAttribute("data-active");
        }
      }
    }
    syncHighlight() {
      if (this.highlightIndex >= 0 && this.items[this.highlightIndex]) {
        const item = this.items[this.highlightIndex];
        if (item.type !== "info" && !item.disabled) {
          this.setHighlight(this.highlightIndex);
          return;
        }
      }
      const first = this.items.findIndex(
        (i) => i.type !== "info" && !i.disabled
      );
      this.setHighlight(first);
    }
    select(index, fromKeyboard) {
      const item = this.items[index];
      if (!item || item.disabled || item.type === "info") return;
      this.onSelect(item, fromKeyboard);
    }
    render() {
      clearChildren(this.menu);
      this.items.forEach((item, index) => {
        const el = this.renderItem(item);
        el.dataset.index = String(index);
        el.setAttribute("role", "option");
        if (item.disabled) el.setAttribute("aria-disabled", "true");
        this.menu.appendChild(el);
      });
    }
    defaultRenderItem(item) {
      return h("li", {
        className: `autocomplete-item ${item.type === "info" ? "is-info" : ""}`,
        textContent: item.label
      });
    }
  };

  // src/app/github/ui/branch.ts
  var BRANCH_TTL_MS = 6e4;
  var RENDER_STEP = 200;
  var BRANCH_INPUT_PLACEHOLDER = "Search branches\u2026";
  var GithubBranchUi = class {
    constructor(deps) {
      this.doc = null;
      this.win = null;
      // Elements
      this.ghBranchInput = null;
      this.ghBranchClearBtn = null;
      this.ghBranchToggleBtn = null;
      this.ghBranchMenu = null;
      this.ghBranchCountEl = null;
      this.ghBranchRefreshBtn = null;
      this.ghNewBranchBtn = null;
      this.ghNewBranchRow = null;
      this.ghNewBranchName = null;
      this.ghCreateBranchConfirmBtn = null;
      this.ghCancelBranchBtn = null;
      // Components
      this.autocomplete = null;
      // State
      this.currentOwner = "";
      this.currentRepo = "";
      this.desiredBranch = null;
      this.defaultBranchFromApi = void 0;
      this.loadedPages = 0;
      this.hasMorePages = false;
      this.isFetchingBranches = false;
      this.lastBranchesFetchedAtMs = 0;
      this.allBranches = [];
      this.filteredBranches = [];
      this.renderCount = 0;
      this.lastQuery = "";
      this.inputPristine = true;
      // Callbacks
      this.onBranchChange = null;
      this.deps = deps;
    }
    attach(context) {
      this.doc = context.document;
      this.win = context.window;
      this.ghBranchInput = this.doc.getElementById(
        "ghBranchInput"
      );
      this.ghBranchClearBtn = this.doc.getElementById(
        "ghBranchClearBtn"
      );
      this.ghBranchToggleBtn = this.doc.getElementById(
        "ghBranchToggleBtn"
      );
      this.ghBranchMenu = this.doc.getElementById(
        "ghBranchMenu"
      );
      this.ghBranchCountEl = this.doc.getElementById("ghBranchCount");
      this.ghBranchRefreshBtn = this.doc.getElementById(
        "ghBranchRefreshBtn"
      );
      this.ghNewBranchBtn = this.doc.getElementById(
        "ghNewBranchBtn"
      );
      this.ghNewBranchRow = this.doc.getElementById("ghNewBranchRow");
      this.ghNewBranchName = this.doc.getElementById(
        "ghNewBranchName"
      );
      this.ghCreateBranchConfirmBtn = this.doc.getElementById(
        "ghCreateBranchConfirmBtn"
      );
      this.ghCancelBranchBtn = this.doc.getElementById(
        "ghCancelBranchBtn"
      );
      if (this.ghBranchInput && this.ghBranchMenu) {
        this.autocomplete = new Autocomplete({
          input: this.ghBranchInput,
          menu: this.ghBranchMenu,
          toggleBtn: this.ghBranchToggleBtn || void 0,
          onQuery: (q) => this.handleQuery(q),
          onSelect: (item, fromKeyboard) => this.handleSelect(item, fromKeyboard),
          renderItem: (item) => this.renderAutocompleteItem(item)
        });
      }
      this.setupEventListeners();
    }
    setRepo(owner, repo) {
      this.currentOwner = owner;
      this.currentRepo = repo;
      this.reset();
      if (owner && repo) {
        this.setBranchDisabled(true, "Loading branches\u2026");
        this.updateBranchCount();
        this.cancelNewBranchFlow(false);
        this.deps.log(`GitHub: loading branches for ${owner}/${repo}\u2026`);
        this.isFetchingBranches = true;
        this.deps.postToPlugin({
          type: "GITHUB_FETCH_BRANCHES",
          payload: { owner, repo, page: 1 }
        });
      } else {
        this.setBranchDisabled(true, "Pick a repository first\u2026");
        this.updateBranchCount();
        this.cancelNewBranchFlow(false);
      }
    }
    getCurrentBranch() {
      if (this.desiredBranch) return this.desiredBranch;
      if (this.ghBranchInput && !this.ghBranchInput.disabled) {
        const raw = this.ghBranchInput.value.trim();
        if (raw && raw !== "__more__" && raw !== "__fetch__") {
          if (this.allBranches.includes(raw) || raw === this.defaultBranchFromApi)
            return raw;
        }
      }
      return this.defaultBranchFromApi || "";
    }
    getPrBaseBranch() {
      return this.defaultBranchFromApi || "";
    }
    handleMessage(msg) {
      if (msg.type === "GITHUB_BRANCHES") {
        const pl = msg.payload || {};
        const owner = String(pl.owner || "");
        const repo = String(pl.repo || "");
        if (owner !== this.currentOwner || repo !== this.currentRepo)
          return true;
        this.lastBranchesFetchedAtMs = Date.now();
        this.loadedPages = Number(pl.page || 1);
        this.hasMorePages = !!pl.hasMore;
        this.isFetchingBranches = false;
        if (typeof pl.defaultBranch === "string" && !this.defaultBranchFromApi) {
          this.defaultBranchFromApi = pl.defaultBranch;
        }
        if (this.ghNewBranchBtn) this.ghNewBranchBtn.disabled = false;
        const names = Array.isArray(pl.branches) ? pl.branches.map((b) => b.name) : [];
        const set = new Set(this.allBranches);
        for (const n of names) if (n) set.add(n);
        this.allBranches = Array.from(set).sort(
          (a, b) => a.localeCompare(b)
        );
        this.applyBranchFilter();
        this.setBranchDisabled(false);
        this.deps.log(
          `Loaded ${names.length} branches (page ${this.loadedPages}) for ${repo}${this.hasMorePages ? "\u2026" : ""}`
        );
        return true;
      }
      if (msg.type === "GITHUB_BRANCHES_ERROR") {
        const pl = msg.payload || {};
        const owner = String(pl.owner || "");
        const repo = String(pl.repo || "");
        if (owner !== this.currentOwner || repo !== this.currentRepo)
          return true;
        this.isFetchingBranches = false;
        this.setBranchDisabled(false);
        this.deps.log(
          `Branch load failed (status ${pl.status}): ${pl.message || "unknown error"}`
        );
        return true;
      }
      if (msg.type === "GITHUB_CREATE_BRANCH_RESULT") {
        this.handleCreateBranchResult(msg.payload);
        return true;
      }
      if (msg.type === "GITHUB_RESTORE_SELECTED") {
        const p = msg.payload || {};
        this.desiredBranch = typeof p.branch === "string" ? p.branch : null;
        if (this.desiredBranch && this.ghBranchInput) {
          this.ghBranchInput.value = this.desiredBranch;
          this.lastQuery = this.desiredBranch;
          this.inputPristine = false;
          this.updateClearButtonVisibility();
          if (this.onBranchChange)
            this.onBranchChange(this.desiredBranch);
        }
        return false;
      }
      return false;
    }
    reset() {
      this.desiredBranch = null;
      this.defaultBranchFromApi = void 0;
      this.loadedPages = 0;
      this.hasMorePages = false;
      this.isFetchingBranches = false;
      this.allBranches = [];
      this.filteredBranches = [];
      this.renderCount = 0;
      if (this.ghBranchInput) {
        this.ghBranchInput.value = "";
        this.lastQuery = "";
        this.inputPristine = true;
        this.updateClearButtonVisibility();
      }
      if (this.autocomplete) {
        this.autocomplete.setItems([]);
        this.autocomplete.close();
      }
    }
    setupEventListeners() {
      if (this.ghBranchInput) {
        this.ghBranchInput.addEventListener("change", () => {
          const val = this.ghBranchInput.value;
          if (val && val !== "__more__" && val !== "__fetch__") {
            this.processBranchSelection(val);
          }
        });
      }
      if (this.ghBranchClearBtn) {
        this.ghBranchClearBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (this.ghBranchInput) {
            this.ghBranchInput.value = "";
            this.lastQuery = "";
            this.desiredBranch = null;
            this.inputPristine = false;
            this.updateClearButtonVisibility();
            this.handleQuery("");
            this.ghBranchInput.focus();
          }
        });
      }
      if (this.ghBranchRefreshBtn) {
        this.ghBranchRefreshBtn.addEventListener("click", () => {
          this.lastBranchesFetchedAtMs = 0;
          this.revalidateBranchesIfStale(true);
        });
      }
      if (this.ghNewBranchBtn) {
        this.ghNewBranchBtn.addEventListener("click", () => {
          if (this.ghNewBranchBtn.disabled) return;
          const next = !this.isNewBranchRowVisible();
          if (next) this.showNewBranchRow(true);
          else this.cancelNewBranchFlow(false);
        });
      }
      if (this.ghNewBranchName) {
        this.ghNewBranchName.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            this.requestNewBranchCreation();
          } else if (event.key === "Escape") {
            event.preventDefault();
            this.cancelNewBranchFlow(true);
          }
        });
      }
      if (this.ghCreateBranchConfirmBtn) {
        this.ghCreateBranchConfirmBtn.addEventListener(
          "click",
          () => this.requestNewBranchCreation()
        );
      }
      if (this.ghCancelBranchBtn) {
        this.ghCancelBranchBtn.addEventListener(
          "click",
          () => this.cancelNewBranchFlow(true)
        );
      }
    }
    handleQuery(query) {
      if (query !== "__more__" && query !== "__fetch__") {
        this.lastQuery = query;
      }
      this.inputPristine = false;
      this.updateClearButtonVisibility();
      this.applyBranchFilter();
    }
    handleSelect(item, fromKeyboard) {
      if (item.value === "__more__") {
        this.renderCount = Math.min(
          this.renderCount + RENDER_STEP,
          this.filteredBranches.length
        );
        this.updateAutocompleteItems();
        this.updateBranchCount();
        if (this.ghBranchInput) this.ghBranchInput.value = this.lastQuery;
        if (this.autocomplete) this.autocomplete.open();
        return;
      }
      if (item.value === "__fetch__") {
        this.ensureNextPageIfNeeded();
        if (this.ghBranchInput) this.ghBranchInput.value = this.lastQuery;
        return;
      }
      this.processBranchSelection(item.value);
      if (this.autocomplete) this.autocomplete.close();
    }
    revalidateBranchesIfStale(forceLog = false) {
      if (!this.currentOwner || !this.currentRepo) return;
      const stale = Date.now() - this.lastBranchesFetchedAtMs > BRANCH_TTL_MS;
      if (!stale) {
        if (forceLog)
          this.deps.log("Branches are up to date (no refresh needed).");
        return;
      }
      this.desiredBranch = this.desiredBranch || null;
      this.defaultBranchFromApi = void 0;
      this.loadedPages = 0;
      this.hasMorePages = false;
      this.isFetchingBranches = true;
      this.allBranches = [];
      this.filteredBranches = [];
      this.renderCount = 0;
      this.setBranchDisabled(true, "Refreshing branches\u2026");
      this.updateBranchCount();
      if (this.ghBranchInput) {
        this.ghBranchInput.value = "";
        this.lastQuery = "";
        this.inputPristine = true;
      }
      this.deps.log("Refreshing branches\u2026");
      this.deps.postToPlugin({
        type: "GITHUB_FETCH_BRANCHES",
        payload: {
          owner: this.currentOwner,
          repo: this.currentRepo,
          page: 1
        }
      });
    }
    updateClearButtonVisibility() {
      if (this.ghBranchClearBtn) {
        const hasText = !!(this.ghBranchInput && this.ghBranchInput.value.trim());
        this.ghBranchClearBtn.hidden = !hasText;
      }
    }
    setBranchDisabled(disabled, placeholder) {
      const nextPlaceholder = placeholder !== void 0 ? placeholder : BRANCH_INPUT_PLACEHOLDER;
      if (this.ghBranchInput) {
        this.ghBranchInput.disabled = disabled;
        this.ghBranchInput.placeholder = nextPlaceholder;
        if (disabled) {
          this.ghBranchInput.value = "";
          this.lastQuery = "";
          this.inputPristine = true;
        }
      }
      if (this.ghBranchToggleBtn) {
        this.ghBranchToggleBtn.disabled = disabled;
        this.ghBranchToggleBtn.setAttribute("aria-expanded", "false");
      }
      if (disabled && this.autocomplete) this.autocomplete.close();
    }
    updateBranchCount() {
      if (!this.ghBranchCountEl) return;
      const total = this.allBranches.length;
      const showing = this.filteredBranches.length;
      this.ghBranchCountEl.textContent = `${showing} / ${total}${this.hasMorePages ? " +" : ""}`;
    }
    applyBranchFilter() {
      var _a;
      const rawInput = (((_a = this.ghBranchInput) == null ? void 0 : _a.value) || "").trim();
      const raw = rawInput === "__more__" || rawInput === "__fetch__" ? this.lastQuery.trim() : rawInput;
      const q = raw.toLowerCase();
      const effectiveQuery = q;
      this.filteredBranches = effectiveQuery ? this.allBranches.filter(
        (n) => n.toLowerCase().includes(effectiveQuery)
      ) : [...this.allBranches];
      this.renderCount = Math.min(RENDER_STEP, this.filteredBranches.length);
      this.updateAutocompleteItems();
      this.updateBranchCount();
    }
    updateAutocompleteItems() {
      if (!this.autocomplete) return;
      const items = [];
      const slice = this.filteredBranches.slice(0, this.renderCount);
      if (slice.length > 0) {
        for (const name of slice) {
          items.push({
            key: name,
            label: name,
            value: name,
            type: "option"
          });
        }
      } else {
        items.push({
          key: "__empty__",
          label: this.allBranches.length ? "No matching branches" : "No branches loaded yet",
          value: "",
          type: "info",
          disabled: true
        });
      }
      if (this.filteredBranches.length > this.renderCount) {
        items.push({
          key: "__more__",
          label: `Load more\u2026 (${this.filteredBranches.length - this.renderCount} more)`,
          value: "__more__",
          type: "action"
        });
      } else if (this.hasMorePages) {
        items.push({
          key: "__fetch__",
          label: "Load next page\u2026",
          value: "__fetch__",
          type: "action"
        });
      }
      this.autocomplete.setItems(items);
    }
    renderAutocompleteItem(item) {
      if (item.type === "info") {
        return h(
          "li",
          {
            className: "gh-branch-item gh-branch-item-empty",
            "aria-disabled": "true"
          },
          item.label
        );
      }
      if (item.type === "action") {
        return h(
          "li",
          {
            className: "gh-branch-item gh-branch-item-action"
          },
          item.label
        );
      }
      return h(
        "li",
        {
          className: "gh-branch-item"
        },
        item.label
      );
    }
    processBranchSelection(value) {
      const val = (value || "").trim();
      if (!val) return;
      if (!this.ghBranchInput) return;
      this.desiredBranch = val;
      this.lastQuery = val;
      this.ghBranchInput.value = val;
      this.inputPristine = false;
      this.updateClearButtonVisibility();
      this.deps.postToPlugin({
        type: "GITHUB_SELECT_BRANCH",
        payload: {
          owner: this.currentOwner,
          repo: this.currentRepo,
          branch: val
        }
      });
      this.applyBranchFilter();
      if (this.onBranchChange) this.onBranchChange(val);
    }
    ensureNextPageIfNeeded() {
      if (!this.ghBranchInput) return;
      if (!this.hasMorePages || this.isFetchingBranches) return;
      if (!this.currentOwner || !this.currentRepo) return;
      this.isFetchingBranches = true;
      this.deps.postToPlugin({
        type: "GITHUB_FETCH_BRANCHES",
        payload: {
          owner: this.currentOwner,
          repo: this.currentRepo,
          page: this.loadedPages + 1
        }
      });
    }
    // New Branch Flow
    showNewBranchRow(show) {
      if (!this.ghNewBranchRow) return;
      this.ghNewBranchRow.style.display = show ? "flex" : "none";
      if (show && this.ghNewBranchName) {
        if (!this.ghNewBranchName.value) {
          this.ghNewBranchName.value = `tokens/update-${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
        }
        this.ghNewBranchName.focus();
        this.ghNewBranchName.select();
      }
    }
    isNewBranchRowVisible() {
      if (!this.ghNewBranchRow) return false;
      return this.ghNewBranchRow.style.display !== "none";
    }
    cancelNewBranchFlow(refocusBtn) {
      this.showNewBranchRow(false);
      if (this.ghNewBranchName) this.ghNewBranchName.value = "";
      if (refocusBtn && this.ghNewBranchBtn) this.ghNewBranchBtn.focus();
    }
    requestNewBranchCreation() {
      var _a;
      if (!this.ghCreateBranchConfirmBtn || this.ghCreateBranchConfirmBtn.disabled)
        return;
      if (!this.currentOwner || !this.currentRepo) {
        this.deps.log("Pick a repository before creating a branch.");
        return;
      }
      const baseBranch = this.defaultBranchFromApi || "";
      if (!baseBranch) {
        this.deps.log(
          "GitHub: Unable to determine the repository default branch. Refresh branches first."
        );
        return;
      }
      const newBranch = (((_a = this.ghNewBranchName) == null ? void 0 : _a.value) || "").trim();
      if (!newBranch) {
        this.deps.log("Enter a branch name to create.");
        if (this.ghNewBranchName) this.ghNewBranchName.focus();
        return;
      }
      if (newBranch === baseBranch) {
        this.deps.log(
          "Enter a branch name that differs from the source branch."
        );
        if (this.ghNewBranchName) this.ghNewBranchName.focus();
        return;
      }
      this.ghCreateBranchConfirmBtn.disabled = true;
      this.deps.log(`GitHub: creating ${newBranch} from ${baseBranch}\u2026`);
      this.deps.postToPlugin({
        type: "GITHUB_CREATE_BRANCH",
        payload: {
          owner: this.currentOwner,
          repo: this.currentRepo,
          baseBranch,
          newBranch
        }
      });
    }
    handleCreateBranchResult(payload) {
      var _a;
      const pl = payload || {};
      if (this.ghCreateBranchConfirmBtn)
        this.ghCreateBranchConfirmBtn.disabled = false;
      if (typeof pl.ok !== "boolean") return;
      if (pl.ok) {
        const baseBranch = String(pl.baseBranch || "");
        const newBranch = String(pl.newBranch || "");
        const url = String(pl.html_url || "");
        if (newBranch) {
          const s = new Set(this.allBranches);
          if (!s.has(newBranch)) {
            s.add(newBranch);
            this.allBranches = Array.from(s).sort(
              (a, b) => a.localeCompare(b)
            );
          }
          this.desiredBranch = newBranch;
          if (this.ghBranchInput) {
            this.ghBranchInput.value = newBranch;
            this.lastQuery = newBranch;
            this.inputPristine = false;
          }
          this.applyBranchFilter();
        }
        this.showNewBranchRow(false);
        if (this.ghNewBranchName) this.ghNewBranchName.value = "";
        if (url) {
          this.deps.log(
            `Branch created: ${newBranch} (from ${baseBranch})`
          );
          const logEl = this.deps.getLogElement();
          if (logEl && this.doc) {
            const wrap = h(
              "div",
              null,
              h(
                "a",
                { href: url, target: "_blank" },
                "View on GitHub"
              )
            );
            logEl.appendChild(wrap);
            logEl.scrollTop = logEl.scrollHeight;
          }
        } else {
          this.deps.log(
            `Branch created: ${newBranch} (from ${baseBranch})`
          );
        }
        if (this.onBranchChange && newBranch)
          this.onBranchChange(newBranch);
      } else {
        const status = (_a = pl.status) != null ? _a : 0;
        const message = pl.message || "unknown error";
        this.deps.log(
          `Create branch failed (status ${status}): ${message}`
        );
        if (pl.samlRequired) {
          this.deps.log(
            "This org requires SSO. Open the repo in your browser and authorize SSO for your token."
          );
        } else if (status === 403) {
          if (pl.noPushPermission) {
            this.deps.log(
              "You do not have push permission to this repository. Ask a maintainer for write access."
            );
          } else {
            this.deps.log("Likely a token permission issue:");
            this.deps.log(
              '\u2022 Classic PAT: add the "repo" scope (or "public_repo" for public repos).'
            );
            this.deps.log(
              '\u2022 Fine-grained PAT: grant this repository and set "Contents: Read and write".'
            );
          }
        }
      }
    }
  };

  // src/app/github/ui/folder.ts
  var GH_FOLDER_PLACEHOLDER = "Path in repository\u2026";
  var GithubFolderUi = class {
    constructor(deps) {
      this.doc = null;
      this.win = null;
      // Elements
      this.ghFolderInput = null;
      this.ghFolderDisplay = null;
      this.ghPickFolderBtn = null;
      this.folderPickerOverlay = null;
      this.folderPickerTitleEl = null;
      this.folderPickerPathInput = null;
      this.folderPickerUseBtn = null;
      this.folderPickerListEl = null;
      this.folderPickerCancelBtn = null;
      // State
      this.currentOwner = "";
      this.currentRepo = "";
      this.currentBranch = "";
      this.pickerState = {
        isOpen: false,
        currentPath: "",
        lastFocus: null,
        refreshNonce: 0
      };
      this.folderListWaiters = [];
      this.folderCreateWaiters = [];
      // Callbacks
      this.onFolderChange = null;
      this.deps = deps;
    }
    attach(context) {
      var _a;
      this.doc = context.document;
      this.win = context.window;
      this.ghFolderInput = this.doc.getElementById(
        "ghFolderInput"
      );
      this.ghFolderDisplay = this.doc.getElementById("ghFolderDisplay");
      this.setGhFolderDisplay(((_a = this.ghFolderInput) == null ? void 0 : _a.value) || "");
      this.ghPickFolderBtn = this.doc.getElementById(
        "ghPickFolderBtn"
      );
      this.folderPickerOverlay = this.doc.getElementById(
        "folderPickerOverlay"
      );
      this.folderPickerTitleEl = this.doc.getElementById("folderPickerTitle");
      this.folderPickerPathInput = this.doc.getElementById(
        "folderPickerPath"
      );
      this.folderPickerUseBtn = this.doc.getElementById(
        "folderPickerUseBtn"
      );
      this.folderPickerListEl = this.doc.getElementById("folderPickerList");
      this.folderPickerCancelBtn = this.doc.getElementById(
        "folderPickerCancelBtn"
      );
      this.setupEventListeners();
    }
    setContext(owner, repo, branch) {
      this.currentOwner = owner;
      this.currentRepo = repo;
      this.currentBranch = branch;
      this.updateFolderControlsEnabled();
    }
    reset() {
      this.setGhFolderDisplay("");
      this.pickerState.isOpen = false;
      this.pickerState.currentPath = "";
      this.pickerState.refreshNonce++;
      this.folderListWaiters = [];
      this.folderCreateWaiters = [];
      if (this.folderPickerOverlay) {
        this.folderPickerOverlay.classList.remove("is-open");
        this.folderPickerOverlay.setAttribute("aria-hidden", "true");
        this.folderPickerOverlay.hidden = true;
      }
    }
    getFolder() {
      const raw = this.ghFolderInput ? this.ghFolderInput.value.trim() : "";
      return this.normalizeFolderInput(raw).payload;
    }
    setFolder(path) {
      const normalized = this.normalizeFolderInput(path);
      this.setGhFolderDisplay(normalized.display);
    }
    handleMessage(msg) {
      if (msg.type === "GITHUB_FOLDER_LIST_RESULT") {
        const pl = msg.payload;
        const path = String(pl.path || "").replace(/^\/+|\/+$/g, "");
        const ok = pl.ok;
        let entries = [];
        let message = "";
        let status;
        if (pl.ok) {
          entries = pl.entries;
        } else {
          message = pl.message;
          status = pl.status;
        }
        for (let i = 0; i < this.folderListWaiters.length; i++) {
          if (this.folderListWaiters[i].path === path) {
            const waiter = this.folderListWaiters.splice(i, 1)[0];
            if (ok) waiter.resolve({ ok: true, entries });
            else
              waiter.reject({
                ok: false,
                message: message || `HTTP ${status || 0}`,
                status
              });
            break;
          }
        }
        return true;
      }
      if (msg.type === "GITHUB_CREATE_FOLDER_RESULT") {
        const pl = msg.payload;
        const fp = String(pl.folderPath || "").replace(/^\/+|\/+$/g, "");
        const ok = pl.ok;
        let message = "";
        let status;
        if (!pl.ok) {
          message = pl.message;
          status = pl.status;
        }
        for (let i = 0; i < this.folderCreateWaiters.length; i++) {
          if (this.folderCreateWaiters[i].folderPath === fp) {
            const waiter = this.folderCreateWaiters.splice(i, 1)[0];
            if (ok) waiter.resolve({ ok: true });
            else
              waiter.reject({
                ok: false,
                message: message || `HTTP ${status || 0}`,
                status
              });
            break;
          }
        }
        return true;
      }
      if (msg.type === "GITHUB_RESTORE_SELECTED") {
        const p = msg.payload || {};
        if (typeof p.folder === "string") {
          const normalized = this.normalizeFolderInput(p.folder);
          this.setGhFolderDisplay(normalized.display);
          if (this.onFolderChange)
            this.onFolderChange(normalized.payload);
        }
        return false;
      }
      return false;
    }
    setupEventListeners() {
      if (this.ghPickFolderBtn) {
        this.ghPickFolderBtn.addEventListener(
          "click",
          () => this.openFolderPicker()
        );
      }
      if (this.folderPickerOverlay) {
        this.folderPickerOverlay.addEventListener("click", (event) => {
          if (event.target === this.folderPickerOverlay)
            this.closeFolderPicker();
        });
      }
      if (this.folderPickerCancelBtn) {
        this.folderPickerCancelBtn.addEventListener(
          "click",
          () => this.closeFolderPicker()
        );
      }
      let folderPickerPathDebounce;
      if (this.folderPickerPathInput) {
        this.folderPickerPathInput.addEventListener("input", () => {
          var _a, _b;
          if (folderPickerPathDebounce)
            (_a = this.win) == null ? void 0 : _a.clearTimeout(folderPickerPathDebounce);
          const value = this.folderPickerPathInput.value;
          folderPickerPathDebounce = (_b = this.win) == null ? void 0 : _b.setTimeout(() => {
            this.setFolderPickerPath(value, true, false);
          }, 120);
        });
        this.folderPickerPathInput.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            this.setFolderPickerPath(this.folderPickerPathInput.value);
          }
        });
        this.folderPickerPathInput.addEventListener(
          "click",
          (e) => e.stopPropagation()
        );
        this.folderPickerPathInput.addEventListener(
          "mousedown",
          (e) => e.stopPropagation()
        );
      }
      if (this.folderPickerUseBtn) {
        this.folderPickerUseBtn.addEventListener("click", () => {
          if (this.folderPickerPathInput) {
            this.setFolderPickerPath(
              this.folderPickerPathInput.value,
              false
            );
          }
          const selectionRaw = this.pickerState.currentPath ? `${this.pickerState.currentPath}/` : "/";
          const normalized = this.normalizeFolderInput(selectionRaw);
          this.setGhFolderDisplay(normalized.display);
          this.deps.postToPlugin({
            type: "GITHUB_SET_FOLDER",
            payload: {
              owner: this.currentOwner,
              repo: this.currentRepo,
              folder: normalized.payload
            }
          });
          this.closeFolderPicker();
          this.deps.log(
            `Folder selected: ${normalized.display === "/" ? "(repo root)" : normalized.display}`
          );
          if (this.onFolderChange)
            this.onFolderChange(normalized.payload);
        });
      }
      if (this.doc) {
        this.doc.addEventListener(
          "keydown",
          (e) => this.handleFolderPickerKeydown(e)
        );
      }
    }
    normalizeFolderInput(raw) {
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
    normalizeFolderPickerPath(raw) {
      const trimmed = (raw || "").trim();
      if (!trimmed || trimmed === "/" || trimmed === "./" || trimmed === ".")
        return "";
      const collapsed = trimmed.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
      return collapsed.replace(/^\/+/, "").replace(/\/+$/, "");
    }
    setGhFolderDisplay(display) {
      if (this.ghFolderInput) this.ghFolderInput.value = display || "";
      if (!this.ghFolderDisplay) return;
      if (display) {
        this.ghFolderDisplay.textContent = display;
        this.ghFolderDisplay.classList.remove("is-placeholder");
      } else {
        this.ghFolderDisplay.textContent = GH_FOLDER_PLACEHOLDER;
        this.ghFolderDisplay.classList.add("is-placeholder");
      }
    }
    updateFolderControlsEnabled() {
      const enable = !!(this.currentOwner && this.currentRepo && this.currentBranch);
      if (this.ghPickFolderBtn) this.ghPickFolderBtn.disabled = !enable;
    }
    listDir(path) {
      return new Promise((resolve) => {
        const req = { path: path.replace(/^\/+|\/+$/g, "") };
        this.folderListWaiters.push({
          path: req.path,
          resolve: (v) => resolve(v),
          reject: (v) => resolve(v)
        });
        this.deps.postToPlugin({
          type: "GITHUB_FOLDER_LIST",
          payload: {
            owner: this.currentOwner,
            repo: this.currentRepo,
            branch: this.currentBranch,
            path: req.path
          }
        });
      });
    }
    openFolderPicker() {
      var _a, _b;
      if (!this.currentOwner || !this.currentRepo) {
        this.deps.log("Pick a repository first.");
        return;
      }
      if (!this.currentBranch) {
        this.deps.log("Pick a branch first.");
        return;
      }
      if (!(this.folderPickerOverlay && this.folderPickerTitleEl && this.folderPickerPathInput && this.folderPickerListEl)) {
        this.deps.log("Folder picker UI is unavailable.");
        return;
      }
      this.pickerState.lastFocus = this.doc && this.doc.activeElement instanceof HTMLElement ? this.doc.activeElement : null;
      this.folderPickerOverlay.hidden = false;
      this.folderPickerOverlay.classList.add("is-open");
      this.folderPickerOverlay.setAttribute("aria-hidden", "false");
      this.pickerState.isOpen = true;
      this.updateFolderPickerTitle(this.currentBranch);
      const startNormalized = this.normalizeFolderInput(
        ((_a = this.ghFolderInput) == null ? void 0 : _a.value) || ""
      );
      const startPath = startNormalized.payload === "/" ? "" : startNormalized.payload;
      this.setFolderPickerPath(startPath, true);
      (_b = this.win) == null ? void 0 : _b.setTimeout(() => {
        var _a2, _b2;
        (_a2 = this.folderPickerPathInput) == null ? void 0 : _a2.focus();
        (_b2 = this.folderPickerPathInput) == null ? void 0 : _b2.select();
      }, 0);
    }
    closeFolderPicker() {
      var _a;
      if (!this.folderPickerOverlay) return;
      this.folderPickerOverlay.classList.remove("is-open");
      this.folderPickerOverlay.setAttribute("aria-hidden", "true");
      this.folderPickerOverlay.hidden = true;
      this.pickerState.isOpen = false;
      this.pickerState.currentPath = "";
      this.pickerState.refreshNonce++;
      if (this.folderPickerListEl) {
        this.folderPickerListEl.replaceChildren(
          this.createFolderPickerRow("Loading\u2026", {
            muted: true,
            disabled: true
          })
        );
      }
      if (this.pickerState.lastFocus && ((_a = this.doc) == null ? void 0 : _a.contains(this.pickerState.lastFocus))) {
        this.pickerState.lastFocus.focus();
      }
      this.pickerState.lastFocus = null;
    }
    createFolderPickerRow(label, options) {
      const props = {
        className: `folder-picker-row ${(options == null ? void 0 : options.muted) ? "is-muted" : ""}`,
        type: "button"
      };
      if (options == null ? void 0 : options.disabled) props.disabled = true;
      if (options == null ? void 0 : options.onClick) {
        props.onmousedown = (event) => {
          var _a;
          event.preventDefault();
          event.stopPropagation();
          (_a = options.onClick) == null ? void 0 : _a.call(options);
        };
      }
      return h("button", props, label);
    }
    updateFolderPickerTitle(branch) {
      if (!this.folderPickerTitleEl) return;
      if (this.currentOwner && this.currentRepo) {
        this.folderPickerTitleEl.textContent = `${this.currentOwner}/${this.currentRepo} @ ${branch}`;
      } else {
        this.folderPickerTitleEl.textContent = "Select a repository first";
      }
    }
    setFolderPickerPath(raw, refresh = true, syncInput = true) {
      const normalized = this.normalizeFolderPickerPath(raw);
      this.pickerState.currentPath = normalized;
      if (syncInput && this.folderPickerPathInput)
        this.folderPickerPathInput.value = normalized;
      if (refresh && this.pickerState.isOpen) {
        void this.refreshFolderPickerList();
      }
    }
    async refreshFolderPickerList() {
      if (!(this.folderPickerListEl && this.pickerState.isOpen)) return;
      const listEl = this.folderPickerListEl;
      const requestId = ++this.pickerState.refreshNonce;
      listEl.replaceChildren(
        this.createFolderPickerRow("Loading\u2026", {
          muted: true,
          disabled: true
        })
      );
      const path = this.pickerState.currentPath;
      const res = await this.listDir(path);
      if (requestId !== this.pickerState.refreshNonce) return;
      if (!res.ok) {
        const status = typeof res.status === "number" ? res.status : 0;
        if (status === 404) {
          listEl.replaceChildren(
            this.createFolderPickerRow(
              "Folder not found. It will be created during export.",
              { muted: true, disabled: true }
            )
          );
          return;
        }
        if (status === 409) {
          listEl.replaceChildren(
            this.createFolderPickerRow(
              "Cannot open this path: an existing file blocks the folder.",
              { muted: true, disabled: true }
            )
          );
          return;
        }
        const message = res.message ? res.message : "failed to fetch";
        listEl.replaceChildren(
          this.createFolderPickerRow(`Error: ${message}`, {
            muted: true,
            disabled: true
          })
        );
        return;
      }
      const nodes = [];
      if (path) {
        nodes.push(
          this.createFolderPickerRow(".. (up one level)", {
            muted: true,
            onClick: () => {
              const parentParts = this.pickerState.currentPath.split("/").filter(Boolean);
              parentParts.pop();
              this.setFolderPickerPath(parentParts.join("/"));
            }
          })
        );
      }
      const entries = Array.isArray(res.entries) ? res.entries : [];
      const dirs = entries.filter((e) => e.type === "dir").sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      if (dirs.length === 0) {
        nodes.push(
          this.createFolderPickerRow("(no subfolders)", {
            muted: true,
            disabled: true
          })
        );
      } else {
        for (const d of dirs) {
          const name = d.name || "";
          nodes.push(
            this.createFolderPickerRow(`${name}/`, {
              onClick: () => {
                const next = this.pickerState.currentPath ? `${this.pickerState.currentPath}/${name}` : name;
                this.setFolderPickerPath(next);
              }
            })
          );
        }
      }
      listEl.replaceChildren(...nodes);
    }
    handleFolderPickerKeydown(event) {
      if (!this.pickerState.isOpen) return;
      if (event.key === "Escape") {
        event.preventDefault();
        this.closeFolderPicker();
      }
    }
  };

  // src/app/github/ui/import.ts
  var GithubImportUi = class {
    constructor(deps) {
      this.doc = null;
      // Elements
      this.ghFetchBtn = null;
      this.ghFetchPathInput = null;
      // State
      this.currentOwner = "";
      this.currentRepo = "";
      this.currentBranch = "";
      this.currentFolder = "";
      this.deps = deps;
    }
    attach(context) {
      this.doc = context.document;
      this.ghFetchBtn = this.doc.getElementById(
        "ghFetchTokensBtn"
      );
      this.ghFetchPathInput = this.doc.getElementById(
        "ghFetchPathInput"
      );
      if (this.ghFetchBtn) {
        this.ghFetchBtn.addEventListener("click", () => this.fetchTokens());
      }
      if (this.ghFetchPathInput) {
        this.ghFetchPathInput.addEventListener(
          "input",
          () => this.updateEnabled()
        );
      }
    }
    setContext(owner, repo, branch, folder) {
      this.currentOwner = owner;
      this.currentRepo = repo;
      this.currentBranch = branch;
      this.currentFolder = folder;
      this.updateEnabled();
    }
    reset() {
      this.currentOwner = "";
      this.currentRepo = "";
      this.currentBranch = "";
      this.currentFolder = "";
      this.updateEnabled();
    }
    handleMessage(msg) {
      if (msg.type === "GITHUB_FETCH_TOKENS_RESULT") {
        this.handleFetchResult(msg.payload);
        return true;
      }
      return false;
    }
    updateEnabled() {
      if (this.ghFetchBtn) {
        const hasContext = !!(this.currentOwner && this.currentRepo && this.currentBranch);
        const hasPath = !!(this.ghFetchPathInput && this.ghFetchPathInput.value.trim());
        this.ghFetchBtn.disabled = !(hasContext && hasPath);
      }
    }
    fetchTokens() {
      var _a;
      if (!this.currentOwner || !this.currentRepo || !this.currentBranch) {
        this.deps.log("Please select a repository and branch first.");
        return;
      }
      const pathInput = ((_a = this.ghFetchPathInput) == null ? void 0 : _a.value.trim()) || "";
      if (!pathInput) {
        this.deps.log("Please enter a path to the tokens file.");
        return;
      }
      const path = pathInput.replace(/^\/+|\/+$/g, "");
      this.deps.log(
        `Fetching ${path} from ${this.currentOwner}/${this.currentRepo} (${this.currentBranch})\u2026`
      );
      if (this.ghFetchBtn) this.ghFetchBtn.disabled = true;
      const allowHex = !!(this.deps.getAllowHexCheckbox() && this.deps.getAllowHexCheckbox().checked);
      const contexts = this.deps.getImportContexts();
      this.deps.postToPlugin({
        type: "GITHUB_FETCH_TOKENS",
        payload: {
          owner: this.currentOwner,
          repo: this.currentRepo,
          branch: this.currentBranch,
          path,
          allowHexStrings: allowHex,
          contexts
        }
      });
    }
    handleFetchResult(pl) {
      if (this.ghFetchBtn) this.ghFetchBtn.disabled = false;
      if (!pl || typeof pl !== "object") return;
      const payload = pl;
      const status = typeof payload.status === "number" ? payload.status : 0;
      const message = payload.message || "unknown error";
      if (payload.ok) {
        const json = payload.json;
        if (!json) {
          this.deps.log("Fetched file is empty or invalid JSON.");
          return;
        }
        this.deps.log(
          `Successfully fetched tokens file (${JSON.stringify(json).length} bytes).`
        );
      } else {
        this.deps.log(`Fetch failed (status ${status}): ${message}`);
        if (status === 404) {
          this.deps.log("File not found. Check if the path is correct.");
        }
      }
    }
  };

  // src/app/github/ui/export.ts
  var GithubExportUi = class {
    constructor(deps) {
      this.doc = null;
      // Elements
      this.ghExportAndCommitBtn = null;
      this.ghCommitMsgInput = null;
      this.ghFilenameInput = null;
      this.ghScopeAll = null;
      this.ghScopeTypography = null;
      this.ghScopeSelected = null;
      this.ghCreatePrChk = null;
      this.ghPrTitleInput = null;
      this.ghPrBodyInput = null;
      // State
      this.currentOwner = "";
      this.currentRepo = "";
      this.currentBranch = "";
      this.currentFolder = "";
      this.prBaseBranch = "";
      this.hasCollections = false;
      this.hasTextStyles = false;
      this.deps = deps;
    }
    attach(context) {
      this.doc = context.document;
      this.ghExportAndCommitBtn = this.doc.getElementById(
        "ghExportAndCommitBtn"
      );
      this.ghCommitMsgInput = this.doc.getElementById(
        "ghCommitMsgInput"
      );
      this.ghFilenameInput = this.doc.getElementById(
        "ghFilenameInput"
      );
      this.ghScopeAll = this.doc.getElementById(
        "ghScopeAll"
      );
      this.ghScopeTypography = this.doc.getElementById(
        "ghScopeTypography"
      );
      this.ghScopeSelected = this.doc.getElementById(
        "ghScopeSelected"
      );
      this.ghCreatePrChk = this.doc.getElementById(
        "ghCreatePrChk"
      );
      this.ghPrTitleInput = this.doc.getElementById(
        "ghPrTitleInput"
      );
      this.ghPrBodyInput = this.doc.getElementById(
        "ghPrBodyInput"
      );
      if (this.ghExportAndCommitBtn) {
        this.ghExportAndCommitBtn.addEventListener(
          "click",
          () => this.handleExportClick()
        );
      }
      [this.ghScopeAll, this.ghScopeTypography, this.ghScopeSelected].forEach(
        (el) => {
          if (el)
            el.addEventListener("change", () => this.updateEnabled());
        }
      );
    }
    setContext(owner, repo, branch, folder, prBaseBranch) {
      this.currentOwner = owner;
      this.currentRepo = repo;
      this.currentBranch = branch;
      this.currentFolder = folder;
      this.prBaseBranch = prBaseBranch;
      this.updateEnabled();
    }
    reset() {
      this.currentOwner = "";
      this.currentRepo = "";
      this.currentBranch = "";
      this.currentFolder = "";
      this.prBaseBranch = "";
      this.hasCollections = false;
      this.hasTextStyles = false;
      this.updateEnabled();
    }
    handleMessage(msg) {
      if (msg.type === "GITHUB_COMMIT_RESULT") {
        this.handleCommitResult(msg.payload);
        return true;
      }
      if (msg.type === "GITHUB_PR_RESULT") {
        this.handlePrResult(msg.payload);
        return true;
      }
      return false;
    }
    updateEnabled() {
      if (!this.ghExportAndCommitBtn) return;
      const hasContext = !!(this.currentOwner && this.currentRepo && this.currentBranch);
      let scopeValid = true;
      const scope = this.getSelectedScope();
      if (scope === "selected") {
        const collectionSelect = this.deps.getCollectionSelect();
        const modeSelect = this.deps.getModeSelect();
        const hasCollection = !!(collectionSelect && collectionSelect.value);
        const hasMode = !!(modeSelect && modeSelect.value);
        scopeValid = hasCollection && hasMode;
      } else if (scope === "all") {
        scopeValid = this.hasCollections;
      } else if (scope === "typography") {
        scopeValid = this.hasTextStyles;
      }
      const hasFilename = !!(this.ghFilenameInput && this.ghFilenameInput.value.trim());
      this.ghExportAndCommitBtn.disabled = !(hasContext && scopeValid && hasFilename);
    }
    setCollectionsAvailability(hasCollections, hasTextStyles) {
      this.hasCollections = hasCollections;
      this.hasTextStyles = hasTextStyles;
      this.updateEnabled();
    }
    getSelectedScope() {
      if (this.ghScopeAll && this.ghScopeAll.checked) return "all";
      if (this.ghScopeTypography && this.ghScopeTypography.checked)
        return "typography";
      return "selected";
    }
    handleExportClick() {
      var _a, _b, _c, _d, _e, _f, _g, _h;
      if (!this.currentOwner || !this.currentRepo || !this.currentBranch) {
        this.deps.log("Pick a repository and branch first.");
        return;
      }
      const collectionSelect = this.deps.getCollectionSelect();
      const modeSelect = this.deps.getModeSelect();
      const scope = this.ghScopeAll && this.ghScopeAll.checked ? "all" : this.ghScopeTypography && this.ghScopeTypography.checked ? "typography" : "selected";
      const selectedCollection = collectionSelect ? collectionSelect.value || "" : "";
      const selectedMode = modeSelect ? modeSelect.value || "" : "";
      const commitMessage = (((_a = this.ghCommitMsgInput) == null ? void 0 : _a.value) || "Update tokens from Figma").trim();
      const folder = this.currentFolder;
      if (!folder || folder === "/") {
      }
      const filenameRaw = ((_b = this.ghFilenameInput) == null ? void 0 : _b.value) || "";
      if (!filenameRaw.trim()) {
        this.deps.log("Enter a filename (e.g. tokens.json).");
        (_c = this.ghFilenameInput) == null ? void 0 : _c.focus();
        return;
      }
      if (!filenameRaw.endsWith(".json")) {
        this.deps.log("Filename must end with .json");
        (_d = this.ghFilenameInput) == null ? void 0 : _d.focus();
        return;
      }
      if (scope === "selected") {
        if (!selectedCollection || !selectedMode) {
          this.deps.log("Pick a collection and a mode before exporting.");
          return;
        }
      }
      const createPr = !!(this.ghCreatePrChk && this.ghCreatePrChk.checked);
      const payload = {
        type: "GITHUB_EXPORT_AND_COMMIT",
        payload: {
          owner: this.currentOwner,
          repo: this.currentRepo,
          branch: this.currentBranch,
          folder,
          filename: filenameRaw,
          commitMessage,
          scope,
          styleDictionary: !!((_e = this.deps.getStyleDictionaryCheckbox()) == null ? void 0 : _e.checked),
          flatTokens: !!((_f = this.deps.getFlatTokensCheckbox()) == null ? void 0 : _f.checked),
          createPr
        }
      };
      if (selectedCollection) payload.payload.collection = selectedCollection;
      if (selectedMode) payload.payload.mode = selectedMode;
      if (createPr) {
        payload.payload.prBase = this.prBaseBranch;
        payload.payload.prTitle = (((_g = this.ghPrTitleInput) == null ? void 0 : _g.value) || "").trim();
        payload.payload.prBody = ((_h = this.ghPrBodyInput) == null ? void 0 : _h.value) || "";
      }
      const scopeLabel = scope === "all" ? "all collections" : scope === "typography" ? "typography" : "selected mode";
      const fullPath = folder ? `${folder}${filenameRaw}` : filenameRaw;
      this.deps.log(`GitHub: Export summary \u2192 ${fullPath} (${scopeLabel})`);
      this.deps.log(
        createPr ? "Export, Commit & PR requested\u2026" : "Export & Commit requested\u2026"
      );
      this.deps.postToPlugin(payload);
    }
    handleCommitResult(pl) {
      if (!pl || typeof pl !== "object") return;
      const payload = pl;
      if (payload.ok) {
        const url = String(payload.commitUrl || "");
        const branch = payload.branch || "";
        const fullPath = payload.fullPath || "file";
        this.deps.log(`Commit succeeded (${branch}): ${url || "(no URL)"}`);
        this.deps.log(`Committed ${fullPath}`);
        if (url) {
          this.addLogLink(url, "View commit");
        }
        if (payload.createdPr) {
          const pr = payload.createdPr;
          this.deps.log(
            `PR prepared (#${pr.number}) from ${pr.head} \u2192 ${pr.base}`
          );
        }
      } else {
        const status = typeof payload.status === "number" ? payload.status : 0;
        const message = payload.message || "unknown error";
        const fullPath = payload.fullPath || "file";
        if (status === 304) {
          this.deps.log(`Commit skipped: ${message} (${fullPath})`);
        } else {
          this.deps.log(
            `Commit failed (${status}): ${message} (${fullPath})`
          );
        }
      }
    }
    handlePrResult(pl) {
      if (!pl || typeof pl !== "object") return;
      const payload = pl;
      if (payload.ok) {
        this.deps.log(
          `PR created: #${payload.number} (${payload.head} \u2192 ${payload.base})`
        );
        const url = payload.url;
        if (url && typeof url === "string") {
          this.addLogLink(url, "View PR");
        }
      } else {
        this.deps.log(
          `PR creation failed (${payload.status || 0}): ${payload.message || "unknown error"}`
        );
      }
    }
    addLogLink(url, text) {
      const logEl = this.deps.getLogElement();
      if (logEl && this.doc) {
        const wrap = this.doc.createElement("div");
        const a = this.doc.createElement("a");
        a.href = url;
        a.target = "_blank";
        a.textContent = text;
        wrap.appendChild(a);
        logEl.appendChild(wrap);
        logEl.scrollTop = logEl.scrollHeight;
      }
    }
  };

  // src/app/github/ui.ts
  function createGithubUi(deps) {
    const authUi = new GithubAuthUi(deps);
    const repoUi = new GithubRepoUi(deps);
    const branchUi = new GithubBranchUi(deps);
    const folderUi = new GithubFolderUi(deps);
    const importUi = new GithubImportUi(deps);
    const exportUi = new GithubExportUi(deps);
    wireDependencies();
    function wireDependencies() {
      repoUi.onRepoChange = () => {
        const { owner, repo } = repoUi.getSelected();
        branchUi.setRepo(owner, repo);
        folderUi.reset();
        importUi.reset();
        exportUi.reset();
      };
      branchUi.onBranchChange = (branch) => {
        const { owner, repo } = repoUi.getSelected();
        folderUi.setContext(owner, repo, branch);
        const folder = folderUi.getFolder();
        const prBase = branchUi.getPrBaseBranch();
        importUi.setContext(owner, repo, branch, folder);
        exportUi.setContext(owner, repo, branch, folder, prBase);
      };
      folderUi.onFolderChange = (folder) => {
        const { owner, repo } = repoUi.getSelected();
        const branch = branchUi.getCurrentBranch();
        const prBase = branchUi.getPrBaseBranch();
        importUi.setContext(owner, repo, branch, folder);
        exportUi.setContext(owner, repo, branch, folder, prBase);
      };
    }
    function attach(context) {
      authUi.attach(context);
      repoUi.attach(context);
      branchUi.attach(context);
      folderUi.attach(context);
      importUi.attach(context);
      exportUi.attach(context);
    }
    function handleMessage(msg) {
      let handled = false;
      handled = authUi.handleMessage(msg) || handled;
      handled = repoUi.handleMessage(msg) || handled;
      handled = branchUi.handleMessage(msg) || handled;
      handled = folderUi.handleMessage(msg) || handled;
      handled = importUi.handleMessage(msg) || handled;
      handled = exportUi.handleMessage(msg) || handled;
      return handled;
    }
    function onSelectionChange() {
      exportUi.updateEnabled();
    }
    function onCollectionsData(data) {
      const hasCollections = !!(data == null ? void 0 : data.collections) && data.collections.length > 0 && data.collections.some((c) => c.variables && c.variables.length > 0);
      const hasTextStyles = !!((data == null ? void 0 : data.textStyles) && data.textStyles.length);
      exportUi.setCollectionsAvailability(hasCollections, hasTextStyles);
      exportUi.updateEnabled();
    }
    return {
      attach,
      handleMessage,
      onSelectionChange,
      onCollectionsData
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
    const h2 = Math.max(420, Math.min(1200, Math.floor(height)));
    postToPlugin({ type: "UI_RESIZE", payload: { width: w, height: h2 } });
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
  var prefersDarkQuery = typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  function applyTheme() {
    if (typeof document === "undefined") return;
    const effective = appState.systemDarkMode ? "dark" : "light";
    const root = document.documentElement;
    if (effective === "light") {
      root.setAttribute("data-theme", "light");
    } else {
      root.removeAttribute("data-theme");
    }
    root.style.colorScheme = effective;
  }
  function primeTheme() {
    if (!prefersDarkQuery) {
      applyTheme();
      return;
    }
    appState.systemDarkMode = prefersDarkQuery.matches;
    applyTheme();
    prefersDarkQuery.addEventListener("change", (e) => {
      appState.systemDarkMode = e.matches;
      applyTheme();
    });
  }
  primeTheme();
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
    const maybePayload = data.pluginMessage;
    if (maybePayload && typeof maybePayload === "object") {
      const maybeMsg = maybePayload;
      if (typeof maybeMsg.type === "string") {
        msg = maybeMsg;
      }
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
      githubUi.onCollectionsData({
        collections: msg.payload.collections,
        textStyles: msg.payload.textStylesCount ? new Array(msg.payload.textStylesCount).fill({
          id: "",
          name: ""
        }) : []
      });
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
      const payload = msg.payload;
      let last = null;
      if (payload && typeof payload === "object" && "last" in payload) {
        const maybeLast = payload.last;
        if (maybeLast && typeof maybeLast === "object" && typeof maybeLast.collection === "string" && typeof maybeLast.mode === "string") {
          last = {
            collection: maybeLast.collection,
            mode: maybeLast.mode
          };
        }
      }
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
    if (!prefersDarkQuery) applyTheme();
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

// src/app/ui/components/autocomplete.ts
// Generic autocomplete/dropdown controller for inputs and menus.
import { h, clearChildren } from "../dom-helpers";

export interface AutocompleteItem {
    key: string;
    label: string;
    value: string;
    type: "option" | "action" | "info";
    disabled?: boolean;
    active?: boolean; // For pre-selection
}

export interface AutocompleteOptions {
    input: HTMLInputElement;
    menu: HTMLElement;
    toggleBtn?: HTMLButtonElement;
    onQuery: (query: string) => void;
    onSelect: (item: AutocompleteItem, fromKeyboard: boolean) => void;
    renderItem?: (item: AutocompleteItem) => HTMLElement;
}

export class Autocomplete {
    private input: HTMLInputElement;
    private menu: HTMLElement;
    private toggleBtn?: HTMLButtonElement;
    private onQuery: (query: string) => void;
    private onSelect: (item: AutocompleteItem, fromKeyboard: boolean) => void;
    private renderItem: (item: AutocompleteItem) => HTMLElement;

    private items: AutocompleteItem[] = [];
    private highlightIndex: number = -1;
    private isOpen: boolean = false;
    private debounceTimer: number | undefined;

    // Bound event handlers for add/remove symmetry
    private onInputFocus = () => {
        this.open();
        this.onQuery(this.input.value);
    };
    private onInputInput = () => {
        if (this.debounceTimer) window.clearTimeout(this.debounceTimer);
        this.debounceTimer = window.setTimeout(() => {
            this.open();
            this.onQuery(this.input.value);
        }, 120);
    };
    private onInputKeydown = (e: KeyboardEvent) => this.handleKeydown(e);
    private onToggleClick = (e: MouseEvent) => {
        e.preventDefault();
        this.toggle();
    };
    private onMenuMouseDown = (e: MouseEvent) => e.preventDefault();
    private onMenuClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        const li = target.closest("li");
        if (li) {
            const index = Number(li.dataset.index);
            if (!isNaN(index) && this.items[index]) {
                this.select(index, false);
            }
        }
    };
    private onDocumentMouseDown = (e: MouseEvent) => {
        if (!this.isOpen) return;
        const target = e.target as Node;
        if (
            this.menu.contains(target) ||
            this.input.contains(target) ||
            (this.toggleBtn && this.toggleBtn.contains(target))
        ) {
            return;
        }
        this.close();
    };

    constructor(options: AutocompleteOptions) {
        this.input = options.input;
        this.menu = options.menu;
        this.toggleBtn = options.toggleBtn;
        this.onQuery = options.onQuery;
        this.onSelect = options.onSelect;
        this.renderItem = options.renderItem || this.defaultRenderItem;

        this.setupEvents();
    }

    public setItems(items: AutocompleteItem[]) {
        this.items = items;
        this.render();
        // If menu is open, refresh highlight
        if (this.isOpen) {
            this.syncHighlight();
        }
    }

    public open() {
        if (this.isOpen) return;
        this.isOpen = true;
        this.menu.hidden = false;
        this.menu.setAttribute("data-open", "1");
        this.input.setAttribute("aria-expanded", "true");
        if (this.toggleBtn)
            this.toggleBtn.setAttribute("aria-expanded", "true");

        // If empty, maybe trigger query?
        // Consumer should have called setItems before opening or in response to focus
        this.syncHighlight();
    }

    public close() {
        if (!this.isOpen) return;
        this.isOpen = false;
        this.menu.hidden = true;
        this.menu.removeAttribute("data-open");
        this.input.setAttribute("aria-expanded", "false");
        if (this.toggleBtn)
            this.toggleBtn.setAttribute("aria-expanded", "false");
        this.setHighlight(-1);
    }

    public destroy() {
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

    public toggle() {
        if (this.isOpen) this.close();
        else {
            this.input.focus();
            this.open();
            // Trigger a query to ensure items are populated
            this.onQuery(this.input.value);
        }
    }

    private setupEvents() {
        this.input.addEventListener("focus", this.onInputFocus);
        this.input.addEventListener("input", this.onInputInput);
        this.input.addEventListener("keydown", this.onInputKeydown);

        if (this.toggleBtn) {
            this.toggleBtn.addEventListener("click", this.onToggleClick);
        }

        this.menu.addEventListener("mousedown", this.onMenuMouseDown); // Prevent blur
        this.menu.addEventListener("click", this.onMenuClick);

        document.addEventListener("mousedown", this.onDocumentMouseDown);
    }

    private handleKeydown(e: KeyboardEvent) {
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
            // If closed or no highlight, let default form submit happen or consumer handle it
        } else if (e.key === "Escape") {
            if (this.isOpen) {
                e.preventDefault();
                this.close();
            }
        }
    }

    private moveHighlight(delta: number) {
        if (this.items.length === 0) return;
        let next = this.highlightIndex + delta;

        // Wrap around
        if (next >= this.items.length) next = 0;
        if (next < 0) next = this.items.length - 1;

        // Skip disabled/info items
        // Simple scan for next selectable
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

    private setHighlight(index: number) {
        this.highlightIndex = index;
        const children = this.menu.children;
        for (let i = 0; i < children.length; i++) {
            const child = children[i] as HTMLElement;
            if (i === index) {
                child.setAttribute("data-active", "1");
                child.scrollIntoView({ block: "nearest" });
            } else {
                child.removeAttribute("data-active");
            }
        }
    }

    private syncHighlight() {
        // Try to keep highlight on the same item key if possible, or reset
        // For now, just reset to first selectable if lost
        if (this.highlightIndex >= 0 && this.items[this.highlightIndex]) {
            // Check if still valid
            const item = this.items[this.highlightIndex];
            if (item.type !== "info" && !item.disabled) {
                this.setHighlight(this.highlightIndex);
                return;
            }
        }

        // Find first selectable
        const first = this.items.findIndex(
            (i) => i.type !== "info" && !i.disabled
        );
        this.setHighlight(first);
    }

    private select(index: number, fromKeyboard: boolean) {
        const item = this.items[index];
        if (!item || item.disabled || item.type === "info") return;
        this.onSelect(item, fromKeyboard);
    }

    private render() {
        clearChildren(this.menu);
        this.items.forEach((item, index) => {
            const el = this.renderItem(item);
            el.dataset.index = String(index);
            el.setAttribute("role", "option");
            if (item.disabled) el.setAttribute("aria-disabled", "true");
            this.menu.appendChild(el);
        });
    }

    private defaultRenderItem(item: AutocompleteItem): HTMLElement {
        return h("li", {
            className: `autocomplete-item ${
                item.type === "info" ? "is-info" : ""
            }`,
            textContent: item.label,
        });
    }
}

// src/app/collections.ts
// Helpers for enumerating variable collections and analyzing selection state.

export async function snapshotCollectionsForUi(): Promise<{
    collections: Array<{
        id: string;
        name: string;
        modes: Array<{ id: string; name: string }>;
        variables: Array<{ id: string; name: string; type: string }>;
    }>;
    rawText: string;
    checksum: string;
}> {
    if (typeof figma.editorType !== "string" || figma.editorType !== "figma") {
        return {
            collections: [],
            rawText:
                "Variables API is not available in this editor.\n" +
                "Open a Figma Design file (not FigJam) and try again.",
            checksum: "",
        };
    }
    if (
        typeof figma.variables === "undefined" ||
        typeof figma.variables.getLocalVariableCollectionsAsync !==
            "function" ||
        typeof figma.variables.getVariableByIdAsync !== "function"
    ) {
        return {
            collections: [],
            rawText:
                "Variables API methods not found. Ensure your Figma version supports Variables and try again.",
            checksum: "",
        };
    }

    const locals: VariableCollection[] =
        await figma.variables.getLocalVariableCollectionsAsync();
    const allVars = await figma.variables.getLocalVariablesAsync();
    const varsById = new Map<string, Variable>();
    for (const v of allVars) {
        varsById.set(v.id, v);
    }

    const out: Array<{
        id: string;
        name: string;
        modes: Array<{ id: string; name: string }>;
        variables: Array<{ id: string; name: string; type: string }>;
    }> = [];
    const rawLines: string[] = [];
    const checksumParts: string[] = [];

    for (let i = 0; i < locals.length; i++) {
        const c = locals[i];
        if (!c) continue;

        const modes: Array<{ id: string; name: string }> = [];
        for (let mi = 0; mi < c.modes.length; mi++) {
            const m = c.modes[mi];
            modes.push({ id: m.modeId, name: m.name });
        }

        // Include collection metadata in checksum
        checksumParts.push(`C:${c.id}:${c.name}`);

        // Include mode metadata in checksum
        const modeSigs = c.modes.map((m) => `${m.modeId}:${m.name}`);
        checksumParts.push(`M:${modeSigs.join(",")}`);

        const varsList: Array<{ id: string; name: string; type: string }> = [];
        const varLines: string[] = [];

        for (let vi = 0; vi < c.variableIds.length; vi++) {
            const varId = c.variableIds[vi];
            const v = varsById.get(varId);
            if (!v) continue;
            varsList.push({ id: v.id, name: v.name, type: v.resolvedType });

            // Capture values for change detection (internal use only, not logged)
            const values: string[] = [];
            for (const m of c.modes) {
                const val = v.valuesByMode[m.modeId];
                values.push(JSON.stringify(val));
            }
            varLines.push(`    - ${v.name} [${v.resolvedType}]`);
            // Include variable name and type in checksum
            checksumParts.push(
                `V:${v.id}:${v.name}:${v.resolvedType}:${values.join(",")}`
            );
        }

        out.push({ id: c.id, name: c.name, modes: modes, variables: varsList });

        rawLines.push("Collection: " + c.name + " (" + c.id + ")");
        const modeNames: string[] = modes.map((m) => m.name);
        rawLines.push(
            "  Modes: " +
                (modeNames.length > 0 ? modeNames.join(", ") : "(none)")
        );
        rawLines.push("  Variables (" + String(varsList.length) + "):");
        rawLines.push(...varLines);
        rawLines.push("");
    }

    if (out.length === 0) {
        rawLines.push("No local Variable Collections found.");
        rawLines.push("Create one in the Variables panel, then press Refresh.");
    }

    if (typeof figma.getLocalTextStyles === "function") {
        const textStyles = figma.getLocalTextStyles();
        rawLines.push("");
        rawLines.push("Text styles: " + String(textStyles.length));
        for (let si = 0; si < textStyles.length; si++) {
            const style = textStyles[si];
            rawLines.push("  - " + style.name);
        }
        if (textStyles.length === 0) {
            rawLines.push("  (No local text styles found.)");
        }
    }

    return {
        collections: out,
        rawText: rawLines.join("\n"),
        checksum: checksumParts.join("|"),
    };
}

export function safeKeyFromCollectionAndMode(
    collectionName: string,
    modeName: string
): string {
    const base = collectionName + "/mode=" + modeName;
    let out = "";
    for (let i = 0; i < base.length; i++) {
        const ch = base.charAt(i);
        out += ch === "/" || ch === "\\" || ch === ":" ? "_" : ch;
    }
    return out;
}

export async function analyzeSelectionState(
    collectionName: string,
    modeName: string
): Promise<{
    ok: boolean;
    message?: string;
    variableCount?: number;
    variablesWithValues?: number;
}> {
    try {
        const snap = await snapshotCollectionsForUi();
        const col = snap.collections.find((c) => c.name === collectionName);
        if (!col)
            return {
                ok: false,
                message: `Collection "${collectionName}" not found in this file.`,
            };
        if (!col.variables || col.variables.length === 0) {
            return {
                ok: false,
                message: `Collection "${collectionName}" has no local variables.`,
            };
        }
        const mode = col.modes.find((m) => m.name === modeName);
        if (!mode)
            return {
                ok: false,
                message: `Mode "${modeName}" not found in collection "${collectionName}".`,
            };

        let withValues = 0;
        for (const v of col.variables) {
            const full = await figma.variables.getVariableByIdAsync(v.id);
            if (full && full.valuesByMode && mode.id in full.valuesByMode)
                withValues++;
        }
        return {
            ok: true,
            variableCount: col.variables.length,
            variablesWithValues: withValues,
        };
    } catch (e) {
        return {
            ok: false,
            message: (e as Error)?.message || "Analysis failed",
        };
    }
}
